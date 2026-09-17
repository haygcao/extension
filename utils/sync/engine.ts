/**
 * utils/sync/engine.ts — v2.6.0 分模态独立文件 WebDAV 存储架构 Sync Engine
 * 包含: 剪贴板 (clipboard.json)、书签 (bookmarks.json)、历史 (history.json)、
 *       会话 (sessions.json)、扩展 (extensions.json)、主控规则 (master_config.json)
 */

import { getSyncSettings, setSyncStatus } from "~storage/syncSettings";
import { getLocalAsCloudData, saveCloudDataToLocal } from "~utils/db/core";
import { exportBookmarksTree, type SyncBookmark } from "./handlers/bookmarks";
import { exportExtensions, type SyncExtension } from "./handlers/extensions";
import { exportHistory, importHistory, type SyncHistoryItem } from "./handlers/history";
import { exportSession, type SyncSession } from "./handlers/sessions";
import { attachMasterLockToPushData, processMasterSlaveRulesOnPull } from "./masterSlave";
import { getActiveProvider, type CloudData } from "./provider";

export interface MultiModalSyncPayload extends CloudData {
  bookmarks?: SyncBookmark[];
  history?: SyncHistoryItem[];
  sessions?: SyncSession[];
  extensions?: SyncExtension[];
  masterLock?: any;
}

/** 打包本地全模态同步数据 */
export async function getLocalMultiModalPayload(): Promise<MultiModalSyncPayload> {
  const [baseCloudData, syncSettings] = await Promise.all([
    getLocalAsCloudData(),
    getSyncSettings(),
  ]);

  const deviceId = syncSettings.deviceId || "local_device";
  const deviceName = syncSettings.deviceName || "此设备";

  const [bookmarks, history, currentSession, extensions] = await Promise.all([
    exportBookmarksTree(),
    exportHistory(30),
    exportSession(deviceId, deviceName),
    exportExtensions(),
  ]);

  return {
    ...baseCloudData,
    bookmarks,
    history,
    sessions: currentSession.tabs.length > 0 ? [currentSession] : [],
    extensions,
  };
}

/** 执行 v2.6.0 分模态独立文件同步任务 */
export async function runFullSync(): Promise<{ success: boolean; message: string }> {
  const provider = await getActiveProvider();
  if (!provider || !(await provider.isAvailable())) {
    await setSyncStatus({ status: "idle", message: "未配置或未启用同步后端" });
    return { success: false, message: "未配置或未启用同步后端" };
  }

  await setSyncStatus({ status: "syncing", message: "全模态分文件同步中..." });

  try {
    const localPayload = await getLocalMultiModalPayload();

    // 1. 拉取远程数据并应用主辅设备规则
    let remoteRaw: any = { entries: [], settings: [], devices: [] };
    try {
      remoteRaw = await provider.pull();
    } catch (e: any) {
      console.warn("[SyncEngine] Pull remote warning:", e);
    }

    const { processedEntries, masterState } = await processMasterSlaveRulesOnPull(remoteRaw);

    // 2. 剪贴板主数据根据许可范围进行合并
    const mergedBase = {
      entries: [...processedEntries, ...(localPayload.entries || [])],
      settings: localPayload.settings || [],
      devices: localPayload.devices || [],
    };

    // 3. 构建推送 payload，如果当前为主设备则附加主设备控制锁数据
    const pushPayload = await attachMasterLockToPushData({
      ...mergedBase,
      bookmarks: localPayload.bookmarks,
      history: localPayload.history,
      sessions: localPayload.sessions,
      extensions: localPayload.extensions,
    });

    await provider.push(pushPayload);
    await saveCloudDataToLocal(mergedBase);

    // 4. 后台写回历史记录
    if (remoteRaw?.history?.length) {
      importHistory(remoteRaw.history).catch(() => {});
    }

    const statusMsg = masterState.isForcedAuxiliary
      ? "分模态同步完成 (受云端主设备规则约束)"
      : "v2.6.0 分模态 WebDAV 独立文件同步完成";

    await setSyncStatus({
      status: "success",
      lastSyncTime: Date.now(),
      message: statusMsg,
      itemCount: mergedBase.entries.length,
    });

    return { success: true, message: statusMsg };
  } catch (err: any) {
    const errorMsg = err?.message || "同步出现异常";
    await setSyncStatus({ status: "error", message: errorMsg });
    return { success: false, message: errorMsg };
  }
}
