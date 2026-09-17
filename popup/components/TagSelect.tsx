import {
  Divider,
  Popover,
  rem,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  useMantineTheme,
} from "@mantine/core";
import { useDisclosure, useHotkeys } from "@mantine/hooks";
import { IconTags } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";

import { entryIdToTagsAtom } from "~popup/states/atoms";
import { defaultBorderColor, lightOrDark } from "~utils/sx";

import { CommonActionIcon } from "./CommonActionIcon";
import { TagOption } from "./TagOption";

interface Props {
  entryId: string;
}

export const TagSelect = ({ entryId }: Props) => {
  const theme = useMantineTheme();
  const entryIdToTags = useAtomValue(entryIdToTagsAtom) || {};

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const tags of Object.values(entryIdToTags)) {
      if (Array.isArray(tags)) {
        for (const t of tags) set.add(t);
      }
    }
    return Array.from(set);
  }, [entryIdToTags]);

  const [opened, handlers] = useDisclosure(false);
  const [tagSearch, setTagSearch] = useState("");
  const tagSearchLowercase = useMemo(() => tagSearch.toLowerCase(), [tagSearch]);
  const matchedTags = allTags
    .slice()
    .sort()
    .filter((tag) => tag.includes(tagSearchLowercase));
  const showCreateTagOption = tagSearch !== "" && !matchedTags.includes(tagSearchLowercase);

  const [focusedTagIndex, setFocusedTagIndex] = useState(0);

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (opened) {
      setTagSearch("");
      setFocusedTagIndex(0);
    }
  }, [opened]);

  useEffect(() => {
    setFocusedTagIndex(0);
  }, [tagSearch]);

  const maxFocusedTagIndex = matchedTags.length - (showCreateTagOption ? 0 : 1);

  useHotkeys(
    [
      [
        "ArrowUp",
        () => {
          if (opened && focusedTagIndex > 0) {
            setFocusedTagIndex(focusedTagIndex - 1);

            const focusedOption = scrollAreaRef.current?.children[
              focusedTagIndex - 1
            ] as HTMLDivElement;
            focusedOption.scrollIntoView({ block: "nearest" });
          }
        },
      ],
      [
        "ArrowDown",
        () => {
          if (opened && focusedTagIndex < maxFocusedTagIndex) {
            setFocusedTagIndex(focusedTagIndex + 1);

            const focusedOption = scrollAreaRef.current?.children[
              focusedTagIndex + 1
            ] as HTMLDivElement;
            focusedOption.scrollIntoView({ block: "nearest" });
          }
        },
      ],
    ],
    [],
  );

  return (
    <Popover opened={opened} position="bottom-end" shadow="md" onChange={handlers.toggle}>
      <Popover.Target>
        <CommonActionIcon onClick={handlers.toggle}>
          <IconTags size="1rem" />
        </CommonActionIcon>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <Stack spacing="xs" w={rem(180)}>
          <TextInput
            placeholder="搜索或添加标签..."
            size="xs"
            value={tagSearch}
            onChange={(e) => setTagSearch(e.currentTarget.value)}
            sx={(theme) => ({
              ".mantine-Input-input": {
                borderColor: defaultBorderColor(theme),
                "&:focus, &:focus-within": {
                  borderColor: theme.fn.primaryColor(),
                },
              },
            })}
            autoFocus
          />
          {matchedTags.length > 0 || showCreateTagOption ? (
            <ScrollArea.Autosize mah={rem(150)} placeholder={undefined}>
              <Stack ref={scrollAreaRef} spacing={0}>
                {matchedTags.map((tag, index) => (
                  <TagOption
                    key={tag}
                    entryId={entryId}
                    focused={index === focusedTagIndex}
                    tag={tag}
                    onClose={handlers.close}
                    onHover={() => setFocusedTagIndex(index)}
                  />
                ))}
                {showCreateTagOption && (
                  <>
                    {matchedTags.length > 0 && <Divider my="xs" />}
                    <TagOption
                      entryId={entryId}
                      focused={matchedTags.length === focusedTagIndex}
                      tag={tagSearchLowercase}
                      onClose={handlers.close}
                      onHover={() => setFocusedTagIndex(matchedTags.length)}
                    />
                  </>
                )}
              </Stack>
            </ScrollArea.Autosize>
          ) : (
            <Text color="dimmed" size="xs">
              无相关标签
            </Text>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};
