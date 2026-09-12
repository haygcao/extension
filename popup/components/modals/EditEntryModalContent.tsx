import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  CloseButton,
  Grid,
  Group,
  Paper,
  Stack,
  Text,
  Textarea,
  Title,
  useMantineTheme,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconCheck, IconCopy } from "@tabler/icons-react";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { handleMutation } from "~popup/utils/mutation";
import type { Entry } from "~types/entry";
import db from "~utils/db/react";
import { getEntryCopiedAt } from "~utils/entries";
import { updateEntryContent } from "~utils/storage";
import { lightOrDark } from "~utils/sx";

import { EntryDeleteAction } from "../EntryDeleteAction";
import { EntryFavoriteAction } from "../EntryFavoriteAction";

const schema = z.object({
  content: z.string(),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  entry: Entry;
}

export const EditEntryModalContent = ({ entry }: Props) => {
  const theme = useMantineTheme();
  const [copied, setCopied] = useState(false);

  const {
    control,
    setError,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isDirty, isValid, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      content: entry.content,
    },
    mode: "all",
    resolver: zodResolver(schema),
  });

  const handleCopyAll = () => {
    const textToCopy = getValues("content") || entry.content;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    notifications.show({
      color: "green",
      title: "已复制",
      message: "整条内容已一键复制到剪贴板！",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const auth = db.useAuth();
  const connectionStatus = db.useConnectionStatus();

  useEffect(() => {
    if (entry.id.length === 36 && auth.user && connectionStatus === "closed") {
      modals.closeAll();
    }
  }, [entry.id.length === 36 && auth.user && connectionStatus === "closed"]);

  return (
    <Paper p="md">
      <Group align="center" position="apart" mb="xs">
        <Group spacing="xs">
          <Title order={5}>编辑 / 查看剪贴板条目</Title>
          <Button
            size="xs"
            compact
            color={copied ? "teal" : "indigo"}
            variant="light"
            leftIcon={copied ? <IconCheck size="0.9rem" /> : <IconCopy size="0.9rem" />}
            onClick={handleCopyAll}
          >
            {copied ? "已复制全文" : "一键复制全文"}
          </Button>
        </Group>
        <CloseButton onClick={() => modals.closeAll()} />
      </Group>
      <Grid gutter={0}>
        <Grid.Col span={4}>
          <Text size="xs" color="dimmed">
            字符总数 (Length)
          </Text>
          <Text size="xs">{entry.content.length}</Text>
        </Grid.Col>
        <Grid.Col span={4}>
          <Text size="xs" color="dimmed">
            创建时间 (Created)
          </Text>
          <Text size="xs">{format(entry.createdAt, "Pp")}</Text>
        </Grid.Col>
        <Grid.Col span={4}>
          <Text size="xs" color="dimmed">
            最近复制 (Last Copied)
          </Text>
          <Text size="xs">{format(getEntryCopiedAt(entry), "Pp")}</Text>
        </Grid.Col>
        <Grid.Col span={12}>
          <form
            onSubmit={handleSubmit(async ({ content }) => {
              const { ok } = await handleMutation(() => updateEntryContent(entry.id, content))();

              if (ok) {
                modals.closeAll();
              } else {
                setError("content", { type: "manual", message: "Content must be unique" });
              }
            })}
          >
            <Stack spacing="xs" mt="xs">
              <Controller
                name="content"
                control={control}
                render={({ field }) => (
                  <Textarea
                    {...field}
                    label={
                      <Text size="xs" color="dimmed" fw="normal">
                        完整内容 (可自由编辑与修改)
                      </Text>
                    }
                    autosize
                    minRows={4}
                    maxRows={16}
                    size="xs"
                    error={errors.content?.message}
                  />
                )}
              />
              <Group align="center" position="apart">
                <Text
                  size="xs"
                  color={lightOrDark(theme, "orange", "yellow")}
                  display="flex"
                  align="center"
                >
                  {isDirty && (
                    <>
                      <IconAlertTriangle size="1.125rem" />
                      <Text ml={4}>您修改了内容，记得保存更改。</Text>
                    </>
                  )}
                </Text>
                <Group align="center" spacing="xs">
                  <Button
                    size="xs"
                    variant="outline"
                    color="indigo"
                    leftIcon={copied ? <IconCheck size="0.9rem" /> : <IconCopy size="0.9rem" />}
                    onClick={handleCopyAll}
                  >
                    一键复制
                  </Button>
                  <EntryFavoriteAction entryId={entry.id} />
                  <EntryDeleteAction entryId={entry.id} />
                  <Button size="xs" variant="subtle" disabled={!isDirty} onClick={() => reset()}>
                    还原修改
                  </Button>
                  <Button
                    size="xs"
                    disabled={!isDirty || !isValid}
                    type="submit"
                    loading={isSubmitting}
                  >
                    保存修改
                  </Button>
                </Group>
              </Group>
            </Stack>
          </form>
        </Grid.Col>
      </Grid>
    </Paper>
  );
};
