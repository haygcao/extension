/**
 * utils/sync/handlers/history.ts
 * 浏览历史记录备份与去重同步模块
 */

export interface SyncHistoryItem {
  url: string;
  title?: string;
  lastVisitTime: number;
  visitCount: number;
}

/** 导出本地指定天数内的浏览历史记录 */
export async function exportHistory(daysLimit = 30): Promise<SyncHistoryItem[]> {
  if (typeof chrome === "undefined" || !chrome.history) return [];
  try {
    const startTime = Date.now() - daysLimit * 24 * 60 * 60 * 1000;
    const items = await chrome.history.search({
      text: "",
      startTime,
      maxResults: 2000,
    });

    return items
      .filter((item) => item.url && (item.url.startsWith("http://") || item.url.startsWith("https://")))
      .map((item) => ({
        url: item.url!,
        title: item.title,
        lastVisitTime: item.lastVisitTime || Date.now(),
        visitCount: item.visitCount || 1,
      }));
  } catch (err) {
    console.warn("[HistoryHandler] Failed to export history:", err);
    return [];
  }
}

/** 将远程同步的历史记录批量写回/添加至本地历史（若本地无此访问） */
export async function importHistory(items: SyncHistoryItem[]): Promise<number> {
  if (typeof chrome === "undefined" || !chrome.history) return 0;
  let added = 0;
  for (const item of items) {
    if (!item.url || (!item.url.startsWith("http://") && !item.url.startsWith("https://"))) continue;
    try {
      await chrome.history.addUrl({ url: item.url });
      added++;
    } catch {
      // 忽略单个添加失败
    }
  }
  return added;
}

/** 从本地清除指定 URL */
export async function deleteHistoryUrl(url: string): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.history) return false;
  try {
    await chrome.history.deleteUrl({ url });
    return true;
  } catch {
    return false;
  }
}
