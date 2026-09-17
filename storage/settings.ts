import { Storage } from "@plasmohq/storage";

import { defaultSettings, Settings } from "~types/settings";

export type { Settings };

const storage = new Storage({
  area: "local",
});

export const watchSettings = (cb: (settings: Settings) => void) => {
  return storage.watch({
    settings: (c) => {
      const parsed = Settings.safeParse(c.newValue);
      if (parsed.success) {
        cb(parsed.data);
        return;
      }

      cb(defaultSettings);
    },
  });
};

export const getSettings = async () => {
  const parsed = Settings.safeParse(await storage.get("settings"));
  if (parsed.success) {
    return parsed.data;
  }

  return defaultSettings;
};

export const setSettings = async (settings: Settings) => {
  await storage.set("settings", settings);
};
