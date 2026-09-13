import { Storage } from "@plasmohq/storage";
import type { DeviceInfo } from "~utils/sync/provider";
import type { SyncSettings } from "./syncSettings";

const storage = new Storage({ area: "local" });
const KEY = "discoveredDevices";

export const getDiscoveredDevices = async (): Promise<DeviceInfo[]> => {
  const val = await storage.get<DeviceInfo[]>(KEY);
  return Array.isArray(val) ? val : [];
};

export const setDiscoveredDevices = async (devices: DeviceInfo[]): Promise<void> => {
  if (!Array.isArray(devices)) return;
  await storage.set(KEY, devices);
};

export const registerCurrentDevice = async (syncSettings: SyncSettings): Promise<DeviceInfo[]> => {
  const list = await getDiscoveredDevices();
  const now = Date.now();
  const map = new Map<string, DeviceInfo>();

  for (const d of list) {
    if (d && d.deviceId) {
      map.set(d.deviceId, {
        deviceId: d.deviceId,
        deviceName: d.deviceName || "未知设备",
        lastActive: typeof d.lastActive === "number" ? d.lastActive : now,
      });
    }
  }

  if (syncSettings.deviceId) {
    map.set(syncSettings.deviceId, {
      deviceId: syncSettings.deviceId,
      deviceName: syncSettings.deviceName || "设备 A",
      lastActive: now,
    });
  }

  const result = Array.from(map.values()).sort((a, b) => b.lastActive - a.lastActive);
  await storage.set(KEY, result);
  return result;
};
