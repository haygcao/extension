/**
 * utils/sync/handlers/sessions.ts
 * 打开的标签页 (Open Sections / Active Tabs) 与跨设备会话同步模块
 */

export interface SyncTab {
  url: string;
  title?: string;
  pinned: boolean;
  favIconUrl?: string;
}

export interface SyncSession {
  id: string;
  deviceId: string;
  deviceName: string;
  savedAt: string;
  label?: string;
  tabs: SyncTab[];
}

/** 导出当前浏览器打开的所有合法网页标签 */
export async function exportCurrentTabs(): Promise<SyncTab[]> {
  if (typeof chrome === "undefined" || !chrome.tabs) return [];
  try {
    const tabs = await chrome.tabs.query({});
    return tabs
      .filter(
        (t) =>
          t.url &&
          (t.url.startsWith("http://") || t.url.startsWith("https://")) &&
          !t.url.includes("login") &&
          !t.url.includes("token"),
      )
      .map((t) => ({
        url: t.url!,
        title: t.title || t.url,
        pinned: !!t.pinned,
        favIconUrl: t.favIconUrl,
      }));
  } catch (err) {
    console.warn("[SessionsHandler] Failed to export active tabs:", err);
    return [];
  }
}

/** 打包当前设备打开的标签页会话 */
export async function exportSession(deviceId: string, deviceName: string, label?: string): Promise<SyncSession> {
  const tabs = await exportCurrentTabs();
  return {
    id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    deviceId,
    deviceName,
    savedAt: new Date().toISOString(),
    label: label || `${deviceName} 会话 (${tabs.length} 标签页)`,
    tabs,
  };
}

/** 在新窗口或当前窗口批量打开会话中的标签页 */
export async function openSessionTabs(tabs: SyncTab[], inNewWindow = true): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.tabs) return;
  const validTabs = tabs.filter(
    (t) => t.url && (t.url.startsWith("http://") || t.url.startsWith("https://")),
  );
  if (validTabs.length === 0) return;

  try {
    if (inNewWindow && chrome.windows) {
      const win = await chrome.windows.create({ url: validTabs[0]!.url, focused: true });
      if (win && win.id) {
        for (let i = 1; i < validTabs.length; i++) {
          await chrome.tabs.create({ windowId: win.id, url: validTabs[i]!.url, active: false });
        }
      }
    } else {
      for (const t of validTabs) {
        await chrome.tabs.create({ url: t.url, active: false });
      }
    }
  } catch (err) {
    console.warn("[SessionsHandler] Error opening session tabs:", err);
  }
}
