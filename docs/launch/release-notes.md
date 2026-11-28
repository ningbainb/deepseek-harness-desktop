# DeepSeek Harness Desktop 5.6.0

## 中文

DeepSeek Harness Desktop 5.6.0 是一次体验与能力全面升级的正式版本：在一个桌面工作台里汇集多款本机 AI 助手、更省额度的代码读写、全局 `Ctrl+K` 对话搜索、办公文档直读、改文件自动留档回滚、飞书/钉钉/企业微信进度提醒，以及开箱即用的国内加速更新。

### 本次亮点

- **一个窗口用遍多款本机 AI 助手。** 不用来回切换软件或命令行，在模型菜单里就能按对话选用本机 Gemini（Antigravity CLI）、Codex、OpenCode 等助手，还能在右侧栏并排开启多个助手协作，继续支持 `/acp` 快捷呼出。
- **读大项目更快、更省额度（nbfast）。** 批量读取文件、先预览再精准修改代码，大幅减少反复读取大文件带来的额度消耗；对话底部的用量明细会实时告诉你一共省下了多少额度。
- **按 `Ctrl+K` 一秒搜遍历史对话与项目文档。** 无论是中文、英文还是代码里的名称，都能直接搜出过去聊过的内容；在侧栏或文件列表里顺手把项目文档加入知识库，让 AI 边查资料边作答。
- **办公文档直读、流程图离线存图与对话小工具。** 拖入 Word、Excel、PPT、PDF 或授权打开的网页即可直接解析，一键选择「只传路径」或「提取摘要」；流程图（Mermaid）支持离线直接出图，还能一键导出 SVG 或 PNG；常用外部工具界面也能直接在对话卡片里操作。
- **AI 改文件自带「后悔药」。** 每轮文件修改完成后自动保存独立的恢复点，完全不打乱你自己的 Git 历史；支持左右分栏对比改了哪些行，按单个文件或整轮一键还原，还原错了还能撤销。
- **飞书 / 钉钉 / 企业微信通知与按需桌面操控。** 支持把长任务完成通知和操作确认推送到飞书、钉钉、企业微信或常用 Webhook；电脑桌面操控放在模型菜单中按需开启，平时安静隐藏不占版面。
- **国内更新默认提速 & 界面更顺手。** 默认内置国内加速更新线路，检查和下载新版本更快，遇到线路波动会自动切回 GitHub；输入栏按专业模式和办公模式自动精简，常用选项收短为「询问」「默认」，并修复了 SSH 远程连接、Windows 自动更新、性价比模式切换和意外断电配置恢复等问题。

### 验证

三端原生构建与验收记录可在 GitHub Actions 查看。[发布工作流](https://github.com/ningbainb/deepseek-harness-desktop/actions/workflows/desktop-three-platform-release.yml)

### 下载与校验

本发行页提供 Windows x64 安装程序、macOS arm64 DMG 和 ZIP，以及 Linux x64 DEB。安装前可通过同页的 `SHA256SUMS.txt` 校验下载文件；已安装桌面版的用户可在应用内自动检查并选择加速线路或 GitHub 完成升级。

### 说明

基于官方 DSH `0.2.3-alpha.2` 与 Cordis `4.2.0-alpha.1` 构建。macOS arm64（macOS 13+）和 Linux x64 继续以 Preview 提供。签名与文件信息见 `release-manifest.json`。

[项目官网](https://1521003.xyz/) · [QQ 二群（1129522514）](https://qm.qq.com/q/9hrcdaEYPC)

## English

DeepSeek Harness Desktop 5.6.0 is a major feature and polish release designed around everyday workflows: switch between local AI assistants in one window, save tokens on large projects, search any past conversation with `Ctrl+K`, read Office and PDF files directly, undo file edits safely, get notified on Feishu/DingTalk/WeCom, and enjoy faster built-in update downloads.

### Highlights

- **Multiple Local AI Assistants in One Workspace.** Switch between local Gemini (Antigravity CLI), Codex, OpenCode, and companion agents right from the model menu or side by side in the right panel, with `/acp` shortcut support preserved.
- **Faster Code Work with Fewer Tokens (nbfast).** Read project files in batches, preview code changes before applying them, and see live token savings directly in the bottom usage details bar.
- **Instant `Ctrl+K` Search Across History and Docs.** Search past conversations and project knowledge bases across Chinese, English, and code terms in seconds, and add workspace files as reference sources with one click.
- **Direct Office/PDF Reading, Offline Diagrams, and Interactive Tools.** Drop in Word, Excel, PowerPoint, or PDF files and switch between path references and extracted text; render Mermaid diagrams offline with one-click SVG/PNG export; interact with rich tool cards directly inside chat.
- **Safe Recovery Points for File Edits.** Automatically saves a separate restore point after every AI edit turn without touching your Git history. Inspect side-by-side diffs, restore individual files or a full turn, and undo any restore.
- **Feishu / DingTalk / WeCom Alerts & On-Demand Desktop Control.** Route task updates and approvals to Feishu, DingTalk, WeCom, or webhooks, and toggle Windows desktop control from the model menu only when you need it.
- **Faster Default Update Mirror & Cleaner Interface.** Preconfigures `download.1521003.xyz` for faster regional downloads with automatic fallback to GitHub, streamlines the composer by work mode with concise options, and fixes SSH remote connections, Windows auto-updates, Value Mode preset sync, and crash recovery.

### Verification

Native build and acceptance records for all three platforms are available in GitHub Actions. [Release workflow](https://github.com/ningbainb/deepseek-harness-desktop/actions/workflows/desktop-three-platform-release.yml)

### Download and verification

This release includes a Windows x64 installer, macOS arm64 DMG and ZIP files, and a Linux x64 DEB package. Verify your download against the attached `SHA256SUMS.txt` before installing, or upgrade seamlessly through the built-in desktop updater.

### Notice

Built on official DSH `0.2.3-alpha.2` and Cordis `4.2.0-alpha.1`. macOS arm64 (macOS 13+) and Linux x64 remain previews. See `release-manifest.json` for signing status and file details.
