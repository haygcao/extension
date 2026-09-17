import { ActionIcon, Badge, Button, Card, Group, ScrollArea, Stack, Text, Tooltip } from "@mantine/core";
import { IconDeviceDesktop, IconExternalLink, IconRefresh, IconWorldUpload } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { getDiscoveredDevices } from "~storage/discoveredDevices";
import { getSyncSettings } from "~storage/syncSettings";
import { exportCurrentTabs, openSessionTabs, type SyncTab } from "~utils/sync/handlers/sessions";
import type { DeviceInfo } from "~utils/sync/provider";

export const DevicesPage = () => {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [currentTabs, setCurrentTabs] = useState<SyncTab[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState("");
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [devs, syncSet, tabs] = await Promise.all([
      getDiscoveredDevices(),
      getSyncSettings(),
      exportCurrentTabs(),
    ]);
    setDevices(devs);
    setCurrentDeviceId(syncSet.deviceId || "");
    setCurrentTabs(tabs);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCurrentTabs = () => {
    openSessionTabs(currentTabs, true);
  };

  return (
    <Stack spacing="xs" p="xs" style={{ flex: 1, minHeight: 0 }}>
      <Group position="apart">
        <Text size="xs" color="dimmed" weight={500}>
          网络中已发现的在线/同步设备
        </Text>
        <Button size="xs" variant="light" leftIcon={<IconRefresh size={14} />} loading={loading} onClick={loadData}>
          刷新设备墙
        </Button>
      </Group>

      {/* 本地设备概览卡片 */}
      <Card p="sm" radius="md" withBorder style={{ backgroundColor: "rgba(76, 110, 245, 0.05)" }}>
        <Group position="apart">
          <Group spacing="xs">
            <IconDeviceDesktop size={18} color="#4C6EF5" />
            <Stack spacing={0}>
              <Text size="sm" weight={600}>
                当前设备 (此电脑)
              </Text>
              <Text size="xs" color="dimmed">
                正在打开 {currentTabs.length} 个网页标签
              </Text>
            </Stack>
          </Group>
          <Button size="xs" variant="subtle" leftIcon={<IconWorldUpload size={14} />} onClick={handleOpenCurrentTabs}>
            会话标签墙 ({currentTabs.length})
          </Button>
        </Group>
      </Card>

      <ScrollArea style={{ flex: 1 }}>
        <Stack spacing="xs">
          {devices.length === 0 ? (
            <Text size="sm" color="dimmed" align="center" py="xl">
              暂无发现其他跨端云设备
            </Text>
          ) : (
            devices.map((dev) => {
              const isCurrent = dev.deviceId === currentDeviceId;
              return (
                <Card key={dev.deviceId} p="xs" withBorder shadow="none" radius="md">
                  <Group position="apart">
                    <Group spacing="xs">
                      <IconDeviceDesktop size={16} color={isCurrent ? "#4C6EF5" : "#868E96"} />
                      <Stack spacing={0}>
                        <Group spacing={6}>
                          <Text size="sm" weight={500}>
                            {dev.deviceName}
                          </Text>
                          {isCurrent && (
                            <Badge size="xs" color="blue">
                              当前设备
                            </Badge>
                          )}
                        </Group>
                        <Text size="xs" color="dimmed">
                          最后活跃: {new Date(dev.lastActive).toLocaleString()}
                        </Text>
                      </Stack>
                    </Group>
                  </Group>
                </Card>
              );
            })
          )}
        </Stack>
      </ScrollArea>
    </Stack>
  );
};
