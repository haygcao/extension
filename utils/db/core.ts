/**
 * db/core.ts — 替换 InstantDB，对外暴露相同接口供 background 和 UI 使用。
 *
 * 实现了本地数据与云端（WebDAV / Chrome Sync / OneDrive / Google Drive）的双向无感同步。
 */

import { getDiscoveredDevices, registerCurrentDevice, setDiscoveredDevices } from "~storage/discoveredDevices";
import { _setEntryIdToTags, getEntryIdToTags } from "~storage/entryIdToTags";
import { _setFavoriteEntryIds, getFavoriteEntryIds } from "~storage/favoriteEntryIds";
import { _setPinnedEntryIds, getPinnedEntryIds } from "~storage/pinnedEntryIds";
import { getSettings } from "~storage/settings";
import { getSyncSettings, setSyncStatus } from "~storage/syncSettings";
import type { Entry } from "~types/entry";
import {
  extractDiscoveredDevices,
  getActiveProvider,
  mergeCloudData,
  pruneExpiredAndOversizedEntries,
  type CloudData,
  type CloudEntry,
  type DeviceInfo,
} from "~utils/sync/provider";
import { _setEntries, getEntries } from "~utils/storage";

export interface DbData {
  entries: CloudEntry[];
  subscriptions: { id: string }[];
  settings: { id: string; cloudItemLimit: number | null }[];
  [key: string]: unknown[];
}

export const getLocalAsCloudData = async (): Promise<CloudData> => {
  const [entries, entryIdToTags, favoriteIds, pinnedIds, settings, syncSettings] = await Promise.all([
    getEntries(),
    getEntryIdToTags(),
    getFavoriteEntryIds(),
    getPinnedEntryIds(),
    getSettings(),
    getSyncSettings(),
  ]);
  const favSet = new Set(favoriteIds);
  const pinSet = new Set(pinnedIds);

  const cloudEntries: CloudEntry[] = entries.map((e) => ({
    id: e.id,
    emailContentHash: e.id,
    content: e.content,
    createdAt: e.createdAt,
    copiedAt: e.copiedAt || e.createdAt,
    isFavorited: favSet.has(e.id),
    isPinned: pinSet.has(e.id),
    deviceId: syncSettings.deviceId,
    deviceName: syncSettings.deviceName,
    tags: entryIdToTags[e.id]?.length ? JSON.stringify(entryIdToTags[e.id]) : undefined,
  }));

  const pruned = pruneExpiredAndOversizedEntries(
    cloudEntries,
    settings.historyRetentionDays,
    settings.localItemCharacterLimit,
  );

  const registeredDevices = await registerCurrentDevice(syncSettings);
  const allDevices = extractDiscoveredDevices({ entries: pruned, settings: [] }, registeredDevices);

  return {
    entries: pruned,
    settings: [],
    devices: allDevices,
  };
};

