import { Checkbox, Group, rem } from "@mantine/core";
import { useFocusWithin, useHotkeys, useMouse } from "@mantine/hooks";
import { useAtomValue } from "jotai";
import { useEffect } from "react";

import { entryIdToTagsAtom } from "~popup/states/atoms";
import { handleMutation } from "~popup/utils/mutation";
import { toggleEntryTag } from "~storage/entryIdToTags";
import { lightOrDark } from "~utils/sx";

import { TagBadge } from "./TagBadge";

interface Props {
  entryId: string;
  tag: string;
  focused: boolean;
  onHover: () => void;
  onClose: () => void;
}

export const TagOption = ({ entryId, tag, focused, onHover, onClose }: Props) => {
  const { ref: groupRef, x, y } = useMouse({ resetOnExit: true });
  const { ref: checkboxRef, focused: checkboxFocused } = useFocusWithin<HTMLInputElement>();
  const entryIdToTags = useAtomValue(entryIdToTagsAtom) || {};

  useEffect(() => {
    if (x === 0 && y === 0) {
      return;
    }

    onHover();
  }, [x, y]);

  useEffect(() => {
    if (checkboxFocused) {
      checkboxRef.current.blur();
    }
  }, [checkboxFocused]);

  useHotkeys(
    [
      [
        "Enter",
        () => {
          if (focused) {
            handleMutation(() => toggleEntryTag(entryId, tag))();
            onClose();
          }
        },
      ],
    ],
    [],
  );

  return (
    <Group
      ref={groupRef}
      align="center"
      className="tag-option"
      spacing="xs"
      px={rem(4)}
      py={rem(8)}
      sx={(theme) => ({
        cursor: "pointer",
        borderRadius: theme.radius.sm,
        backgroundColor: focused
          ? lightOrDark(theme, theme.colors.gray[1], theme.colors.dark[5])
          : undefined,
      })}
      noWrap
      onClick={() => {
        handleMutation(() => toggleEntryTag(entryId, tag))();
        onClose();
      }}
    >
      <Checkbox
        ref={checkboxRef}
        checked={!!entryIdToTags[entryId]?.includes(tag)}
        size="xs"
        onChange={() => {
          handleMutation(() => toggleEntryTag(entryId, tag))();
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
        sx={(theme) => ({
          ".mantine-Checkbox-input:hover": {
            borderColor: theme.fn.primaryColor(),
          },
        })}
      />
      <TagBadge tag={tag} />
    </Group>
  );
};
