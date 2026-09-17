import { Tooltip, useMantineTheme } from "@mantine/core";
import { IconPin, IconPinFilled } from "@tabler/icons-react";
import { useAtomValue } from "jotai";

import { pinnedEntryIdsAtom } from "~popup/states/atoms";
import { handleMutation } from "~popup/utils/mutation";
import { addPinnedEntryIds, deletePinnedEntryIds } from "~storage/pinnedEntryIds";

import { CommonActionIcon } from "./CommonActionIcon";

interface Props {
  entryId: string;
}

export const EntryPinAction = ({ entryId }: Props) => {
  const theme = useMantineTheme();
  const pinnedEntryIds = useAtomValue(pinnedEntryIdsAtom) || [];
  const isPinned = pinnedEntryIds.includes(entryId);

  return (
    <Tooltip label={isPinned ? "取消置顶" : "置顶并永久保存"}>
      <div>
        <CommonActionIcon
          color={isPinned ? theme.colors.indigo[5] : undefined}
          hoverColor={isPinned ? theme.colors.indigo[5] : undefined}
          onClick={handleMutation(() =>
            isPinned ? deletePinnedEntryIds([entryId]) : addPinnedEntryIds([entryId]),
          )}
        >
          {isPinned ? <IconPinFilled size="1rem" /> : <IconPin size="1rem" />}
        </CommonActionIcon>
      </div>
    </Tooltip>
  );
};