export const saveCloudDataToLocal = async (cloudData: CloudData): Promise<void> => {
  const [existingEntries, existingTags, existingFavs, existingPins, settings, syncSettings, localDevices] = await Promise.all([
    getEntries(),
    getEntryIdToTags(),
    getFavoriteEntryIds(),
    getPinnedEntryIds(),
    getSettings(),
    getSyncSettings(),
    getDiscoveredDevices(),
  ]);

  const entryMap = new Map<string, Entry>();
  for (const e of existingEntries) entryMap.set(e.content, e);

  const favSet = new Set(existingFavs);
  const pinSet = new Set(existingPins);
  const updatedTags = { ...existingTags };

  // 按设备筛选拦截逻辑 (Device Filter)
  const deviceFilter = settings.syncDeviceFilter;

  for (const ce of cloudData.entries) {
    if (!ce || !ce.content) continue;
    // 如果设置了指定从某台设备拉取，跳过非该设备的数据
    if (deviceFilter && deviceFilter !== "all" && ce.deviceId && ce.deviceId !== deviceFilter) {
      continue;
    }

    const existing = entryMap.get(ce.content);
    if (!existing) {
      entryMap.set(ce.content, {
        id: ce.id,
        content: ce.content,
        createdAt: ce.createdAt,
        copiedAt: ce.copiedAt || ce.createdAt,
      });
      if (ce.isFavorited) favSet.add(ce.id);
      if (ce.isPinned) pinSet.add(ce.id);
      if (ce.tags) {
        try {
          const parsed = JSON.parse(ce.tags);
          if (Array.isArray(parsed)) updatedTags[ce.id] = parsed;
        } catch {}
      }
    } else {
      existing.createdAt = Math.min(existing.createdAt, ce.createdAt);
      existing.copiedAt = Math.max(existing.copiedAt || 0, ce.copiedAt || 0);
      if (ce.isFavorited) favSet.add(existing.id);
      if (ce.isPinned) pinSet.add(existing.id);
      if (ce.tags) {
        try {
          const parsed = JSON.parse(ce.tags);
          if (Array.isArray(parsed)) {
            updatedTags[existing.id] = Array.from(
              new Set([...(updatedTags[existing.id] || []), ...parsed]),
            );
          }
        } catch {}
      }
    }
  }

  // 持续持久化与提取已发现的所有设备列表
  const allDiscoveredDevices = extractDiscoveredDevices(cloudData, localDevices);
  const currentDev: DeviceInfo = {
    deviceId: syncSettings.deviceId,
    deviceName: syncSettings.deviceName,
    lastActive: Date.now(),
  };
  const finalDevices = extractDiscoveredDevices({ entries: [], settings: [], devices: [currentDev] }, allDiscoveredDevices);

  await Promise.all([
    _setEntries(Array.from(entryMap.values())),
    _setEntryIdToTags(updatedTags),
    _setFavoriteEntryIds(Array.from(favSet)),
    _setPinnedEntryIds(Array.from(pinSet)),
    setDiscoveredDevices(finalDevices),
  ]);

  if (_cache) {
    _cache.devices = finalDevices;
  }
};

// ─── 内部缓存 ───────────────────────────────────────────
let _cache: CloudData | null = null;
let _connected = false;

const ensureCache = async (): Promise<CloudData> => {
  if (_cache) return _cache;
  const local = await getLocalAsCloudData();
  const provider = await getActiveProvider();
  if (!provider || !(await provider.isAvailable())) {
    _connected = false;
    _cache = local;
    return _cache;
  }
  _connected = true;
  try {
    const remote = await provider.pull();
    _cache = mergeCloudData(local, remote);
    await setSyncStatus({
      status: "success",
      lastSyncTime: Date.now(),
      message: "连接正常",
      itemCount: _cache.entries.length,
    });
  } catch (err: any) {
    _cache = local;
    await setSyncStatus({ status: "error", message: err?.message || "拉取数据失败" });
  }
  return _cache;
};

const flushCache = async (): Promise<void> => {
  if (!_cache) return;
  const provider = await getActiveProvider();
  if (provider && (await provider.isAvailable())) {
    try {
      const remote = await provider.pull();
      _cache = mergeCloudData(_cache, remote);
    } catch {}
    await provider.push(_cache);
    await saveCloudDataToLocal(_cache);
    await setSyncStatus({
      status: "success",
      lastSyncTime: Date.now(),
      message: "同步成功",
      itemCount: _cache.entries.length,
    });
  }
};

// ─── TxOp DSL ───────────────────────────────────────────
type TxOp =
  | { kind: "delete"; collection: string; id: string }
  | { kind: "update"; collection: string; id: string; data: Record<string, unknown> }
  | { kind: "link"; op: TxOp; linkData: Record<string, unknown> };

const makeTxEntry = (collection: string, id: string) => ({
  delete(): TxOp {
    return { kind: "delete", collection, id };
  },
  update(data: Record<string, unknown>): TxOp & { link(l: Record<string, unknown>): TxOp } {
    const op: TxOp = { kind: "update", collection, id, data };
    return {
      ...op,
      link(linkData: Record<string, unknown>): TxOp {
        return { kind: "link", op, linkData };
      },
    };
  },
});

// ─── 执行事务 ────────────────────────────────────────────
const applyOp = (data: CloudData, op: TxOp): void => {
  const realOp = op.kind === "link" ? op.op : op;

  if (realOp.kind === "delete") {
    if (realOp.collection === "entries") {
      data.entries = data.entries.filter((e) => e.id !== realOp.id);
    }
    return;
  }

  if (realOp.kind === "update") {
    if (realOp.collection === "entries") {
      const idx = data.entries.findIndex((e) => e.id === realOp.id);
      if (idx >= 0) {
        data.entries[idx] = { ...data.entries[idx]!, ...(realOp.data as any) };
      } else {
        data.entries.push({ id: realOp.id, emailContentHash: realOp.id, ...(realOp.data as any) } as any);
      }
    } else if (realOp.collection === "settings") {
      const idx = data.settings.findIndex((s) => s.id === realOp.id);
      if (idx >= 0) {
        data.settings[idx] = { ...data.settings[idx]!, ...(realOp.data as any) };
      } else {
        data.settings.push({ id: realOp.id, cloudItemLimit: null, ...(realOp.data as any) });
      }
    }
    return;
  }
};

