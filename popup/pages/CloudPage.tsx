import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Group,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
  useMantineTheme,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconAlertCircle,
  IconBookmark,
  IconBrandGoogleDrive,
  IconBrandOnedrive,
  IconClipboardList,
  IconCloudUpload,
  IconCrown,
  IconDatabase,
  IconDeviceDesktop,
  IconDownload,
  IconGlobe,
  IconHistory,
  IconPuzzle,
  IconRefresh,
  IconServer,
  IconShield,
  IconTarget,
} from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";

import { getDiscoveredDevices, registerCurrentDevice } from "~storage/discoveredDevices";
import {
  type DevicePermissionRule,
  getMasterDeviceState,
  type ModalitySourceTarget,
  setMasterDeviceState,
  type MasterDeviceState,
} from "~storage/masterDevice";
import {
  getSyncSettings,
  getSyncStatus,
  setSyncSettings,
  type SyncSettings,
  type SyncStatus,
} from "~storage/syncSettings";
import { runFullSync } from "~utils/sync/engine";
import type { DeviceInfo } from "~utils/sync/provider";
import { lightOrDark } from "~utils/sx";

import { EntryList } from "../components/EntryList";
import { NoEntriesOverlay } from "../components/NoEntriesOverlay";
import { entriesAtom, entryIdToTagsAtom, searchAtom } from "../states/atoms";

function formatLastSync(timestamp: number | null | undefined): string {
  if (!timestamp) return "从未同步";
  const diffMinutes = Math.floor((Date.now() - timestamp) / 60000);
  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  return new Date(timestamp).toLocaleDateString();
}

