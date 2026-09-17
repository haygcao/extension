import { ActionIcon, Badge, Button, Card, Group, ScrollArea, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import { IconClock, IconCopy, IconExternalLink, IconHistory, IconRefresh, IconSearch, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { deleteHistoryUrl, exportHistory, type SyncHistoryItem } from "~utils/sync/handlers/history";

export const HistoryPage = ({ searchQuery }: { searchQuery: string }) => {
  const [historyItems, setHistoryItems] = useState<SyncHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterText, setFilterText] = useState("");

  const loadHistory = async () => {
    setLoading(true);
    const items = await exportHistory(30);
    setHistoryItems(items);
    setLoading(false);
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleDelete = async (url: string) => {
    await deleteHistoryUrl(url);
    setHistoryItems((prev) => prev.filter((item) => item.url !== url));
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
  };

  const query = (searchQuery || filterText).toLowerCase().trim();
  const filtered = historyItems.filter(
    (item) => item.url.toLowerCase().includes(query) || (item.title && item.title.toLowerCase().includes(query)),
  );

  return (
    <Stack spacing="xs" p="xs" style={{ flex: 1, minHeight: 0 }}>
      <Group position="apart">
        <TextInput
          placeholder="搜索浏览历史..."
          icon={<IconSearch size={16} />}
          value={filterText}
          onChange={(e) => setFilterText(e.currentTarget.value)}
          size="xs"
          style={{ flex: 1 }}
        />
        <Button size="xs" variant="light" leftIcon={<IconRefresh size={14} />} loading={loading} onClick={loadHistory}>
          刷新
        </Button>
      </Group>

      <ScrollArea style={{ flex: 1 }}>
        <Stack spacing="xs">
          {filtered.length === 0 ? (
            <Text size="sm" color="dimmed" align="center" py="xl">
              {loading ? "正在获取历史记录..." : "无相关浏览历史记录"}
            </Text>
          ) : (
            filtered.map((item, idx) => (
              <Card key={idx} p="xs" withBorder shadow="none" radius="md">
                <Group position="apart" noWrap>
                  <Stack spacing={2} style={{ overflow: "hidden", flex: 1 }}>
                    <Group spacing="xs">
                      <IconHistory size={14} color="#FD7E14" />
                      <Text size="sm" weight={500} truncate style={{ flex: 1 }}>
                        {item.title || item.url}
                      </Text>
                      <Badge size="xs" variant="dot" color="orange">
                        {item.visitCount} 次访问
                      </Badge>
                    </Group>
                    <Text size="xs" color="dimmed" truncate>
                      {item.url}
                    </Text>
                  </Stack>
                  <Group spacing={4} noWrap>
                    <Tooltip label="复制 URL">
                      <ActionIcon size="sm" variant="subtle" color="blue" onClick={() => handleCopy(item.url)}>
                        <IconCopy size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="打开链接">
                      <ActionIcon size="sm" variant="subtle" color="gray" component="a" href={item.url} target="_blank">
                        <IconExternalLink size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="移除本地记录">
                      <ActionIcon size="sm" variant="subtle" color="red" onClick={() => handleDelete(item.url)}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
              </Card>
            ))
          )}
        </Stack>
      </ScrollArea>
    </Stack>
  );
};
