import { useAtomValue } from "jotai";

import { EntryList } from "~popup/components/EntryList";
import { NoEntriesOverlay } from "~popup/components/NoEntriesOverlay";
import { entriesAtom, entryIdToTagsAtom, searchAtom } from "~popup/states/atoms";

export const AllPage = () => {
  const entries = useAtomValue(entriesAtom) || [];
  const search = useAtomValue(searchAtom);
  const entryIdToTags = useAtomValue(entryIdToTagsAtom) || {};

  const reversedEntries = [...entries].reverse();

  return (
    <EntryList
      noEntriesOverlay={
        search.length === 0 ? (
          <NoEntriesOverlay
            title="剪贴板历史为空"
            subtitle="在任何地方复制文本即可同步至此"
          />
        ) : (
          <NoEntriesOverlay title={`未找到包含 "${search}" 的记录`} />
        )
      }
      entries={reversedEntries.filter(
        (entry) =>
          search.length === 0 ||
          entry.content.toLowerCase().includes(search.toLowerCase()) ||
          entryIdToTags[entry.id]?.some((tag) => tag.includes(search.toLowerCase())),
      )}
    />
  );
};
