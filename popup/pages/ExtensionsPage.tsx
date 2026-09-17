import { ActionIcon, Badge, Button, Card, Group, ScrollArea, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import { IconExternalLink, IconPuzzle, IconRefresh, IconSearch } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { exportExtensions, type SyncExtension } from "~utils/sync/handlers/extensions";

export const ExtensionsPage = ({ searchQuery }: { searchQuery: string }) => {
  const [extensions, setExtensions] = useState<SyncExtension[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterText, setFilterText] = useState("");

  const loadExtensions = async () => {
    setLoading(true);
    const list = await exportExtensions();
    setExtensions(list);
    setLoading(false);
  };

  useEffect(() => {
    loadExtensions();
  }, []);

  const query = (searchQuery || filterText).toLowerCase().trim();
  const filtered = extensions.filter(
    (ext) => ext.name.toLowerCase().includes(query) || (ext.description && ext.description.toLowerCase().includes(query)),
  );

  return (
    <Stack spacing="xs" p="xs" style={{ flex: 1, minHeight: 0 }}>
      <Group position="apart">
        <TextInput
          placeholder="搜索已安装插件..."
          icon={<IconSearch size={16} />}
          value={filterText}
          onChange={(e) => setFilterText(e.currentTarget.value)}
          size="xs"
          style={{ flex: 1 }}
        />
        <Button size="xs" variant="light" leftIcon={<IconRefresh size={14} />} loading={loading} onClick={loadExtensions}>
          刷新
        </Button>
      </Group>

      <ScrollArea style={{ flex: 1 }}>
        <Stack spacing="xs">
          {filtered.length === 0 ? (
            <Text size="sm" color="dimmed" align="center" py="xl">
              {loading ? "正在读取已安装插件..." : "无相关插件"}
            </Text>
          ) : (
            filtered.map((ext) => (
              <Card key={ext.id} p="xs" withBorder shadow="none" radius="md">
                <Group position="apart" noWrap>
                  <Stack spacing={2} style={{ overflow: "hidden", flex: 1 }}>
                    <Group spacing="xs">
                      <IconPuzzle size={16} color="#20C997" />
                      <Text size="sm" weight={600} truncate style={{ flex: 1 }}>
                        {ext.name}
                      </Text>
                      <Badge size="xs" color={ext.enabled ? "teal" : "gray"}>
                        v{ext.version} {ext.enabled ? "已启用" : "未启用"}
                      </Badge>
                    </Group>
                    {ext.description && (
                      <Text size="xs" color="dimmed" lineClamp={2}>
                        {ext.description}
                      </Text>
                    )}
                  </Stack>
                  <Tooltip label="前往应用商店">
                    <ActionIcon size="sm" variant="light" color="teal" component="a" href={ext.storeUrl} target="_blank">
                      <IconExternalLink size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Card>
            ))
          )}
        </Stack>
      </ScrollArea>
    </Stack>
  );
};
