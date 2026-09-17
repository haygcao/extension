/**
 * sync/provider.ts — 多后端同步核心实现：
 * 支持 Chrome Sync、WebDAV、Microsoft OneDrive、Google Drive
 * 支持每个服务独立开关、独立状态追踪、复合多端并发双向同步与智能去重
 */

import { createHash } from "crypto";

import { getSettings } from "~storage/settings";
import {
  getSyncSettings,
  setSyncSettings,
  updateProviderStatus,
  type SyncSettings,
} from "~storage/syncSettings";

export interface CloudEntry {
  id: string;
  emailContentHash: string;
  content: string;
  createdAt: number;
  copiedAt?: number | null;
  isFavorited?: boolean;
  isPinned?: boolean;
  deviceId?: string;
  deviceName?: string;
  tags?: string; // JSON string of string[]
}

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  lastActive: number;
}

export interface CloudData {
  entries: CloudEntry[];
  settings: { id: string; cloudItemLimit: number | null }[];
  devices?: DeviceInfo[];
}

export interface SyncProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  pull(): Promise<CloudData>;
  push(data: CloudData): Promise<void>;
}

/** 自动提取和汇总发现的所有设备注册表 */
export const extractDiscoveredDevices = (data: CloudData, extraDevices: DeviceInfo[] = []): DeviceInfo[] => {
  const map = new Map<string, DeviceInfo>();

  for (const d of extraDevices) {
    if (d && d.deviceId) {
      map.set(d.deviceId, {
        deviceId: d.deviceId,
        deviceName: d.deviceName || "未知设备",
        lastActive: typeof d.lastActive === "number" ? d.lastActive : Date.now(),
      });
    }
  }

  for (const d of data.devices || []) {
    if (d && d.deviceId) {
      const existing = map.get(d.deviceId);
      const active = typeof d.lastActive === "number" ? d.lastActive : Date.now();
      if (!existing) {
        map.set(d.deviceId, {
          deviceId: d.deviceId,
          deviceName: d.deviceName || "未知设备",
          lastActive: active,
        });
      } else {
        if (active > existing.lastActive) existing.lastActive = active;
        if (d.deviceName && d.deviceName !== "未知设备") existing.deviceName = d.deviceName;
      }
    }
  }

  for (const e of data.entries || []) {
    if (e && e.deviceId) {
      const active = e.copiedAt || e.createdAt || Date.now();
      const existing = map.get(e.deviceId);
      if (!existing) {
        map.set(e.deviceId, {
          deviceId: e.deviceId,
          deviceName: e.deviceName || "在线设备",
          lastActive: active,
        });
      } else {
        if (active > existing.lastActive) existing.lastActive = active;
        if (e.deviceName && e.deviceName !== "在线设备" && e.deviceName !== "未知设备") {
          existing.deviceName = e.deviceName;
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.lastActive - a.lastActive);
};

/** 原生 Gzip 压缩与解压（利用现代浏览器原生 CompressionStream API） */
export const compressToGzip = async (text: string): Promise<Uint8Array> => {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const response = new Response(stream);
  const blob = await response.blob();
  return new Uint8Array(await blob.arrayBuffer());
};

export const decompressFromGzip = async (data: ArrayBuffer | Uint8Array): Promise<string> => {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"));
  const response = new Response(stream);
  return await response.text();
};

/** 判断是否为 Gzip 格式（魔数 0x1F, 0x8B） */
export const isGzipData = (bytes: Uint8Array): boolean => {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
};

/** 智能解析：支持解析纯 JSON 文本、ArrayBuffer 以及 Gzip 压缩二进制流 */
export const parseRemotePayload = async (payload: any): Promise<CloudData> => {
  if (!payload) return { entries: [], settings: [], devices: [] };

  try {
    let jsonStr = "";
    if (payload instanceof ArrayBuffer || payload instanceof Uint8Array) {
      const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
      if (isGzipData(bytes)) {
        jsonStr = await decompressFromGzip(bytes);
      } else {
        jsonStr = new TextDecoder().decode(bytes);
      }
      return parseRemoteJson(JSON.parse(jsonStr));
    } else if (typeof payload === "string") {
      return parseRemoteJson(JSON.parse(payload));
    } else if (typeof payload === "object") {
      return parseRemoteJson(payload);
    }
  } catch (err) {
    console.warn("Failed to parse remote payload:", err);
  }
  return { entries: [], settings: [], devices: [] };
};

/** 根据保留周期（天数）与字符上限对条目进行安全裁剪与过期淘汰（置顶/收藏项永久豁免） */
export const pruneExpiredAndOversizedEntries = (
  entries: CloudEntry[],
  retentionDays: number | null | undefined,
  maxChars: number | null | undefined,
): CloudEntry[] => {
  const now = Date.now();
  const cutoffTime =
    typeof retentionDays === "number" && retentionDays > 0
      ? now - retentionDays * 24 * 60 * 60 * 1000
      : null;

  return entries
    .filter((item) => {
      if (!item || typeof item.content !== "string") return false;
      // 置顶或收藏的条目拥有永久保留特权
      if (item.isFavorited || item.isPinned) return true;
      // 检查过期时间
      if (cutoffTime !== null) {
        const lastActive = item.copiedAt || item.createdAt || 0;
        if (lastActive < cutoffTime) return false;
      }
      return true;
    })
    .map((item) => {
      if (typeof maxChars === "number" && maxChars > 0 && item.content.length > maxChars) {
        return {
          ...item,
          content: item.content.slice(0, maxChars),
        };
      }
      return item;
    });
};

/** 安全解析从远端拉取的各类 JSON 结构（支持对象 { entries } 或纯数组 [ ... ]） */
export const parseRemoteJson = (data: any): CloudData => {
  if (!data) return { entries: [], settings: [], devices: [] };

  const parsedDevices: DeviceInfo[] = Array.isArray(data.devices)
    ? data.devices.map((d: any) => ({
        deviceId: d.deviceId || "",
        deviceName: d.deviceName || "设备",
        lastActive: typeof d.lastActive === "number" ? d.lastActive : Date.now(),
      })).filter((d: any) => !!d.deviceId)
    : [];

  if (Array.isArray(data.entries)) {
    const parsedData: CloudData = {
      entries: data.entries.map((e: any) => {
        const text = typeof e.content === "string" ? e.content : typeof e.text === "string" ? e.text : "";
        const id = e.id || createHash("sha256").update(text).digest("hex");
        return {
          id,
          emailContentHash: e.emailContentHash || id,
          content: text,
          createdAt: typeof e.createdAt === "number" ? e.createdAt : Date.now(),
          copiedAt: typeof e.copiedAt === "number" ? e.copiedAt : e.createdAt || Date.now(),
          isFavorited: !!(e.isFavorited || e.isFavorite),
          isPinned: !!(e.isPinned || e.pinned),
          deviceId: typeof e.deviceId === "string" ? e.deviceId : undefined,
          deviceName: typeof e.deviceName === "string" ? e.deviceName : undefined,
          tags: typeof e.tags === "string" ? e.tags : Array.isArray(e.tags) ? JSON.stringify(e.tags) : undefined,
        };
      }),
      settings: Array.isArray(data.settings) ? data.settings : [],
      devices: parsedDevices,
    };
    parsedData.devices = extractDiscoveredDevices(parsedData);
    return parsedData;
  }

  if (Array.isArray(data)) {
    const parsedData: CloudData = {
      entries: data.map((e: any) => {
        const text = typeof e.content === "string" ? e.content : typeof e.text === "string" ? e.text : "";
        const id = e.id || createHash("sha256").update(text).digest("hex");
        return {
          id,
          emailContentHash: id,
          content: text,
          createdAt: typeof e.createdAt === "number" ? e.createdAt : Date.now(),
          copiedAt: typeof e.copiedAt === "number" ? e.copiedAt : e.createdAt || Date.now(),
          isFavorited: !!(e.isFavorited || e.isFavorite),
          isPinned: !!(e.isPinned || e.pinned),
          deviceId: typeof e.deviceId === "string" ? e.deviceId : undefined,
          deviceName: typeof e.deviceName === "string" ? e.deviceName : undefined,
          tags: typeof e.tags === "string" ? e.tags : Array.isArray(e.tags) ? JSON.stringify(e.tags) : undefined,
        };
      }),
      settings: [],
      devices: parsedDevices,
    };
    parsedData.devices = extractDiscoveredDevices(parsedData);
    return parsedData;
  }

  return { entries: [], settings: [], devices: [] };
};

/** 多设备双向合并与自动去重：按文本内容自动去重合并，相同内容保留最新时间戳与标签并集 */
export const mergeCloudData = (local: CloudData, remote: CloudData): CloudData => {
  const allEntries = [...(remote.entries || []), ...(local.entries || [])];
  const contentMap = new Map<string, CloudEntry>();

  for (const item of allEntries) {
    if (!item || typeof item.content !== "string") continue;
    const key = item.content;
    const existing = contentMap.get(key);

    if (!existing) {
      contentMap.set(key, { ...item });
    } else {
      const existingCopied = existing.copiedAt || 0;
      const itemCopied = item.copiedAt || 0;
      const existingCreated = existing.createdAt || 0;
      const itemCreated = item.createdAt || 0;

      let mergedTags = existing.tags;
      if (item.tags && item.tags !== existing.tags) {
        try {
          const tagsA = JSON.parse(existing.tags || "[]");
          const tagsB = JSON.parse(item.tags || "[]");
          const tagSet = new Set([...tagsA, ...tagsB]);
          mergedTags = tagSet.size > 0 ? JSON.stringify(Array.from(tagSet)) : undefined;
        } catch {
          mergedTags = existing.tags || item.tags;
        }
      }

      contentMap.set(key, {
        ...existing,
        id: item.id && item.id.length === 36 ? item.id : existing.id,
        createdAt:
          existingCreated && itemCreated
            ? Math.min(existingCreated, itemCreated)
            : existingCreated || itemCreated,
        copiedAt: Math.max(existingCopied, itemCopied),
        isFavorited: existing.isFavorited || item.isFavorited,
        isPinned: existing.isPinned || item.isPinned,
        deviceId: item.deviceId || existing.deviceId,
        deviceName: item.deviceName || existing.deviceName,
        tags: mergedTags,
      });
    }
  }

  const sMap = new Map<string, { id: string; cloudItemLimit: number | null }>();
  for (const s of remote.settings || []) if (s?.id) sMap.set(s.id, s);
  for (const s of local.settings || []) if (s?.id) sMap.set(s.id, s);

  const mergedData: CloudData = {
    entries: Array.from(contentMap.values()),
    settings: Array.from(sMap.values()),
    devices: [...(local.devices || []), ...(remote.devices || [])],
  };

  mergedData.devices = extractDiscoveredDevices(mergedData);
  return mergedData;
};

// ─────────────────────────────────────────────
// 1. Chrome Sync Provider
// ─────────────────────────────────────────────
const CHROME_SYNC_KEY = "cloudData";

export const clearChromeSyncStorage = async (): Promise<void> => {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage?.sync) {
      chrome.storage.sync.remove([CHROME_SYNC_KEY], () => {
        updateProviderStatus("chrome", {
          status: "idle",
          message: "Chrome 云端存储已清空",
          itemCount: 0,
        });
        resolve();
      });
    } else {
      resolve();
    }
  });
};

