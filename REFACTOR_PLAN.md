# OpenClip Sync — 代码剥离、全模态同步(扩展/书签/历史/剪贴板)与全新重构计划书

## 📌 一、 重构背景与终极产品愿景

当前项目正从原开源项目 `clipboard-history` 彻底蜕变为一款**全能型去中心化浏览器全模态数据同步插件**。

通过全方位融合与吸纳 [konode (konabe-studio/konode)](https://github.com/konabe-studio/konode.git) 的核心解耦设计，本项目将实现**“一个插件全同步”**的终极体验。不仅同步剪贴板，还将浏览器全套核心数据统一入库并无缝备份，一个插件替代多款工具：

1. **多模态浏览器数据大一统 (Full-Spectrum Sync)**：
   - 📋 **剪贴板历史 (Clipboard History)**：多设备历史记录、自定义标签、固定置顶、敏感词自动清理。
   - 🔖 **浏览器书签 (Bookmarks Tree)**：跨浏览器书签树合并、双向同步与失效检测。
   - 📜 **浏览历史与会话 (Browser History & Sessions)**：重要历史记录与打开标签页分组全端同步。
   - 🧩 **扩展插件清单与配置 (Installed Extensions & Configs)**：已安装扩展插件列表备份与配置共享。
   - ⚙️ **黑名单与设备规则 (Rules & Settings)**：全端共享自动清理规则、设备注册表。
2. **零中间商与无账户自主存储 (No Middleman, Storage You Own)**：数据完全通过用户自己的 WebDAV / 云盘加密传输，杜绝第三方云服务与中间人风险。
3. **数据库兼容性与极致轻量化**：保留 `OpenClipDbAdapter` 解耦能力（预留 SQLite WASM / 自建 Lightweight API 插槽），采用零内存常驻的最轻量架构。
4. **彻底清洗旧代码与版权独立 (100% Fresh Rewrite)**：借助功能全面升维，彻底淘汰掉原 `clipboard-history` 所有的旧代码、旧模型与旧界面，实现 100% 独立自主产权。

---

## 🎯 二、 旧代码剥离与清理清单 (Removal Checklist)

### 1. 彻底移除的依赖与旧文件
- [ ] **InstantDB 残余文件**：彻底删除 `instant.schema.ts`，从 `package.json` 中移除 `@instantdb/core` 和 `@instantdb/react` 依赖。
- [ ] **冗余状态与 Context**：移除 `popup/contexts/` 下的 `EntriesContext.tsx`、`EntryIdToTagsContext.tsx`、`FavoriteEntryIdsContext.tsx`、`PinnedEntryIdsContext.tsx` 繁复包装，改为统一的数据流 Hook。
- [ ] **臃肿设置组件**：废弃当前的 `popup/components/modals/SettingsModalContent.tsx`（1300 行），全新编写轻量化 Settings 模块。
- [ ] **废弃图标与链接**：清空所有指向原作者网站、应用商店、引导页面的残留。

---

## 🔗 三、 全模态数据同步架构设计 (Full-Spectrum Sync Architecture)

我们将融合 `konode` 的多驱动抽象，构建全模态数据同步引擎：

```
                              ┌─────────────────────────┐
                              │  OpenClip Core Engine   │
                              └────────────┬────────────┘
                                           │
 ┌─────────────────┬───────────────────────┼───────────────────────┬─────────────────┐
 ▼                 ▼                       ▼                       ▼                 ▼
📋 剪贴板历史      🔖 浏览器书签           📜 浏览历史/会话         🧩 扩展列表与配置  ⚙️ 清理规则与设备
(Clipboard)       (Bookmarks)             (History & Sessions)    (Extensions)       (Rules & Devices)
- 历史/置顶/收藏  - 目录树双向合并        - 历史记录备份           - 插件清单备份     - 全词匹配黑名单
- 敏感词黑名单    - 节点去重/对齐         - 标签页分组发送         - 配置无缝迁移     - 多设备发现卡片墙
 └─────────────────┴───────────────────────┼───────────────────────┴─────────────────┘
                                           ▼
                              🗄️ 统一 WebDAV / 多云存储引擎
```

---

## 🗄️ 四、 轻量级 DB 抽象层设计 (Lightweight DB Adapter)

针对后续可能的数据库扩展，我们将建立一套**极低内存开销、高度解耦**的 DB 适配器架构：

```ts
export interface OpenClipDbAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  getEntries(query?: Record<string, unknown>): Promise<Entry[]>;
  saveEntries(entries: Entry[]): Promise<void>;
  deleteEntries(ids: string[]): Promise<void>;
}
```

- **默认实现**：`LocalIndexedDbAdapter`（基于浏览器原生 IndexedDB，内存占用接近零，无需加载任何大型云端 SDK）。
- **预留插槽**：`RemoteDbAdapter`（未来可无缝插拔 SQLite WASM 或自建 API，绝不影响前端 UI 与同步业务逻辑）。

---

## 🎨 五、 三态 UI 与人体工学交互重构 (Fresh UX Design)

不再照搬原作者混乱的交互逻辑，针对扩展的三种常见形态（Popup / Floating Window / SidePanel）进行极致方便好用的定制：

```
┌─────────────────────────────────────────────────────────────┐
│ 🚀 OpenClip Sync  [v2.3.1]               [同步状态: 🟢] [⚙️]  │
├─────────────────────────────────────────────────────────────┤
│ 🔍 [ 搜索剪贴板 / 书签 / 历史 / 扩展...             ] [🧹]   │
├─────────────────────────────────────────────────────────────┤
│ [📋 剪贴板]  [🔖 书签]  [📜 历史]  [🧩 扩展]  [🌐 云设备]     │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📌 示例剪贴板内容 A               [仅拉取此设备] [复制] │ │
│ │ 🏷️ #Code  🕒 2分钟前  💻 办公电脑                        │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 1. 三种形态的精细化 UX 定制
1. **Popup 快捷弹窗模式（默认 400x560）**：弹出时搜索框自动聚焦；按 `Enter` 快捷复制；按 `Esc` 关闭。
2. **Floating 独立悬浮窗模式 (窗口化常驻)**：自由拉伸大小；顶部窗口置顶按钮；支持全模态卡片拖拽与批量管理。
3. **SidePanel 侧边栏模式 (Chrome 侧栏伴随)**：纵向伴随工作流；支持剪贴板文本填充、书签快速打开、扩展列表与历史检索。

---

## 🚀 六、 分阶段实施路线图 (Phase-by-Phase Roadmap)

| 阶段 | 实施内容 | 目标状态 |
| :--- | :--- | :--- |
| **Phase 1: 瘦身剥离与 DB 抽象** | 卸载 `@instantdb` 依赖，重构 `utils/db/core.ts` 为最轻量 `OpenClipDbAdapter` 模式。 | 内存占用降至最低，为未来扩展留出无缝插槽 |
| **Phase 2: 融合 konode 全模态驱动** | 依次编写 `bookmarks`、`history`、`extensions` 同步驱动，接入统一 WebDAV 同步管道。 | 实现扩展、书签、历史与剪贴板大一统同步 |
| **Phase 3: Fresh Settings & UI 重写** | 重构 `popup/App.tsx` 与 Settings 模块，提供卡片化多模块切片与三态交互体验。 | 界面焕然一新，彻底消除原项目残留 |
| **Phase 4: 终极审查** | 全局清理无用 i18n 键、废弃类型与遗留注释，完成 100% 干净打包。 | 具备完全独立的自主知识产权 |

---

> 💡 **备注**：计划书已更新完成，已将 `konode` 的全模态数据同步（扩展清单/书签/历史/剪贴板）写入 Plan。后续代码修改将按此方案逐步落地。
