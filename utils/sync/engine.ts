/**
 * utils/sync/engine.ts
 * 全模态数据同步管道 (Full-Spectrum Sync Engine)
 * 统一调度: 剪贴板历史(主)、主辅设备控制流、浏览器书签、浏览历史、打开的会话/标签页、扩展列表
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

/** 执行全模态同步任务 */
export async function runFullSync(): Promise<{ success: boolean; message: string }> {
  const provider = await getActiveProvider();
  if (!provider || !(await provider.isAvailable())) {
    await setSyncStatus({ status: "idle", message: "未配置或未启用同步后端" });
    return { success: false, message: "未配置或未启用同步后端" };
  }

  await setSyncStatus({ status: "syncing", message: "全模态同步中..." });

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
      ? "同步完成 (已自动降级为辅助设备，受主设备规则约束)"
      : "全模态同步完成";

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
