export interface CloudSettingsData {
  cloudItemLimit?: number | null;
}

export const resolveCloudSettings = (cloudSettings?: CloudSettingsData) => {
  return {
    cloudItemLimit:
      !cloudSettings ||
      (typeof cloudSettings.cloudItemLimit === "number" && cloudSettings.cloudItemLimit < 1)
        ? 1000
        : cloudSettings.cloudItemLimit || null,
  };
};
