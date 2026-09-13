# OpenClip Sync — 代码彻底剥离与全新架构重写计划书 (Refactor & Rewrite Plan)

## 📌 一、 重构背景与核心目标

当前项目是在原开源项目 `clipboard-history` 基础上演进而来。随着 **OpenClip Sync** 功能的不断深化（如自研双向同步内核、WebDAV 压缩传输、黑名单全词拦截引擎、多设备发现卡片墙等），原项目的许多设计理念已成为沉重的技术负债：

1. **逻辑与交互不一致**：原项目依赖第三方 InstantDB 云服务及复杂的上下文代理，交互繁琐混乱，且包含大量废弃的功能引导（如第三方 OAuth 流程教学、复杂的浮动窗口分配逻辑等）。
2. **代码冗余严重**：存在 over-engineered 的状态分散管理（Jotai atoms 与 4+ 个 Context 嵌套）、1300+ 行臃肿的设置弹窗、已废弃的数据库 Schema (`instant.schema.ts`)。
3. **版权与自主可控风险**：为了彻底消除许可协议及版权争议，必须将项目代码与原作者的交互界面、逻辑链路及品牌遗留进行 **100% 剥离与全新重写 (Fresh Rewrite)**。

---

## 🎯 二、 旧代码剥离与清理清单 (Removal Checklist)

### 1. 彻底移除的依赖与旧文件
- [ ] **InstantDB 残余文件**：彻底删除 `instant.schema.ts`，从 `package.json` 中移除 `@instantdb/core` 和 `@instantdb/react` 依赖。
- [ ] **冗余状态与 Context**：移除 `popup/contexts/` 下的 `EntriesContext.tsx`、`EntryIdToTagsContext.tsx`、`FavoriteEntryIdsContext.tsx`、`PinnedEntryIdsContext.tsx` 繁复包装，改为统一的数据流 Hook。
- [ ] **臃肿设置组件**：废弃当前的 `popup/components/modals/SettingsModalContent.tsx`（1300 行），全新编写轻量化 Settings 模块。
- [ ] **废弃图标与链接**：清空所有指向原作者网站、应用商店、引导页面的残留。

---

## 🎨 三、 全新界面 (UI) 与交互 (Fresh UX) 设计蓝图

我们将抛弃原有的混乱布局，按照 **现代极简、直观高效** 的原则全新构建界面：

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
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 示例剪贴板内容 B                                [复制] │ │
│ │ 🕒 10分钟前  💻 MacBook Air                             │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 1. 交互重构重点
- **全新的极简设置中心 (Fresh Settings Modal)**：
  - 彻底去除无用教程，分四大清晰面板：
    1. **常规配置**：历史保留天数、单条字符上限、系统通知。
    2. **多云同步**：WebDAV（URL/账号/密码/压缩）、Chrome Sync、OneDrive、Google Drive 简明切开。
    3. **自动清理规则**：直观的黑名单多词匹配组管理（支持一键添加/禁用/删除）。
    4. **备份导出**：标准的 JSON / CSV 导出与导入。
- **全新的卡片化列表 (Fresh List Components)**：
  - 列表项支持高亮显示设备来源（如 `💻 办公电脑`）。
  - 操作栏直观集成：`一键复制` | `置顶 Pin` | `收藏 Favorite` | `打标签 Tag` | `加入自动清理`。

---

## 🏗️ 四、 架构剥离与重载方案 (Architectural Architecture)

### 1. 归一化数据存储层 (`utils/db/core.ts`)
- 废弃 InstantDB 风格的 `TxOp` 复杂 DSL 语法，改用极其直观的 Local-First Store 模式：
  ```ts
  // 简化的核心接口
  export const db = {
    getEntries: () => Promise<Entry[]>,
    saveEntry: (entry: Partial<Entry>) => Promise<void>,
    deleteEntry: (id: string) => Promise<void>,
    sync: () => Promise<SyncResult>,
  };
  ```

### 2. 统一的数据响应式 Hook (`useOpenClipStore`)
- 用单一数据源 Hook 替代 Jotai atoms + 多 Context 架构：
  ```ts
  export const useOpenClipStore = () => {
    // 统一管理 entries, favoriteIds, pinnedIds, tags, devices
  };
  ```

---

## 🚀 五、 分阶段实施路线图 (Phase-by-Phase Roadmap)

| 阶段 | 实施内容 | 目标状态 |
| :--- | :--- | :--- |
| **Phase 1: 瘦身剥离** | 删除 `instant.schema.ts`，卸载 `@instantdb` 依赖，重构 `utils/db/core.ts` 去除复杂 Proxy。 | 代码体积减少 30%，彻底脱离原后端残留 |
| **Phase 2: Fresh Settings 模块** | 全新重写 `SettingsModalContent.tsx`，将 1300 行代码缩减至 300 行结构清晰的组件。 | 设置界面焕然一新，零原作者逻辑残留 |
| **Phase 3: Fresh Popup 主界面** | 重构 `popup/App.tsx` 与列表展示，应用统一的新外观与卡片组件。 | 交互简洁明快，设备卡片与黑名单无缝协同 |
| **Phase 4: 终极审查** | 全局清理无用 i18n 键、废弃类型与遗留注释，完成 100% 干净打包。 | 具备完全独立的自主知识产权 |

---

> 💡 **备注**：当前已完成重构计划书编写，代码改动将在下一步按 Phase 逐步落地。
