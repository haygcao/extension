import { z } from "zod";

import { DisplayMode } from "./displayMode";
import { ItemSortOption } from "./itemSortOption";
import { StorageLocation } from "./storageLocation";
import { Tab } from "./tab";

export interface BlacklistRule {
  id: string;
  name: string;
  keywords: string[];
  enabled: boolean;
}

export const defaultBlacklistRules: BlacklistRule[] = [
  {
    id: "rule_1",
    name: "异常错误日志 (Error Log)",
    keywords: ["error", "exception", "failed"],
    enabled: true,
  },
  {
    id: "rule_2",
    name: "敏感密钥与 Token (Secret Token)",
    keywords: ["token=", "access_token", "secret"],
    enabled: true,
  },
];

// DO NOT REUSE DEPRECATED FIELDS.
export const defaultSettings = {
  sortItemsBy: ItemSortOption.Enum.DateLastCopied,
  storageLocation: StorageLocation.Enum.Local,
  totalItemsBadge: true,
  pasteFromContextMenu: true,
  changelogIndicator: true,
  allowBlankItems: true,
  defaultTab: Tab.Enum.All,
  // theme: "light",
  themeV2: "system",
  localItemLimit: null,
  localItemCharacterLimit: null,
  historyRetentionDays: null,
  enableCompression: true,
  enableBlacklistFilter: false,
  blacklistRules: defaultBlacklistRules,
  displayMode: DisplayMode.Enum.Popup,
  language: "auto",
};

export const BlacklistRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  keywords: z.array(z.string()),
  enabled: z.boolean(),
});

export const Settings = z
  .object({
    sortItemsBy: ItemSortOption.default(defaultSettings.sortItemsBy),
    storageLocation: StorageLocation.default(defaultSettings.storageLocation),
    totalItemsBadge: z.boolean().default(defaultSettings.totalItemsBadge),
    pasteFromContextMenu: z.boolean().default(defaultSettings.pasteFromContextMenu),
    changelogIndicator: z.boolean().default(defaultSettings.changelogIndicator),
    allowBlankItems: z.boolean().default(defaultSettings.allowBlankItems),
    defaultTab: Tab.default(defaultSettings.defaultTab),
    // theme: z.string().default(defaultSettings.theme),
    themeV2: z.string().default(defaultSettings.themeV2),
    localItemLimit: z.number().nullable().default(defaultSettings.localItemLimit),
    localItemCharacterLimit: z.number().nullable().default(defaultSettings.localItemCharacterLimit),
    historyRetentionDays: z.number().nullable().default(defaultSettings.historyRetentionDays),
    enableCompression: z.boolean().default(defaultSettings.enableCompression),
    enableBlacklistFilter: z.boolean().default(defaultSettings.enableBlacklistFilter),
    blacklistRules: z.array(BlacklistRuleSchema).default(defaultSettings.blacklistRules),
    displayMode: DisplayMode.default(defaultSettings.displayMode),
    language: z.string().default(defaultSettings.language),
  })
  .default(defaultSettings);
export type Settings = z.infer<typeof Settings>;
