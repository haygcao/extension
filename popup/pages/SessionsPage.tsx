import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Image,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  useMantineTheme,
} from "@mantine/core";
import {
  IconDeviceDesktop,
  IconExternalLink,
  IconGlobe,
  IconRefresh,
  IconWorldUpload,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { getSyncSettings } from "~storage/syncSettings";
import {
  exportCurrentTabs,
  openSessionTabs,
  type SyncSession,
  type SyncTab,
} from "~utils/sync/handlers/sessions";
import { lightOrDark } from "~utils/sx";

interface Props {
  searchQuery?: string;
}

export const SessionsPage = ({ searchQuery = "" }: Props) => {
  const theme = useMantineTheme();
  const [localTabs, setLocalTabs] = useState<SyncTab[]>([]);
  const [syncedSessions, setSyncedSessions] = useState<SyncSession[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState("");
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [tabs, syncSet] = await Promise.all([exportCurrentTabs(), getSyncSettings()]);
    setLocalTabs(tabs);
    setCurrentDeviceId(syncSet.deviceId || "");

    // 本地及同步会话预占位
    setSyncedSessions([
      {
        id: "local_current",
        deviceId: syncSet.deviceId || "local",
        deviceName: syncSet.deviceName || "此电脑 (本机)",
        savedAt: new Date().toISOString(),
        label: "当前打开的活跃标签页",
        tabs,
      },
    ]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenTab = (url: string) => {
    chrome.tabs.create({ url });
  };

  const handleOpenAllTabs = (tabs: SyncTab[]) => {
    openSessionTabs(tabs, true);
  };

  const filteredTabs = localTabs.filter(
    (t) =>
      !searchQuery ||
      t.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.url.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <Stack spacing="xs" p="xs" sx={{ flex: 1, minHeight: 0 }}>
      {/* 顶部标题与手动刷新 */}
      <Group position="apart" align="center">
        <Group spacing="xs">
          <IconGlobe size="1.1rem" color={theme.colors.cyan[6]} />
          <Text size="xs" fw={600}>
            跨端浏览器会话与打开的标签页 (Sync Sessions)
          </Text>
        </Group>
        <Button
          size="xs"
          variant="light"
          color="cyan"
          leftIcon={<IconRefresh size={14} />}
          loading={loading}
          onClick={loadData}
        >
          刷新会话标签
        </Button>
      </Group>

      {/* 本机打开的标签页汇总面板 */}
      <Card p="xs" radius="md" withBorder bg={lightOrDark(theme, "cyan.0", "dark.6")}>
        <Group position="apart" align="center">
          <Group spacing="xs">
            <IconDeviceDesktop size={18} color={theme.colors.cyan[7]} />
            <Stack spacing={0}>
              <Text size="xs" fw={600}>
                本机（当前设备）正在打开 {localTabs.length} 个标签页
              </Text>
              <Text size="11px" color="dimmed">
                文本与链接实时同步，随时可在其他云端设备上一键全量还原打开
              </Text>
            </Stack>
          </Group>
          <Button
            size="xs"
            variant="filled"
            color="cyan"
            leftIcon={<IconWorldUpload size={14} />}
            onClick={() => handleOpenAllTabs(localTabs)}
          >
            新窗口批量还原 ({localTabs.length})
          </Button>
        </Group>
      </Card>

      {/* 会话标签列表 */}
      <ScrollArea sx={{ flex: 1 }}>
        <Stack spacing="xs">
          {filteredTabs.length === 0 ? (
            <Text size="xs" color="dimmed" align="center" py="xl">
              {searchQuery ? `未找到包含 "${searchQuery}" 的会话标签` : "当前没有打开的活跃网页标签页"}
            </Text>
          ) : (
            filteredTabs.map((t, idx) => (
              <Paper
                key={`${t.url}_${idx}`}
                p="xs"
                radius="sm"
                withBorder
                bg={lightOrDark(theme, "white", "dark.5")}
              >
                <Group position="apart" align="center" noWrap>
                  <Group spacing="xs" sx={{ overflow: "hidden", flex: 1 }}>
                    {t.favIconUrl ? (
                      <Image src={t.favIconUrl} w={16} h={16} fit="contain" withPlaceholder />
                    ) : (
                      <IconGlobe size={16} color={theme.colors.gray[6]} />
                    )}
                    <Stack spacing={2} sx={{ overflow: "hidden" }}>
                      <Text size="xs" fw={500} truncate>
                        {t.title || t.url}
                      </Text>
                      <Text size="10px" color="dimmed" truncate>
                        {t.url}
                      </Text>
                    </Stack>
                  </Group>

                  <Group spacing={4} noWrap>
                    {t.pinned && (
                      <Badge size="xs" color="blue" variant="dot">
                        已固定
                      </Badge>
                    )}
                    <Tooltip label="在当前浏览器打开此标签">
                      <ActionIcon size="xs" color="cyan" onClick={() => handleOpenTab(t.url)}>
                        <IconExternalLink size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
              </Paper>
            ))
          )}
        </Stack>
      </ScrollArea>
    </Stack>
  );
};
