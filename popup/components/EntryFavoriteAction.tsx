import { useMantineTheme } from "@mantine/core";
import { IconStar, IconStarFilled } from "@tabler/icons-react";
import { useAtomValue } from "jotai";

import { favoriteEntryIdsAtom } from "~popup/states/atoms";
import { handleMutation } from "~popup/utils/mutation";
import { addFavoriteEntryIds, deleteFavoriteEntryIds } from "~storage/favoriteEntryIds";

import { CommonActionIcon } from "./CommonActionIcon";

interface Props {
  entryId: string;
}

export const EntryFavoriteAction = ({ entryId }: Props) => {
  const theme = useMantineTheme();
  const favoriteEntryIds = useAtomValue(favoriteEntryIdsAtom) || [];
  const isFavoriteEntry = favoriteEntryIds.includes(entryId);

  return (
    <CommonActionIcon
      color={isFavoriteEntry ? theme.colors.yellow[5] : undefined}
      hoverColor={isFavoriteEntry ? theme.colors.yellow[5] : undefined}
      onClick={handleMutation(() =>
        isFavoriteEntry ? deleteFavoriteEntryIds([entryId]) : addFavoriteEntryIds([entryId]),
      )}
    >
      {isFavoriteEntry ? <IconStarFilled size="1rem" /> : <IconStar size="1rem" />}
    </CommonActionIcon>
  );
};
