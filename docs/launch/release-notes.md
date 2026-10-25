# DeepSeek Harness Desktop 5.1.0

## 中文

这是 5.1.0 候选发布说明，不代表正式发布完成。维护者已授权三端未签名发布，仍须在同一候选提交完成 Windows x64、macOS arm64 和 Linux x64 原生门禁，再核对正式 Release 资产。当前公开可下载版本仍为 [5.0.1](https://github.com/ningbainb/deepseek-harness-desktop/releases/tag/desktop-v5.0.1)，其[发布说明](release-notes-5.0.1.md)与哈希不属于 5.1.0。

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

2026-10-23 本地未签名 Windows x64 内测包记录使用实际 Setup 提取载荷，最终核心回归 28/28、流式相关测试 99/99、设置测试 314/314 通过；桌面全量单测 1884 项，其中 1882 通过、0 失败、2 项既有跳过。包完整性与真实 Electron 原生 Sharp 加载通过；原生 UI 覆盖七页、全部导航、深浅色、窄窗命中/焦点、保存重开、独立设置无宠物及主会话宠物保全。这些是本地候选记录，不是尚待生成的正式发布提交或三端验收结果。

本地流式模拟样本保留完整中文和代码，P95 帧间隔为 8.5ms，5.0.1 对照也是 8.5ms；不据此宣传普遍性能百分比或冷启动加速。原始 NSIS 编译失败及重 I/O 夹具超时记录保留，修复/独立复测另记；首轮核心回归 27/28 的外部 Git 超时不改写，随后独立重试及完整重跑 28/28 单列。

本地记录未执行干净账号或虚拟机的真实 Setup 新装、覆盖、卸载或中断回滚；隔离安装夹具不替代真实 HKLM 权限或断电恢复。macOS/Linux 原生门禁尚待正式候选运行。技能市场原生确认响应在 Electron 边界模拟，不等于物理对话框按钮验收；模拟模型不等于真实付费授权、充值或所有供应商验收。社区质量清单中未认证或未记录的结果不提升为通过。

网站候选深浅色截图来自同一本地 Windows 内测包的原生窗口采集，不使用独立 WebContents 合成诊断图；[来源与截图哈希](../../website/assets/desktop-5.1.0-candidate-sources.json)仅校验截图，不是安装包校验和，也不证明 macOS/Linux 或云端发布。

### 下载与校验

按[三端发布流程](desktop-release-workflow.md)在同一精确提交完成非发布预检和标签运行。Windows Runner 须验证真实 Setup 新装、4.3.0/5.0.0/5.0.1 分别覆盖至 5.1.0、同版覆盖、重启及数据保全，并保留 receipt 与截图；macOS/Linux 须分别完成原生打包、完整性与启动冒烟。通过后再填正式工作流、提交、发布日期及同 Release 的 `SHA256SUMS.txt`、`release-manifest.json`，不得复用本地候选或 5.0.1 的哈希。

### 说明

这是社区维护的开源桌面端，不是 DeepSeek 官方客户端。计划三端未签名、macOS 未公证，macOS/Linux 保持 Preview；以最终资产签名记录为准。升级前备份重要会话与配置。正式构建保留匿名产品统计及退出机制，不采集对话、代码、路径、截图、模型密钥或账号凭据；诊断仅主动确认后本地导出，开发与测试不发送生产事件。官网部署须等正式 Release 与下载核验完成。

## English

These are candidate notes for 5.1.0, not confirmation of publication. The maintainer has authorized an unsigned three-platform release, subject to native Windows x64, macOS arm64 and Linux x64 gates on the same candidate commit and verification of the actual Release assets. The public download remains [5.0.1](https://github.com/ningbainb/deepseek-harness-desktop/releases/tag/desktop-v5.0.1); its [notes](release-notes-5.0.1.md) and hashes do not describe 5.1.0.

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

The 2026-10-23 local unsigned Windows x64 beta record exercised the actual Setup-extracted payload: final core regression 28/28, stream-related tests 99/99 and settings tests 314/314 passed. Desktop unit tests totalled 1884: 1882 passed, zero failed and two existing skips. Package integrity and real Electron native Sharp loading passed. Native UI covered seven pages, all navigation, light/dark, narrow hit/focus, save/reopen, pet-free dedicated settings and main-pet preservation. These are local candidate records, not results for the still-pending formal release commit or three-platform acceptance.

A simulated stream retained complete Chinese text and code with an 8.5ms P95 frame interval; the 5.0.1 control also measured 8.5ms. This establishes neither a general percentage improvement nor faster cold startup. Original NSIS compilation failures and heavy-I/O fixture timeouts remain recorded, with fixes and isolated reruns reported separately. The initial 27/28 core run's external Git timeout is not rewritten; its isolated retry and subsequent full 28/28 run are separate results.

The local record does not cover real Setup fresh installation, overlay, uninstall or interrupted rollback on a clean account/VM. Isolated installer fixtures do not establish real HKLM permissions or power-loss recovery. Native macOS/Linux gates await the formal candidate run. Market consent responses were simulated at the Electron boundary, not accepted through physical dialog buttons. Simulated models do not establish paid authorization, top-ups or every provider's behavior. Unauthenticated or unrecorded community-quality results are not promoted to passes.

Candidate light/dark website images are native-window captures of that local Windows beta, not independently composed WebContents diagnostic images. Their [provenance and image hashes](../../website/assets/desktop-5.1.0-candidate-sources.json) verify screenshots only, not installers, macOS/Linux acceptance or cloud publication.

### Download and verification

Follow the [three-platform release workflow](desktop-release-workflow.md) for non-publishing preflight and tag validation on the same exact commit. Windows Runner must verify real Setup fresh installation, separate 4.3.0/5.0.0/5.0.1-to-5.1.0 upgrades, same-version overlay, restart and data preservation, retaining receipts and screenshots. macOS/Linux each require native packaging, integrity checks and launch smoke. Only then record the formal workflow, commit, publication date and that Release's `SHA256SUMS.txt` and `release-manifest.json`; never reuse local-candidate or 5.0.1 hashes.

### Notice

This is a community-maintained open-source application, not an official DeepSeek client. The plan is unsigned packages on all platforms, unnotarized macOS, and macOS/Linux Preview status; actual asset receipts determine signature state. Back up important conversations and configuration before upgrading. Official builds retain anonymous opt-out product metrics, excluding conversations, code, paths, screenshots, model keys and account credentials. Diagnostics are locally exported only after explicit consent; development/tests do not send production events. Website deployment follows actual Release and download verification.
