import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Loader,
  Paper,
  rem,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
  useMantineTheme,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconBrandGoogleDrive,
  IconBrandOnedrive,
  IconCheck,
  IconCloud,
  IconCloudUpload,
  IconDatabase,
  IconFolder,
  IconRefresh,
  IconServer,
  IconSettings,
  IconX,
} from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";

import { CommonActionIcon } from "~popup/components/CommonActionIcon";
import { EntryList } from "~popup/components/EntryList";
import { SettingsModalContent } from "~popup/components/modals/SettingsModalContent";
import { NoEntriesOverlay } from "~popup/components/NoEntriesOverlay";
import { useEntries } from "~popup/contexts/EntriesContext";
import { useEntryIdToTags } from "~popup/contexts/EntryIdToTagsContext";
import { searchAtom } from "~popup/states/atoms";
import {
  getSyncSettings,
  getSyncStatus,
  type ProviderDetailStatus,
  type SyncSettings,
  type SyncStatus,
} from "~storage/syncSettings";
import db from "~utils/db/react";
import {
  chromeSyncProvider,
  createGoogleDriveProvider,
  createOneDriveProvider,
  createWebDavProvider,
} from "~utils/sync/provider";
import { defaultBorderColor, lightOrDark } from "~utils/sx";

export const CloudPage = () => {
  const theme = useMantineTheme();
  const search = useAtomValue(searchAtom);
  const entries = useEntries();
  const entryIdToTags = useEntryIdToTags();

  const [syncSettings, setSyncSettings] = useState<SyncSettings | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [providerTesting, setProviderTesting] = useState<string | null>(null);

  const loadStatus = async () => {
    const [s, st] = await Promise.all([getSyncSettings(), getSyncStatus()]);
    setSyncSettings(s);
    setSyncStatus(st);
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleManualSyncAll = async () => {
    setSyncingAll(true);
    try {
      const res = await db.sync();
      await loadStatus();
      if (res.success) {
        notifications.show({
          color: "green",
          title: "全端同步完成",
          message: `成功同步 ${res.itemCount} 条剪贴板历史记录到已启用的存储服务。`,
        });
      } else {
        notifications.show({
          color: "red",
          title: "同步失败",
          message: res.message || "未能连接到同步服务，请检查网络或配置。",
        });
      }
    } finally {
      setSyncingAll(false);
    }
  };

  const handleTestProvider = async (providerName: "chrome" | "webdav" | "onedrive" | "googledrive") => {
    if (!syncSettings) return;
    setProviderTesting(providerName);
    try {
      if (providerName === "chrome") {
        await chromeSyncProvider.pull();
      } else if (providerName === "webdav") {
        const p = createWebDavProvider(
          syncSettings.webdavUrl,
          syncSettings.webdavUsername,
          syncSettings.webdavPassword,
          syncSettings.webdavPath || "/openclip-sync.json",
        );
        await p.pull();
      } else if (providerName === "onedrive") {
        const p = createOneDriveProvider(
          syncSettings.oneDriveAccessToken,
          syncSettings.oneDriveFolder || "/OpenClipSync",
        );
        await p.pull();
      } else if (providerName === "googledrive") {
        const p = createGoogleDriveProvider(
          syncSettings.googleAccessToken,
          syncSettings.googleDriveFolder || "/OpenClipSync",
        );
        await p.pull();
      }
      await loadStatus();
      notifications.show({
        color: "green",
        title: "连接成功",
        message: `${providerName.toUpperCase()} 连通性测试正常！`,
      });
    } catch (e: any) {
      await loadStatus();
      notifications.show({
        color: "red",
        title: "连接失败",
        message: e?.message || "连通性测试异常，请检查配置或授权。",
      });
    } finally {
      setProviderTesting(null);
    }
  };

  const openSettings = () => {
    modals.open({
      padding: 0,
      size: "xl",
      withCloseButton: false,
      children: <SettingsModalContent defaultTab="cloud" />,
    });
  };

  const formatLastSync = (timestamp: number | null | undefined) => {
    if (!timestamp) return "尚未同步";
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 10) return "刚刚";
    if (diffSec < 60) return `${diffSec} 秒前`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} 分钟前`;
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const hasAnyEnabled =
    syncSettings?.enableChromeSync ||
    syncSettings?.enableWebdav ||
    syncSettings?.enableOneDrive ||
    syncSettings?.enableGoogleDrive;

  const filteredEntries = entries.filter(
    (entry) =>
      search.length === 0 ||
      entry.content.toLowerCase().includes(search.toLowerCase()) ||
      entryIdToTags[entry.id]?.some((tag) => tag.includes(search.toLowerCase())),
  );

  return (
    <Stack spacing="xs" sx={{ height: "100%", overflow: "hidden" }}>
      {/* 顶部总览与各 Provider 独立卡片 */}
      <Card
        p="sm"
        mx="md"
        mt="xs"
        withBorder
        bg={lightOrDark(theme, "gray.0", "dark.7")}
        sx={{ flexShrink: 0 }}
      >
        <Stack spacing="xs">
          <Group position="apart" align="center">
            <Group spacing="xs">
              <IconCloud size="1.25rem" color={theme.fn.primaryColor()} />
              <Stack spacing={0}>
                <Group spacing="xs" align="center">
                  <Text fw={700} fz="sm">
                    多端云同步管理中心
                  </Text>
                  <Badge size="xs" color="indigo" variant="light">
                    {syncSettings?.deviceName || "设备 A"}
                  </Badge>
                </Group>
                <Text fz="xs" color="dimmed">
                  已启用 {hasAnyEnabled ? "多端复合同步" : "无（未配置）"} | 总条目: {entries.length} | 上次总同步: {formatLastSync(syncStatus?.lastSyncTime)}
                </Text>
              </Stack>
            </Group>

            <Group spacing="xs">
              {hasAnyEnabled && (
                <Button
                  size="xs"
                  variant="filled"
                  leftIcon={<IconRefresh size="0.85rem" />}
                  loading={syncingAll}
                  onClick={handleManualSyncAll}
                >
                  立即全端同步
                </Button>
              )}
              <Tooltip label="云同步设置">
                <ActionIcon size="sm" variant="light" color="gray" onClick={openSettings}>
                  <IconSettings size="1rem" />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          <Divider sx={(theme) => ({ borderColor: defaultBorderColor(theme) })} />

          {/* 各 Provider 独立展示状态卡片 */}
          <Group grow spacing="xs">
            {/* 1. Chrome Sync 卡片 */}
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
                    <IconDatabase size="0.95rem" color={theme.colors.blue[6]} />
                    <Text fz="xs" fw={600}>Chrome Sync</Text>
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
                    {!syncSettings?.enableChromeSync ? "未开启" : syncStatus?.chrome?.status === "error" ? "异常" : "正常"}
                  </Badge>
                </Group>
                <Text fz={11} color="dimmed">
                  {syncSettings?.enableChromeSync
                    ? `同步: ${formatLastSync(syncStatus?.chrome?.lastSyncTime)} (${syncStatus?.chrome?.itemCount || 0}条)`
                    : "Chrome 账号静默同步"}
                </Text>
              </Stack>
            </Paper>

            {/* 2. WebDAV 卡片 */}
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
                    <IconServer size="0.95rem" color={theme.colors.teal[6]} />
                    <Text fz="xs" fw={600}>WebDAV</Text>
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
                    {!syncSettings?.enableWebdav ? "未开启" : syncStatus?.webdav?.status === "error" ? "异常" : "正常"}
                  </Badge>
                </Group>
                <Text fz={11} color="dimmed" sx={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {syncSettings?.enableWebdav
                    ? `同步: ${formatLastSync(syncStatus?.webdav?.lastSyncTime)} | ${syncSettings.webdavPath || "/openclip-sync.json"}`
                    : "私有云网盘同步"}
                </Text>
              </Stack>
            </Paper>

            {/* 3. OneDrive 卡片 */}
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
                    <IconBrandOnedrive size="0.95rem" color={theme.colors.cyan[6]} />
                    <Text fz="xs" fw={600}>OneDrive</Text>
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

            {/* 4. Google Drive 卡片 */}
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
                    <IconBrandGoogleDrive size="0.95rem" color={theme.colors.yellow[7]} />
                    <Text fz="xs" fw={600}>Google Drive</Text>
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
                    : "谷歌云端硬盘同步"}
                </Text>
              </Stack>
            </Paper>
          </Group>
        </Stack>
      </Card>

      <Box sx={{ flex: 1, minHeight: 0 }}>
        <EntryList
          noEntriesOverlay={
            !hasAnyEnabled ? (
              <Stack align="center" spacing="sm" p="xl">
                <IconCloudUpload size="2.5rem" color={theme.colors.gray[5]} />
                <Title order={5}>尚未开启多端同步</Title>
                <Text size="sm" color="dimmed" align="center" maw={380}>
                  支持 Chrome 内置同步、WebDAV（坚果云/Nextcloud/群晖等）、OneDrive、Google Drive 多端并行同步与自动去重。
                </Text>
                <Button size="xs" variant="filled" onClick={openSettings}>
                  前往开启同步服务
                </Button>
              </Stack>
            ) : search.length === 0 ? (
              <NoEntriesOverlay
                title="暂无同步条目"
                subtitle={
                  <Group align="center" spacing={4}>
                    <Text>所有本地复制的内容均已自动纳入多端同步池中</Text>
                  </Group>
                }
                description="剪贴板数据会自动在所有开启的云端存储中进行双向合并与去重"
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
