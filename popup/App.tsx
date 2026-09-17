import {
  ActionIcon,
  Badge,
  Box,
  Card,
  Divider,
  Group,
  Image,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Tooltip,
  useMantineTheme,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconBookmark,
  IconChartBar,
  IconClipboardList,
  IconCloud,
  IconCrown,
  IconDeviceDesktop,
  IconGlobe,
  IconHistory,
  IconPictureInPicture,
  IconPuzzle,
  IconSearch,
  IconSettings,
  IconShield,
} from "@tabler/icons-react";
import iconSrc from "data-base64:~assets/icon.png";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { match } from "ts-pattern";

import { toggleClipboardMonitorIsEnabled } from "~storage/clipboardMonitorIsEnabled";
import {
  deleteFloatingWindowId,
  getFloatingWindowId,
  setFloatingWindowId,
} from "~storage/floatingWindowId";
import { getMasterDeviceState, type MasterDeviceState } from "~storage/masterDevice";
import { Tab } from "~types/tab";
import db from "~utils/db/react";
import { defaultBorderColor } from "~utils/sx";

import { SettingsModalContent } from "./components/modals/SettingsModalContent";
import { StorageUsageModalContent } from "./components/modals/StorageUsageModalContent";
import { ShortcutBadge } from "./components/ShortcutBadge";
import { useApp } from "./hooks/useApp";
import { useCloudEntriesQuery } from "./hooks/useCloudEntriesQuery";
import { SEARCH_INPUT_ID } from "./hooks/useEntryListNavigation";
import { AllPage } from "./pages/AllPage";
import { BookmarksPage } from "./pages/BookmarksPage";
import { CloudPage } from "./pages/CloudPage";
import { DevicesPage } from "./pages/DevicesPage";
import { ExtensionsPage } from "./pages/ExtensionsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { SessionsPage } from "./pages/SessionsPage";
import { SettingsPage } from "./pages/SettingsPage";
import {
  clipboardMonitorIsEnabledAtom,
  commandsAtom,
  refreshTokenAtom,
  searchAtom,
  tabAtom,
} from "./states/atoms";

