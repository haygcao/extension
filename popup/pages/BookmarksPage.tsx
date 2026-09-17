import { ActionIcon, Badge, Button, Card, Group, ScrollArea, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import { IconBookmark, IconCopy, IconExternalLink, IconRefresh, IconSearch } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { exportBookmarksTree, extractBookmarkUrls, type SyncBookmark } from "~utils/sync/handlers/bookmarks";

export const BookmarksPage = ({ searchQuery }: { searchQuery: string }) => {
  const [bookmarks, setBookmarks] = useState<{ title: string; url: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterText, setFilterText] = useState("");

  const loadBookmarks = async () => {
    setLoading(true);
    const tree = await exportBookmarksTree();
    const map = extractBookmarkUrls(tree);
    setBookmarks(Array.from(map.values()));
    setLoading(false);
  };

  useEffect(() => {
    loadBookmarks();
  }, []);

  const query = (searchQuery || filterText).toLowerCase().trim();
  const filtered = bookmarks.filter(
    (b) => b.title.toLowerCase().includes(query) || b.url.toLowerCase().includes(query),
  );

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
  };

  return (
    <Stack spacing="xs" p="xs" style={{ flex: 1, minHeight: 0 }}>
      <Group position="apart">
        <TextInput
          placeholder="搜索书签..."
          icon={<IconSearch size={16} />}
          value={filterText}
          onChange={(e) => setFilterText(e.currentTarget.value)}
          size="xs"
          style={{ flex: 1 }}
        />
        <Button size="xs" variant="light" leftIcon={<IconRefresh size={14} />} loading={loading} onClick={loadBookmarks}>
          刷新
        </Button>
      </Group>

      <ScrollArea style={{ flex: 1 }}>
        <Stack spacing="xs">
          {filtered.length === 0 ? (
            <Text size="sm" color="dimmed" align="center" py="xl">
              {loading ? "正在加载书签..." : "未找到匹配的书签"}
            </Text>
          ) : (
            filtered.map((item, idx) => (
              <Card key={idx} p="xs" withBorder shadow="none" radius="md">
                <Group position="apart" noWrap>
                  <Stack spacing={2} style={{ overflow: "hidden", flex: 1 }}>
                    <Group spacing="xs">
                      <IconBookmark size={14} color="#4C6EF5" />
                      <Text size="sm" weight={500} truncate style={{ flex: 1 }}>
                        {item.title || item.url}
                      </Text>
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
                    <Tooltip label="在新标签页打开">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        component="a"
                        href={item.url}
                        target="_blank"
                      >
                        <IconExternalLink size={14} />
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
