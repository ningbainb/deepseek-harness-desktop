# DeepSeek Harness Desktop 5.6.0

## 中文

DeepSeek Harness Desktop 5.6.0 是集成官方 DSH `0.2.3-alpha.2` 与原生 UI 插槽体系的重要特性与稳定版，带来多引擎 ACP 协同、nbfast 代码省流工具箱、全局中英代码混合检索、工作区检查点回滚、离线文档与 Mermaid 图表导出、国内 4 通道 IM 通知、Windows 原生操控，以及默认内置的 CDN 加速更新线路。

### 本次亮点

- **多引擎 ACP 协同与 Gemini CLI 交互支持。** 在原生模型菜单与右侧工作栏即可按会话切换本地 Antigravity CLI（Gemini）、Codex、OpenCode 等引擎（`/acp` 同步可用），支持主对话或并排右侧栏协同、交互式登录检测、思考档位与工具权限确认。
- **nbfast 省流工具箱（`dsh-fast-ops`）。** 提供 AST 语法大纲提取、结构化符号搜索、带修订号校验与 Diff 预览的多段批量改写及终端全量输出按需读取，并在底部实时令牌明细中展示累计节省令牌数。
- **全局混合检索（`Ctrl+K` / `/search`）与工作区知识库。** 支持基于 BM25 的中文、英文与代码标识符混合检索历史会话、记忆与项目知识库，并在右侧栏与文件树提供一键加入检索源入口。
- **办公文档解析、工作区检查点与离线图表。** 原生解析拖入的 Word/Excel/PowerPoint/PDF 与授权网页并支持一键切换路径引用或摘要；每轮写入自动保存独立影子检查点，支持分栏差异审阅、单文件或整轮恢复及撤销恢复；支持会话内交互式 MCP Apps 与 Mermaid 图表离线导出 SVG/PNG。
- **内置国内 4 通道 IM 通知与 Windows 原生操控。** 新增飞书、钉钉、企业微信与 Webhook 四通道轻量级消息推送与指令桥接（`dsh-im-hub`），以及受控的 Windows 桌面 UI 自动化与截图控制工具（`dsh-win-control`），默认仅在当前会话主动授权时呈现状态胶囊。
- **默认内置 CDN 加速更新与原生界面重塑。** 桌面端自动更新默认预置 `https://download.1521003.xyz/releases/`（国内线路自动探测并优先选用更快的健康源，海外及异常/`429` 自动回退 GitHub）；全面采用官方 DSH 原生插槽重构输入栏与设置导航，精简权限（「询问」）与推理强度（「默认」）文案，按模式隐藏冗余图标。
- **重点稳定性修复。** 修复 SSH 远程开发挂载与 PAM/Windows 密钥导入兼容、`.dsh-desktop-updates` 更新缓存目录下 `NsisUpdater` 空网络执行器报错、性价比模式预设热切换、完全权限下浏览器/电脑操控执行，以及意外断电损坏配置文件的启动自愈。

### 验证

三端原生构建与验收记录可在 GitHub Actions 查看。[发布工作流](https://github.com/ningbainb/deepseek-harness-desktop/actions/workflows/desktop-three-platform-release.yml)

### 下载与校验

本发行页提供 Windows x64 安装程序、macOS arm64 DMG 和 ZIP，以及 Linux x64 DEB。安装前可通过同页的 `SHA256SUMS.txt` 校验下载文件；已安装桌面版的用户可在应用内自动检查并选择加速线路或 GitHub 完成升级。

### 说明

基于官方 DSH `0.2.3-alpha.2` 与 Cordis `4.2.0-alpha.1` 构建。macOS arm64（macOS 13+）和 Linux x64 继续以 Preview 提供。签名与文件信息见 `release-manifest.json`。

[项目官网](https://1521003.xyz/) · [QQ 二群（1129522514）](https://qm.qq.com/q/9hrcdaEYPC)

## English

DeepSeek Harness Desktop 5.6.0 brings official DSH `0.2.3-alpha.2` and native slot integration together with major capabilities: multi-engine ACP collaboration, the nbfast token-efficient AST toolkit, global `Ctrl+K` hybrid search, workspace checkpoints, offline Office/PDF parsing and Mermaid export, a 4-channel IM hub, Windows native desktop control, and built-in CDN update acceleration.

### Highlights

- **Multi-Engine ACP Workbench & Interactive Gemini CLI.** Switch between local Antigravity CLI (Gemini), Codex, OpenCode, and companion engines directly inside the native model menu, right workspace pane, or `/acp` command, with per-session state, thinking level controls, and tool approval prompts.
- **nbfast Code Toolkit (`dsh-fast-ops`).** Delivers AST code outlines, structure-aware search, revision-checked batch edits with previews, and on-demand terminal output expansion, reporting cumulative token savings directly inside the live stats details panel.
- **Global Hybrid Search (`Ctrl+K` / `/search`) & Workspace Knowledge Base.** Uses BM25 ranking over mixed Chinese, English, and code identifiers across session transcripts, memories, and explicitly indexed Markdown/project knowledge sources from the sidebar and files tab.
- **Document Parsing, Workspace Checkpoints & Offline Diagrams.** Parses dropped Office/PDF documents and approved web pages with instant switching between path references and extracted excerpts; captures per-turn shadow Git checkpoints with split diff inspection, single-file or full-turn restore, and one-click undo; supports interactive in-chat MCP Apps and offline Mermaid SVG/PNG export.
- **4-Channel IM Hub & On-Demand Windows Control.** Adds lightweight Feishu, DingTalk, WeCom, and Webhook notification routing (`dsh-im-hub`) plus scoped Windows desktop UI automation (`dsh-win-control`) surfaced cleanly from the model menu and active-session composer pill.
- **Default CDN Update Acceleration & Native UI Refinement.** Preconfigures `https://download.1521003.xyz/releases/` as the default mirror in `UpdateDownloadRouter` (probing and preferring the faster healthy mirror in mainland China while automatically falling back to GitHub globally or on `429`/errors); aligns composer toolbars, two-character concise labels, and sidebar actions with official DSH UI slots.
- **Reliability & Bug Fixes.** Restores Extension Dock SSH mounting and PAM/Windows key import, initializes `ElectronHttpExecutor` when sibling update cache directories exist on Windows, syncs Value Mode presets dynamically, enables full-access Smart Control tools, and adds power-loss startup self-healing.

### Verification

Native build and acceptance records for all three platforms are available in GitHub Actions. [Release workflow](https://github.com/ningbainb/deepseek-harness-desktop/actions/workflows/desktop-three-platform-release.yml)

### Download and verification

This release includes a Windows x64 installer, macOS arm64 DMG and ZIP files, and a Linux x64 DEB package. Verify your download against the attached `SHA256SUMS.txt` before installing, or upgrade seamlessly through the built-in desktop updater.

### Notice

Built on official DSH `0.2.3-alpha.2` and Cordis `4.2.0-alpha.1`. macOS arm64 (macOS 13+) and Linux x64 remain previews. See `release-manifest.json` for signing status and file details.
