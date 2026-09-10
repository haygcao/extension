import { createHash } from "crypto";
import { z } from "zod";

import { _setEntryIdToTags, getEntryIdToTags } from "~storage/entryIdToTags";
import { _setFavoriteEntryIds, addFavoriteEntryIds, getFavoriteEntryIds } from "~storage/favoriteEntryIds";
import { _setPinnedEntryIds, getPinnedEntryIds } from "~storage/pinnedEntryIds";
import { getSettings, setSettings } from "~storage/settings";
import { getSyncSettings, setSyncSettings } from "~storage/syncSettings";
import type { Entry } from "~types/entry";
import { ClipboardHistoryIOExport, ClipboardHistoryProExport } from "~types/importExport";

import { _setEntries, getEntries } from "./storage";

export const FullBackupSchema = z.object({
  type: z.literal("openclip-sync-full-backup"),
  version: z.number(),
  timestamp: z.number(),
  entries: z.array(
    z.object({
      id: z.string(),
      createdAt: z.number(),
      copiedAt: z.number().nullable().optional(),
      content: z.string(),
    }),
  ),
  tags: z.record(z.array(z.string())),
  favoriteEntryIds: z.array(z.string()),
  pinnedEntryIds: z.array(z.string()).optional().default([]),
  settings: z.record(z.any()).optional(),
  syncSettings: z.record(z.any()).optional(),
});

export type FullBackup = z.infer<typeof FullBackupSchema>;

/** 导出全部配置与完整剪贴板历史（包含 WebDAV 密码、网盘配置及所有个性化设置） */
export const getFullBackupExport = async (): Promise<FullBackup> => {
  const [entries, tags, favoriteEntryIds, pinnedEntryIds, settings, syncSettings] =
    await Promise.all([
      getEntries(),
      getEntryIdToTags(),
      getFavoriteEntryIds(),
      getPinnedEntryIds(),
      getSettings(),
      getSyncSettings(),
    ]);

  return {
    type: "openclip-sync-full-backup",
    version: 2,
    timestamp: Date.now(),
    entries,
    tags,
    favoriteEntryIds,
    pinnedEntryIds,
    settings,
    syncSettings,
  };
};

/** 兼容旧版剪贴板导出 */
export const getClipboardHistoryIOExport = async (): Promise<ClipboardHistoryIOExport> => {
  const [entries, entryIdToTags, favoriteEntryIds] = await Promise.all([
    getEntries(),
    getEntryIdToTags(),
    getFavoriteEntryIds(),
  ]);

  const favoriteEntryIdSet = new Set(favoriteEntryIds);

  return entries.map((entry) => ({
    createdAt: entry.createdAt,
    copiedAt: entry.copiedAt,
    content: entry.content,
    tags: entryIdToTags[entry.id],
    isFavorite: favoriteEntryIdSet.has(entry.id) || undefined,
  }));
};

export const importFile = async (file: File) => {
  const text = await file.text();
  const json = JSON.parse(text);

  // 1. 全量备份导入 (包含配置与密码)
  const fullBackupParsed = FullBackupSchema.safeParse(json);
  if (fullBackupParsed.success) {
    return await importFullBackup(fullBackupParsed.data);
  }

  // 2. 兼容导入
  const clipboardHistoryIOParsed = ClipboardHistoryIOExport.safeParse(json);
  if (clipboardHistoryIOParsed.success) {
    return await importClipboardHistoryIO(clipboardHistoryIOParsed.data);
  }

  const clipboardHistoryProParsed = ClipboardHistoryProExport.safeParse(json);
  if (clipboardHistoryProParsed.success) {
    return await importClipboardHistoryPro(clipboardHistoryProParsed.data);
  }

  throw [fullBackupParsed.error, clipboardHistoryIOParsed.error, clipboardHistoryProParsed.error];
};

