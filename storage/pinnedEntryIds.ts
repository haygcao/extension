import { z } from "zod";

import { Storage } from "@plasmohq/storage";

const storage = new Storage({
  area: "local",
});

const PINNED_STORAGE_KEY = "pinnedEntryIds";

export const watchPinnedEntryIds = (cb: (entryIds: string[]) => void) => {
  return storage.watch({
    [PINNED_STORAGE_KEY]: (c) => {
      const parsed = z.array(z.string()).safeParse(c.newValue);
      if (parsed.success) {
        cb(parsed.data);
        return;
      }
      _setPinnedEntryIds([]);
      cb([]);
    },
  });
};

export const getPinnedEntryIds = async (): Promise<string[]> => {
  const entries = await storage.get(PINNED_STORAGE_KEY);
  const parsed = z.array(z.string()).safeParse(entries);
  if (parsed.success) {
    return parsed.data;
  }
  await _setPinnedEntryIds([]);
  return [];
};

export const _setPinnedEntryIds = async (entryIds: string[]) =>
  storage.set(PINNED_STORAGE_KEY, entryIds);

export const addPinnedEntryIds = async (entryIds: string[]) => {
  const current = await getPinnedEntryIds();
  await _setPinnedEntryIds(Array.from(new Set([...current, ...entryIds])));
};

export const deletePinnedEntryIds = async (entryIds: string[]) => {
  const s = new Set(entryIds);
  const current = await getPinnedEntryIds();
  await _setPinnedEntryIds(current.filter((id) => !s.has(id)));
};

export const togglePinnedEntryId = async (entryId: string) => {
  const current = await getPinnedEntryIds();
  const s = new Set(current);
  if (s.has(entryId)) {
    s.delete(entryId);
  } else {
    s.add(entryId);
  }
  await _setPinnedEntryIds(Array.from(s));
};