export const chromeSyncProvider: SyncProvider = {
  name: "Chrome Sync",
  async isAvailable() {
    const s = await getSyncSettings();
    return !!s.enableChromeSync && typeof chrome !== "undefined" && !!chrome.storage?.sync;
  },
  async pull() {
    const s = await getSyncSettings();
    if (!s.enableChromeSync) {
      return { entries: [], settings: [] };
    }
    try {
      const res = await new Promise<CloudData>((resolve) => {
        chrome.storage.sync.get(CHROME_SYNC_KEY, (result) => {
          const raw = result[CHROME_SYNC_KEY];
          if (!raw) {
            resolve({ entries: [], settings: [] });
          } else {
            try {
              resolve(parseRemoteJson(JSON.parse(raw)));
            } catch {
              resolve({ entries: [], settings: [] });
            }
          }
        });
      });
      await updateProviderStatus("chrome", {
        status: "success",
        lastSyncTime: Date.now(),
        message: "Chrome 同步正常",
        itemCount: res.entries.length,
      });
      return res;
    } catch (e: any) {
      await updateProviderStatus("chrome", {
        status: "error",
        message: e?.message || "Chrome Sync 读取失败",
      });
      throw e;
    }
  },
  async push(data) {
    const s = await getSyncSettings();
    if (!s.enableChromeSync) {
      return;
    }
    let toPush = data;
    let json = JSON.stringify(toPush);
    if (new Blob([json]).size > 7500) {
      const sorted = [...toPush.entries].sort(
        (a, b) => (b.copiedAt || b.createdAt) - (a.copiedAt || a.createdAt),
      );
      let count = sorted.length;
      while (count > 0 && new Blob([json]).size > 7500) {
        count = Math.max(0, count - 5);
        toPush = { ...toPush, entries: sorted.slice(0, count) };
        json = JSON.stringify(toPush);
      }
    }
    return new Promise<void>((resolve, reject) => {
      chrome.storage.sync.set({ [CHROME_SYNC_KEY]: json }, () => {
        if (chrome.runtime.lastError) {
          const err = new Error(chrome.runtime.lastError.message);
          updateProviderStatus("chrome", { status: "error", message: err.message });
          reject(err);
        } else {
          updateProviderStatus("chrome", {
            status: "success",
            lastSyncTime: Date.now(),
            message: "Chrome 同步已更新",
            itemCount: toPush.entries.length,
          });
          resolve();
        }
      });
    });
  },
};

