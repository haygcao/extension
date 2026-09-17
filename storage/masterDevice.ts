import { Storage } from "@plasmohq/storage";

export type ModalitySourceTarget = "all" | "none" | string; // "all" 全量 | "none" 禁用 | 具体源设备 ID

export interface ModalitySourceMapping {
  clipboard: ModalitySourceTarget;
  bookmarks: ModalitySourceTarget;
  history: ModalitySourceTarget;
  sessions: ModalitySourceTarget;
  extensions: ModalitySourceTarget;
}

export interface DevicePermissionRule {
  deviceId: string;                // 目标从设备 ID (如 设备 B)
  deviceName: string;              // 目标从设备名称
  sources: ModalitySourceMapping;  // 各模态绑定的数据源设备映射
}

export interface MasterDeviceState {
  isMasterDevice: boolean;          // 本地用户是否试图设置为主设备
  isForcedAuxiliary: boolean;       // 是否因云端已存在主设备而被强制降级为辅助设备
  masterDeviceId: string | null;     // 当前云端生效的主设备 ID
  masterDeviceName: string | null;   // 当前云端生效的主设备名称
  auxiliaryPullPolicy: "self_only" | "specified_device" | "all_devices"; // 主设备给辅助设备制定的全局拉取策略
  auxiliaryTargetDeviceId: string | null; // 当策略为 specified_device 时，允许拉取的特定设备 ID
  deviceRules: Record<string, DevicePermissionRule>; // 独立从设备 x 模态粒度 x 数据源设备的交叉规则矩阵
}

export const defaultMasterDeviceState: MasterDeviceState = {
  isMasterDevice: false,
  isForcedAuxiliary: false,
  masterDeviceId: null,
  masterDeviceName: null,
  auxiliaryPullPolicy: "all_devices",
  auxiliaryTargetDeviceId: null,
  deviceRules: {},
};

const storage = new Storage({ area: "local" });
const MASTER_DEVICE_KEY = "openclip_master_device_state";

export const getMasterDeviceState = async (): Promise<MasterDeviceState> => {
  const data = await storage.get<MasterDeviceState>(MASTER_DEVICE_KEY);
  return { ...defaultMasterDeviceState, ...(data || {}) };
};

export const setMasterDeviceState = async (
  update: Partial<MasterDeviceState>,
): Promise<MasterDeviceState> => {
  const current = await getMasterDeviceState();
  const next = { ...current, ...update };
  await storage.set(MASTER_DEVICE_KEY, next);
  return next;
};
