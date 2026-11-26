# DeepSeek Harness Desktop 5.6.0

## 中文

5.6.0 为维护修复版本，重点修复拓展坞与对话界面中的 SSH 远程开发、性价比模式预设切换与智能操控完全权限兼容、Windows 自动升级异常，以及异常断电后的本地配置自愈与令牌悬停预览体验。

### 本次亮点

- **恢复 SSH 远程开发入口与挂载可靠性。** 兼容拓展坞「更多工具 → SSH 远程开发」在不同原生布局容器中的懒加载挂载，并在打开前自动收起可能遮挡对话区的全局面板或快捷键设置弹窗；增加重复挂载保护；调整原生设置视图显示时的 Toast 提示位置，避免错误反馈被原生视图遮挡。
- **增强 SSH 连接与配置导入兼容性。** 为密码主机补充 PAM `keyboard-interactive` 认证兜底；兼容 Windows 下带引号路径与 `~\` 路径展开；支持 `~/.ssh/config` 中的 `Key=Value` 语法、带引号 `IdentityFile`、自动探测同目录默认私钥（`id_ed25519` / `id_rsa` / `id_ecdsa`）及 `USERNAME` 用户兜底。
- **修复 Windows 自动更新检查失败。** 修复当安装目录旁存在 `.dsh-desktop-updates` 缓存目录时 `NsisUpdater` 未初始化 `ElectronHttpExecutor` 导致的空指针报错（`Cannot read properties of null (reading 'request')`），恢复新版本检测与自动下载安装流程。
- **修复性价比模式与智能操控兼容性，新增断电自愈与令牌悬停预览。** 修复性价比模式（`dsh-value-mode`）仅读取创建时冻结 `agentPreset` 导致空白会话切进/切出预设路由不同步的问题；修复「完全权限 + 不询问」模式下 Playwright/浏览器与电脑操控工具被静默拒绝的问题；为桌面端持久化配置与迁移日志增加意外断电/全零损坏文件的无感备份恢复与隔离重建；为对话底部实时令牌行补充悬停直出预览卡片及缓存命中/写入明细。

### 验证

三端原生构建与验收记录可在 GitHub Actions 查看。[发布工作流](https://github.com/ningbainb/deepseek-harness-desktop/actions/workflows/desktop-three-platform-release.yml)

### 下载与校验

本发行页提供 Windows x64 安装程序、macOS arm64 DMG 和 ZIP，以及 Linux x64 DEB。安装前可通过同页的 `SHA256SUMS.txt` 校验下载文件。

### 说明

基于官方 DSH `0.2.3-alpha.2` 与 Cordis `4.2.0-alpha.1` 构建。macOS arm64（macOS 13+）和 Linux x64 继续以 Preview 提供。签名与文件信息见 `release-manifest.json`。

[项目官网](https://1521003.xyz/) · [QQ 二群（1129522514）](https://qm.qq.com/q/9hrcdaEYPC)

## English

Desktop 5.6.0 is a maintenance release that restores SSH remote access, fixes Windows auto-update checks, resolves Value Mode preset switching and full-access Smart Control execution, and adds power-loss startup self-healing with hover token cache previews.

### Highlights

- **Restored SSH entry & conversation mounting.** Supports lazy mounting across both `[data-pane="conversation"]` and `[class*="centerCol"]`, dismisses blocking global panels or settings modals when launched from Extension Dock, guards against duplicate `apply` registration, and keeps Dock toast notifications visible in the sidebar while native `WebContentsView` tabs are open.
- **Improved SSH authentication & config import.** Adds bounded `keyboard-interactive` fallback for PAM password hosts, handles quoted and Windows `~\` key paths, parses `Key=Value` entries in `~/.ssh/config`, detects default keys (`id_ed25519` / `id_rsa` / `id_ecdsa`) when `IdentityFile` is omitted, and falls back to `USERNAME` on Windows.
- **Fixed Windows auto-update check failures.** Initializes `ElectronHttpExecutor` on the custom `NsisUpdater` instance used when the sibling `.dsh-desktop-updates` cache directory exists, resolving `Cannot read properties of null (reading 'request')` and restoring update checks and downloads.
- **Value Mode preset sync, full-access Smart Control, crash self-healing & token hover preview.** Tracks live `agentPreset` projections/events in `dsh-value-mode`, stops silently rejecting Browser/Computer Use tools under `danger-full-access` (`approval: never`), auto-recovers or quarantines power-loss-corrupted startup state files, and shows cache hit/write breakdowns on token-bar hover.

### Verification

Native build and acceptance records for all three platforms are available in GitHub Actions. [Release workflow](https://github.com/ningbainb/deepseek-harness-desktop/actions/workflows/desktop-three-platform-release.yml)

### Download and verification

This release includes a Windows x64 installer, macOS arm64 DMG and ZIP files, and a Linux x64 DEB package. Verify your download against the attached `SHA256SUMS.txt` before installing.

### Notice

Built on official DSH `0.2.3-alpha.2` and Cordis `4.2.0-alpha.1`. macOS arm64 (macOS 13+) and Linux x64 remain previews. See `release-manifest.json` for signing status and file details.