// ─────────────────────────────────────────────
// 2. WebDAV Provider
// ─────────────────────────────────────────────
export const createWebDavProvider = (
  url: string,
  username: string,
  password: string,
  path: string,
): SyncProvider => {
  const cleanPath = path ? (path.startsWith("/") ? path : `/${path}`) : "/OpenClipSync/openclip-sync.json";
  const baseUrl = url.replace(/\/$/, "");
  const fileUrl = baseUrl + cleanPath;
  const authHeader = "Basic " + btoa(unescape(encodeURIComponent(`${username}:${password}`)));
  const baseHeaders = { Authorization: authHeader };

  const parts = cleanPath.split("/").filter(Boolean);
  const folderPath = parts.length > 1 ? "/" + parts.slice(0, -1).join("/") : "/OpenClipSync";
  const devicesFileUrl = baseUrl + folderPath + "/openclip-devices.json";
  const masterConfigFileUrl = baseUrl + folderPath + "/master_config.json";

  // 确保父目录存在 (MKCOL)
  const ensureDirectoryExists = async () => {
    if (parts.length > 1) {
      try {
        await fetch(baseUrl + folderPath, {
          method: "MKCOL",
          headers: baseHeaders,
        });
      } catch {}
    }
  };

  return {
    name: "WebDAV",
    async isAvailable() {
      return !!(url && username && password);
    },
    async pull() {
      try {
        const res = await fetch(fileUrl, { method: "GET", headers: baseHeaders });
        if (res.status === 404) {
          await updateProviderStatus("webdav", {
            status: "success",
            lastSyncTime: Date.now(),
            message: "文件就绪（初次同步）",
            itemCount: 0,
          });
          return { entries: [], settings: [], devices: [] };
        }
        if (!res.ok) throw new Error(`WebDAV GET 失败: HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        const result = await parseRemotePayload(buffer);

        try {
          const devRes = await fetch(devicesFileUrl, { method: "GET", headers: baseHeaders });
          if (devRes.ok) {
            const devText = await devRes.text();
            const parsedDevs = JSON.parse(devText);
            if (Array.isArray(parsedDevs)) {
              result.devices = extractDiscoveredDevices(result, parsedDevs);
            }
          }
        } catch {}

        try {
          const masterRes = await fetch(masterConfigFileUrl, { method: "GET", headers: baseHeaders });
          if (masterRes.ok) {
            const masterText = await masterRes.text();
            const masterJson = JSON.parse(masterText);
            if (masterJson && masterJson.masterDeviceId) {
              (result as any).masterLock = masterJson;
            }
          }
        } catch {}

        await updateProviderStatus("webdav", {
          status: "success",
          lastSyncTime: Date.now(),
          message: "WebDAV 连接正常",
          itemCount: result.entries.length,
        });
        return result;
      } catch (e: any) {
        await updateProviderStatus("webdav", {
          status: "error",
          message: e?.message || "WebDAV 连接失败",
        });
        throw e;
      }
    },
    async push(data) {
      try {
        await ensureDirectoryExists();
        const settings = await getSettings();
        const prunedEntries = pruneExpiredAndOversizedEntries(
          data.entries,
          settings.historyRetentionDays,
          settings.localItemCharacterLimit,
        );
        const payloadData: CloudData = { ...data, entries: prunedEntries };
        const jsonStr = JSON.stringify(payloadData);

        let body: BodyInit;
        let contentType: string;

        if (settings.enableCompression) {
          body = (await compressToGzip(jsonStr)) as unknown as BodyInit;
          contentType = "application/gzip";
        } else {
          body = jsonStr;
          contentType = "application/json";
        }

        const res = await fetch(fileUrl, {
          method: "PUT",
          headers: {
            ...baseHeaders,
            "Content-Type": contentType,
          },
          body,
        });
        if (!res.ok) throw new Error(`WebDAV PUT 失败: HTTP ${res.status}`);

        if (Array.isArray(payloadData.devices) && payloadData.devices.length > 0) {
          try {
            await fetch(devicesFileUrl, {
              method: "PUT",
              headers: {
                ...baseHeaders,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(payloadData.devices, null, 2),
            });
          } catch {}
        }

        if ((payloadData as any).masterLock) {
          try {
            await fetch(masterConfigFileUrl, {
              method: "PUT",
              headers: {
                ...baseHeaders,
                "Content-Type": "application/json",
              },
              body: JSON.stringify((payloadData as any).masterLock, null, 2),
            });
          } catch {}
        }

        await updateProviderStatus("webdav", {
          status: "success",
          lastSyncTime: Date.now(),
          message: settings.enableCompression ? "WebDAV 同步成功 (Gzip 压缩)" : "WebDAV 同步成功",
          itemCount: payloadData.entries.length,
        });
      } catch (e: any) {
        await updateProviderStatus("webdav", {
          status: "error",
          message: e?.message || "WebDAV 上传失败",
        });
        throw e;
      }
    },
  };
};

// ─────────────────────────────────────────────
// 3. Microsoft OneDrive Provider (Microsoft Graph API)
// ─────────────────────────────────────────────
export const createOneDriveProvider = (
  accessToken: string,
  folderPath: string = "/OpenClipSync",
): SyncProvider => {
  const cleanFolder = folderPath.replace(/^\//, "").replace(/\/$/, "");
  const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${cleanFolder}/openclip-sync.json:/content`;

  return {
    name: "OneDrive",
    async isAvailable() {
      return !!accessToken;
    },
    async pull() {
      try {
        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.status === 404) {
          await updateProviderStatus("onedrive", {
            status: "success",
            lastSyncTime: Date.now(),
            message: "已连接 OneDrive（初始空文件）",
            itemCount: 0,
          });
          return { entries: [], settings: [] };
        }
        if (!res.ok) throw new Error(`OneDrive 读取失败: HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        const result = await parseRemotePayload(buffer);
        await updateProviderStatus("onedrive", {
          status: "success",
          lastSyncTime: Date.now(),
          message: "OneDrive 同步正常",
          itemCount: result.entries.length,
        });
        return result;
      } catch (e: any) {
        await updateProviderStatus("onedrive", {
          status: "error",
          message: e?.message || "OneDrive 连接失败",
        });
        throw e;
      }
    },
    async push(data) {
      try {
        const settings = await getSettings();
        const prunedEntries = pruneExpiredAndOversizedEntries(
          data.entries,
          settings.historyRetentionDays,
          settings.localItemCharacterLimit,
        );
        const payloadData: CloudData = { ...data, entries: prunedEntries };
        const jsonStr = JSON.stringify(payloadData);

        let body: BodyInit;
        let contentType: string;

        if (settings.enableCompression) {
          body = (await compressToGzip(jsonStr)) as unknown as BodyInit;
          contentType = "application/gzip";
        } else {
          body = jsonStr;
          contentType = "application/json";
        }

        const res = await fetch(endpoint, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": contentType,
          },
          body,
        });
        if (!res.ok) throw new Error(`OneDrive 写入失败: HTTP ${res.status}`);
        await updateProviderStatus("onedrive", {
          status: "success",
          lastSyncTime: Date.now(),
          message: settings.enableCompression ? "OneDrive 上传成功 (Gzip 压缩)" : "OneDrive 上传成功",
          itemCount: payloadData.entries.length,
        });
      } catch (e: any) {
        await updateProviderStatus("onedrive", {
          status: "error",
          message: e?.message || "OneDrive 上传失败",
        });
        throw e;
      }
    },
  };
};

// ─────────────────────────────────────────────
// 4. Google Drive Provider (Google Drive REST API v3)
// ─────────────────────────────────────────────
export const createGoogleDriveProvider = (
  accessToken: string,
  _folderPath: string = "/OpenClipSync",
): SyncProvider => {
  const fileName = "openclip-sync.json";

  const getFileId = async (): Promise<string | null> => {
    const q = encodeURIComponent(`name = '${fileName}' and trashed = false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!res.ok) throw new Error(`Google Drive 文件搜索失败: HTTP ${res.status}`);
    const data = await res.json();
    return data.files?.[0]?.id || null;
  };

  return {
    name: "Google Drive",
    async isAvailable() {
      return !!accessToken;
    },
    async pull() {
      try {
        const fileId = await getFileId();
        if (!fileId) {
          await updateProviderStatus("googledrive", {
            status: "success",
            lastSyncTime: Date.now(),
            message: "已连接 Google Drive（未找到历史文件，将新建）",
            itemCount: 0,
          });
          return { entries: [], settings: [] };
        }
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error(`Google Drive 读取失败: HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        const result = await parseRemotePayload(buffer);
        await updateProviderStatus("googledrive", {
          status: "success",
          lastSyncTime: Date.now(),
          message: "Google Drive 同步正常",
          itemCount: result.entries.length,
        });
        return result;
      } catch (e: any) {
        await updateProviderStatus("googledrive", {
          status: "error",
          message: e?.message || "Google Drive 连接失败",
        });
        throw e;
      }
    },
    async push(data) {
      try {
        const settings = await getSettings();
        const prunedEntries = pruneExpiredAndOversizedEntries(
          data.entries,
          settings.historyRetentionDays,
          settings.localItemCharacterLimit,
        );
        const payloadData: CloudData = { ...data, entries: prunedEntries };
        const jsonStr = JSON.stringify(payloadData);

        let bodyStr: string | Uint8Array;
        let mimeType = "application/json";

        if (settings.enableCompression) {
          bodyStr = await compressToGzip(jsonStr);
          mimeType = "application/gzip";
        } else {
          bodyStr = jsonStr;
        }

        const fileId = await getFileId();

        if (fileId) {
          const res = await fetch(
            `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": mimeType,
              },
              body: bodyStr as unknown as BodyInit,
            },
          );
          if (!res.ok) throw new Error(`Google Drive 更新失败: HTTP ${res.status}`);
        } else {
          const metadata = { name: fileName, mimeType };
          const boundary = "-------OpenClipSyncBoundary" + Math.random().toString(36).substring(2);
          const delimiter = `\r\n--${boundary}\r\n`;
          const closeDelimiter = `\r\n--${boundary}--`;

          const metaPart = new Blob([
            delimiter +
              "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
              JSON.stringify(metadata) +
              delimiter +
              `Content-Type: ${mimeType}\r\n\r\n`,
          ]);
          const dataPart = new Blob([bodyStr as any]);
          const closePart = new Blob([closeDelimiter]);
          const fullBody = new Blob([metaPart, dataPart, closePart]);

          const res = await fetch(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": `multipart/related; boundary=${boundary}`,
              },
              body: fullBody,
            },
          );
          if (!res.ok) throw new Error(`Google Drive 创建文件失败: HTTP ${res.status}`);
        }

        await updateProviderStatus("googledrive", {
          status: "success",
          lastSyncTime: Date.now(),
          message: settings.enableCompression ? "Google Drive 上传成功 (Gzip 压缩)" : "Google Drive 上传成功",
          itemCount: payloadData.entries.length,
        });
      } catch (e: any) {
        await updateProviderStatus("googledrive", {
          status: "error",
          message: e?.message || "Google Drive 上传失败",
        });
        throw e;
      }
    },
  };
};

