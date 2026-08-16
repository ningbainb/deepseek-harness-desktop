# Changelog

## Unreleased

中文：

- 扩展坞新增插件实际版本、三态兼容性和社区更新检查；内置插件随 Desktop 更新，已知不兼容版本会被拦截，未知适配需明确确认。
- 社区插件升级改为运行中预取、离线精确切换和启动失败自动回滚；启动时只做本地兼容隔离，不访问注册表。
- 缓存运行包解析并并行检查 profile 链接，同机未变化配置中位耗时从约 54.9 ms 降至 13.2 ms。
- 将内置 dsh-web-ui 插件套件同步到 0.1.15，新增图像描述、量身 Agent、Harbor 与 QQ2006 皮肤，并吸收各插件的性能、设置和稳定性改进。
- 将腾讯 QQ Bot 升级到 0.3.0、扩展坞升级到 0.1.1、插件市场升级到 1.3.0；市场重启仍由 Electron 桌面宿主统一管理。
- 补齐 Windows 兼容：SFTP 路径规范化、更新超时测试、POSIX 权限测试隔离、共享路径测试和生成器路径识别。

English:

- Added actual plugin versions, three-state compatibility, and community update checks to Extension Dock; built-ins follow Desktop releases, known-incompatible candidates are blocked, and unknown compatibility requires confirmation.
- Changed community upgrades to online prefetch, exact offline switching, and automatic rollback after a failed start; launch performs only local compatibility quarantine and no registry access.
- Cached runtime package resolution and parallelized profile-link checks, reducing median unchanged-profile preparation on the reference machine from about 54.9 ms to 13.2 ms.
- Synced the bundled dsh-web-ui plugin suite to 0.1.15, adding Describe Image, the Liangshen agent, Harbor, and QQ2006 while incorporating the suite's performance, settings, and reliability improvements.
- Upgraded Tencent QQ Bot to 0.3.0, Extension Dock to 0.1.1, and the plugin market to 1.3.0; Electron remains the sole runtime-restart supervisor.
- Completed Windows adaptation for SFTP path normalization, update-timeout tests, POSIX permission-test isolation, shared path tests, and generator path detection.

## 0.1.7 - 2026-08-15

中文：

- 全新设计深海探索启动界面，以状态驱动的真实进度、三阶段启动提示、完整恢复操作、减少动态效果适配和无障碍进度语义替代旧启动页。
- 将顶部窗口栏压缩为 32 像素的 macOS 风格磨砂玻璃材质，只保留真实软件图标，同时继续使用原生 Windows 窗口按钮并安全避让全屏弹窗。
- 大文件预览改为有界读取和流式原始响应，标签页内容加入内存预算；相同仓库的 Git 状态轮询合并执行，慢请求不再重叠堆积。
- SSH 输出改为按真实字节限额并安全处理跨块 UTF-8，目录上传移除同步遍历；首次冷启动容忍时间提升至 120 秒，安装版验收失败会输出最近运行日志。
- 扩大 Windows CI 与发布门禁，统一 Node 版本边界、全量测试、生成文件检查、官网回退版本校验和安装载荷裁剪验证。

English:

- Replaced the old launch screen with a deep-ocean discovery experience driven by real runtime state, three visible phases, complete recovery actions, reduced-motion handling, and accessible progress semantics.
- Refined the top chrome into a 32-pixel macOS-inspired frosted-glass surface with only the real app icon, while retaining native Windows caption controls and modal safe-area behavior.
- Bounded large-file preview reads, streamed raw responses, and added a tab-content memory budget; Git status polling is shared per repository and slow polls can no longer overlap.
- Made SSH output limits byte-accurate across split UTF-8 chunks and removed synchronous upload traversal; expanded first-run startup tolerance to 120 seconds and added recent runtime logs to packaged E2E failures.
- Strengthened Windows CI and release gates around supported Node versions, complete tests, generated assets, website fallback versions, and packaged-payload pruning.

## 0.1.6 - 2026-08-14

中文：

- 内置腾讯官方 QQ Bot 与扫码 Connector，在扩展坞提供二维码绑定、刷新、取消、重新绑定和解绑。
- 未绑定时保持插件禁用，扫码成功后自动启用并重启 DSH；AppSecret 通过 Windows 凭据保护加密，只注入子进程。

English:

- Bundled Tencent's official QQ Bot and QR Connector with in-dock QR binding, refresh, cancellation, rebinding, and unbinding.
- Kept the plugin disabled until binding succeeds, then enabled it and restarted DSH automatically; AppSecret is protected by Windows credential encryption and supplied only to the child process.

