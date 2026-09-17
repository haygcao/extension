import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  Group,
  NumberInput,
  Paper,
  PasswordInput,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  useMantineTheme,
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
  IconSettings,
  IconShieldLock,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { getDiscoveredDevices } from "~storage/discoveredDevices";
import {
  getMasterDeviceState,
  setMasterDeviceState,
  type MasterDeviceState,
} from "~storage/masterDevice";
import { getSettings, setSettings, type Settings } from "~storage/settings";
import { getSyncSettings, setSyncSettings, type SyncSettings } from "~storage/syncSettings";
import { runFullSync } from "~utils/sync/engine";
import { lightOrDark } from "~utils/sx";

export const SettingsPage = () => {
  const theme = useMantineTheme();
  const [syncSettings, setSyncSet] = useState<SyncSettings>({
    deviceId: "",
    deviceName: "此电脑",
    enableChromeSync: true,
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
      message: "同步设置与系统属性已全面更新",
      color: "teal",
      icon: <IconCheck size={16} />,
    });
  };

  const handleTriggerSync = async () => {
    setSyncing(true);
    const res = await runFullSync();
    setSyncing(false);

    const updatedState = await getMasterDeviceState();
    setMasterState(updatedState);

    notifications.show({
      title: res.success ? "同步完成" : "同步提示",
      message: res.message,
      color: res.success ? "teal" : "red",
    });
  };

  return (
    <ScrollArea sx={{ flex: 1 }}>
      <Stack spacing="md" p="xs">
        <Group position="apart" align="center">
          <Group spacing="xs">
            <IconSettings size="1.2rem" color={theme.colors.indigo[6]} />
            <Title order={5}>OpenClip Sync 系统与服务设置</Title>
            <Badge size="xs" color="blue">
              v2.5.0
            </Badge>
          </Group>
          <Button size="xs" color="indigo" onClick={handleSave}>
            保存全部修改
          </Button>
        </Group>

        {/* 1. 多云后端支持：完全平铺展开 (无折叠，可多选) */}
        <Card p="sm" radius="md" withBorder bg={lightOrDark(theme, "gray.0", "dark.7")}>
          <Stack spacing="xs">
            <Group spacing="xs">
              <IconCloud size={18} color={theme.colors.indigo[6]} />
              <Text fw={600} fz="sm">
                云端同步 Backend 选项（平铺展开，可同时勾选任意多个服务）
              </Text>
            </Group>

            <Group spacing="lg">
              <Checkbox
                label="Chrome Sync (谷歌浏览器内置账号静默同步)"
                checked={syncSettings.enableChromeSync}
                onChange={(e) =>
                  setSyncSet((prev) => ({ ...prev, enableChromeSync: e.currentTarget.checked }))
                }
              />
              <Checkbox
                label="WebDAV (坚果云 / Nextcloud / 群晖私有云)"
                checked={syncSettings.enableWebdav}
                onChange={(e) =>
                  setSyncSet((prev) => ({ ...prev, enableWebdav: e.currentTarget.checked }))
                }
              />
              <Checkbox
                label="OneDrive (微软云盘)"
                checked={syncSettings.enableOneDrive}
                onChange={(e) =>
                  setSyncSet((prev) => ({ ...prev, enableOneDrive: e.currentTarget.checked }))
                }
              />
              <Checkbox
                label="Google Drive (谷歌云端硬盘)"
                checked={syncSettings.enableGoogleDrive}
                onChange={(e) =>
                  setSyncSet((prev) => ({ ...prev, enableGoogleDrive: e.currentTarget.checked }))
                }
              />
            </Group>

            {/* WebDAV 展开表单 */}
            {syncSettings.enableWebdav && (
              <Paper p="xs" radius="sm" withBorder bg={lightOrDark(theme, "white", "dark.6")} mt="xs">
                <Stack spacing="xs">
                  <Text fz="xs" fw={600} color="indigo">
                    WebDAV 服务器参数配置
                  </Text>
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
                      label="密码 / 应用授权码"
                      value={syncSettings.webdavPassword || ""}
                      onChange={(e) => setSyncSet((prev) => ({ ...prev, webdavPassword: e.target.value }))}
                    />
                  </Group>
                </Stack>
              </Paper>
            )}

            <Button
              mt="xs"
              variant="light"
              color="indigo"
              size="xs"
              leftIcon={<IconRefresh size={14} />}
              loading={syncing}
              onClick={handleTriggerSync}
            >
              测试联机并立即触发全模态同步
            </Button>
          </Stack>
        </Card>

        {/* 2. 主/辅设备属性与自动防抢判定 */}
        <Card p="sm" radius="md" withBorder bg={lightOrDark(theme, "indigo.0", "dark.6")}>
          <Stack spacing="xs">
            <Group spacing="xs">
              <IconCrown size={18} color={theme.colors.indigo[7]} />
              <Text fw={600} fz="sm">
                设备角色与 Master 主设备互斥防抢逻辑
              </Text>
            </Group>

            {masterState.isForcedAuxiliary ? (
              <Alert icon={<IconAlertCircle size={16} />} title="已自动变灰防抢并降级为辅助设备" color="orange">
                云端目录已存在生效的主设备：
                <Text fw={600} component="span">
                  「{masterState.masterDeviceName || masterState.masterDeviceId || "云端主控"}」
                </Text>
                。当主设备存在时，本机【设为主设备】开关**自动变灰并禁止抢夺**，严格受主设备规则下发管控。
              </Alert>
            ) : (
              <Paper p="xs" radius="sm" withBorder bg={lightOrDark(theme, "white", "dark.5")}>
                <Group position="apart">
                  <Stack spacing={2}>
                    <Text size="xs" fw={600}>
                      将本机标记为主设备 (Master Device)
                    </Text>
                    <Text size="11px" color="dimmed">
                      首次标记并同步到云端后，后续其他设备读取该目录时均会自动变灰降级为辅助设备。
                    </Text>
                  </Stack>
                  <Switch
                    size="md"
                    color="indigo"
                    checked={masterState.isMasterDevice}
                    disabled={masterState.isForcedAuxiliary}
                    onChange={(e) =>
                      setMasterState((prev) => ({ ...prev, isMasterDevice: e.currentTarget.checked }))
                    }
                  />
                </Group>
              </Paper>
            )}
          </Stack>
        </Card>

        {/* 3. 本机与存储清理规则 */}
        <Card p="sm" radius="md" withBorder bg={lightOrDark(theme, "gray.0", "dark.7")}>
          <Stack spacing="xs">
            <Group spacing="xs">
              <IconFilter size={18} color={theme.colors.blue[6]} />
              <Text fw={600} fz="sm">
                本机属性与数据保留策略
              </Text>
            </Group>

            <Group grow>
              <TextInput
                label="本机设备名称"
                value={syncSettings.deviceName || "此电脑"}
                onChange={(e) => setSyncSet((prev) => ({ ...prev, deviceName: e.target.value }))}
              />
              <NumberInput
                label="剪贴板历史保留天数 (0 为永久)"
                value={settings.historyRetentionDays || 30}
                onChange={(val) =>
                  setSet((prev: Settings) => ({ ...prev, historyRetentionDays: Number(val) || 0 }))
                }
              />
            </Group>

            <NumberInput
              label="单条剪贴板记录最大字符上限"
              value={settings.localItemCharacterLimit || 50000}
              onChange={(val) =>
                setSet((prev: Settings) => ({
                  ...prev,
                  localItemCharacterLimit: Number(val) || 50000,
                }))
              }
            />
          </Stack>
        </Card>

        <Divider />

        <Group position="apart">
          <Text size="xs" color="dimmed">
            OpenClip Sync v2.5.0 — 100% 独立自主去中心化架构
          </Text>
          <Button size="sm" color="indigo" onClick={handleSave}>
            保存全部配置
          </Button>
        </Group>
      </Stack>
    </ScrollArea>
  );
};