// ─────────────────────────────────────────────
// OAuth 快捷授权助手
// ─────────────────────────────────────────────
export const authorizeGoogleOAuth = async (clientId: string): Promise<string> => {
  if (!clientId) throw new Error("请先填写 Google Client ID");
  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `response_type=token&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=${encodeURIComponent("https://www.googleapis.com/auth/drive.file")}`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (redirectUrl) => {
      if (chrome.runtime.lastError || !redirectUrl) {
        reject(new Error(chrome.runtime.lastError?.message || "用户取消了 Google 授权"));
        return;
      }
      try {
        const urlObj = new URL(redirectUrl);
        const params = new URLSearchParams(urlObj.hash.replace(/^#/, ""));
        const token = params.get("access_token");
        if (token) {
          resolve(token);
        } else {
          reject(new Error("未获取到 Access Token，请检查重定向 URI 设置"));
        }
      } catch (e: any) {
        reject(e);
      }
    });
  });
};

export const authorizeOneDriveOAuth = async (clientId: string): Promise<string> => {
  if (!clientId) throw new Error("请先填写 Microsoft OneDrive Client ID");
  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl =
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `response_type=token&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=${encodeURIComponent("Files.ReadWrite offline_access User.Read")}`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (redirectUrl) => {
      if (chrome.runtime.lastError || !redirectUrl) {
        reject(new Error(chrome.runtime.lastError?.message || "用户取消了 OneDrive 授权"));
        return;
      }
      try {
        const urlObj = new URL(redirectUrl);
        const params = new URLSearchParams(urlObj.hash.replace(/^#/, ""));
        const token = params.get("access_token");
        if (token) {
          resolve(token);
        } else {
          reject(new Error("未获取到 Access Token，请检查重定向 URI 设置"));
        }
      } catch (e: any) {
        reject(e);
      }
    });
  });
};

