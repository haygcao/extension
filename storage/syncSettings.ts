import { Storage } from "@plasmohq/storage";

export type SyncProviderType = "chrome" | "webdav" | "onedrive" | "googledrive" | "none";

export interface SyncSettings {
  deviceName: string;
  enableChromeSync: boolean;
  enableWebdav: boolean;
  enableOneDrive: boolean;
  enableGoogleDrive: boolean;
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavPath: string;
  oneDriveFolder: string;
  oneDriveClientId: string;
  oneDriveClientSecret: string;
  oneDriveAccessToken: string;
  googleDriveFolder: string;
  googleClientId: string;
  googleClientSecret: string;
  googleAccessToken: string;
  // Legacy compat
  provider?: SyncProviderType;
}

const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  deviceName: "设备 A",
  enableChromeSync: false,
  enableWebdav: false,
  enableOneDrive: false,
  enableGoogleDrive: false,
  webdavUrl: "",
  webdavUsername: "",
  webdavPassword: "",
  webdavPath: "/openclip-sync.json",
  oneDriveFolder: "/OpenClipSync",
  oneDriveClientId: "",
  oneDriveClientSecret: "",
  oneDriveAccessToken: "",
  googleDriveFolder: "/OpenClipSync",
  googleClientId: "",
  googleClientSecret: "",
  googleAccessToken: "",
};

const storage = new Storage({ area: "local" });
const KEY = "syncSettings";

export const getSyncSettings = async (): Promise<SyncSettings> => {
  const val = (await storage.get<any>(KEY)) || {};
  return {
    ...DEFAULT_SYNC_SETTINGS,
    ...val,
    enableChromeSync: typeof val.enableChromeSync === "boolean" ? val.enableChromeSync : false,
    enableWebdav: typeof val.enableWebdav === "boolean" ? val.enableWebdav : false,
    enableOneDrive: typeof val.enableOneDrive === "boolean" ? val.enableOneDrive : false,
    enableGoogleDrive: typeof val.enableGoogleDrive === "boolean" ? val.enableGoogleDrive : false,
  };
};

export const setSyncSettings = async (settings: Partial<SyncSettings>): Promise<void> => {
  const current = await getSyncSettings();
  const next = { ...current, ...settings };
  delete (next as any).provider;
  await storage.set(KEY, next);
};

export interface ProviderDetailStatus {
  lastSyncTime: number | null;
  status: "idle" | "syncing" | "success" | "error";
  message: string;
  itemCount: number;
}

export interface SyncStatus {
  lastSyncTime: number | null;
  status: "idle" | "syncing" | "success" | "error";
  message: string;
  itemCount: number;
  chrome?: ProviderDetailStatus;
  webdav?: ProviderDetailStatus;
  onedrive?: ProviderDetailStatus;
  googledrive?: ProviderDetailStatus;
}

const DEFAULT_PROVIDER_STATUS: ProviderDetailStatus = {
  lastSyncTime: null,
  status: "idle",
  message: "",
  itemCount: 0,
};

const DEFAULT_SYNC_STATUS: SyncStatus = {
  lastSyncTime: null,
  status: "idle",
  message: "",
  itemCount: 0,
  chrome: { ...DEFAULT_PROVIDER_STATUS },
  webdav: { ...DEFAULT_PROVIDER_STATUS },
  onedrive: { ...DEFAULT_PROVIDER_STATUS },
  googledrive: { ...DEFAULT_PROVIDER_STATUS },
};

const STATUS_KEY = "syncStatus";

export const getSyncStatus = async (): Promise<SyncStatus> => {
  const val = await storage.get<SyncStatus>(STATUS_KEY);
  return {
    ...DEFAULT_SYNC_STATUS,
    ...val,
    chrome: { ...DEFAULT_PROVIDER_STATUS, ...val?.chrome },
    webdav: { ...DEFAULT_PROVIDER_STATUS, ...val?.webdav },
    onedrive: { ...DEFAULT_PROVIDER_STATUS, ...val?.onedrive },
    googledrive: { ...DEFAULT_PROVIDER_STATUS, ...val?.googledrive },
  };
};

export const setSyncStatus = async (status: Partial<SyncStatus>): Promise<void> => {
  const current = await getSyncStatus();
  await storage.set(STATUS_KEY, { ...current, ...status });
};

export const updateProviderStatus = async (
  providerKey: "chrome" | "webdav" | "onedrive" | "googledrive",
  status: Partial<ProviderDetailStatus>,
): Promise<void> => {
  const current = await getSyncStatus();
  const updatedProvider = { ...current[providerKey], ...status };
  await storage.set(STATUS_KEY, {
    ...current,
    [providerKey]: updatedProvider,
    lastSyncTime: status.lastSyncTime || current.lastSyncTime,
  });
};
