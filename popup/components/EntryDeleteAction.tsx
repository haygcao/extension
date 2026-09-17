import { IconTrash } from "@tabler/icons-react";
import { useAtomValue } from "jotai";

import { favoriteEntryIdsAtom } from "~popup/states/atoms";
import { handleMutation } from "~popup/utils/mutation";
import { deleteEntries } from "~utils/storage";

import { CommonActionIcon } from "./CommonActionIcon";

interface Props {
  entryId: string;
}

export const EntryDeleteAction = ({ entryId }: Props) => {
  const favoriteEntryIds = useAtomValue(favoriteEntryIdsAtom) || [];
  const isFavoriteEntry = favoriteEntryIds.includes(entryId);

  return (
    <CommonActionIcon
      disabled={isFavoriteEntry}
      onClick={handleMutation(() => deleteEntries([entryId]))}
    >
      <IconTrash size="1rem" />
    </CommonActionIcon>
  );
};
