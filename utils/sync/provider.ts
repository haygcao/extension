/**
 * sync/provider.ts — 多后端同步核心实现：
 * 支持 Chrome Sync、WebDAV、Microsoft OneDrive、Google Drive
 * 支持每个服务独立开关、独立状态追踪、复合多端并发双向同步与智能去重
 */

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
  tags?: string; // JSON string of string[]
}

export interface CloudData {
  entries: CloudEntry[];
  settings: { id: string; cloudItemLimit: number | null }[];
}

export interface SyncProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  pull(): Promise<CloudData>;
  push(data: CloudData): Promise<void>;
}

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
        createdAt: existingCreated && itemCreated ? Math.min(existingCreated, itemCreated) : (existingCreated || itemCreated),
        copiedAt: Math.max(existingCopied, itemCopied),
        isFavorited: existing.isFavorited || item.isFavorited,
        tags: mergedTags,
      });
    }
  }

  const sMap = new Map<string, { id: string; cloudItemLimit: number | null }>();
  for (const s of remote.settings || []) if (s?.id) sMap.set(s.id, s);
  for (const s of local.settings || []) if (s?.id) sMap.set(s.id, s);

  return {
    entries: Array.from(contentMap.values()),
    settings: Array.from(sMap.values()),
  };
};

// ─────────────────────────────────────────────
// 1. Chrome Sync Provider
// ─────────────────────────────────────────────
const CHROME_SYNC_KEY = "cloudData";

export const chromeSyncProvider: SyncProvider = {
  name: "Chrome Sync",
  async isAvailable() {
    return typeof chrome !== "undefined" && !!chrome.storage?.sync;
  },
  async pull() {
    try {
      const res = await new Promise<CloudData>((resolve) => {
        chrome.storage.sync.get(CHROME_SYNC_KEY, (result) => {
          const raw = result[CHROME_SYNC_KEY];
          if (!raw) {
            resolve({ entries: [], settings: [] });
          } else {
            try {
              resolve(JSON.parse(raw) as CloudData);
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
  const fileUrl = url.replace(/\/$/, "") + path;
  const headers = {
    Authorization: "Basic " + btoa(`${username}:${password}`),
    "Content-Type": "application/json",
  };

  return {
    name: "WebDAV",
    async isAvailable() {
      return !!(url && username && password);
    },
    async pull() {
      try {
        const res = await fetch(fileUrl, { method: "GET", headers });
        if (res.status === 404) {
          await updateProviderStatus("webdav", {
            status: "success",
            lastSyncTime: Date.now(),
            message: "文件就绪（初次同步）",
            itemCount: 0,
          });
          return { entries: [], settings: [] };
        }
        if (!res.ok) throw new Error(`WebDAV GET 失败: HTTP ${res.status}`);
        const data = (await res.json()) as CloudData;
        const result = { entries: data.entries || [], settings: data.settings || [] };
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
        const res = await fetch(fileUrl, {
          method: "PUT",
          headers,
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error(`WebDAV PUT 失败: HTTP ${res.status}`);
        await updateProviderStatus("webdav", {
          status: "success",
          lastSyncTime: Date.now(),
          message: "WebDAV 同步成功",
          itemCount: data.entries.length,
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
        const data = (await res.json()) as CloudData;
        const result = { entries: data.entries || [], settings: data.settings || [] };
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
        const res = await fetch(endpoint, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error(`OneDrive 写入失败: HTTP ${res.status}`);
        await updateProviderStatus("onedrive", {
          status: "success",
          lastSyncTime: Date.now(),
          message: "OneDrive 上传成功",
          itemCount: data.entries.length,
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
        const data = (await res.json()) as CloudData;
        const result = { entries: data.entries || [], settings: data.settings || [] };
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
        const fileId = await getFileId();
        const bodyStr = JSON.stringify(data);

        if (fileId) {
          // 更新已有文件
          const res = await fetch(
            `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: bodyStr,
            },
          );
          if (!res.ok) throw new Error(`Google Drive 更新失败: HTTP ${res.status}`);
        } else {
          // 创建新文件 (Multipart upload)
          const metadata = { name: fileName, mimeType: "application/json" };
          const boundary = "-------OpenClipSyncBoundary" + Math.random().toString(36).substring(2);
          const delimiter = `\r\n--${boundary}\r\n`;
          const closeDelimiter = `\r\n--${boundary}--`;

          const multipartRequestBody =
            delimiter +
            "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
            JSON.stringify(metadata) +
            delimiter +
            "Content-Type: application/json\r\n\r\n" +
            bodyStr +
            closeDelimiter;

          const res = await fetch(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": `multipart/related; boundary=${boundary}`,
              },
              body: multipartRequestBody,
            },
          );
          if (!res.ok) throw new Error(`Google Drive 创建文件失败: HTTP ${res.status}`);
        }

        await updateProviderStatus("googledrive", {
          status: "success",
          lastSyncTime: Date.now(),
          message: "Google Drive 上传成功",
          itemCount: data.entries.length,
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

  // 复合提供方：同时同步到所有已开启的后端
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