// ─────────────────────────────────────────────
// Provider Factory — 根据用户 Switch 开关返回当前 Provider (支持多后端同时同步)
// ─────────────────────────────────────────────
export const getActiveProvider = async (): Promise<SyncProvider | null> => {
  const s = await getSyncSettings();
  const providers: SyncProvider[] = [];

  if (s.enableChromeSync) {
    providers.push(chromeSyncProvider);
  }

  if (s.enableWebdav && s.webdavUrl && s.webdavUsername && s.webdavPassword) {
    providers.push(
      createWebDavProvider(
        s.webdavUrl,
        s.webdavUsername,
        s.webdavPassword,
        s.webdavPath || "/openclip-sync.json",
      ),
    );
  }

  if (s.enableOneDrive && s.oneDriveAccessToken) {
    providers.push(
      createOneDriveProvider(s.oneDriveAccessToken, s.oneDriveFolder || "/OpenClipSync"),
    );
  }

  if (s.enableGoogleDrive && s.googleAccessToken) {
    providers.push(
      createGoogleDriveProvider(s.googleAccessToken, s.googleDriveFolder || "/OpenClipSync"),
    );
  }

  if (providers.length === 0) return null;
  if (providers.length === 1) return providers[0]!;

  return {
    name: providers.map((p) => p.name).join(" + "),
    async isAvailable() {
      for (const p of providers) {
        if (await p.isAvailable()) return true;
      }
      return false;
    },
    async pull() {
      let combined: CloudData = { entries: [], settings: [] };
      for (const p of providers) {
        if (await p.isAvailable()) {
          try {
            const data = await p.pull();
            combined = mergeCloudData(combined, data);
          } catch {}
        }
      }
      return combined;
    },
    async push(data) {
      await Promise.allSettled(
        providers.map(async (p) => {
          if (await p.isAvailable()) {
            await p.push(data);
          }
        }),
      );
    },
  };
};
