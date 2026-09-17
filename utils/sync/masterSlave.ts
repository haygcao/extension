/**
 * utils/sync/masterSlave.ts
 * 主/辅设备控制流与自动降级变形引擎 (Master-Slave Authority Engine)
 */

import {
  type DevicePermissionRule,
  getMasterDeviceState,
  setMasterDeviceState,
  type MasterDeviceState,
} from "~storage/masterDevice";
import { getSyncSettings } from "~storage/syncSettings";
import type { CloudEntry } from "./provider";

export interface CloudMasterLock {
  masterDeviceId: string;
  masterDeviceName: string;
  updatedAt: number;
  auxiliaryPullPolicy: "self_only" | "specified_device" | "all_devices";
  auxiliaryTargetDeviceId?: string | null;
  deviceRules?: Record<string, DevicePermissionRule>;
}

/** 在主设备推送时生成并附带主设备控制锁及全量从设备授权规则表 Payload */
export async function attachMasterLockToPushData<T extends Record<string, any>>(data: T): Promise<T> {
  const [masterState, syncSet] = await Promise.all([
    getMasterDeviceState(),
    getSyncSettings(),
  ]);

  if (masterState.isMasterDevice && !masterState.isForcedAuxiliary) {
    const lock: CloudMasterLock = {
      masterDeviceId: syncSet.deviceId,
      masterDeviceName: syncSet.deviceName || "主控制设备",
      updatedAt: Date.now(),
      auxiliaryPullPolicy: masterState.auxiliaryPullPolicy,
      auxiliaryTargetDeviceId: masterState.auxiliaryTargetDeviceId,
      deviceRules: masterState.deviceRules || {},
    };
    return { ...data, masterLock: lock };
  }
  return data;
}

/** 在拉取云端 Payload 时，进行主辅状态识别、强制变形与按从设备粒度矩阵安全拦截 */
export async function processMasterSlaveRulesOnPull(
  remoteData: any,
): Promise<{ processedEntries: CloudEntry[]; masterState: MasterDeviceState }> {
  const [localMasterState, syncSet] = await Promise.all([
    getMasterDeviceState(),
    getSyncSettings(),
  ]);

  const rawEntries: CloudEntry[] = Array.isArray(remoteData?.entries) ? remoteData.entries : [];
  const cloudLock: CloudMasterLock | undefined = remoteData?.masterLock;
  const currentDeviceId = syncSet.deviceId;

  // 1. 如果云端存在主设备锁
  if (cloudLock && cloudLock.masterDeviceId) {
    // 检查此设备是否为云端锁定的主设备
    if (cloudLock.masterDeviceId !== currentDeviceId) {
      // 并非主设备 -> 强制自动变形降级为辅助设备！
      const updatedState = await setMasterDeviceState({
        isMasterDevice: false,
        isForcedAuxiliary: true,
        masterDeviceId: cloudLock.masterDeviceId,
        masterDeviceName: cloudLock.masterDeviceName,
        auxiliaryPullPolicy: cloudLock.auxiliaryPullPolicy,
        auxiliaryTargetDeviceId: cloudLock.auxiliaryTargetDeviceId || null,
        deviceRules: cloudLock.deviceRules || {},
      });

      const recipientRule = cloudLock.deviceRules?.[currentDeviceId];

      // 依据主设备下发给该特定从设备的模态 x 源设备规则进行拦截
      const filteredEntries = rawEntries.filter((entry) => {
        if (!entry.deviceId) return true;
        if (entry.deviceId === currentDeviceId) return true; // 总是许可自主拉取自身的备份

        // 如果主设备为该特定从设备定制了专有规则 (如：剪贴板只能从设备 C 拉取)
        if (recipientRule?.sources?.clipboard) {
          const targetSource = recipientRule.sources.clipboard;
          if (targetSource === "none") return false;
          if (targetSource === "all") return true;
          return entry.deviceId === targetSource;
        }

        // 回退至全局策略
        if (cloudLock.auxiliaryPullPolicy === "self_only") {
          return false;
        }

        if (cloudLock.auxiliaryPullPolicy === "specified_device") {
          return entry.deviceId === cloudLock.auxiliaryTargetDeviceId;
        }

        return true; // "all_devices"
      });

      return { processedEntries: filteredEntries, masterState: updatedState };
    } else {
      // 当前设备恰好就是云端认定的主设备
      const updatedState = await setMasterDeviceState({
        isMasterDevice: true,
        isForcedAuxiliary: false,
        masterDeviceId: currentDeviceId,
        masterDeviceName: syncSet.deviceName,
      });
      return { processedEntries: rawEntries, masterState: updatedState };
    }
  }

  // 2. 云端尚无主设备锁
  return { processedEntries: rawEntries, masterState: localMasterState };
}
