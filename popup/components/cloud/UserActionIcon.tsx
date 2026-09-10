import { ActionIcon, Badge, Group, Menu, Text, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconCloud,
  IconDevices,
  IconRefresh,
  IconSettings,
  IconUserCircle,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { SettingsModalContent } from "~popup/components/modals/SettingsModalContent";
import { getSyncSettings, type SyncSettings } from "~storage/syncSettings";
import db from "~utils/db/react";
import { getSyncStatus } from "~storage/syncSettings";

export const UserActionIcon = () => {
  const [opened, setOpened] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncSettings, setLocalSyncSettings] = useState<SyncSettings | null>(null);

  useEffect(() => {
    getSyncSettings().then(setLocalSyncSettings);
  }, [opened]);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await db.sync();
      const status = await getSyncStatus();
      if (status.status === "error") {
        notifications.show({
          color: "red",
          title: "同步遇到问题",
          message: status.message || "未能连接到同步端点，请检查网络或配置。",
        });
      } else {
        notifications.show({
          color: "green",
          title: "同步成功",
          message: `已完成云端剪贴板数据同步与去重合并。`,
        });
      }
    } catch (e: any) {
      notifications.show({
        color: "red",
        title: "同步出错",
        message: e?.message || "发生未知错误",
      });
    } finally {
      setSyncing(false);
    }
  };

  const deviceName = syncSettings?.deviceName || "设备 A";

  return (
    <Menu position="bottom-end" shadow="md" opened={opened} onChange={setOpened}>
      <Menu.Target>
        <Tooltip
          label={<Text fz="xs">个人资料与设备 (Local Profile)</Text>}
          disabled={opened}
        >
          <ActionIcon variant="light" color="indigo.5">
            <IconUserCircle size="1.125rem" />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>
          <Group position="apart" spacing="xs">
            <Text fz="xs" fw={700}>本地账户 (Local)</Text>
            <Badge size="xs" color="indigo" variant="light">
              Active
            </Badge>
          </Group>
        </Menu.Label>

        <Menu.Item
          icon={<IconDevices size="0.9rem" />}
          onClick={() =>
            modals.open({
              padding: 0,
              size: "xl",
              withCloseButton: false,
              children: <SettingsModalContent defaultTab="cloud" />,
            })
          }
        >
          <Group position="apart" spacing="xs" noWrap>
            <Text fz="xs">当前设备:</Text>
            <Text fz="xs" fw={600} color="indigo.5">
              {deviceName}
            </Text>
          </Group>
        </Menu.Item>

        <Menu.Divider />

        <Menu.Item
          icon={<IconRefresh size="0.9rem" />}
          disabled={syncing}
          onClick={handleSyncNow}
        >
          <Text fz="xs">{syncing ? "正在同步中..." : "立即双向同步 (Sync Now)"}</Text>
        </Menu.Item>

        <Menu.Item
          icon={<IconCloud size="0.9rem" />}
          onClick={() =>
            modals.open({
              padding: 0,
              size: "xl",
              withCloseButton: false,
              children: <SettingsModalContent defaultTab="cloud" />,
            })
          }
        >
          <Text fz="xs">云同步与多端配置</Text>
        </Menu.Item>

        <Menu.Item
          icon={<IconSettings size="0.9rem" />}
          onClick={() =>
            modals.open({
              padding: 0,
              size: "xl",
              withCloseButton: false,
              children: <SettingsModalContent defaultTab="general" />,
            })
          }
        >
          <Text fz="xs">常规设置</Text>
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