export const App = () => {
  useApp();

  const theme = useMantineTheme();
  const inputRef = useRef<HTMLInputElement>(null);

  const urlParams = new URLSearchParams(window.location.search);
  const [isFloatingPopup] = useState(urlParams.get("ref") === "popup");
  const [isSidePanel] = useState(urlParams.get("ref") === "sidepanel");

  const [search, setSearch] = useAtom(searchAtom);
  const [tab, setTab] = useAtom(tabAtom);

  const [masterState, setMasterState] = useState<MasterDeviceState>({
    isMasterDevice: false,
    isForcedAuxiliary: false,
    masterDeviceId: null,
    masterDeviceName: null,
    auxiliaryPullPolicy: "all_devices",
    auxiliaryTargetDeviceId: null,
    deviceRules: {},
  });

  const clipboardMonitorIsEnabled = useAtomValue(clipboardMonitorIsEnabledAtom);
  const refreshToken = useAtomValue(refreshTokenAtom);
  const commands = useAtomValue(commandsAtom);

  useEffect(() => {
    getMasterDeviceState().then(setMasterState);
  }, []);

  const extensionActivationShortcut = commands.find(
    (command) =>
      command.name ===
      (process.env.PLASMO_TARGET === "firefox-mv2" ? "_execute_browser_action" : "_execute_action"),
  )?.shortcut;

  // Preload queries
  const connectionStatus = db.useConnectionStatus();
  const cloudEntriesQuery = useCloudEntriesQuery();

  if (clipboardMonitorIsEnabled === undefined || refreshToken === undefined) {
    return null;
  }

  return (
    <Card
      h={isFloatingPopup || isSidePanel ? "100%" : 620}
      w={isFloatingPopup || isSidePanel ? "100%" : 720}
      miw={isSidePanel ? 320 : 520}
      p="sm"
    >
      <Stack h="100%" spacing="sm">
        {/* Top Header Bar */}
        <Group align="center" position="apart">
          <Group align="center" spacing="xs">
            <Image src={iconSrc} maw={26} />
            <Title order={6}>OpenClip Sync</Title>
            <Badge size="xs" variant="light" color="blue">
              v2.6.0
            </Badge>

            {/* Master/Auxiliary Device Role Badge */}
            {masterState.isMasterDevice && !masterState.isForcedAuxiliary ? (
              <Badge size="xs" color="indigo" leftSection={<IconCrown size={12} />}>
                主设备
              </Badge>
            ) : masterState.isForcedAuxiliary ? (
              <Badge size="xs" color="orange" leftSection={<IconShield size={12} />}>
                辅助设备
              </Badge>
            ) : null}
          </Group>

          <Group align="center" spacing="xs" grow={false}>
            {/* Floating Mode */}
            <Tooltip label={<Text fz="xs">独立悬浮窗</Text>} disabled={isFloatingPopup || isSidePanel}>
              <ActionIcon
                variant="light"
                color="indigo.5"
                onClick={async () => {
                  const floatingWindowId = await getFloatingWindowId();
                  if (floatingWindowId !== null) {
                    try {
                      await chrome.windows.update(floatingWindowId, { focused: true });
                      window.close();
                      return;
                    } catch {
                      await deleteFloatingWindowId();
                    }
                  }
                  const newWindow = await chrome.windows.create({
                    url: chrome.runtime.getURL("popup.html?ref=popup"),
                    type: "popup",
                    height: 620,
                    width: 720,
                  });
                  if (newWindow.id !== undefined) {
                    await setFloatingWindowId(newWindow.id);
                  }
                  window.close();
                }}
                disabled={isFloatingPopup || isSidePanel}
              >
                <IconPictureInPicture size="1.125rem" />
              </ActionIcon>
            </Tooltip>

            {/* Storage usage */}
            <Tooltip label={<Text fz="xs">存储容量统计</Text>}>
              <ActionIcon
                variant="light"
                color="indigo.5"
                onClick={() =>
                  modals.open({
                    padding: 0,
                    size: "lg",
                    withCloseButton: false,
                    children: <StorageUsageModalContent />,
                  })
                }
              >
                <IconChartBar size="1.125rem" />
              </ActionIcon>
            </Tooltip>

            {/* Settings Modal */}
            <Tooltip label={<Text fz="xs">系统与同步设置</Text>}>
              <ActionIcon
                variant="light"
                color="indigo.5"
                onClick={() =>
                  modals.open({
                    padding: "md",
                    size: "lg",
                    title: "OpenClip Sync 设置",
                    children: <SettingsModalContent />,
                  })
                }
              >
                <IconSettings size="1.125rem" />
              </ActionIcon>
            </Tooltip>

            <Divider orientation="vertical" h={16} sx={{ alignSelf: "inherit" }} />

            {/* Clipboard Monitor Switch */}
            <Switch
              size="md"
              color="indigo.5"
              checked={clipboardMonitorIsEnabled}
              onChange={() => toggleClipboardMonitorIsEnabled()}
            />
          </Group>
        </Group>

        {/* Global Search and Navigation Tabs */}
        <Group align="center" position="apart">
          <TextInput
            ref={inputRef}
            id={SEARCH_INPUT_ID}
            placeholder="搜索剪贴板、书签、历史..."
            icon={<IconSearch size="1rem" />}
            size="xs"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            w={220}
            sx={{
              ".mantine-Input-input": {
                borderColor: defaultBorderColor(theme),
                "&:focus, &:focus-within": {
                  borderColor: theme.fn.primaryColor(),
                },
              },
            }}
            rightSection={
              search.length === 0 &&
              extensionActivationShortcut && (
                <Box pr="xs">
                  <ShortcutBadge shortcut={extensionActivationShortcut} />
                </Box>
              )
            }
            rightSectionProps={{ onClick: () => inputRef.current?.focus() }}
            autoFocus
          />

          {/* Primary Modality Tabs */}
          <SegmentedControl
            value={tab}
            onChange={(newTab) => setTab(Tab.parse(newTab))}
            size="xs"
            color={match(tab)
              .with(Tab.Enum.Clipboard, () => "indigo.5")
              .with(Tab.Enum.Cloud, () => "violet.5")
              .with(Tab.Enum.Sessions, () => "cyan.5")
              .with(Tab.Enum.Bookmarks, () => "blue.5")
              .with(Tab.Enum.History, () => "orange.5")
              .with(Tab.Enum.Extensions, () => "teal.5")
              .with(Tab.Enum.Devices, () => "gray.6")
              .with(Tab.Enum.Settings, () => "grape.5")
              .exhaustive()}
            data={[
              {
                label: (
                  <Group align="center" spacing={4} noWrap>
                    <IconClipboardList size="0.85rem" />
                    <Text size="xs">📋 剪贴板</Text>
                  </Group>
                ),
                value: Tab.Enum.Clipboard,
              },
              {
                label: (
                  <Group align="center" spacing={4} noWrap>
                    <IconCloud size="0.85rem" />
                    <Text size="xs">☁️ 云同步</Text>
                  </Group>
                ),
                value: Tab.Enum.Cloud,
              },
              {
                label: (
                  <Group align="center" spacing={4} noWrap>
                    <IconGlobe size="0.85rem" />
                    <Text size="xs">🌐 会话标签</Text>
                  </Group>
                ),
                value: Tab.Enum.Sessions,
              },
              {
                label: (
                  <Group align="center" spacing={4} noWrap>
                    <IconBookmark size="0.85rem" />
                    <Text size="xs">🔖 书签</Text>
                  </Group>
                ),
                value: Tab.Enum.Bookmarks,
              },
              {
                label: (
                  <Group align="center" spacing={4} noWrap>
                    <IconHistory size="0.85rem" />
                    <Text size="xs">📜 历史</Text>
                  </Group>
                ),
                value: Tab.Enum.History,
              },
              {
                label: (
                  <Group align="center" spacing={4} noWrap>
                    <IconPuzzle size="0.85rem" />
                    <Text size="xs">🧩 扩展</Text>
                  </Group>
                ),
                value: Tab.Enum.Extensions,
              },
              {
                label: (
                  <Group align="center" spacing={4} noWrap>
                    <IconDeviceDesktop size="0.85rem" />
                    <Text size="xs">💻 设备墙</Text>
                  </Group>
                ),
                value: Tab.Enum.Devices,
              },
              {
                label: (
                  <Group align="center" spacing={4} noWrap>
                    <IconSettings size="0.85rem" />
                    <Text size="xs">⚙️ 设置</Text>
                  </Group>
                ),
                value: Tab.Enum.Settings,
              },
            ]}
          />
        </Group>

        {/* Tab Page Views */}
        {match(tab)
          .with(Tab.Enum.Clipboard, () => <AllPage />)
          .with(Tab.Enum.Cloud, () => <CloudPage />)
          .with(Tab.Enum.Sessions, () => <SessionsPage searchQuery={search} />)
          .with(Tab.Enum.Bookmarks, () => <BookmarksPage searchQuery={search} />)
          .with(Tab.Enum.History, () => <HistoryPage searchQuery={search} />)
          .with(Tab.Enum.Extensions, () => <ExtensionsPage searchQuery={search} />)
          .with(Tab.Enum.Devices, () => <DevicesPage />)
          .with(Tab.Enum.Settings, () => <SettingsPage />)
          .exhaustive()}
      </Stack>
    </Card>
  );
};