## 0.1.5 - 2026-08-14

中文：

- 窗口标题栏现在跟随 DSH 的亮色/暗色主题，并让原生 Windows 窗口按钮同步使用匹配的前景与背景色。
- 修复设置等全屏弹窗被自定义标题栏遮住上边界的问题，弹窗统一使用标题栏下方的安全可视区域。
- 修复打包版皮肤中心扫描源码路径和写错配置层的问题；现在从 `~/.dsh/profiles/desktop/node_modules` 发现皮肤，并更新桌面 profile 的 `cordis.patch.yml`。
- 将 `dshmarket` 1.0.3 与 `dsh-plugin-hub` 0.1.0 作为内置桌面插件，并让市场安装目标指向 `desktop` profile。

English:

- Made the custom title bar follow the DSH light/dark theme, including matching native Windows caption colors.
- Kept full-screen dialogs below the custom title bar so their top border and rounded corners are no longer clipped.
- Fixed packaged Skin Center discovery and configuration: skins are read from the desktop profile and switches update that profile's patch file.
- Bundled `dshmarket` 1.0.3 and `dsh-plugin-hub` 0.1.0, with marketplace installs targeting the desktop profile.

## 0.1.4 - 2026-08-14

中文：

- 修复桌宠客户端挂载在已失效会话插槽、导致主页看不到鲸鱼娘的问题，改为使用全局 Shell Overlay。
- 修复 DSH rc.6 设置接口过滤自定义命名空间的问题，Web UI 插件分组现在会显示移动端远程控制、皮肤中心、实时令牌估算、任务看板和宠物五个配置项。
- 重新生成并构建皮肤中心清单，完整展示随桌面版安装的 9 套可选皮肤，并增加运行时、资源与打包回归检查。

English:

- Fixed the whale-girl desktop pet disappearing because its client was attached to a conversation slot no longer rendered by the rc.6 shell; it now uses the root shell overlay.
- Exposed the five bundled Web UI settings namespaces through the rc.6 Host API allowlist, restoring the Remote, Skin Center, Live Stats, Task Board, and Pet cards.
- Regenerated the Skin Center bundle so all nine installed skins are listed, and added runtime, asset, and packaged-payload regression coverage.

## 0.1.3 - 2026-08-14

中文：

- 在所有运行时窗口中明确应用萌化 DeepSeek 图标，Windows 任务栏不再回退到 Electron 默认图标。
- 新增稳定版 GitHub Release 检查、双语更新内容展示、用户确认下载、任务栏下载进度和用户确认重启安装。
- 新增手动检查更新入口，并在发行资产中加入后续自动更新所需的 `latest.yml`。

English:

- Applied the kawaii DeepSeek icon explicitly to every runtime window so the Windows taskbar no longer falls back to the Electron icon.
- Added stable GitHub Release checks, release-note display, user-confirmed downloads, taskbar download progress, and user-confirmed restart installation.
- Added a manual update command and shipped the GitHub `latest.yml` metadata required by future desktop releases.

## 0.1.2 - 2026-08-14

- Replaced the failing Windows native folder-dialog worker with the official DSH in-app directory browser.
- Reduced the Windows release payload by pruning published source, declarations, development material, and non-x64 native artifacts after packaging.
- Replaced the desktop and installer artwork with a cute anthropomorphic DeepSeek whale-girl icon.

## 0.1.1 - 2026-08-14

Natural Windows chrome refinement.

- Replaced the disconnected bright title and menu rows with a 46-pixel deep-sea title surface.
- Preserved native Windows caption buttons, resizing, keyboard menu access, and Snap layouts.
- Added context-aware labels for startup, the original Web surface, and the Extension Dock.
- Added page safe-area handling plus unit and real-runtime Electron verification.

## 0.1.0 - 2026-08-14

Initial Windows desktop release.

- Lossless Electron host for the official DSH Web application.
- Isolated, idempotent `desktop` profile with the complete dsh-web-ui aggregate.
- Managed runtime lifecycle, readiness probes, graceful shutdown, bounded restart, and recovery UI.
- Hardened preload, IPC, navigation, permissions, downloads, logs, and window-state persistence.
- Extension Dock for protected built-ins, transactional registry plugins, and safe skill discovery/import.
- 21 bundled UI plugins with 9 selectable skins, including Miku and Trading, plus the upstream compatibility layer.
- Hermetic DSH rc.6 runtime peer closure, verified from a clean short-path Windows installation.
- Windows x64 NSIS installer, reproducible verification script, and CI/release workflows.