export const CloudPage = () => {
  const theme = useMantineTheme();
  const search = useAtomValue(searchAtom);
  const entries = useAtomValue(entriesAtom) || [];
  const entryIdToTags = useAtomValue(entryIdToTagsAtom) || {};

  const [syncSettings, setSyncSettingsState] = useState<SyncSettings | null>(null);
  const [syncStatus, setSyncStatusState] = useState<SyncStatus | null>(null);
  const [discoveredDevices, setDiscoveredDevices] = useState<DeviceInfo[]>([]);
  const [masterState, setMasterState] = useState<MasterDeviceState>({
    isMasterDevice: false,
    isForcedAuxiliary: false,
    masterDeviceId: null,
    masterDeviceName: null,
    auxiliaryPullPolicy: "all_devices",
    auxiliaryTargetDeviceId: null,
    deviceRules: {},
  });

  const [selectedTargetDeviceId, setSelectedTargetDeviceId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const filteredEntries = useMemo(() => {
    const reversed = [...entries].reverse();
    return reversed.filter(
      (entry) =>
        search.length === 0 ||
        entry.content.toLowerCase().includes(search.toLowerCase()) ||
        entryIdToTags[entry.id]?.some((tag) => tag.includes(search.toLowerCase())),
    );
  }, [entries, search, entryIdToTags]);

  const loadAllState = async () => {
    const [settings, status, master, devices] = await Promise.all([
      getSyncSettings(),
      getSyncStatus(),
      getMasterDeviceState(),
      getDiscoveredDevices(),
    ]);
    setSyncSettingsState(settings);
    setSyncStatusState(status);
    setMasterState(master);

    const registered = await registerCurrentDevice(settings);
    setDiscoveredDevices(registered);
  };

  useEffect(() => {
    loadAllState();
  }, []);

  const handleRunSync = async (targetDeviceId?: string) => {
    setSyncing(true);
    if (targetDeviceId && masterState.isMasterDevice) {
      await setMasterDeviceState({ auxiliaryTargetDeviceId: targetDeviceId });
    }
    await runFullSync();
    await loadAllState();
    setSyncing(false);
  };

  const handleToggleMaster = async (checked: boolean) => {
    const updated = await setMasterDeviceState({
      isMasterDevice: checked,
      isForcedAuxiliary: false,
    });
    setMasterState(updated);
  };

  const updateDeviceModalitySource = async (
    targetDeviceId: string,
    targetDeviceName: string,
    modality: "clipboard" | "bookmarks" | "history" | "sessions" | "extensions",
    sourceTarget: ModalitySourceTarget,
  ) => {
    const currentRules = { ...(masterState.deviceRules || {}) };
    const currentRule: DevicePermissionRule = currentRules[targetDeviceId] || {
      deviceId: targetDeviceId,
      deviceName: targetDeviceName,
      sources: {
        clipboard: "all",
        bookmarks: "all",
        history: "all",
        sessions: "all",
        extensions: "all",
      },
    };

    const updatedRule: DevicePermissionRule = {
      ...currentRule,
      sources: {
        ...currentRule.sources,
        [modality]: sourceTarget,
      },
    };

    const updatedRules = { ...currentRules, [targetDeviceId]: updatedRule };
    const nextMasterState = await setMasterDeviceState({ deviceRules: updatedRules });
    setMasterState(nextMasterState);
  };

  const handleToggleProvider = async (
    providerKey: "enableChromeSync" | "enableWebdav" | "enableOneDrive" | "enableGoogleDrive",
    checked: boolean,
  ) => {
    if (!syncSettings) return;
    const updated = { ...syncSettings, [providerKey]: checked };
    setSyncSettingsState(updated);
    await setSyncSettings(updated);
  };

  const hasAnyEnabled =
    syncSettings?.enableChromeSync ||
    syncSettings?.enableWebdav ||
    syncSettings?.enableOneDrive ||
    syncSettings?.enableGoogleDrive;

  const deviceSelectOptions = [
    { value: "all", label: "🌐 全量设备 (所有数据源)" },
    { value: "none", label: "⛔ 禁用 (不拉取任何源数据)" },
    ...discoveredDevices.map((d) => ({
      value: d.deviceId,
      label: `🎯 仅从【${d.deviceName}】`,
    })),
  ];

  return (
    <Stack spacing="xs" sx={{ flex: 1, minHeight: 0 }}>
      {/* 1. 顶部：平铺展开的 4 大云端存储服务节点 */}
      <Card p="xs" radius="md" withBorder bg={lightOrDark(theme, "gray.0", "dark.7")}>
        <Stack spacing={8}>
          <Group position="apart" align="center">
            <Group spacing="xs">
              <IconCloudUpload size="1.1rem" color={theme.colors.indigo[6]} />
              <Text fw={600} fz="xs">
                云端 Backend 同步节点状态（平铺展开，可多选中所有）
              </Text>
            </Group>
            <Button
              size="xs"
              variant="light"
              color="indigo"
              leftIcon={<IconRefresh size={14} />}
              loading={syncing}
              onClick={() => handleRunSync()}
            >
              全量多端同步
            </Button>
          </Group>

          <Group grow spacing="xs">
            {/* 1.1 Chrome Sync */}
            <Paper
              withBorder
              p="xs"
              radius="sm"
              bg={lightOrDark(theme, "white", "dark.6")}
              sx={{ opacity: syncSettings?.enableChromeSync ? 1 : 0.6 }}
            >
              <Stack spacing={4}>
                <Group position="apart" align="center" noWrap>
                  <Group spacing={6} noWrap>
                    <Checkbox
                      size="xs"
                      checked={!!syncSettings?.enableChromeSync}
                      onChange={(e) =>
                        handleToggleProvider("enableChromeSync", e.currentTarget.checked)
                      }
                    />
                    <IconDatabase size="0.95rem" color={theme.colors.blue[6]} />
                    <Text fz="xs" fw={600}>
                      Chrome Sync
                    </Text>
                  </Group>
                  <Badge
                    size="xs"
                    color={
                      !syncSettings?.enableChromeSync
                        ? "gray"
                        : syncStatus?.chrome?.status === "error"
                          ? "red"
                          : "green"
                    }
                    variant="dot"
                  >
                    {!syncSettings?.enableChromeSync
                      ? "未开启"
                      : syncStatus?.chrome?.status === "error"
                        ? "异常"
                        : "正常"}
                  </Badge>
                </Group>
                <Text fz={11} color="dimmed">
                  {syncSettings?.enableChromeSync
                    ? `同步: ${formatLastSync(syncStatus?.chrome?.lastSyncTime)} (${syncStatus?.chrome?.itemCount || 0}条)`
                    : "Chrome 账号静默同步"}
                </Text>
              </Stack>
            </Paper>

            {/* 1.2 WebDAV */}
            <Paper
              withBorder
              p="xs"
              radius="sm"
              bg={lightOrDark(theme, "white", "dark.6")}
              sx={{ opacity: syncSettings?.enableWebdav ? 1 : 0.6 }}
            >
              <Stack spacing={4}>
                <Group position="apart" align="center" noWrap>
                  <Group spacing={6} noWrap>
                    <Checkbox
                      size="xs"
                      checked={!!syncSettings?.enableWebdav}
                      onChange={(e) =>
                        handleToggleProvider("enableWebdav", e.currentTarget.checked)
                      }
                    />
                    <IconServer size="0.95rem" color={theme.colors.teal[6]} />
                    <Text fz="xs" fw={600}>
                      WebDAV 网盘
                    </Text>
                  </Group>
                  <Badge
                    size="xs"
                    color={
                      !syncSettings?.enableWebdav
                        ? "gray"
                        : syncStatus?.webdav?.status === "error"
                          ? "red"
                          : "green"
                    }
                    variant="dot"
                  >
                    {!syncSettings?.enableWebdav
                      ? "未开启"
                      : syncStatus?.webdav?.status === "error"
                        ? "异常"
                        : "正常"}
                  </Badge>
                </Group>
                <Text
                  fz={11}
                  color="dimmed"
                  sx={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {syncSettings?.enableWebdav
                    ? `同步: ${formatLastSync(syncStatus?.webdav?.lastSyncTime)}`
                    : "私有 WebDAV 网盘"}
                </Text>
              </Stack>
            </Paper>

            {/* 1.3 OneDrive */}
            <Paper
              withBorder
              p="xs"
              radius="sm"
              bg={lightOrDark(theme, "white", "dark.6")}
              sx={{ opacity: syncSettings?.enableOneDrive ? 1 : 0.6 }}
            >
              <Stack spacing={4}>
                <Group position="apart" align="center" noWrap>
                  <Group spacing={6} noWrap>
                    <Checkbox
                      size="xs"
                      checked={!!syncSettings?.enableOneDrive}
                      onChange={(e) =>
                        handleToggleProvider("enableOneDrive", e.currentTarget.checked)
                      }
                    />
                    <IconBrandOnedrive size="0.95rem" color={theme.colors.cyan[6]} />
                    <Text fz="xs" fw={600}>
                      OneDrive
                    </Text>
                  </Group>
                  <Badge
                    size="xs"
                    color={
                      !syncSettings?.enableOneDrive
                        ? "gray"
                        : !syncSettings.oneDriveAccessToken
                          ? "yellow"
                          : syncStatus?.onedrive?.status === "error"
                            ? "red"
                            : "green"
                    }
                    variant="dot"
                  >
                    {!syncSettings?.enableOneDrive
                      ? "未开启"
                      : !syncSettings.oneDriveAccessToken
                        ? "待授权"
                        : syncStatus?.onedrive?.status === "error"
                          ? "异常"
                          : "正常"}
                  </Badge>
                </Group>
                <Text fz={11} color="dimmed">
                  {syncSettings?.enableOneDrive
                    ? syncSettings.oneDriveAccessToken
                      ? `同步: ${formatLastSync(syncStatus?.onedrive?.lastSyncTime)}`
                      : "需在设置中完成授权"
                    : "微软云盘备份"}
                </Text>
              </Stack>
            </Paper>

            {/* 1.4 Google Drive */}
            <Paper
              withBorder
              p="xs"
              radius="sm"
              bg={lightOrDark(theme, "white", "dark.6")}
              sx={{ opacity: syncSettings?.enableGoogleDrive ? 1 : 0.6 }}
            >
              <Stack spacing={4}>
                <Group position="apart" align="center" noWrap>
                  <Group spacing={6} noWrap>
                    <Checkbox
                      size="xs"
                      checked={!!syncSettings?.enableGoogleDrive}
                      onChange={(e) =>
                        handleToggleProvider("enableGoogleDrive", e.currentTarget.checked)
                      }
                    />
                    <IconBrandGoogleDrive size="0.95rem" color={theme.colors.yellow[7]} />
                    <Text fz="xs" fw={600}>
                      Google Drive
                    </Text>
                  </Group>
                  <Badge
                    size="xs"
                    color={
                      !syncSettings?.enableGoogleDrive
                        ? "gray"
                        : !syncSettings.googleAccessToken
                          ? "yellow"
                          : syncStatus?.googledrive?.status === "error"
                            ? "red"
                            : "green"
                    }
                    variant="dot"
                  >
                    {!syncSettings?.enableGoogleDrive
                      ? "未开启"
                      : !syncSettings.googleAccessToken
                        ? "待授权"
                        : syncStatus?.googledrive?.status === "error"
                          ? "异常"
                          : "正常"}
                  </Badge>
                </Group>
                <Text fz={11} color="dimmed">
                  {syncSettings?.enableGoogleDrive
                    ? syncSettings.googleAccessToken
                      ? `同步: ${formatLastSync(syncStatus?.googledrive?.lastSyncTime)}`
                      : "需在设置中完成授权"
                    : "谷歌云端硬盘"}
                </Text>
              </Stack>
            </Paper>
          </Group>
        </Stack>
      </Card>

      {/* 2. 中部：设备墙与 Master 主设备粒度 + 源设备控制矩阵 */}
      <Card p="xs" radius="md" withBorder bg={lightOrDark(theme, "indigo.0", "dark.6")}>
        <Stack spacing="xs">
          <Group position="apart" align="center">
            <Group spacing="xs">
              <IconDeviceDesktop size="1.1rem" color={theme.colors.indigo[7]} />
              <Text fw={600} fz="xs">
                设备节点墙与 Master 模态 x 目标数据源拉取矩阵
              </Text>
              {masterState.isMasterDevice && !masterState.isForcedAuxiliary ? (
                <Badge size="xs" color="indigo" leftSection={<IconCrown size={12} />}>
                  主控制设备 (Master)
                </Badge>
              ) : (
                <Badge size="xs" color="orange" leftSection={<IconShield size={12} />}>
                  从属辅设备 (Auxiliary)
                </Badge>
              )}
            </Group>

            {/* 当云端已被锁定时，设为主设备 Switch 自动变灰禁用防抢！ */}
            <Tooltip
              label={
                masterState.isForcedAuxiliary
                  ? `已存在云端主控设备 (${masterState.masterDeviceName || "云端主控"})，无法设为主设备`
                  : "设置本机为主控制设备"
              }
            >
              <Group spacing="xs">
                <Text fz="xs" color="dimmed">
                  设为主设备
                </Text>
                <Switch
                  size="xs"
                  color="indigo"
                  checked={masterState.isMasterDevice && !masterState.isForcedAuxiliary}
                  disabled={masterState.isForcedAuxiliary}
                  onChange={(e) => handleToggleMaster(e.currentTarget.checked)}
                />
              </Group>
            </Tooltip>
          </Group>

          {masterState.isForcedAuxiliary && (
            <Alert icon={<IconAlertCircle size={14} />} color="orange" p="xs">
              <Text fz="xs">
                主设备已被「{masterState.masterDeviceName || "云端主控"}」锁定。本机已**自动变灰禁用主设备开关**。每个从设备拉取的模态及目标源设备完全受主设备权限矩阵下发约束。
              </Text>
            </Alert>
          )}

          {/* 本设备详细信息与拉取控制 */}
          <Paper p="xs" radius="sm" withBorder bg={lightOrDark(theme, "white", "dark.5")}>
            <Group position="apart" align="center">
              <Stack spacing={2}>
                <Group spacing={6}>
                  <Text fz="xs" fw={600}>
                    当前设备：{syncSettings?.deviceName || "设备 A"}
                  </Text>
                  <Badge size="xs" variant="outline">
                    ID: {syncSettings?.deviceId || "未知 ID"}
                  </Badge>
                </Group>
                <Text fz={11} color="dimmed">
                  {masterState.isMasterDevice
                    ? "主设备拥有最高控制权：可精确指定每个从设备从哪台特定设备拉取何种数据"
                    : `受主设备 (${masterState.masterDeviceName || "云端主控制设备"}) 交叉规则矩阵约束`}
                </Text>
              </Stack>

              {/* 主设备定向拉取选择器 */}
              {masterState.isMasterDevice && (
                <Group spacing="xs">
                  <Select
                    size="xs"
                    placeholder="选择独立拉取的设备..."
                    data={discoveredDevices.map((d) => ({
                      value: d.deviceId,
                      label: `${d.deviceName} (${d.deviceId.slice(0, 8)}...)`,
                    }))}
                    value={selectedTargetDeviceId}
                    onChange={setSelectedTargetDeviceId}
                    clearable
                    w={190}
                  />
                  <Button
                    size="xs"
                    variant="filled"
                    color="indigo"
                    leftIcon={<IconTarget size={14} />}
                    loading={syncing}
                    onClick={() => handleRunSync(selectedTargetDeviceId || undefined)}
                  >
                    {selectedTargetDeviceId ? "定向拉取此设备" : "全量合并拉取"}
                  </Button>
                </Group>
              )}
            </Group>
          </Paper>

          {/* 独立设备交叉管控矩阵表：主设备为每个设备精确绑定各自【剪贴板】【书签】【历史】【会话】【扩展】的数据源设备！ */}
          <Stack spacing={6}>
            <Text fz={11} color="dimmed" fw={600}>
              各个从设备的模态数据源绑定矩阵（例：限制【设备 B】仅从【设备 C】拉取 History，仅从【设备 D】拉取 Extension）：
            </Text>
            {discoveredDevices.map((dev) => {
              const isCurrent = dev.deviceId === syncSettings?.deviceId;
              const deviceRule: DevicePermissionRule = masterState.deviceRules?.[dev.deviceId] || {
                deviceId: dev.deviceId,
                deviceName: dev.deviceName,
                sources: {
                  clipboard: "all",
                  bookmarks: "all",
                  history: "all",
                  sessions: "all",
                  extensions: "all",
                },
              };

              return (
                <Paper
                  key={dev.deviceId}
                  p="xs"
                  radius="sm"
                  withBorder
                  bg={lightOrDark(theme, isCurrent ? "indigo.0" : "white", "dark.5")}
                >
                  <Stack spacing={6}>
                    <Group position="apart" align="center">
                      <Group spacing={6}>
                        <IconDeviceDesktop
                          size={14}
                          color={isCurrent ? theme.colors.indigo[6] : theme.colors.gray[6]}
                        />
                        <Text fz="xs" fw={600}>
                          从设备：{dev.deviceName}
                        </Text>
                        <Badge size="xs" color={isCurrent ? "indigo" : "gray"}>
                          {isCurrent ? "本机" : `ID: ${dev.deviceId.slice(0, 10)}...`}
                        </Badge>
                        <Text fz={10} color="dimmed">
                          {formatLastSync(dev.lastActive)}
                        </Text>
                      </Group>

                      {masterState.isMasterDevice && !isCurrent && (
                        <Button
                          size="xs"
                          compact
                          variant="light"
                          color="indigo"
                          leftIcon={<IconDownload size={12} />}
                          onClick={() => handleRunSync(dev.deviceId)}
                        >
                          主设备直接拉取此机器
                        </Button>
                      )}
                    </Group>

                    {/* 5大模态的数据源绑定下拉矩阵 */}
                    <Group grow spacing="xs">
                      <Select
                        size="xs"
                        disabled={!masterState.isMasterDevice}
                        label="📋 剪贴板源"
                        data={deviceSelectOptions}
                        value={deviceRule.sources?.clipboard || "all"}
                        onChange={(val) =>
                          updateDeviceModalitySource(
                            dev.deviceId,
                            dev.deviceName,
                            "clipboard",
                            val as any,
                          )
                        }
                      />
                      <Select
                        size="xs"
                        disabled={!masterState.isMasterDevice}
                        label="🔖 书签源"
                        data={deviceSelectOptions}
                        value={deviceRule.sources?.bookmarks || "all"}
                        onChange={(val) =>
                          updateDeviceModalitySource(
                            dev.deviceId,
                            dev.deviceName,
                            "bookmarks",
                            val as any,
                          )
                        }
                      />
                      <Select
                        size="xs"
                        disabled={!masterState.isMasterDevice}
                        label="📜 历史源"
                        data={deviceSelectOptions}
                        value={deviceRule.sources?.history || "all"}
                        onChange={(val) =>
                          updateDeviceModalitySource(
                            dev.deviceId,
                            dev.deviceName,
                            "history",
                            val as any,
                          )
                        }
                      />
                      <Select
                        size="xs"
                        disabled={!masterState.isMasterDevice}
                        label="🌐 会话源"
                        data={deviceSelectOptions}
                        value={deviceRule.sources?.sessions || "all"}
                        onChange={(val) =>
                          updateDeviceModalitySource(
                            dev.deviceId,
                            dev.deviceName,
                            "sessions",
                            val as any,
                          )
                        }
                      />
                      <Select
                        size="xs"
                        disabled={!masterState.isMasterDevice}
                        label="🧩 扩展源"
                        data={deviceSelectOptions}
                        value={deviceRule.sources?.extensions || "all"}
                        onChange={(val) =>
                          updateDeviceModalitySource(
                            dev.deviceId,
                            dev.deviceName,
                            "extensions",
                            val as any,
                          )
                        }
                      />
                    </Group>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        </Stack>
      </Card>

      {/* 3. 底部：云端多端同步剪贴板 Feed */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <EntryList
          noEntriesOverlay={
            !hasAnyEnabled ? (
              <Stack align="center" spacing="sm" p="xl">
                <IconCloudUpload size="2.5rem" color={theme.colors.gray[5]} />
                <Title order={5}>尚未开启多端同步</Title>
                <Text size="sm" color="dimmed" align="center" maw={380}>
                  支持 Chrome 内置同步、WebDAV（坚果云/Nextcloud/群晖等）、OneDrive、Google Drive 多端并行同步与设备管控。
                </Text>
              </Stack>
            ) : search.length === 0 ? (
              <NoEntriesOverlay
                title="暂无同步条目"
                subtitle="所有本地复制的内容均已自动纳入多端同步池中"
                description="剪贴板数据会自动在所有开启的云端存储中进行双向合并与设备拉取"
              />
            ) : (
              <NoEntriesOverlay title={`未找到包含 "${search}" 的条目`} />
            )
          }
          entries={filteredEntries}
        />
      </Box>
    </Stack>
  );
};
