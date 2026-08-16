# DeepSeek Harness Desktop 0.1.9

## 中文

### 本次亮点

- 修复桌面版对话气泡、整段回复与代码块复制按钮点击无效的问题。应用只对当前本地 DSH 页面开放安全的剪贴板写入权限，剪贴板读取及其他敏感权限仍保持关闭。
- 自动更新调整为发现新版后直接在后台下载，不再用下载前系统弹窗打断对话。下载完成后会显示新的蓝黑毛玻璃更新面板，由用户选择立即重启安装或稍后处理。
- 侧边栏“检查更新”在桌面环境中改为检查 DeepSeek Harness Desktop，不再误触发 Web UI 插件自更新；普通浏览器部署仍保留原插件更新能力。
- 启动页改为简洁的“探索未至之境”界面，只保留当前状态和单条进度条。原有大圆球、轨道与阶段列表已移除，替换为完全本地绘制的原创蓝黑粒子鲸鱼。
- 粒子鲸鱼只在启动页面运行，进入 DSH 主界面后随页面导航自动释放；系统开启“减少动态效果”时会显示静态版本。
- 更新面板统一展示当前版本、目标版本、发行说明、下载进度、错误重试与重启安装状态，并继续在安装前安全停止内置 DSH 运行时。
- 修复 Windows 升级时偶发的“应用仍在运行”或文件占用提示。桌面端退出时会结束完整 DSH 进程树；安装器还会在覆盖旧版本前，仅清理旧安装目录主程序和 `resources` 内的残留进程。
- 扩展坞现在展示每个插件的实际版本与适配状态，只在打开扩展坞时检查社区插件更新。兼容版本可一键升级，已知不兼容版本会说明原因并拦截，未声明适配的版本需用户明确确认。
- 社区插件升级会先在后台预取包，再短暂停止 DSH 完成离线精确版本切换；安装校验或重启失败时自动恢复旧清单、锁文件和运行时。内置插件继续只随经过验证的 Desktop 版本更新。
- 桌面 profile 复用运行包解析结果并并行检查独立链接；同机基准中，未变化配置的中位耗时由约 54.9 ms 降至 13.2 ms，新配置由约 64.9 ms 降至 22.3 ms。

### 验证

- 桌面测试覆盖后台自动下载、进度状态、下载完成后的显式安装、手动检查及更新错误。
- IPC 测试验证更新状态只向渲染层暴露版本、说明、进度和错误等安全字段。
- 剪贴板权限测试覆盖本地运行时源校验、端口隔离以及其他权限的默认拒绝行为。
- 启动页使用 1440×900 桌面窗口完成视觉回归，验证粒子鲸鱼、毛玻璃进度条和紧凑布局。
- 安装器测试验证清理逻辑按旧安装路径限定范围，不会按通用进程名结束其他软件；运行时测试验证 Windows 使用 `taskkill /T /F` 回收完整子进程树。
- 插件回归覆盖三态 semver 适配、固定 npm 源、四路并发限制、精确离线安装、启动隔离和失败回滚；可复现 profile 基准不访问网络。

### 下载与校验

下载 `DeepSeek-Harness-Desktop-Setup-0.1.9-x64.exe`，并使用同一 GitHub Release 中的 `SHA256SUMS.txt` 校验安装包。应用发现新版后会自动后台下载，但只有用户点击“重启并安装”后才会退出并安装。

### 说明

这是社区构建版本，并非 DeepSeek、OpenAI 或腾讯官方发行版。当前安装包未使用商业代码签名证书，Windows SmartScreen 可能显示“未知发布者”。请只从本项目的 GitHub Release 页面下载并核对 SHA-256。

## English

### Highlights

- Fixes inactive copy buttons for message bubbles, complete responses, and code blocks in the desktop app. Only sanitized clipboard writes from the active local DSH origin are allowed; clipboard reads and other sensitive permissions remain denied.
- Starts downloading a discovered desktop release in the background instead of interrupting the conversation with a pre-download system prompt. A new blue-black glass panel appears after the download and lets the user restart and install or defer it.
- Routes the sidebar update trigger to DeepSeek Harness Desktop when hosted by Electron instead of updating the Web UI plugin. Browser-only deployments retain the existing plugin updater.
- Simplifies startup to “探索未至之境”, one status line, and one progress meter. The previous sphere, orbits, and phase list are replaced with an original locally rendered blue-black particle whale.
- Runs the particle whale only on the startup document and releases it when navigation enters the DSH surface. Reduced-motion systems receive a static rendering.
- Unifies current version, target version, release notes, download progress, retry, and restart-install states in the desktop update surface while preserving the safe runtime shutdown before installation.
- Fixes intermittent “application is still running” and file-in-use errors during Windows upgrades. Desktop shutdown now terminates the complete DSH process tree, while installer preflight removes only stale processes whose executables belong to the previous app installation.
- Extension Dock now shows actual plugin versions and compatibility states and checks community updates only when opened. Compatible releases can update directly, known-incompatible releases are blocked with an explanation, and undeclared compatibility requires explicit confirmation.
- Community updates prefetch packages while DSH is available, then perform an exact offline switch during brief downtime. Failed validation or restart restores the old manifest, lockfile, and runtime. Built-ins continue to update only with a tested Desktop release.
- Desktop profile preparation now reuses runtime resolution and checks independent links concurrently. On the reference machine, median unchanged-profile time fell from about 54.9 ms to 13.2 ms and fresh-profile time from about 64.9 ms to 22.3 ms.

### Verification

- Desktop tests cover automatic background download, progress state, explicit installation after download, manual checks, and update errors.
- IPC tests ensure that renderer update state contains only safe version, notes, progress, and error fields.
- Clipboard permission tests cover active loopback-origin matching, port isolation, and deny-by-default behavior for every other permission.
- The startup page was visually checked at 1440×900 for the particle whale, glass progress surface, and compact layout.
- Installer tests verify that stale-process cleanup is restricted to the previous installation paths rather than generic process names; runtime tests verify complete Windows child-tree termination with `taskkill /T /F`.
- Plugin regression covers three-state semver assessment, the fixed npm origin, four-request concurrency, exact offline installation, startup quarantine, and failed-update rollback; the reproducible profile benchmark performs no network access.

### Download and verification

Download `DeepSeek-Harness-Desktop-Setup-0.1.9-x64.exe` and verify it with `SHA256SUMS.txt` from the same GitHub Release. The app downloads discovered releases in the background, but exits and installs only after the user chooses “Restart and install”.

### Notice

This is a community build and not an official DeepSeek, OpenAI, or Tencent distribution. The installer is not signed with a commercial code-signing certificate, so Windows SmartScreen may report an unknown publisher. Download only from this project's GitHub Release page and verify the SHA-256 checksum.
