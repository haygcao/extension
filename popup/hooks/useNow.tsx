import { max } from "date-fns";
import { useAtomValue } from "jotai";

import { entriesAtom, settingsAtom, staticNowAtom } from "~popup/states/atoms";
import { getEntryTimestamp } from "~utils/entries";

export const useNow = () => {
  const entries = useAtomValue(entriesAtom) || [];
  const staticNow = useAtomValue(staticNowAtom);
  const settings = useAtomValue(settingsAtom);

  return max([new Date(entries[0] ? getEntryTimestamp(entries[0], settings) : 0), staticNow]);
};
