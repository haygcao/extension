import { zodResolver } from "@hookform/resolvers/zod";
import {
  Accordion,
  Anchor,
  Badge,
  Box,
  Button,
  CloseButton,
  Divider,
  FileInput,
  Group,
  Indicator,
  NumberInput,
  Paper,
  rem,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
  useMantineTheme,
} from "@mantine/core";
import { useColorScheme } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconAppWindow,
  IconBrandGoogleDrive,
  IconBrandOnedrive,
  IconCheck,
  IconCloud,
  IconDatabase,
  IconDeviceFloppy,
  IconExternalLink,
  IconFileExport,
  IconFileImport,
  IconKey,
  IconLanguage,
  IconPlugConnected,
  IconServer,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { ShortcutBadge } from "~popup/components/ShortcutBadge";
import { useSettingsQuery } from "~popup/hooks/useSettingsQuery";
import { commandsAtom, settingsAtom } from "~popup/states/atoms";
import { setSettings } from "~storage/settings";
import {
  getSyncSettings,
  setSyncSettings,
  type SyncSettings,
} from "~storage/syncSettings";
import { ItemSortOption } from "~types/itemSortOption";
import { resolveCloudSettings } from "~utils/cloudSettings";
import db from "~utils/db/react";
import {
  getClipboardHistoryIOExport,
  getFullBackupExport,
  importFile,
} from "~utils/importExport";
import {
  authorizeGoogleOAuth,
  authorizeOneDriveOAuth,
  clearChromeSyncStorage,
  createWebDavProvider,
} from "~utils/sync/provider";
import { defaultBorderColor, lightOrDark } from "~utils/sx";

const storageSchema = z.object({
  localItemLimit: z.number().min(1).nullable(),
  localItemCharacterLimit: z.number().min(1).nullable(),
});
type StorageFormValues = z.infer<typeof storageSchema>;

const cloudSchema = z.object({
  cloudItemLimit: z.number().min(1).nullable(),
});
type CloudFormValues = z.infer<typeof cloudSchema>;

const syncSchema = z.object({
  deviceName: z.string(),
  enableChromeSync: z.boolean(),
  enableWebdav: z.boolean(),
  enableOneDrive: z.boolean(),
  enableGoogleDrive: z.boolean(),
  webdavUrl: z.string(),
  webdavUsername: z.string(),
  webdavPassword: z.string(),
  webdavPath: z.string(),
  oneDriveFolder: z.string(),
  oneDriveClientId: z.string(),
  oneDriveClientSecret: z.string(),
  oneDriveAccessToken: z.string(),
  googleDriveFolder: z.string(),
  googleClientId: z.string(),
  googleClientSecret: z.string(),
  googleAccessToken: z.string(),
});
type SyncFormValues = z.infer<typeof syncSchema>;

