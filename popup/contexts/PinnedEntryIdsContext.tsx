import { useAtomValue } from "jotai";
import { createContext, useContext, type PropsWithChildren } from "react";

import { pinnedEntryIdsAtom } from "~popup/states/atoms";

const PinnedEntryIdsContext = createContext<Set<string>>(new Set());

export const PinnedEntryIdsProvider = ({ children }: PropsWithChildren) => {
  const pinnedEntryIds = useAtomValue(pinnedEntryIdsAtom);

  return (
    <PinnedEntryIdsContext.Provider value={new Set(pinnedEntryIds)}>
      {children}
    </PinnedEntryIdsContext.Provider>
  );
};

export const usePinnedEntryIds = () => {
  return useContext(PinnedEntryIdsContext);
};
