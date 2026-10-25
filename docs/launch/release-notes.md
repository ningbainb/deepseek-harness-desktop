# DeepSeek Harness Desktop 5.1.0

## 中文

这是 DeepSeek Harness Desktop 5.1.0 版本更新说明。Windows x64、macOS arm64 与 Linux x64 的三端发布及可下载状态，以[本版 Release](https://github.com/ningbainb/deepseek-harness-desktop/releases/tag/desktop-v5.1.0)、[同版标签工作流](https://github.com/ningbainb/deepseek-harness-desktop/actions/workflows/desktop-three-platform-release.yml?query=branch%3Adesktop-v5.1.0)及同 Release 的[资产校验清单](https://github.com/ningbainb/deepseek-harness-desktop/releases/download/desktop-v5.1.0/release-manifest.json)为准；这些核对链接本身不表示发布已完成。

### 本次亮点

5.1.0 使用官方 NPM Runtime/SDK `0.2.1-rc.2` 和 Electron `44.0.0`，通过 Desktop 适配与插件机制集成，不修改官方源码。重点是慢消费者下的完整流式输出、异步资源读取、安装恢复、技能市场的明确授权，以及更简洁的设置界面。macOS Preview 仅面向 Apple Silicon arm64、macOS 13 Ventura 及以上；Electron 44 已移除 macOS 12 支持，详见[安装边界](../macos-preview.zh.md)。

- **流式背压**：按消费者实际读取确认推进发送，常规每流窗口为 64 帧、1 MiB 序列化数据；暂停后恢复保持顺序和完整内容，保留取消、导航与窗口销毁清理。允许一个超大历史项及最多一个预读项，不是全进程内存硬上限，也不截断历史或工具结果。
- **异步资源与 HMR**：前端资源异步读取并合并同时到达的同文件读取，保留逐请求授权、SPA 回退、HEAD、缓存及 Windows 路径保护。热更新在依赖图刷新后及时重扫剩余变更，保留世代失效、并发四与非重叠扫描，不宣称消除磁盘扫描成本。
- **安装目录与恢复**：逐项验证安装目录候选，失效安装键不遮蔽有效卸载注册路径，显式 `/D` 优先。注册表变更失败逐项恢复，保留备份、不覆盖外来替换项；安装器 include 顺序兼容真实 NSIS 严格编译。
- **技能市场先确认**：保留本地 Skill Center、导入和目录入口；首次启用市场前说明本地进程、hooks 与已有 Agent 声明的执行风险，取消不修改配置。沿用明确保存的启停选择，反馈、翻译、自动更新和项目布局扫描默认关闭，需用户主动选择；翻译可能发送文档并产生模型费用，反馈可能创建公开 GitHub Issue。确认不是沙箱。
- **来源事务恢复**：市场受管来源替换先获取、校验和暂存，再提交来源与状态；失败保留可恢复副本，保护本地及接管来源，不把界面请求超时误报为后台操作取消。
- **简洁设置 UI**：去除拓展坞侧栏竖线、区域隔板、章节套框和重复装饰，用留白、字重与对齐组织内容，折叠解释性文字。保留全部 15 个导航、搜索、设置控件、高级详情、关键风险提示、选中态、键盘焦点和窄窗操作。
- **只移除独立设置页宠物**：拓展坞/独立设置窗口不挂载浮动宠物或预留宠物栏；主会话宠物、其配置入口和既有配置保持可用。官方主聊天、历史会话、模型接入、bai 授权、第三方 API、Skills、插件、托盘与 15 套皮肤继续保留。

### 验证

历史预检记录：2026-10-25，[工作流 40181531589](https://github.com/ningbainb/deepseek-harness-desktop/actions/runs/40181531589)在提交 [`57998820b1063c818e9fdd3a3daf2700319b8de4`](https://github.com/ningbainb/deepseek-harness-desktop/commit/57998820b1063c818e9fdd3a3daf2700319b8de4)观察到 Windows 源码核心回归 28/28、桌面单测 1901/1901 通过，单测无失败或跳过。一次性 Windows Runner 的真实 Setup 验证新装、4.3.0/5.0.0/5.0.1 分别升级至 5.1.0、同版覆盖、安装后启动与重启、卸载及用户数据保全；升级前旧 provider/会话快照同时核对安装阶段字节保全与重启后运行时数据保全，receipt 与截图随该次工作流保存。

该次 Windows 完整打包回归为 41/44，模型偏好、空 Agent 会话及 Skin Center 验收的三项失败进入修正与复验，原始 41/44 记录不改写为通过。同一运行的 macOS arm64 与 Linux x64（Ubuntu 22.04 原生 Runner）预检 job 成功，但 Windows job 失败、发布 job 跳过，因此该次运行没有形成三端全绿或正式发布通过结论；后续结果须按同版、同提交的实际工作流核对。

2026-10-23 本地未签名 Windows x64 内测包记录使用实际 Setup 提取载荷，最终核心回归 28/28、流式相关测试 99/99、设置测试 314/314 通过；桌面全量单测 1884 项，其中 1882 通过、0 失败、2 项既有跳过。包完整性与真实 Electron 原生 Sharp 加载通过；原生 UI 覆盖七页、全部导航、深浅色、窄窗命中/焦点、保存重开、独立设置无宠物及主会话宠物保全。这些本地内测记录与上述云端预检分别留存，不替代最终发布标签的三端验收结果。

本地流式模拟样本保留完整中文和代码，P95 帧间隔为 8.5ms，5.0.1 对照也是 8.5ms；不据此宣传普遍性能百分比或冷启动加速。原始 NSIS 编译失败及重 I/O 夹具超时记录保留，修复/独立复测另记；首轮核心回归 27/28 的外部 Git 超时不改写，随后独立重试及完整重跑 28/28 单列。

2026-10-23 本地内测未执行干净账号或虚拟机的真实 Setup 新装、覆盖、卸载或中断回滚；其后的云端真实 Setup 验证见上述独立记录，不倒填为本地内测结果。隔离安装夹具不替代真实机器的 HKLM 权限差异或断电恢复，本地 Windows 记录也不提供 macOS/Linux 原生证据。技能市场原生确认响应在 Electron 边界模拟，不等于物理对话框按钮验收；模拟模型不等于真实付费授权、充值或所有供应商验收。社区质量清单中未认证或未记录的结果不提升为通过。

网站候选深浅色截图来自同一本地 Windows 内测包的原生窗口采集，不使用独立 WebContents 合成诊断图；[来源与截图哈希](../../website/assets/desktop-5.1.0-candidate-sources.json)仅校验截图，不是安装包校验和，也不证明 macOS/Linux 或云端发布。

### 下载与校验

下载时以[本版 Release](https://github.com/ningbainb/deepseek-harness-desktop/releases/tag/desktop-v5.1.0)实际公开的 Windows x64 EXE、macOS arm64 DMG/ZIP、Linux x64 AppImage/DEB 为准，核对同 Release 的 [SHA256SUMS.txt](https://github.com/ningbainb/deepseek-harness-desktop/releases/download/desktop-v5.1.0/SHA256SUMS.txt) 和 [release-manifest.json](https://github.com/ningbainb/deepseek-harness-desktop/releases/download/desktop-v5.1.0/release-manifest.json)，并按[三端发布流程](desktop-release-workflow.md)核对工作流的版本、标签与精确提交。历史预检不代替发布标签验收，链接或预计文件名不等于资产已公开；不复用本地内测或 5.0.1 的哈希，不预填正式资产大小、哈希或发布日期。

### 说明

这是社区维护的开源桌面端，不是 DeepSeek 官方客户端。本版采用三端未签名发布方式，macOS 未公证，macOS/Linux 保持 Preview；以实际资产签名记录为准。升级前备份重要会话与配置。已安装同号 5.1.0 本地内测包的用户，应在正式资产可用后手动下载正式包覆盖安装，不承诺同号自动更新。正式构建保留匿名产品统计及退出机制，不采集对话、代码、路径、截图、模型密钥或账号凭据；诊断仅主动确认后本地导出，开发与测试不发送生产事件。官网部署须等正式 Release 与下载核验完成。

## English

These are the version update notes for DeepSeek Harness Desktop 5.1.0. Publication and download availability for Windows x64, macOS arm64 and Linux x64 are determined by [this version's Release](https://github.com/ningbainb/deepseek-harness-desktop/releases/tag/desktop-v5.1.0), the [matching tag workflow](https://github.com/ningbainb/deepseek-harness-desktop/actions/workflows/desktop-three-platform-release.yml?query=branch%3Adesktop-v5.1.0) and its [asset verification manifest](https://github.com/ningbainb/deepseek-harness-desktop/releases/download/desktop-v5.1.0/release-manifest.json). These verification links do not themselves establish completed publication.

### Highlights

5.1.0 uses official NPM Runtime/SDK `0.2.1-rc.2` and Electron `44.0.0`, integrated through Desktop adapters and plugins without modifying official sources. It focuses on complete output under slow consumption, asynchronous resource reads, installation recovery, informed market activation and clearer settings. macOS Preview targets Apple Silicon arm64 on macOS 13 Ventura or later; Electron 44 removes macOS 12 support. See the [installation boundary](../macos-preview.md).

- **Streaming backpressure**: consumer-read acknowledgements advance transmission within a normal per-stream window of 64 frames and 1 MiB of serialized data. Pause/resume retains order and complete content, with cancellation, navigation and window-destruction cleanup. One oversized history item and at most one lookahead item are allowed; this is not a process-wide memory cap and does not truncate history or tool output.
- **Async resources and HMR**: asynchronous frontend reads coalesce concurrent reads of the same file, retaining per-request authorization, SPA fallback, HEAD, caching and Windows path protection. HMR promptly rescans remaining changes after graph refresh, retaining generation invalidation, concurrency four and non-overlapping scans, not eliminating disk-stat costs.
- **Installation and recovery**: installation candidates are validated individually so stale install keys do not mask valid uninstall paths; explicit `/D` wins. Failed registry changes are restored individually with backups and foreign-replacement protection. Installer include ordering supports actual strict NSIS compilation.
- **Confirm market activation first**: local Skill Center, import and directory entries remain. First activation explains local-process, hook and existing Agent-declaration risks; cancellation does not change configuration. Explicit saved enable/disable choices survive. Feedback, translation, automatic updates and project-layout scanning default off and require user choice; translation may send documents and incur model charges, while feedback may create a public GitHub Issue. Confirmation is not a sandbox.
- **Source transactions and recovery**: managed market-source replacements are acquired, validated and staged before source/state commit. Failures retain recoverable copies and protect local/adopted sources; a UI request timeout is not reported as cancellation of an ongoing host operation.
- **Simpler settings**: whitespace, weight and alignment replace Dock sidebar rules, dividers, nested section frames and repeated decoration; explanatory prose folds away. All 15 destinations, search, settings controls, advanced details, critical risk notices, selection, keyboard focus and narrow-window operation remain.
- **Pet exclusion only in dedicated settings**: Dock/settings windows mount neither the floating pet nor its reserved rail. The main conversation pet, its configuration entries and saved settings remain available. Official main chat, history, model access, bai authorization, independent APIs, Skills, plugins, tray behavior and all 15 skins remain.

### Verification

Historical preflight record: on 2026-10-25, [workflow 40181531589](https://github.com/ningbainb/deepseek-harness-desktop/actions/runs/40181531589) at commit [`57998820b1063c818e9fdd3a3daf2700319b8de4`](https://github.com/ningbainb/deepseek-harness-desktop/commit/57998820b1063c818e9fdd3a3daf2700319b8de4) recorded Windows source core regression 28/28 and Desktop unit tests 1901/1901 passing, with no unit-test failures or skips. Real Setup acceptance on a disposable Windows Runner verified fresh installation, separate 4.3.0/5.0.0/5.0.1-to-5.1.0 upgrades, same-version overlay, installed startup/restart, uninstall and user-data preservation. Pre-upgrade provider/session snapshots checked both installation-time byte preservation and runtime data preservation after relaunch; receipts and screenshots were retained with that run.

That Windows full packaged regression finished 41/44. Its model-preference, empty Agent-session and Skin Center acceptance failures entered correction and revalidation; the original 41/44 record is not rewritten as passing. The same run's native macOS arm64 and Linux x64 (Ubuntu 22.04 Runner) preflight jobs succeeded, but the Windows job failed and publication was skipped. That run therefore did not establish an all-green three-platform result or formal release acceptance. Subsequent results must be checked against the actual workflow for the same version and commit.

The 2026-10-23 local unsigned Windows x64 beta record exercised the actual Setup-extracted payload: final core regression 28/28, stream-related tests 99/99 and settings tests 314/314 passed. Desktop unit tests totalled 1884: 1882 passed, zero failed and two existing skips. Package integrity and real Electron native Sharp loading passed. Native UI covered seven pages, all navigation, light/dark, narrow hit/focus, save/reopen, pet-free dedicated settings and main-pet preservation. These local beta records remain separate from the cloud preflight above and do not substitute for final release-tag acceptance on all three platforms.

A simulated stream retained complete Chinese text and code with an 8.5ms P95 frame interval; the 5.0.1 control also measured 8.5ms. This establishes neither a general percentage improvement nor faster cold startup. Original NSIS compilation failures and heavy-I/O fixture timeouts remain recorded, with fixes and isolated reruns reported separately. The initial 27/28 core run's external Git timeout is not rewritten; its isolated retry and subsequent full 28/28 run are separate results.

The 2026-10-23 local beta did not exercise real Setup fresh installation, overlay, uninstall or interrupted rollback on a clean account/VM. The later cloud real-Setup checks are recorded separately above, not retroactively attributed to the local beta. Isolated installer fixtures do not establish real-machine HKLM permission differences or power-loss recovery, and local Windows records do not establish native macOS/Linux evidence. Market consent responses were simulated at the Electron boundary, not accepted through physical dialog buttons. Simulated models do not establish paid authorization, top-ups or every provider's behavior. Unauthenticated or unrecorded community-quality results are not promoted to passes.

Candidate light/dark website images are native-window captures of that local Windows beta, not independently composed WebContents diagnostic images. Their [provenance and image hashes](../../website/assets/desktop-5.1.0-candidate-sources.json) verify screenshots only, not installers, macOS/Linux acceptance or cloud publication.

### Download and verification

Use the Windows x64 EXE, macOS arm64 DMG/ZIP and Linux x64 AppImage/DEB actually made public in [this version's Release](https://github.com/ningbainb/deepseek-harness-desktop/releases/tag/desktop-v5.1.0). Verify its [SHA256SUMS.txt](https://github.com/ningbainb/deepseek-harness-desktop/releases/download/desktop-v5.1.0/SHA256SUMS.txt) and [release-manifest.json](https://github.com/ningbainb/deepseek-harness-desktop/releases/download/desktop-v5.1.0/release-manifest.json), and check the workflow's version, tag and exact commit against the [three-platform release procedure](desktop-release-workflow.md). Historical preflight does not substitute for release-tag acceptance; links or anticipated filenames do not establish public assets. Do not reuse local-beta or 5.0.1 hashes or prefill formal asset sizes, hashes or publication dates.

### Notice

This is a community-maintained open-source application, not an official DeepSeek client. This version's distribution policy is unsigned packages on all platforms, unnotarized macOS, and macOS/Linux Preview status; actual asset receipts determine signature state. Back up important conversations and configuration before upgrading. Users of a local beta already numbered 5.1.0 should manually download and overlay-install the formal package once its assets are available; same-version automatic updates are not promised. Official builds retain anonymous opt-out product metrics, excluding conversations, code, paths, screenshots, model keys and account credentials. Diagnostics are locally exported only after explicit consent; development/tests do not send production events. Website deployment follows actual Release and download verification.
