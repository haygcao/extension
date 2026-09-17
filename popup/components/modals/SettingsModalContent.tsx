import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  NumberInput,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCheck,
  IconCloud,
  IconCrown,
  IconDeviceDesktop,
  IconFilter,
  IconRefresh,
  IconShieldLock,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import {
  getMasterDeviceState,
  setMasterDeviceState,
  type MasterDeviceState,
} from "~storage/masterDevice";
import { getSettings, setSettings, type Settings } from "~storage/settings";
import { getSyncSettings, setSyncSettings, type SyncSettings } from "~storage/syncSettings";
import { runFullSync } from "~utils/sync/engine";

export const SettingsModalContent = () => {
  const [syncSettings, setSyncSet] = useState<SyncSettings>({
    deviceId: "",
    deviceName: "此电脑",
    enableChromeSync: false,
    enableWebdav: false,
    enableOneDrive: false,
    enableGoogleDrive: false,
    webdavUrl: "",
    webdavUsername: "",
    webdavPassword: "",
    webdavPath: "/OpenClipSync/openclip-sync.json",
    oneDriveFolder: "/OpenClipSync",
    oneDriveClientId: "",
    oneDriveClientSecret: "",
    oneDriveAccessToken: "",
    googleDriveFolder: "/OpenClipSync",
    googleClientId: "",
    googleClientSecret: "",
    googleAccessToken: "",
  });

  const [settings, setSet] = useState<Settings>({
    historyRetentionDays: 30,
    localItemCharacterLimit: 50000,
    syncDeviceFilter: "all",
    clipboardMonitorIsEnabled: true,
  } as any);

  const [masterState, setMasterState] = useState<MasterDeviceState>({
    isMasterDevice: false,
    isForcedAuxiliary: false,
    masterDeviceId: null,
    masterDeviceName: null,
    auxiliaryPullPolicy: "all_devices",
    auxiliaryTargetDeviceId: null,
    deviceRules: {},
  });

  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    Promise.all([getSyncSettings(), getSettings(), getMasterDeviceState()]).then(
      ([sSet, st, mState]) => {
        setSyncSet(sSet);
        setSet(st);
        setMasterState(mState);
      },
    );
  }, []);

  const handleSave = async () => {
    await Promise.all([
      setSyncSettings(syncSettings),
      setSettings(settings),
      setMasterDeviceState(masterState),
    ]);
    notifications.show({
      title: "保存成功",
      message: "同步设置与主辅设备权限已更新",
      color: "teal",
      icon: <IconCheck size={16} />,
    });
  };

  const handleTriggerSync = async () => {
    setSyncing(true);
    const res = await runFullSync();
    setSyncing(false);

    // 重新刷新主辅状态
    const updatedState = await getMasterDeviceState();
    setMasterState(updatedState);

    notifications.show({
      title: res.success ? "同步完成" : "同步提示",
      message: res.message,
      color: res.success ? "teal" : "red",
    });
  };

  return (
    <Stack spacing="md">
      <Tabs defaultValue="sync">
        <Tabs.List grow>
          <Tabs.Tab value="sync" icon={<IconCloud size={16} />}>
            云同步服务
          </Tabs.Tab>
          <Tabs.Tab value="master" icon={<IconCrown size={16} />}>
            主/辅设备控制
          </Tabs.Tab>
          <Tabs.Tab value="rules" icon={<IconFilter size={16} />}>
            规则与保留
          </Tabs.Tab>
          <Tabs.Tab value="device" icon={<IconDeviceDesktop size={16} />}>
            此设备属性
          </Tabs.Tab>
        </Tabs.List>

        {/* Sync Settings */}
        <Tabs.Panel value="sync" pt="xs">
          <Stack spacing="xs">
            <Select
              label="同步后端提供商"
              value={syncSettings.provider}
              onChange={(val) => setSyncSet((prev) => ({ ...prev, provider: (val as any) || "none" }))}
              data={[
                { value: "none", label: "禁用同步 (仅本地)" },
                { value: "webdav", label: "WebDAV / 私有云盘" },
                { value: "chromesync", label: "Chrome Sync (谷歌内置同步)" },
              ]}
            />

            {syncSettings.provider === "webdav" && (
              <Stack spacing="xs" mt="xs">
                <TextInput
                  label="WebDAV 服务器 URL"
                  placeholder="https://dav.nextcloud.com/remote.php/dav/files/user/"
                  value={syncSettings.webdavUrl || ""}
                  onChange={(e) => setSyncSet((prev) => ({ ...prev, webdavUrl: e.target.value }))}
                />
                <Group grow>
                  <TextInput
                    label="用户名"
                    value={syncSettings.webdavUsername || ""}
                    onChange={(e) => setSyncSet((prev) => ({ ...prev, webdavUsername: e.target.value }))}
                  />
                  <PasswordInput
                    label="密码 / App Token"
                    value={syncSettings.webdavPassword || ""}
                    onChange={(e) => setSyncSet((prev) => ({ ...prev, webdavPassword: e.target.value }))}
                  />
                </Group>
                <TextInput
                  label="同步子目录路径"
                  value={syncSettings.webdavPath || "openclip"}
                  onChange={(e) => setSyncSet((prev) => ({ ...prev, webdavPath: e.target.value }))}
                />
              </Stack>
            )}

            <Button
              mt="sm"
              variant="light"
              leftIcon={<IconRefresh size={16} />}
              loading={syncing}
              onClick={handleTriggerSync}
            >
              立即测试并触发全模态同步
            </Button>
          </Stack>
        </Tabs.Panel>

        {/* Master/Slave Controls */}
        <Tabs.Panel value="master" pt="xs">
          <Stack spacing="xs">
            {masterState.isForcedAuxiliary ? (
              <Alert icon={<IconAlertCircle size={16} />} title="辅助设备 (受限状态)" color="orange">
                云端已被设备「{masterState.masterDeviceName || masterState.masterDeviceId}
                」锁定为主设备。此设备已**自动变形并降级为辅助设备**，无权修改拉取控制逻辑。
              </Alert>
            ) : (
              <Card p="xs" withBorder radius="md" style={{ backgroundColor: "rgba(76, 110, 245, 0.05)" }}>
                <Group position="apart">
                  <Group spacing="xs">
                    <IconCrown size={20} color="#4C6EF5" />
                    <Stack spacing={0}>
                      <Text size="sm" weight={600}>
                        将此设备标记为主设备 (Master Device)
                      </Text>
                      <Text size="xs" color="dimmed">
                        主设备首次同步上传后，云端其他设备读取时将自动降级为辅助设备。
                      </Text>
                    </Stack>
                  </Group>
                  <Switch
                    checked={masterState.isMasterDevice}
                    onChange={(e) =>
                      setMasterState((prev) => ({ ...prev, isMasterDevice: e.currentTarget.checked }))
                    }
                  />
                </Group>
              </Card>
            )}

            {masterState.isMasterDevice && !masterState.isForcedAuxiliary && (
              <Stack spacing="xs" mt="xs">
                <Text size="xs" weight={600} color="indigo">
                  👑 主设备专属授权管理：授权辅助设备的拉取权限
                </Text>
                <Select
                  label="辅助设备拉取范围"
                  value={masterState.auxiliaryPullPolicy}
                  onChange={(val) =>
                    setMasterState((prev) => ({ ...prev, auxiliaryPullPolicy: (val as any) || "all_devices" }))
                  }
                  data={[
                    { value: "all_devices", label: "允许辅助设备拉取所有设备的数据" },
                    { value: "self_only", label: "严格限制：仅允许辅助设备拉取其自主备份的数据" },
                    { value: "specified_device", label: "指定模式：仅允许拉取自身 + 指定特定设备" },
                  ]}
                />
                {masterState.auxiliaryPullPolicy === "specified_device" && (
                  <TextInput
                    label="指定许可拉取的设备 ID"
                    placeholder="输入设备 ID"
                    value={masterState.auxiliaryTargetDeviceId || ""}
                    onChange={(e) =>
                      setMasterState((prev) => ({ ...prev, auxiliaryTargetDeviceId: e.target.value }))
                    }
                  />
                )}
              </Stack>
            )}
          </Stack>
        </Tabs.Panel>

        {/* Rules */}
        <Tabs.Panel value="rules" pt="xs">
          <Stack spacing="xs">
            <NumberInput
              label="剪贴板历史保留天数 (0 为永久)"
              value={settings.historyRetentionDays || 30}
              onChange={(val) => setSet((prev: Settings) => ({ ...prev, historyRetentionDays: Number(val) || 0 }))}
            />
            <NumberInput
              label="单条记录最大字符限制"
              value={settings.localItemCharacterLimit || 50000}
              onChange={(val) => setSet((prev: Settings) => ({ ...prev, localItemCharacterLimit: Number(val) || 50000 }))}
            />
          </Stack>
        </Tabs.Panel>

        {/* Device Settings */}
        <Tabs.Panel value="device" pt="xs">
          <Stack spacing="xs">
            <TextInput
              label="此设备自定义名称"
              value={syncSettings.deviceName || "此电脑"}
              onChange={(e) => setSyncSet((prev) => ({ ...prev, deviceName: e.target.value }))}
            />
            <Text size="xs" color="dimmed">
              设备 ID: {syncSettings.deviceId || "自动生成中..."}
            </Text>
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <Divider />

      <Group position="apart">
        <Text size="xs" color="dimmed">
          OpenClip Sync v2.4.0 — 100% 独立自主去中心化架构
        </Text>
        <Button size="sm" onClick={handleSave}>
          保存所有设置
        </Button>
      </Group>
    </Stack>
  );
};
