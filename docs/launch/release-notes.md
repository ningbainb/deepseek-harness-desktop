# DeepSeek Harness Desktop 5.4.0

## 中文

5.4.0 升级底层运行时至官方 DSH `0.2.3-alpha.2` 与 Cordis `4.2.0-alpha.1`，并围绕聚合模型中转、多 Agent 协作、插件体系及原生桌面交互体验进行全面升级。

### 本次亮点

- **聚合模型中转（bai）全新引导体验。** 优化模型选择器、设置页卡片与首次启动三路分流引导（DeepSeek 官方直连 / 聚合模型中转 / 本地 CLI 或自有 Key），支持登录前浏览可解锁模型目录（Claude / GPT / Gemini / DeepSeek），并在遇到 429 限流、余额不足或请求超时时提供一键切至中转继续对话的快捷入口。
- **内置多 Agent 审批收件箱与数据目录迁移。** 新增多 Agent 审批收件箱（`dsh-agent-inbox`），支持从顶部工具栏集中处理待审批调用与工作区 Git Diff 总览；新增事务型数据目录迁移（`dsh-data-location`），安全迁移数据并保留现有环境状态。
- **原生对话中的办公模式。** 在侧边栏切换到办公模式，通过输入框上方的快捷面板管理飞书、腾讯文档、语雀、金山文档、企业微信、钉钉、腾讯会议和 WPS 365。支持自动安装的连接器可一键安装，无需手动配置 PATH。Windows 安装和登录时隐藏命令行窗口，飞书首次连接自动初始化配置并在系统浏览器中打开授权页，官网与授权链接也在系统浏览器中打开。
- **通用 ACP v1 适配与 Antigravity OAuth 隔离。** 通过标准输入输出接入符合 ACP v1 的本地 Agent，支持能力协商、会话管理及权限请求。Antigravity 的个人与企业 OAuth 限于本机人工交互，普通模型后端、手机远程端、省钱模式和定时任务无法调用。
- **内置与社区插件升级。** 更新 `dsh-context` 0.87.1、`@tencent-connect/dsh-qqbot` 0.5.5、`reasoning-slider` 0.0.7 和 `@michengai/dsh-im-connect` 1.0.53，并补齐内置插件的来源与维护者信息。
- **拓展坞规整与窗口直觉优化。** 统一拓展坞侧边栏层级、卡片与按钮视觉规范，新增版本感知的「本版本新功能」引导弹窗（可通过顶部「帮助 → 本版本新功能」随时回看），并修正标题栏最小化行为：点击减号（`-`）正常最小化到任务栏，点击叉号（`×`）按托盘策略驻留系统托盘。
- **升级体验与更新下载线路。** 调整升级后 Star 提示的版式。自动线路根据系统时区和区域设置选择下载顺序，中国大陆可优先使用已配置且可用的 CDN，海外优先使用 GitHub。更新面板支持手动选线，并预留 Cloudflare R2 镜像接入。

### 验证

三端构建与验收记录可在 GitHub Actions 查看。[发布工作流](https://github.com/ningbainb/deepseek-harness-desktop/actions/workflows/desktop-three-platform-release.yml)

### 下载与校验

安装包与 `SHA256SUMS.txt` 均在本发行页。Windows 用户覆盖安装旧版本时会自动保留原有数据目录、模型配置、会话与拓展设置；安装前可通过 `SHA256SUMS.txt` 校验文件完整性。

### 说明

基于官方 DSH `0.2.3-alpha.2` 与 Cordis `4.2.0-alpha.1` 构建。macOS arm64（macOS 13+）和 Linux x64 为 Preview。签名与文件信息见 `release-manifest.json`。

[项目官网](https://1521003.xyz/) · [QQ 二群（1129522514）](https://qm.qq.com/q/9hrcdaEYPC)

## English

5.4.0 upgrades the underlying runtime to official DSH `0.2.3-alpha.2` and Cordis `4.2.0-alpha.1`, delivering major improvements across multi-model relay onboarding, multi-agent collaboration, plugin ecosystem upgrades, and native desktop UX consistency.

### Highlights

- **Redesigned multi-model relay (`bai`) onboarding and recovery.** Refreshed the model selector, settings card, and three-way First-Run Chooser (DeepSeek Official, Multi-Model Relay, or Local CLI / Custom Key), displaying unlockable Claude, GPT, Gemini, and DeepSeek families before login plus a quick fallback action when sessions encounter 429 rate limits, quota exhaustion, or timeouts.
- **Built-in Agent Approval Inbox and transactional Data Directory Migration.** Added `dsh-agent-inbox` accessible directly from the top toolbar for reviewing scoped tool approvals and workspace Git diffs, alongside `dsh-data-location` for safe transactional data directory relocation.
- **Work Mode in native conversations.** Switch modes in the sidebar and manage Feishu, Tencent Docs, Yuque, Kingsoft Docs, WeCom, DingTalk, Tencent Meeting, and WPS 365 from the panel above the composer. Supported connectors install in one click without a manual PATH change. Windows keeps the console hidden during installation and sign-in. Feishu initializes its configuration on first connection and opens authorization in the system browser, which also handles official site and authorization links.
- **Generic ACP v1 support and Antigravity OAuth isolation.** Connect local ACP v1 agents over standard input and output with capability negotiation, session management, and permission requests. Antigravity personal and business OAuth are restricted to direct local interaction and unavailable to ordinary model backends, mobile remote access, Value Mode, and scheduled tasks.
- **Built-in and community plugin updates.** Updated `dsh-context` (0.87.1), `@tencent-connect/dsh-qqbot` (0.5.5), `reasoning-slider` (0.0.7), and `@michengai/dsh-im-connect` (1.0.53), and filled in the source and maintainer details for built-in plugins.
- **Extension Dock consolidation and window behavior polish.** Unified Extension Dock navigation hierarchy, native card styling, and action buttons, introduced a version-aware What's New dialog (reopenable via Help → What's New), and aligned window controls so minimize (`-`) sends the window to the taskbar while close (`×`) minimizes to the system tray when configured.
- **Upgrade prompt and update download routes.** Refined the Star prompt shown after upgrading. Automatic routing uses system time zone and locale to rank download sources. In mainland China, it can prefer a configured and reachable CDN. Elsewhere, GitHub comes first. The update panel supports manual selection, and the routing layer can accommodate a Cloudflare R2 mirror.

### Verification

Three-platform build and verification records are available in GitHub Actions. [Release workflow](https://github.com/ningbainb/deepseek-harness-desktop/actions/workflows/desktop-three-platform-release.yml)

### Download and verification

Installers and `SHA256SUMS.txt` are attached to this release. Running the Windows installer over an existing installation preserves your data directory, model settings, conversations, and extensions. Verify downloads with `SHA256SUMS.txt`.

### Notice

Built on official DSH `0.2.3-alpha.2` and Cordis `4.2.0-alpha.1`. macOS arm64 (macOS 13+) and Linux x64 remain previews. See `release-manifest.json` for signing status and file details.
