/**
 * utils/sync/handlers/extensions.ts
 * 已安装浏览器扩展插件清单同步与应用商店快速定位模块
 */

export interface SyncExtension {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  homepageUrl?: string;
  storeUrl: string;
  description?: string;
  type: string;
  store?: "chrome" | "firefox";
}

/** 生成扩展在 Chrome Web Store 或 Edge/Firefox 的跳转链接 */
export function buildStoreUrl(id: string, name: string): string {
  const isFirefox = typeof process !== "undefined" && process.env?.PLASMO_TARGET?.includes("firefox");
  if (isFirefox) {
    return `https://addons.mozilla.org/firefox/search/?q=${encodeURIComponent(name)}`;
  }
  return `https://chromewebstore.google.com/detail/${id}`;
}

/** 导出当前浏览器安装的第三方扩展列表 */
export async function exportExtensions(): Promise<SyncExtension[]> {
  if (typeof chrome === "undefined" || !chrome.management) return [];
  try {
    const list = await chrome.management.getAll();
    const selfId = chrome.runtime.id;

    return list
      .filter((ext) => {
        if (ext.id === selfId) return false;
        if (ext.type === "theme") return false;
        if (ext.installType === "admin") return false;
        return true;
      })
      .map((ext) => ({
        id: ext.id,
        name: ext.name,
        version: ext.version,
        enabled: ext.enabled,
        homepageUrl: ext.homepageUrl,
        storeUrl: buildStoreUrl(ext.id, ext.name),
        description: ext.description,
        type: ext.type,
        store: "chrome",
      }));
  } catch (err) {
    console.warn("[ExtensionsHandler] Failed to export extensions list:", err);
    return [];
  }
}