// ─── Public db 对象 ──────────────────────────────────────
const db = {
  _reactor: {
    get status() {
      return _connected ? "open" : "closed";
    },
  },

  tx: new Proxy(
    {} as {
      entries: { [id: string]: ReturnType<typeof makeTxEntry> };
      settings: { [id: string]: ReturnType<typeof makeTxEntry> };
      [collection: string]: { [id: string]: ReturnType<typeof makeTxEntry> };
    },
    {
      get(_t, collection: string) {
        return new Proxy(
          {} as { [id: string]: ReturnType<typeof makeTxEntry> },
          {
            get(_c, id: string) {
              return makeTxEntry(collection, id);
            },
          },
        ) as { [id: string]: ReturnType<typeof makeTxEntry> } & Record<string, ReturnType<typeof makeTxEntry>>;
      },
    },
  ) as {
    entries: Record<string, ReturnType<typeof makeTxEntry>>;
    settings: Record<string, ReturnType<typeof makeTxEntry>>;
    [collection: string]: Record<string, ReturnType<typeof makeTxEntry>>;
  },

  async queryOnce(query: Record<string, unknown>): Promise<{ data: DbData }> {
    const data = await ensureCache();
    const result: DbData = {
      entries: [],
      subscriptions: [],
      settings: [],
    };

    for (const [collection, opts] of Object.entries(query)) {
      const where = (opts as any)?.$?.where as Record<string, unknown> | undefined;
      let items: unknown[];

      if (collection === "entries") {
        items = data.entries.filter((e) => {
          if (!where) return true;
          return Object.entries(where).every(([k, v]) => (e as any)[k] === v);
        });
      } else if (collection === "settings") {
        items = data.settings;
      } else if (collection === "subscriptions") {
        const provider = await getActiveProvider();
        const available = provider ? await provider.isAvailable() : false;
        items = available ? [{ id: "local-provider" }] : [];
      } else {
        items = [];
      }

      (result as any)[collection] = items;
    }

    return { data: result };
  },

  async transact(ops: TxOp | TxOp[]) {
    const data = await ensureCache();
    const list = Array.isArray(ops) ? ops : [ops];
    list.forEach((op) => applyOp(data, op));
    await flushCache();
  },

  async getAuth(): Promise<{ email: string; id: string } | null> {
    const provider = await getActiveProvider();
    if (!provider || !(await provider.isAvailable())) return null;
    return { email: "local@sync", id: "local-user" };
  },

  /** 主动触发一次双向拉取与推送合并 */
  async sync(): Promise<{ success: boolean; message: string; itemCount: number }> {
    const provider = await getActiveProvider();
    if (!provider || !(await provider.isAvailable())) {
      await setSyncStatus({ status: "idle", message: "未配置或未启用同步" });
      return { success: false, message: "未配置或未启用同步", itemCount: 0 };
    }
    await setSyncStatus({ status: "syncing", message: "正在同步..." });
    try {
      const local = await getLocalAsCloudData();
      let remote: CloudData = { entries: [], settings: [] };
      try {
        remote = await provider.pull();
      } catch (e: any) {
        console.warn("Pull remote warning:", e);
      }
      _cache = mergeCloudData(local, remote);
      await provider.push(_cache);
      await saveCloudDataToLocal(_cache);
      await setSyncStatus({
        status: "success",
        lastSyncTime: Date.now(),
        message: "多端同步成功",
        itemCount: _cache.entries.length,
      });
      return { success: true, message: "多端同步成功", itemCount: _cache.entries.length };
    } catch (err: any) {
      const msg = err?.message || "同步失败";
      await setSyncStatus({ status: "error", message: msg });
      return { success: false, message: msg, itemCount: 0 };
    }
  },

  /** 重置缓存，下次访问时重新从 Provider 拉取 */
  invalidateCache() {
    _cache = null;
  },
};

export default db;