export const SettingsModalContent = ({ defaultTab = "general" }: { defaultTab?: string } = {}) => {
  const theme = useMantineTheme();
  const settings = useAtomValue(settingsAtom);
  const commands = useAtomValue(commandsAtom);
  const settingsQuery = useSettingsQuery();
  const cloudSettings = (settingsQuery.data?.settings as any[] | undefined)?.[0];

  const [file, setFile] = useState<File | null>(null);
  const [testingWebdav, setTestingWebdav] = useState(false);
  const [clearingChrome, setClearingChrome] = useState(false);
  const [authorizingGoogle, setAuthorizingGoogle] = useState(false);
  const [authorizingOneDrive, setAuthorizingOneDrive] = useState(false);
  const [autoSavedTime, setAutoSavedTime] = useState<number | null>(null);

  const storageForm = useForm<StorageFormValues>({
    defaultValues: {
      localItemLimit: settings.localItemLimit,
      localItemCharacterLimit: settings.localItemCharacterLimit,
    },
    mode: "all",
    resolver: zodResolver(storageSchema),
  });

  const syncForm = useForm<SyncFormValues>({
    defaultValues: {
      deviceName: "设备 A",
      enableChromeSync: false,
      enableWebdav: false,
      enableOneDrive: false,
      enableGoogleDrive: false,
      webdavUrl: "",
      webdavUsername: "",
      webdavPassword: "",
      webdavPath: "/openclip-sync.json",
      oneDriveFolder: "/OpenClipSync",
      oneDriveClientId: "",
      oneDriveClientSecret: "",
      oneDriveAccessToken: "",
      googleDriveFolder: "/OpenClipSync",
      googleClientId: "",
      googleClientSecret: "",
      googleAccessToken: "",
    },
    mode: "all",
    resolver: zodResolver(syncSchema),
  });

  const isInitialLoad = useRef(true);

  useEffect(() => {
    getSyncSettings().then((s) => {
      const vals: SyncFormValues = {
        deviceName: s.deviceName || "设备 A",
        enableChromeSync: !!s.enableChromeSync,
        enableWebdav: !!s.enableWebdav,
        enableOneDrive: !!s.enableOneDrive,
        enableGoogleDrive: !!s.enableGoogleDrive,
        webdavUrl: s.webdavUrl || "",
        webdavUsername: s.webdavUsername || "",
        webdavPassword: s.webdavPassword || "",
        webdavPath: s.webdavPath || "/openclip-sync.json",
        oneDriveFolder: s.oneDriveFolder || "/OpenClipSync",
        oneDriveClientId: s.oneDriveClientId || "",
        oneDriveClientSecret: s.oneDriveClientSecret || "",
        oneDriveAccessToken: s.oneDriveAccessToken || "",
        googleDriveFolder: s.googleDriveFolder || "/OpenClipSync",
        googleClientId: s.googleClientId || "",
        googleClientSecret: s.googleClientSecret || "",
        googleAccessToken: s.googleAccessToken || "",
      };
      syncForm.reset(vals);
      setTimeout(() => {
        isInitialLoad.current = false;
      }, 100);
    });
  }, []);

  // 监听表单变更，实现真正的实时自动保存 (Auto Save)
  useEffect(() => {
    const subscription = syncForm.watch((values) => {
      if (isInitialLoad.current) return;
      setSyncSettings(values as Partial<SyncSettings>).then(() => {
        setAutoSavedTime(Date.now());
      });
    });
    return () => subscription.unsubscribe();
  }, [syncForm.watch]);

  const enableWebdav = syncForm.watch("enableWebdav");
  const enableOneDrive = syncForm.watch("enableOneDrive");
  const enableGoogleDrive = syncForm.watch("enableGoogleDrive");
  const enableChromeSync = syncForm.watch("enableChromeSync");

  const handleTestWebdav = async () => {
    const vals = syncForm.getValues();
    if (!vals.webdavUrl || !vals.webdavUsername || !vals.webdavPassword) {
      notifications.show({
        color: "yellow",
        title: "请填写完整",
        message: "请先填写 WebDAV 服务器 URL、账号及密码",
      });
      return;
    }
    setTestingWebdav(true);
    try {
      const p = createWebDavProvider(
        vals.webdavUrl,
        vals.webdavUsername,
        vals.webdavPassword,
        vals.webdavPath || "/openclip-sync.json",
      );
      await p.pull();
      notifications.show({
        color: "green",
        title: "WebDAV 连接成功",
        message: "服务器验证通过，可正常双向同步！",
      });
    } catch (e: any) {
      notifications.show({
        color: "red",
        title: "WebDAV 连接失败",
        message: e?.message || "无法连接到 WebDAV 服务器，请检查配置",
      });
    } finally {
      setTestingWebdav(false);
    }
  };

  const handleClearChromeSync = async () => {
    setClearingChrome(true);
    try {
      await clearChromeSyncStorage();
      notifications.show({
        color: "green",
        title: "已清空",
        message: "Chrome 云端同步存储中的数据已全部清除",
      });
    } catch (e: any) {
      notifications.show({
        color: "red",
        title: "清除失败",
        message: e?.message || "清除异常",
      });
    } finally {
      setClearingChrome(false);
    }
  };

  const handleAuthGoogle = async () => {
    const clientId = syncForm.getValues("googleClientId");
    if (!clientId) {
      notifications.show({
        color: "yellow",
        title: "缺少 Client ID",
        message: "请先在下方输入框中填写 Google Cloud OAuth Client ID",
      });
      return;
    }
    setAuthorizingGoogle(true);
    try {
      const token = await authorizeGoogleOAuth(clientId);
      syncForm.setValue("googleAccessToken", token);
      await setSyncSettings({ googleAccessToken: token });
      notifications.show({
        color: "green",
        title: "Google Drive 授权成功",
        message: "已成功获取访问令牌并自动保存！",
      });
    } catch (e: any) {
      notifications.show({
        color: "red",
        title: "Google 授权失败",
        message: e?.message || "未能完成 Google 授权",
      });
    } finally {
      setAuthorizingGoogle(false);
    }
  };

  const handleAuthOneDrive = async () => {
    const clientId = syncForm.getValues("oneDriveClientId");
    if (!clientId) {
      notifications.show({
        color: "yellow",
        title: "缺少 Client ID",
        message: "请先在下方输入框中填写 Azure/OneDrive 应用程序 Client ID",
      });
      return;
    }
    setAuthorizingOneDrive(true);
    try {
      const token = await authorizeOneDriveOAuth(clientId);
      syncForm.setValue("oneDriveAccessToken", token);
      await setSyncSettings({ oneDriveAccessToken: token });
      notifications.show({
        color: "green",
        title: "OneDrive 授权成功",
        message: "已成功获取微软访问令牌并自动保存！",
      });
    } catch (e: any) {
      notifications.show({
        color: "red",
        title: "OneDrive 授权失败",
        message: e?.message || "未能完成微软授权",
      });
    } finally {
      setAuthorizingOneDrive(false);
    }
  };

  return (
    <Paper p="md">
      <Group align="center" position="apart" mb="xs">
        <Title order={5}>设置 (Settings)</Title>
        <CloseButton onClick={() => modals.closeAll()} />
      </Group>
      <Tabs defaultValue={defaultTab}>
        <Tabs.List>
          <Tabs.Tab value="general" icon={<IconAdjustmentsHorizontal size="0.8rem" />}>
            常规 (General)
          </Tabs.Tab>
          <Tabs.Tab value="interface" icon={<IconAppWindow size="0.8rem" />}>
            界面 (Interface)
          </Tabs.Tab>
          <Tabs.Tab
            value="storage"
            icon={
              <Indicator
                color={lightOrDark(theme, "orange", "yellow")}
                size={8}
                disabled={!storageForm.formState.isDirty}
                offset={1}
              >
                <Box mt={rem(1)}>
                  <IconDatabase size="0.8rem" />
                </Box>
              </Indicator>
            }
          >
            存储容量 (Storage)
          </Tabs.Tab>
          <Tabs.Tab value="import-export" icon={<IconDeviceFloppy size="0.8rem" />}>
            导入 / 导出 (Backup)
          </Tabs.Tab>
          <Tabs.Tab value="cloud" icon={<IconCloud size="0.8rem" />}>
            多端云同步 (Cloud)
          </Tabs.Tab>
        </Tabs.List>

        {/* 1. 常规选项卡 */}
        <Tabs.Panel value="general">
          <Stack p="md">
            {/* 界面语言选项 */}
            <Group align="flex-start" spacing="md" position="apart" noWrap>
              <Stack spacing={0}>
                <Title order={6}>界面语言 / Language</Title>
                <Text fz="xs" color="dimmed">
                  选择插件展示语言（默认跟随浏览器语言）。
                </Text>
              </Stack>
              <Select
                value={settings.language || "auto"}
                onChange={async (newLang) => {
                  if (newLang) await setSettings({ ...settings, language: newLang });
                }}
                data={[
                  { value: "auto", label: "自动跟随浏览器 (Auto)" },
                  { value: "zh_CN", label: "简体中文 (Simplified Chinese)" },
                  { value: "zh_TW", label: "繁體中文 (Traditional Chinese)" },
                  { value: "en", label: "English" },
                  { value: "ja", label: "日本語 (Japanese)" },
                  { value: "de", label: "Deutsch (German)" },
                  { value: "es", label: "Español (Spanish)" },
                  { value: "fr", label: "Français (French)" },
                  { value: "ru", label: "Русский (Russian)" },
                ]}
                size="xs"
                withinPortal
              />
            </Group>

            <Divider sx={(theme) => ({ borderColor: defaultBorderColor(theme) })} />

            {/* 快捷键配置 */}
            <Group align="flex-start" spacing="md" position="apart" noWrap>
              <Stack spacing={0}>
                <Title order={6}>扩展激活快捷键</Title>
                <Group align="center" spacing={4}>
                  <Text fz="xs">按快捷键</Text>
                  <ShortcutBadge
                    shortcut={
                      commands.find(
                        (command) =>
                          command.name ===
                          (process.env.PLASMO_TARGET === "firefox-mv2"
                            ? "_execute_browser_action"
                            : "_execute_action"),
                      )?.shortcut || "未设置"
                    }
                  />
                  <Text fz="xs">可快速唤起剪贴板管理器。</Text>
                </Group>
              </Stack>
              <Button
                size="xs"
                rightIcon={<IconExternalLink size="0.8rem" />}
                onClick={async () => {
                  await chrome.tabs.create({
                    url:
                      process.env.PLASMO_TARGET === "firefox-mv2"
                        ? "https://support.mozilla.org/en-US/kb/manage-extension-shortcuts-firefox"
                        : "chrome://extensions/shortcuts",
                  });
                  if (!window.location.search.includes("ref=")) {
                    window.close();
                  }
                }}
              >
                配置快捷键
              </Button>
            </Group>

            <Divider sx={(theme) => ({ borderColor: defaultBorderColor(theme) })} />

            {/* 空白内容记录 */}
            <Group align="flex-start" spacing="md" position="apart" noWrap>
              <Stack spacing={0}>
                <Title order={6}>允许保存空白内容</Title>
                <Text fz="xs" color="dimmed">是否将只包含空格/换行的空白剪贴板加入历史记录。</Text>
              </Stack>
              <Switch
                checked={settings.allowBlankItems}
                onChange={async (e) => {
                  const checked = e.target.checked;
                  await setSettings({ ...settings, allowBlankItems: checked });
                }}
              />
            </Group>

            <Divider sx={(theme) => ({ borderColor: defaultBorderColor(theme) })} />

            {/* 排序方式 */}
            <Group align="flex-start" spacing="md" position="apart" noWrap>
              <Stack spacing={0}>
                <Title order={6}>列表排序方式</Title>
                <Text fz="xs" color="dimmed">置顶条目始终固定于最上方，其余条目按选定规则排序。</Text>
              </Stack>
              <Select
                value={settings.sortItemsBy}
                onChange={(newValue) =>
                  newValue &&
                  setSettings({
                    ...settings,
                    sortItemsBy: ItemSortOption.parse(newValue),
                  })
                }
                data={[
                  { value: ItemSortOption.Enum.DateCreated, label: "按创建时间 (Date Created)" },
                  { value: ItemSortOption.Enum.DateLastCopied, label: "按最近复制时间 (Date Last Copied)" },
                ]}
                size="xs"
                withinPortal
              />
            </Group>
          </Stack>
        </Tabs.Panel>

        {/* 2. 界面选项卡 */}
        <Tabs.Panel value="interface">
          <Stack p="md">
            <Group align="flex-start" spacing="md" position="apart" noWrap>
              <Stack spacing={0}>
                <Title order={6}>扩展图标显示条目数量</Title>
                <Text fz="xs" color="dimmed">在浏览器工具栏图标角标上实时显示已记录的条目数。</Text>
              </Stack>
              <Switch
                checked={settings.totalItemsBadge}
                onChange={async (e) => {
                  const checked = e.target.checked;
                  await setSettings({ ...settings, totalItemsBadge: checked });
                }}
              />
            </Group>
            <Divider sx={(theme) => ({ borderColor: defaultBorderColor(theme) })} />
            <Group align="flex-start" spacing="md" position="apart" noWrap>
              <Stack spacing={0}>
                <Title order={6}>右键菜单粘贴快捷入口</Title>
                <Text fz="xs" color="dimmed">在网页右键菜单中显示最近复制的条目，便于快速选择粘贴。</Text>
              </Stack>
              <Switch
                checked={settings.pasteFromContextMenu}
                onChange={async (e) => {
                  const checked = e.target.checked;
                  await setSettings({ ...settings, pasteFromContextMenu: checked });
                }}
              />
            </Group>
            <Divider sx={(theme) => ({ borderColor: defaultBorderColor(theme) })} />
            <Group align="flex-start" spacing="md" position="apart" noWrap>
              <Stack spacing={0}>
                <Title order={6}>主题模式 (Theme)</Title>
                <Text fz="xs" color="dimmed">选择浅色、暗黑模式或自动跟随系统。</Text>
              </Stack>
              <Select
                value={settings.themeV2}
                onChange={async (newTheme) => {
                  if (newTheme) await setSettings({ ...settings, themeV2: newTheme });
                }}
                data={[
                  { value: "system", label: "跟随系统 (System)" },
                  { value: "light", label: "浅色模式 (Light)" },
                  { value: "dark", label: "暗黑模式 (Dark)" },
                ]}
                size="xs"
                withinPortal
              />
            </Group>
          </Stack>
        </Tabs.Panel>

        {/* 3. 存储容量选项卡 */}
        <Tabs.Panel value="storage">
          <form
            onSubmit={storageForm.handleSubmit(async (values) => {
              await setSettings({ ...settings, ...values });
              notifications.show({
                color: "green",
                title: "成功",
                message: "存储设置已保存",
              });
              storageForm.reset(values);
            })}
          >
            <Stack p="md">
              <Stack spacing="xs">
                <Group align="flex-start" spacing="md" position="apart" noWrap>
                  <Stack spacing={0}>
                    <Title order={6}>本地条目保存数量上限</Title>
                    <Text fz="xs" color="dimmed">
                      超出上限时将自动淘汰最早未置顶且未收藏的条目。置顶与收藏项永久免淘汰。
                    </Text>
                  </Stack>
                  <Switch
                    checked={storageForm.watch("localItemLimit") !== null}
                    onChange={(e) => {
                      const limit = e.target.checked ? settings.localItemLimit || 1000 : null;
                      storageForm.setValue("localItemLimit", limit, { shouldDirty: true });
                      setSettings({ ...settings, localItemLimit: limit });
                    }}
                  />
                </Group>
                <Controller
                  name="localItemLimit"
                  control={storageForm.control}
                  render={({ field }) => (
                    <NumberInput
                      {...field}
                      value={field.value === null ? "" : field.value}
                      onChange={(value) => {
                        const num = value === "" ? 0 : value;
                        field.onChange(num);
                        setSettings({ ...settings, localItemLimit: num });
                      }}
                      disabled={field.value === null}
                      size="xs"
                    />
                  )}
                />
              </Stack>
            </Stack>
          </form>
        </Tabs.Panel>

        {/* 4. 导入 / 导出备份选项卡 */}
        <Tabs.Panel value="import-export">
          <Stack p="md" spacing="md">
            {/* 导入 */}
            <Stack spacing="xs">
              <Stack spacing={0}>
                <Title order={6}>恢复 / 导入备份</Title>
                <Text fz="xs" color="dimmed">
                  支持恢复 OpenClip Sync 全量配置文件（含 WebDAV 密码、网盘配置及所有剪贴板记录），以及兼容旧版导出的 JSON 文件。
                </Text>
              </Stack>
              <Group align="center" spacing="xs" noWrap>
                <FileInput
                  value={file}
                  onChange={setFile}
                  icon={<IconUpload size="0.8rem" />}
                  size="xs"
                  w="100%"
                  {...{ placeholder: "选择备份 JSON 文件" }}
                />
                <Button
                  leftIcon={<IconFileImport size="1rem" />}
                  size="xs"
                  disabled={file === null}
                  onClick={async () => {
                    if (file !== null) {
                      try {
                        await importFile(file);
                        notifications.show({
                          color: "green",
                          title: "导入成功",
                          message: "已成功恢复备份中的所有数据与配置！",
                        });
                        setFile(null);
                      } catch (e) {
                        notifications.show({
                          color: "red",
                          title: "导入失败",
                          message: "所选文件格式不正确或解析失败，请检查后重试。",
                        });
                      }
                    }
                  }}
                >
                  开始恢复
                </Button>
              </Group>
            </Stack>

            <Divider sx={(theme) => ({ borderColor: defaultBorderColor(theme) })} />

            {/* 导出 */}
            <Group align="flex-start" spacing="md" position="apart" noWrap>
              <Stack spacing={0}>
                <Title order={6}>全量导出备份 (推荐)</Title>
                <Text fz="xs" color="dimmed">
                  导出包含全部剪贴板历史、标签分类、置顶/收藏状态、WebDAV 账号密码及网盘 OAuth 配置的完整备份包。
                </Text>
              </Stack>
              <Button
                leftIcon={<IconFileExport size="1rem" />}
                size="xs"
                variant="filled"
                onClick={async () => {
                  const backup = await getFullBackupExport();
                  const a = document.createElement("a");
                  a.href = window.URL.createObjectURL(
                    new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
                  );
                  a.download = `openclip-sync-full-backup-${new Date().toISOString().slice(0, 10)}.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
              >
                导出全量备份
              </Button>
            </Group>

            <Group align="flex-start" spacing="md" position="apart" noWrap>
              <Stack spacing={0}>
                <Title order={6}>导出纯剪贴板数据</Title>
                <Text fz="xs" color="dimmed">
                  仅导出纯文本剪贴板历史列表，不包含任何账户密码与同步配置。
                </Text>
              </Stack>
              <Button
                leftIcon={<IconFileExport size="1rem" />}
                size="xs"
                variant="default"
                onClick={async () => {
                  const a = document.createElement("a");
                  a.href = window.URL.createObjectURL(
                    new Blob([JSON.stringify(await getClipboardHistoryIOExport(), null, 2)], {
                      type: "application/json",
                    }),
                  );
                  a.download = `openclip-sync-entries-${new Date().toISOString().slice(0, 10)}.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
              >
                导出纯数据
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>

        {/* 5. 多端云同步选项卡 (实时自动保存) */}
        <Tabs.Panel value="cloud">
          <Stack p="md" spacing="md">
            {/* 自动保存状态指示 */}
            <Group position="apart" align="center">
              <Group spacing={6} align="center">
                <ThemeIcon size="xs" color="green" variant="light" radius="xl">
                  <IconCheck size="0.65rem" />
                </ThemeIcon>
                <Text fz="xs" color="dimmed">
                  所有设置实时自动保存 (Auto-saved)
                </Text>
              </Group>
            </Group>

            {/* 设备名称 */}
            <Group align="flex-start" spacing="md" position="apart" noWrap>
              <Stack spacing={0} sx={{ flex: 1 }}>
                <Title order={6}>设备名称 / Device Name</Title>
                <Text fz="xs" color="dimmed">
                  设置当前设备的标识名称（如：设备 A、办公电脑、MacBook 等），用于多端区分与同步状态追踪。
                </Text>
              </Stack>
              <Controller
                name="deviceName"
                control={syncForm.control}
                render={({ field }) => (
                  <TextInput {...field} size="xs" w={180} placeholder="设备 A" />
                )}
              />
            </Group>

            <Divider sx={(theme) => ({ borderColor: defaultBorderColor(theme) })} />

            {/* 1. Chrome Sync */}
            <Stack spacing="xs">
              <Group align="center" position="apart" noWrap>
                <Stack spacing={0}>
                  <Group spacing="xs" align="center">
                    <Title order={6}>Chrome 内置同步 (Chrome Sync)</Title>
                    <Badge size="xs" color="blue" variant="light">
                      免配置
                    </Badge>
                  </Group>
                  <Text fz="xs" color="dimmed">
                    通过 Chrome 账号跨设备自动静默同步。单项配额约 100KB，适合多台电脑间快速传输文本。
                  </Text>
                </Stack>
                <Group spacing="xs" align="center">
                  {enableChromeSync && (
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      leftIcon={<IconTrash size="0.75rem" />}
                      loading={clearingChrome}
                      onClick={handleClearChromeSync}
                    >
                      清空云端存储
                    </Button>
                  )}
                  <Controller
                    name="enableChromeSync"
                    control={syncForm.control}
                    render={({ field }) => (
                      <Switch
                        size="md"
                        color="indigo.5"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.currentTarget.checked)}
                      />
                    )}
                  />
                </Group>
              </Group>
            </Stack>

            <Divider sx={(theme) => ({ borderColor: defaultBorderColor(theme) })} />

            {/* 2. WebDAV Sync */}
            <Stack spacing="xs">
              <Group align="center" position="apart" noWrap>
                <Stack spacing={0}>
                  <Group spacing="xs" align="center">
                    <Title order={6}>WebDAV 云同步</Title>
                    <Badge size="xs" color="teal" variant="light">
                      私有云推荐
                    </Badge>
                  </Group>
                  <Text fz="xs" color="dimmed">
                    支持 Koofr、坚果云、Nextcloud、群晖 Synology、自建 WebDAV 等任意标准 WebDAV 服务端。
                  </Text>
                </Stack>
                <Controller
                  name="enableWebdav"
                  control={syncForm.control}
                  render={({ field }) => (
                    <Switch
                      size="md"
                      color="indigo.5"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.currentTarget.checked)}
                    />
                  )}
                />
              </Group>

              {enableWebdav && (
                <Paper withBorder p="sm" radius="sm" sx={{ backgroundColor: "rgba(0,0,0,0.02)" }}>
                  <Stack spacing="xs">
                    <Controller
                      name="webdavUrl"
                      control={syncForm.control}
                      render={({ field }) => (
                        <TextInput
                          {...field}
                          size="xs"
                          label="服务器 URL (Server URL)"
                          placeholder="https://app.koofr.net/dav/Koofr 或 https://dav.jianguoyun.com/dav/"
                        />
                      )}
                    />
                    <Group grow>
                      <Controller
                        name="webdavUsername"
                        control={syncForm.control}
                        render={({ field }) => (
                          <TextInput
                            {...field}
                            size="xs"
                            label="账号 / 邮箱 (Username)"
                            placeholder="account@example.com"
                          />
                        )}
                      />
                      <Controller
                        name="webdavPassword"
                        control={syncForm.control}
                        render={({ field }) => (
                          <TextInput
                            {...field}
                            size="xs"
                            type="password"
                            label="密码 / 应用授权码 (Password / Token)"
                            placeholder="••••••••"
                          />
                        )}
                      />
                    </Group>
                    <Controller
                      name="webdavPath"
                      control={syncForm.control}
                      render={({ field }) => (
                        <TextInput
                          {...field}
                          size="xs"
                          label="远端保存文件路径 (Remote Path)"
                          placeholder="/clipboard-history.json 或 /openclip-sync.json"
                        />
                      )}
                    />
                    <Group position="right" pt={4}>
                      <Button
                        size="xs"
                        variant="light"
                        color="teal"
                        leftIcon={<IconPlugConnected size="0.85rem" />}
                        loading={testingWebdav}
                        onClick={handleTestWebdav}
                      >
                        测试 WebDAV 连接并立即同步
                      </Button>
                    </Group>
                  </Stack>
                </Paper>
              )}
            </Stack>

            <Divider sx={(theme) => ({ borderColor: defaultBorderColor(theme) })} />

            {/* 3. Microsoft OneDrive */}
            <Stack spacing="xs">
              <Group align="center" position="apart" noWrap>
                <Stack spacing={0}>
                  <Group spacing="xs" align="center">
                    <Title order={6}>Microsoft OneDrive 同步</Title>
                    <Badge size="xs" color="cyan" variant="light">
                      OneDrive
                    </Badge>
                  </Group>
                  <Text fz="xs" color="dimmed">
                    通过 Microsoft OneDrive 个人/企业网盘同步剪贴板记录。
                  </Text>
                </Stack>
                <Controller
                  name="enableOneDrive"
                  control={syncForm.control}
                  render={({ field }) => (
                    <Switch
                      size="md"
                      color="indigo.5"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.currentTarget.checked)}
                    />
                  )}
                />
              </Group>

              {enableOneDrive && (
                <Paper withBorder p="sm" radius="sm" sx={{ backgroundColor: "rgba(0,0,0,0.02)" }}>
                  <Stack spacing="xs">
                    <Controller
                      name="oneDriveFolder"
                      control={syncForm.control}
                      render={({ field }) => (
                        <TextInput
                          {...field}
                          size="xs"
                          label="同步目录 (Folder Path)"
                          placeholder="/OpenClipSync"
                        />
                      )}
                    />
                    <Controller
                      name="oneDriveClientId"
                      control={syncForm.control}
                      render={({ field }) => (
                        <TextInput
                          {...field}
                          size="xs"
                          label="应用程序 (Client) ID"
                          placeholder="Azure Portal 注册的应用 Client ID"
                        />
                      )}
                    />
                    <Controller
                      name="oneDriveAccessToken"
                      control={syncForm.control}
                      render={({ field }) => (
                        <TextInput
                          {...field}
                          size="xs"
                          label="访问令牌 (Access Token)"
                          placeholder="点击下方按钮自动获取或手动填入 Token"
                        />
                      )}
                    />
                    <Group position="apart" pt={4}>
                      <Text fz={11} color="dimmed">
                        重定向 URI 请设置为: <code>{chrome.identity.getRedirectURL()}</code>
                      </Text>
                      <Button
                        size="xs"
                        variant="light"
                        color="cyan"
                        leftIcon={<IconBrandOnedrive size="0.85rem" />}
                        loading={authorizingOneDrive}
                        onClick={handleAuthOneDrive}
                      >
                        点击一键 OAuth 授权登录
                      </Button>
                    </Group>
                  </Stack>
                </Paper>
              )}
            </Stack>

            <Divider sx={(theme) => ({ borderColor: defaultBorderColor(theme) })} />

            {/* 4. Google Drive */}
            <Stack spacing="xs">
              <Group align="center" position="apart" noWrap>
                <Stack spacing={0}>
                  <Group spacing="xs" align="center">
                    <Title order={6}>Google Drive 云端硬盘同步</Title>
                    <Badge size="xs" color="yellow" variant="light">
                      Google Drive
                    </Badge>
                  </Group>
                  <Text fz="xs" color="dimmed">
                    通过 Google Drive 个人云端硬盘同步剪贴板记录。
                  </Text>
                </Stack>
                <Controller
                  name="enableGoogleDrive"
                  control={syncForm.control}
                  render={({ field }) => (
                    <Switch
                      size="md"
                      color="indigo.5"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.currentTarget.checked)}
                    />
                  )}
                />
              </Group>

              {enableGoogleDrive && (
                <Paper withBorder p="sm" radius="sm" sx={{ backgroundColor: "rgba(0,0,0,0.02)" }}>
                  <Stack spacing="xs">
                    <Controller
                      name="googleDriveFolder"
                      control={syncForm.control}
                      render={({ field }) => (
                        <TextInput
                          {...field}
                          size="xs"
                          label="同步目录 (Folder Path)"
                          placeholder="/OpenClipSync"
                        />
                      )}
                    />
                    <Controller
                      name="googleClientId"
                      control={syncForm.control}
                      render={({ field }) => (
                        <TextInput
                          {...field}
                          size="xs"
                          label="Google Cloud OAuth Client ID"
                          placeholder="例如: xxxxxxxx.apps.googleusercontent.com"
                        />
                      )}
                    />
                    <Controller
                      name="googleAccessToken"
                      control={syncForm.control}
                      render={({ field }) => (
                        <TextInput
                          {...field}
                          size="xs"
                          label="访问令牌 (Access Token)"
                          placeholder="点击下方按钮自动获取或手动填入 Token"
                        />
                      )}
                    />
                    <Group position="apart" pt={4}>
                      <Text fz={11} color="dimmed">
                        重定向 URI 请设置为: <code>{chrome.identity.getRedirectURL()}</code>
                      </Text>
                      <Button
                        size="xs"
                        variant="light"
                        color="yellow"
                        leftIcon={<IconBrandGoogleDrive size="0.85rem" />}
                        loading={authorizingGoogle}
                        onClick={handleAuthGoogle}
                      >
                        点击一键 OAuth 授权登录
                      </Button>
                    </Group>

                    <Accordion variant="separated" radius="xs" chevronPosition="right">
                      <Accordion.Item value="guide">
                        <Accordion.Control>
                          <Text fz="xs" color="dimmed">
                            📖 查看如何免费申请 Google OAuth Client ID 简易步骤
                          </Text>
                        </Accordion.Control>
                        <Accordion.Panel>
                          <Stack spacing={4} fz={11} color="dimmed">
                            <Text>1. 访问 <Anchor href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</Anchor> 并新建一个项目。</Text>
                            <Text>2. 前往【API 和服务】→【库】，搜索并启用 <b>Google Drive API</b>。</Text>
                            <Text>3. 进入【OAuth 同意屏幕】，用户类型选择“外部”，填写应用名称与邮箱。</Text>
                            <Text>4. 进入【凭据】→【创建凭据】→【OAuth 客户端 ID】，应用类型选择 <b>Web 应用</b>。</Text>
                            <Text>5. 在【已获授权的重定向 URI】中添加：<code>{chrome.identity.getRedirectURL()}</code>。</Text>
                            <Text>6. 复制生成的 <b>客户端 ID (Client ID)</b> 粘贴到上方输入框，并点击【一键 OAuth 授权】即可！</Text>
                          </Stack>
                        </Accordion.Panel>
                      </Accordion.Item>
                    </Accordion>
                  </Stack>
                </Paper>
              )}
            </Stack>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Paper>
  );
};
