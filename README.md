# OpenClip Sync (v2.0.0)

> 🚀 **安全、私有、多端同步的剪贴板历史管理工具（Chrome / Edge / Firefox 扩展）**  
> 基于开源项目 [Clipboard History](https://github.com/ayoung19/clipboard-history) 深度二次开发与增强。

---

## 🌟 特性一览 (Features)

- 🔒 **隐私安全 & 纯本地控制**：所有剪贴板数据完全归您自己掌控，无需第三方中心化商业服务器或付费订阅。
- 🔄 **多端云同步 (Multi-Provider Sync)**：
  - **Chrome Sync (内置同步)**：利用 Google 账号在多台电脑间自动静默同步，即开即用（单项配额约 100KB）。
  - **WebDAV 同步**：支持坚果云、Nextcloud、群晖 Synology、自建网盘等标准 WebDAV 服务端，无容量限制，全私有化。
  - **Microsoft OneDrive / Google Drive**：支持通过网盘目录进行同步。
  - **独立开关控制**：可按需同时开启或切换任意同步引擎。
- 📱 **多设备管理**：支持自定义设备名称（如 `设备 A`、`MacBook`、`Office PC`），多设备数据合并与状态追踪。
- ⚡ **智能全局去重 (Smart Deduplication)**：复制相同内容自动合并更新时间，避免重复冗余条目，保持剪贴板整洁。
- 🏷️ **标签分类与全局搜索**：支持为常用剪贴板内容打标签、加星收藏、快捷搜索。
- 🎨 **现代化 UI & 浮动窗口**：支持暗黑模式、侧边栏 (Side Panel) 模式与独立画中画浮动小窗。

---

## 🛠️ 配置指南 (Setup Guide)

### 1. WebDAV 同步配置（以坚果云为例）
1. 打开坚果云官网并登录 -> 【账户信息】 -> 【安全设置】 -> 【添加应用密码】。
2. 打开 OpenClip Sync -> 右上角【个人中心】或【设置】 -> 【Cloud】选项卡。
3. 开启 **WebDAV 云同步** 开关，填写：
   - **服务器 URL**：`https://dav.jianguoyun.com/dav/`
   - **账号 / 邮箱**：您的坚果云注册邮箱
   - **密码**：刚才生成的应用授权密码
   - **保存路径**：`/openclip-sync.json`
4. 点击【保存设置】即可完成。

### 2. Chrome 内置同步配置
1. 在【Cloud】选项卡中直接打开 **Chrome 内置同步 (Chrome Sync)** 开关。
2. 确保您的浏览器已登录 Google 账号并开启扩展同步功能，多台设备即可自动实现剪贴板内容同步。

---

## 📐 图标规范 (Icon Assets)

若需要自定义扩展图标，请准备以下尺寸的 PNG 图像并放置于 `assets/` 目录：
- `assets/icon.png`: 主图标（推荐分辨率 **512x512** PNG）
- `assets/iconOn128.png`: 监控开启状态图标（分辨率 **128x128** PNG）
- `assets/iconOff128.png`: 监控暂停状态图标（分辨率 **128x128** PNG）

---

## 💻 本地开发与构建 (Development)

本项目基于 [Plasmo Framework](https://docs.plasmo.com/) 构建。

### 安装依赖
```bash
npm install
```

### 开发模式 (Dev Server)
```bash
npm run dev
# 或
npx plasmo dev
```
打开 Chrome 浏览器访问 `chrome://extensions`，开启开发者模式并点击【加载已解压的扩展程序】，选择项目目录下的 `build/chrome-mv3-dev` 即可。

### 生产打包 (Production Build)
```bash
npm run build
# 或
npx plasmo build
```
打包输出目录为 `build/chrome-mv3-prod`。

---

## 📜 致谢与开源协议 (Attribution & License)

- 本项目由 **OpenClip Sync** 团队在原始优秀开源项目 [ayoung19/clipboard-history](https://github.com/ayoung19/clipboard-history)（原作者：[Andy Young](https://github.com/ayoung19)）的基础上改造而来。
- 本项目遵循 GPL-3.0 协议开源，仅供个人自用备份及技术研究交流。