const importFullBackup = async (backup: FullBackup) => {
  const [currentEntries, currentTags, currentFavs, currentPins] = await Promise.all([
    getEntries(),
    getEntryIdToTags(),
    getFavoriteEntryIds(),
    getPinnedEntryIds(),
  ]);

  const entryMap = new Map<string, Entry>();
  for (const e of currentEntries) entryMap.set(e.content, e);
  for (const e of backup.entries) {
    const existing = entryMap.get(e.content);
    if (!existing) {
      entryMap.set(e.content, e);
    } else {
      existing.createdAt = Math.min(existing.createdAt, e.createdAt);
      existing.copiedAt = Math.max(existing.copiedAt || 0, e.copiedAt || 0);
    }
  }

  const mergedTags = { ...currentTags, ...backup.tags };
  const mergedFavs = Array.from(new Set([...currentFavs, ...backup.favoriteEntryIds]));
  const mergedPins = Array.from(new Set([...currentPins, ...(backup.pinnedEntryIds || [])]));

  await Promise.all([
    _setEntries(Array.from(entryMap.values())),
    _setEntryIdToTags(mergedTags),
    _setFavoriteEntryIds(mergedFavs),
    _setPinnedEntryIds(mergedPins),
  ]);

  if (backup.settings) {
    await setSettings(backup.settings as any);
  }
  if (backup.syncSettings) {
    await setSyncSettings(backup.syncSettings as any);
  }
};

const importClipboardHistoryIO = async (clipboardHistoryIOEntries: ClipboardHistoryIOExport) => {
  const [entries, entryIdToTags] = await Promise.all([getEntries(), getEntryIdToTags()]);
  const favoriteEntryIdsToBeAdded: string[] = [];

  for (const clipboardHistoryIOEntry of clipboardHistoryIOEntries) {
    const entryId = createHash("sha256").update(clipboardHistoryIOEntry.content).digest("hex");

    entries.push({
      id: entryId,
      createdAt: clipboardHistoryIOEntry.createdAt,
      copiedAt: clipboardHistoryIOEntry.copiedAt,
      content: clipboardHistoryIOEntry.content,
    });

    if (clipboardHistoryIOEntry.isFavorite) {
      favoriteEntryIdsToBeAdded.push(entryId);
    }

    if (clipboardHistoryIOEntry.tags) {
      entryIdToTags[entryId] = Array.from(
        new Set([
          ...(entryIdToTags[entryId] || []),
          ...clipboardHistoryIOEntry.tags.map((tag) => tag.toLowerCase()),
        ]),
      );
    }
  }

  await Promise.all([
    _setEntries(
      Object.values(
        entries.reduce<Record<string, Entry>>((acc, curr) => {
          const entry = acc[curr.id];
          if (entry === undefined) {
            acc[curr.id] = curr;
          } else {
            entry.createdAt = Math.min(entry.createdAt, curr.createdAt);
            entry.copiedAt = Math.max(entry.copiedAt || 0, curr.copiedAt || 0) || undefined;
          }
          return acc;
        }, {}),
      ),
    ),
    _setEntryIdToTags(entryIdToTags),
    addFavoriteEntryIds(favoriteEntryIdsToBeAdded),
  ]);
};

const importClipboardHistoryPro = async (clipboardHistoryProEntries: ClipboardHistoryProExport) => {
  await importClipboardHistoryIO(
    clipboardHistoryProEntries.flatMap((clipboardHistoryProEntry) => {
      if (
        clipboardHistoryProEntry.text === undefined ||
        clipboardHistoryProEntry.dateAdded === undefined
      ) {
        return [];
      }

      return {
        createdAt: clipboardHistoryProEntry.dateAdded,
        copiedAt: clipboardHistoryProEntry.dateLastCopied,
        content: clipboardHistoryProEntry.text,
        tags: clipboardHistoryProEntry.tags,
        isFavorite: clipboardHistoryProEntry.isFavorite,
      };
    }),
  );
};
