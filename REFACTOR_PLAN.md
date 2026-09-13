# OpenClip Sync — 代码剥离、DB预留与三态 UX 交互重载计划书

## 📌 一、 重构背景与核心目标

当前项目是在原开源项目 `clipboard-history` 基础上演进而来。随着 **OpenClip Sync** 功能的不断深化（如自研双向同步内核、WebDAV 压缩传输、黑名单全词拦截引擎、多设备发现卡片墙等），原项目的许多设计理念已成为沉重的技术负债：

1. **逻辑与交互不一致**：原项目依赖第三方 InstantDB 云服务及复杂的上下文代理，交互繁琐混乱，包含大量废弃的第三方教程与臃肿布局。
2. **代码冗余与依赖过载**：存在过度的状态分散管理（Jotai atoms 与 4+ 个 Context 嵌套）、1300+ 行臃肿的设置弹窗、已废弃的数据库 Schema。
3. **数据库兼容性与极致轻量化**：**保留数据库接口解耦能力**（为未来可能接入 SQLite WASM / 自建 Lightweight API 预留插件化插槽），但放弃笨重的第三方 SDK，采用**零内存常驻、最轻量**的抽象层架构。
4. **版权与自主可控风险**：为了彻底消除许可协议及版权争议，必须将项目代码与原作者的交互界面、逻辑链路及品牌遗留进行 **100% 剥离与全新重写 (Fresh Rewrite)**。

---

## 🎯 二、 旧代码剥离与清理清单 (Removal Checklist)

### 1. 彻底移除的依赖与旧文件
- [ ] **InstantDB 残余文件**：彻底删除 `instant.schema.ts`，从 `package.json` 中移除 `@instantdb/core` 和 `@instantdb/react` 依赖。
- [ ] **冗余状态与 Context**：移除 `popup/contexts/` 下的 `EntriesContext.tsx`、`EntryIdToTagsContext.tsx`、`FavoriteEntryIdsContext.tsx`、`PinnedEntryIdsContext.tsx` 繁复包装，改为统一的数据流 Hook。
- [ ] **臃肿设置组件**：废弃当前的 `popup/components/modals/SettingsModalContent.tsx`（1300 行），全新编写轻量化 Settings 模块。
- [ ] **废弃图标与链接**：清空所有指向原作者网站、应用商店、引导页面的残留。

---

## 🗄️ 三、 轻量级 DB 抽象层设计 (Lightweight DB Adapter)

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

## 🎨 四、 三态 UI 与人体工学交互重构 (Fresh UX Design)

不再照搬原作者混乱的交互逻辑，针对扩展的三种常见形态（Popup / Floating Window / SidePanel）进行极致方便好用的定制：

```
┌─────────────────────────────────────────────────────────────┐
│ 🚀 OpenClip Sync  [v2.3.1]               [同步状态: 🟢] [⚙️]  │
├─────────────────────────────────────────────────────────────┤
│ 🔍 [ 搜索历史文本 / 标签...                        ] [🧹]   │
├─────────────────────────────────────────────────────────────┤
│  [📋 全部历史]    [⭐ 置顶与收藏]    [🌐 多端云同步 (2台设备)] │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📌 示例剪贴板内容 A               [仅拉取此设备] [复制] │ │
│ │ 🏷️ #Code  🕒 2分钟前  💻 办公电脑                        │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 1. 三种形态的精细化 UX 定制
1. **Popup 快捷弹窗模式（默认 400x560）**：
   - **定位**：零延迟闪速查找与复制。
   - **交互**：弹出时搜索框自动获得焦点；按 `Enter` 快捷复制第 1 条历史；按 `Esc` 快捷关闭。
2. **Floating 独立悬浮窗模式 (窗口化常驻)**：
   - **定位**：多任务协同工具箱。
   - **交互**：支持窗口自由拉伸调节大小；窗口顶部提供“始终置顶”切换按钮；支持多选历史批量合并复制。
3. **SidePanel 侧边栏模式 (Chrome 侧栏伴随)**：
   - **定位**：沉浸式工作流伴随。
   - **交互**：纵向高利用率布局，自动随网页滚动；支持一键将历史卡片拖拽/点击直接填充入网页当前焦点输入框。

### 2. 全新 Setting 重构方案
- 放弃 1300 行复杂嵌套，改为直观的 4 大切片面板：
  1. **常规首选项**：保留天数、单条限制、显示模式切换。
  2. **多云同步中心**：WebDAV（URL/账号/密码/压缩）、Chrome Sync、OneDrive、Google Drive。
  3. **自动清理规则引擎**：多词组合黑名单规则添加、禁用与测试。
  4. **数据备份导出**：标准的 JSON/CSV 导入导出。

---

## 🚀 五、 分阶段实施路线图 (Phase-by-Phase Roadmap)

| 阶段 | 实施内容 | 目标状态 |
| :--- | :--- | :--- |
| **Phase 1: 瘦身剥离与 DB 抽象** | 卸载 `@instantdb` 依赖，重构 `utils/db/core.ts` 为最轻量 `OpenClipDbAdapter` 模式。 | 内存占用降至最低，为未来扩展留出无缝插槽 |
| **Phase 2: Fresh Settings 模块** | 全新重写 `SettingsModalContent.tsx`，将 1300 行代码缩减至 300 行结构清晰的组件。 | 设置界面焕然一新，零原作者逻辑残留 |
| **Phase 3: 三态 UI/UX 优化** | 针对 Popup、Floating Window、SidePanel 分别实现焦点控制、快速复制与侧栏伴随体验。 | 界面方便好用，三种形态体验极致顺畅 |
| **Phase 4: 终极审查** | 全局清理无用 i18n 键、废弃类型与遗留注释，完成 100% 干净打包。 | 具备完全独立的自主知识产权 |

---

> 💡 **备注**：计划书已更新完成，后续代码修改将按此精细化方案逐步落地。
