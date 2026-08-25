# Changelog

## Unreleased

中文：暂无。

English: No changes yet.

## 3.0.9 - 2026-08-25

中文：

- 修复冷启动时工具与帮助菜单早于完整 Desktop IPC 注册出现，导致打包版内置终端入口偶发无响应的问题；菜单现在会在 IPC 就绪后再启用。
- 修复用户更新期间 QQ Bot 异步绑定/解绑任务可能在应用关停后重新启动本地 Runtime，进而触发后台未关闭或安装包文件被占用的问题。

English:

- Fixes a cold-start race where Tools and Help appeared before the complete Desktop IPC was registered, making the packaged built-in terminal entry intermittently unresponsive; the menus now enable only after IPC is ready.
- Fixes an update-shutdown race where an asynchronous QQ Bot bind/unbind task could restart the local Runtime after shutdown, causing the background-process-not-closed prompt or installer file locks.

## 3.0.8 - 2026-08-25

中文：

- 启动页现在公开显示检测、原样重试、自动修复、验证、回滚和同 Home 内置插件回退等阶段；用户能看到自动修复正在进行，而不是停在模糊的加载状态。
- 没有配置模型或没有可用 Key 时，修复能力会明确报告“无可用模型”，不会调用云端模型，也不会把用户引导到隐藏的远程路径；应用会继续走同 Home 内置插件回退。
- 增加请求侧 Tools capability 判断，自动区分原生工具调用、兼容补丁和无工具能力，避免把不被当前 Runtime 支持的 tools 请求发送给模型。
- 设置页恢复修复状态卡、重试和脱敏诊断入口；修复记录只保留有界状态、相对文件和注册检查，不持久化 Key、Token、Cookie、Prompt、完整 Session 或 Tool Result。
- 保持 DSH 0.1.1-rc.1 精确锁定，并将兼容补丁、运行时证据和社区插件质量报告重新生成为当前 Desktop 版本。

English:

- The startup surface now exposes detection, unchanged retry, automatic repair, verification, rollback, and same-Home built-ins fallback phases, so users can see repair progress instead of an ambiguous loading state.
- When no model or usable key is configured, repair reports that no model is available, does not invoke a cloud model, and does not send the user through a hidden remote path; the app continues to the same-Home built-ins fallback.
- Adds request-side Tools capability detection that distinguishes native tool calls, the compatibility patch, and no-tool operation, preventing unsupported tools requests from reaching the model.
- Restores the settings repair-status card, retry action, and redacted diagnostics entry. Durable repair records keep only bounded status, relative files, and registered checks; they never persist keys, tokens, cookies, prompts, full sessions, or tool results.
- Keeps DSH 0.1.1-rc.1 exactly pinned and regenerates the compatibility, runtime-evidence, and community-plugin-quality reports for the current Desktop version.
## 3.0.1 - 2026-08-22

中文：

- 冻结 Desktop Contract 1.x、browser-safe Desktop Client SDK 1.x、Runtime Provider 1.x、`.dshpreset` v1、Task/Run/Evidence、Deep Link、运行时矩阵与兼容补丁注册表的公开边界；为每项提供机器可读 Schema、加性字段兼容夹具与公开版本策略。未来未知 major 会给出升级指引，不会被猜测性读取或写回覆盖。
- Stable 启动只接受 `known-good` 或 `supported` 的精确 Runtime matrix 项，校验 provider、Desktop 范围、完整性、lockfile 证据与 patch registry；`candidate`、`blocked`、未知或旧诊断状态绝不会提升为 Stable。补丁项现在强制 owner、appliesTo、tests、removeWhen 和 lastVerified，并拒绝过期或无测试记录。
- 新增独立迁移助手：它只扫描并私有快照允许的 profile/lock/managed settings/Task/Desktop/Runtime 状态，按 safe、needs-confirmation、blocked 生成计划，以原子 journal 支持崩溃后继续或回滚，并保留有限、已验证的快照。2.3–2.7 代表性 fixture 覆盖旧任务、Contract、Preset、Provider、Worktree/Evidence、Scheduler 与插件 metadata。
- 更新系统支持 `stable` 与 `beta`；Stable 拒绝 prerelease，Beta 不会改写 Stable 元数据，切回 Stable 不自动降级更高 Beta。发布产物新增 SHA-256 `release-manifest.json`；未配置证书时正式社区版本可未签名，配置证书后自动强制 Authenticode signer/timestamp 验证，manifest 与正式发布说明记录实际状态。
- 诊断导出升级为用户选择位置、确认后生成的脱敏 JSON/ZIP：包含内容清单与每文件哈希，只保留有界版本、运行时、恢复、任务/调度数量和更新状态；集中删除凭据、路径、URL query、Prompt、完整 Session、Tool Result、项目内容与 SSH 私钥。遥测默认关闭，诊断不上传。
- Task/Evidence 读取改为允许列表正规化；未知未来 Task major 保留原文件并阻止写入，未知/敏感可选字段不再持久化。SDK 也在每次功能调用前检查 Contract capability 和安全 Deep Link ID。
- 扩展坞加入原生社区插件市场，直接读取 `awesome-dsh-plugin.com/plugins.json` 索引并提供本地搜索、分类、排序和分页，不再嵌入第三方市场页面或显示其沙箱边界栏。安装只把不透明目录 ID 交给主进程解析，经一次原生确认后复用完整权限的事务安装、Runtime 重启和失败回滚；旧 `dshmarket` 运行时依赖已退役。
- 新增独立嵌入式终端、受校验的 Managed Git 修复路径，以及不依赖主 Runtime 的恢复界面和隔离恢复会话；迁移完成标记缺失时可从已提交 journal 自愈，存在中断 journal 时仍严格保留恢复流程。
- 修复 Task Ledger v3 过长错误文本导致后续写入永久失败、损坏 v3 被过期 v2 静默覆盖、SSH 断线重试失效、连接替换泄漏并拆错隧道、取消请求误报成功和分块上传绕过大小限制等稳定性问题，并补齐回归测试。
- 修复 Windows 发布 Runner 上内置终端工作目录门禁依赖 xterm 可视区长路径文本而重复超时的问题；PowerShell 现在内部比较完整规范化路径并输出有界结果标记，仍严格验证真实 Shell cwd，同时提供明确的 mismatch 诊断。

English:

- Freezes the public Desktop Contract 1.x, browser-safe Desktop Client SDK 1.x, Runtime Provider 1.x, `.dshpreset` v1, Task/Run/Evidence, Deep Link, runtime-matrix, and compatibility-patch boundaries. Each has a machine-readable schema, additive-field fixtures, and a public versioning policy. A future unsupported major reports an upgrade path rather than being guessed or overwritten.
- Stable startup accepts only exact `known-good` or `supported` Runtime matrix entries and checks the provider, Desktop range, integrity, lockfile evidence, and patch registry. `candidate`, `blocked`, unknown, and legacy diagnostic states are never promoted to Stable. Patch records now require an owner, appliesTo, tests, removeWhen, and lastVerified, and stale or untested records fail the gate.
- Adds an independent migration assistant. It scans and privately snapshots only allowlisted profile, lock, managed-setting, Task, Desktop, and Runtime state; emits safe, needs-confirmation, or blocked plans; and uses an atomic journal for resume or rollback after interruption with bounded verified retention. Representative 2.3–2.7 fixtures cover legacy tasks, Contract, Preset, Provider, Worktree/Evidence, Scheduler, and plugin metadata.
- Updates now have `stable` and `beta` channels. Stable rejects prereleases, Beta cannot rewrite Stable metadata, and moving back to Stable never auto-downgrades a newer Beta. Release assets now have a SHA-256 `release-manifest.json`. An official community release may be unsigned without a certificate; configuring one automatically requires Authenticode signer/timestamp verification, and both the manifest and published notes record the actual state.
- Diagnostic export is now an explicitly confirmed JSON/ZIP written only to a user-selected location. It has a content manifest and per-file hashes while retaining only bounded version, runtime, recovery, task/scheduler-count, and update state. A central redactor removes credentials, paths, URL queries, prompts, full sessions, tool results, project content, and SSH private keys. Telemetry is off by default and diagnostics are never uploaded.
- Task/Evidence reads now use allowlisted normalization. An unknown future Task major preserves the original file and blocks writes; unknown or sensitive optional fields no longer persist. The SDK also checks Contract capabilities and safe Deep Link IDs before every feature call.
- Extension Dock now includes a native community plugin market backed directly by the `awesome-dsh-plugin.com/plugins.json` index, with local search, category filtering, sorting, and pagination. It no longer embeds the third-party market page or its sandbox boundary banner. Installation passes only an opaque catalog ID to the main process, then reuses the full-permission transactional installer, Runtime restart, and rollback after one native confirmation; the old `dshmarket` runtime dependency is retired.
- Added a standalone embedded terminal, a validated Managed Git repair path, and recovery surfaces and isolated recovery sessions that do not depend on the primary Runtime. A missing migration completion marker can self-heal from a committed journal, while an interrupted journal still preserves the strict recovery path.
- Fixed Task Ledger v3 write poisoning from oversized error text, stale v2 data replacing a damaged v3 ledger, ineffective SSH disconnect retries, connection replacement leaks and wrong-tunnel teardown, cancellation falsely reporting success, and chunked uploads bypassing the size limit, with regression coverage for each class.
- Fixed repeated Windows release-runner timeouts caused by matching a long terminal working-directory path in the visible xterm viewport. PowerShell now compares the full normalized path internally and emits a bounded result marker, preserving strict validation of the real shell cwd while reporting an explicit mismatch.

## 2.7.0 - 2026-08-20

中文：

- 修复旧版空对象、空列表或仅注释的全局/Profile 补丁文件造成的启动失败，以及状态订阅竞态或 IPC 异常让启动页停在 8% 的问题；Windows 11 上移除 PowerShell 5.1 `-WindowStyle Hidden` 与 Electron Node 模式的冲突，窗口继续由 `spawn` 的 `windowsHide` 隐藏。
- 内置 Runtime 升级到 `@deepseek-ai/dsh` `0.1.0-rc.7` release train；插件市场升级到 `dshmarket` `1.15.0`，Web UI 聚合升级到 `0.2.3`，Codex Connect 升级到兼容 rc.7 的 `0.1.0-alpha.4.11`，并恢复 `dsh-live-stats` `0.1.20`。
- 新增可持久化的关闭行为和系统托盘生命周期。默认仍为退出；只有用户选择“最小化到托盘并启用后台自动化”时，主窗口关闭后才保留 Runtime 与后台自动化，显式退出、更新和安全/崩溃路径仍会完整停止。
- Task Board 增加有租约、确定性运行键、时区、misfire/running 策略和恢复语义的 Host 持久调度器。用户启用后台自动化后，Desktop Runtime Provider 会以真实 DSH Session 执行并回写 Task Run；没有可用 Host adapter 时浏览器调度保持为回退。
- Extension Dock 识别 `dsh.compatibility` 的 Desktop、Runtime、Desktop API、能力、Surface 和运行时证据，并在每次清单变更/启动对账写入原子 `desktop-plugins.lock.json`；不兼容社区 bundle 会被阻止或停用，未声明项保持明确的人工确认路径。
- 当用户自行添加的插件、游离 loader、profile 配置或依赖链接损坏而无法被依赖树识别时，启动恢复会将这些非受管输入可逆隔离到私有快照并以 Desktop 基线重试；内置 Runtime 健康时不再永久卡在启动页，扩展中心可恢复原始配置。
- 启动页新增“导出诊断日志”，即使 Runtime 尚未就绪也能生成脱敏诊断包；工具调用对模型偶发包了一层 `arguments` 对象的有效 JSON 进行严格 schema 校验后仅展开一层，其他请求仍交由官方校验明确报错。
- 新增不导入 Electron/DSH 私有模块的 browser-safe `@linxin666/dsh-desktop-client` SDK，以及仅主窗口拥有的安全“外部打开工作区文件”能力。预览只提交工作区根和相对路径，Host 解析已注册工作区后才交给系统 Shell，绝不把可用绝对路径返回给 Renderer。
- 将 Candidate Lite 扩展为 Candidate Matrix，并增加 Stable 支持矩阵、候选队列和离线社区插件质量报告；Candidate 仍不能自动改动 Stable 依赖、lockfile、更新元数据或发布。

English:

- Fixed startup failures caused by legacy empty-object, empty-list, or comment-only global/Profile patch files, and prevented status-subscription races or IPC errors from leaving the startup screen at 8%. On Windows 11, removed the PowerShell 5.1 `-WindowStyle Hidden` conflict with Electron Node mode while retaining spawn-level `windowsHide`.
- Upgraded the embedded Runtime to the `@deepseek-ai/dsh` `0.1.0-rc.7` release train, dshmarket to `1.15.0`, the Web UI aggregate to `0.2.3`, Codex Connect to rc.7-compatible `0.1.0-alpha.4.11`, and restored `dsh-live-stats` `0.1.20`.
- Added persisted close behavior and tray lifecycle. Quit remains the default; only an explicit **minimize to tray and enable background automation** choice keeps the Runtime and background automation alive after the main window closes. Explicit quit, update, safe-mode, and crash paths still stop cleanly.
- Added a Host durable scheduler for Task Board with leases, deterministic run keys, time zones, misfire/running policies, and recovery semantics. When background automation is enabled, the Desktop Runtime Provider executes real DSH Sessions and writes back Task Runs; browser scheduling remains the fallback without a usable Host adapter.
- Extension Dock now understands `dsh.compatibility` Desktop, Runtime, Desktop API, capability, Surface, and runtime-evidence requirements, and writes an atomic `desktop-plugins.lock.json` after each manifest mutation or startup reconciliation. Incompatible community bundles are blocked or disabled; undeclared metadata remains an explicit confirmation path.
- When user-added plugins, detached loaders, profile configuration, or dependency links are broken and cannot be identified from the dependency tree, startup recovery reversibly quarantines those unmanaged inputs in a private snapshot and retries from the Desktop baseline. A healthy embedded Runtime no longer remains permanently stranded on startup, and Extension Dock can restore the original configuration.
- The startup screen now offers **Export diagnostic log** even before Runtime readiness, producing a redacted diagnostic bundle. Tool calls that contain one accidental `arguments` envelope are unwrapped only after strict schema validation; every other request continues to receive the upstream validation error.
- Added the browser-safe `@linxin666/dsh-desktop-client` SDK, with no Electron or private DSH imports, and a main-window-only safe **open workspace file externally** capability. Preview submits only a workspace root plus relative path; the Host resolves a registered workspace before Shell receives it and never returns a usable absolute path to a renderer.
- Expanded Candidate Lite into Candidate Matrix with a Stable support matrix, candidate queue, and offline community-plugin quality report. Candidates still cannot automatically change Stable dependencies, lockfile, updater metadata, or a release.

## 2.6.0 - 2026-08-19

中文：

- Task Board v3 增加 Project、Task Run、派生 Evidence 与 Git Worktree 审核流；v2 账本复制迁移并保留备份，旧任务默认 shared-workspace。
- Git Graph Host 增加受控 Worktree 服务和 ID-only loopback 路由，限制 realpath、分支、冲突、操作中状态和丢弃确认；取消只取消 Session，不自动清理 Worktree。
- Runtime Provider 缺少 `workspace.register`、`session.create` 或 `session.observe` 时记录能力证据并显式回退现有 shared-workspace；Session CWD 不匹配时阻断。
- 增加有界 Evidence 面板、Commit/Merge/Keep/二次确认 Discard 审核、运行通知 Deep Link，以及真实临时 Git 仓库 Candidate 执行兼容夹具。
- 历史 2.6 正式版曾默认启用仅用于产品改进的有界匿名统计；该默认值已由 3.0.1 的“默认关闭、仅用户主动诊断导出”政策取代。

English:

- Task Board v3 adds Projects, compact Task Runs, derived Evidence, and explicit Git Worktree review. The v2 ledger is migrated copy-first with a preserved backup, and legacy tasks default to shared-workspace.
- Git Graph Host adds a controlled Worktree service and ID-only loopback routes with realpath, branch, conflict, in-progress, and discard-confirmation fences. Cancellation cancels only the Session and never removes a Worktree implicitly.
- When `workspace.register`, `session.create`, or `session.observe` is unavailable, the Runtime Provider records capability evidence and falls back explicitly to the existing shared-workspace executor; a Session CWD mismatch is blocked.
- Added a bounded Evidence panel, Commit/Merge/Keep/two-step Discard review, run deep-link notifications, and a real temporary Git repository Candidate execution fixture.
- Historical 2.6 release builds enabled bounded anonymous product metrics by default. That default is superseded in 3.0.1 by the off-by-default, user-initiated diagnostic-export policy.

## 2.5.0 - 2026-08-19

中文：

- 新增 DSH Runtime Provider Adapter v1、直接 import 边界、上游耦合审计、Known Good 证据、兼容补丁注册表和只生成报告的 Candidate Lite 工作流，稳定版继续精确锁定已验证 DSH，不追随 latest。
- PluginManager 支持多包精确预取和单快照离线事务，完整验证安装身份、SHA-512、bundle 与兼容性；任一包或 Runtime 健康检查失败都会恢复同一 manifest、lockfile 和旧 Runtime。
- Extension Dock 新增安全的 `.dshpreset` v1 导出、预览与确认导入，覆盖插件、允许设置、Skills 和任务模板；压缩包、路径、脚本、Secret、版本与完整性边界在主进程校验，并提供插件与可归属配置一并回滚的 Web Profile 到 Desktop Profile 选择性迁移。
- 插件变更后明确显示“刷新”和按需“Restart DeepSeek Harness”，Preset 导入展示准备、预取、停止、应用、启动、提交和回滚进度。
- `dsh://` 只接受扩展、更新、安全任务/会话 ID 与 Preset 预览路由；`.dshpreset` 文件关联只打开预览，不静默安装，也不把文件路径交给 Renderer。
- Desktop Contract 1.1 增加结构化通知实现：分类、ID、文本与 Deep Link 均受验证，并提供同 ID 去重、分类间隔、前台抑制和白名单点击路由。
- 彻底绕过覆盖更新中的已安装卸载器：安装器在无进程、无文件锁后原子迁移所有具有精确产品锚点的旧安装，并清除精确产品注册项；版本号和 v3 标记不再作为信任信号，因此旧版、带标记的 2.5.0 中间构建和目录已删但卸载项残留的情况都不会再次调用旧卸载器，用户数据保持不变。
- 更新窗口新增“前往 GitHub 下载”“加入用户群”“稍后更新”三条清晰路径；GitHub Releases 保持唯一默认下载源，下载较慢时可通过 QQ 用户群获取同步安装包，不默认宣传或启用第三方镜像。
- 设置窗口支持拖动、八方向边缘/角落缩放、最小尺寸、响应式内容滚动和跨重开位置/尺寸恢复，并在窗口尺寸与 DPI 变化时自动约束到可见区域。
- 新增独立 `dsh-particle-theme` 全页粒子主题，将粒子鲸鱼延伸到主界面；输入聚焦、对话框、减少动态效果和后台页面会自动降低或停止密度、透明度与速度，并提供开关和性能自适应扩展接口。

English:

- Added DSH Runtime Provider Adapter v1, a direct-import boundary, upstream coupling audit, Known Good evidence, compatibility patch registry, and report-only Candidate Lite workflow. Stable remains pinned to the verified DSH graph instead of following latest.
- PluginManager now prepares exact multi-package candidates and applies one-snapshot offline transactions with installed identity, SHA-512, bundle, and compatibility verification. Any package or Runtime health failure restores the same manifest, lockfile, and previous Runtime.
- Extension Dock adds secure `.dshpreset` v1 export, preview, and confirmed import for plugins, allowlisted settings, Skills, and task templates. Archive, path, script, Secret, version, and integrity boundaries stay in the main process, alongside selective Web-to-Desktop Profile migration that rolls attributable configuration back with packages.
- Extension mutations now present explicit Refresh and conditional Restart DeepSeek Harness actions. Preset imports expose preparation, prefetch, stop, apply, start, commit, and rollback progress.
- `dsh://` accepts only extensions, updates, safe task/session identifiers, and Preset preview. The `.dshpreset` association opens review only, never installs silently, and never gives the file path to a renderer.
- Desktop Contract 1.1 adds structured notifications with validated category, ID, text, and deep link plus ID deduplication, category intervals, foreground suppression, and allowlisted click routing.
- In-place updates now bypass every installed uninstaller. After process and file-lock checks, the installer atomically stages every root with the exact product anchors and removes only the exact product registry entries. Version numbers and the v3 marker are never trusted, so legacy builds, marker-bearing 2.5.0 intermediates, and stale uninstall registrations cannot invoke an old uninstaller again; user data remains unchanged.
- The update surface now offers clear **Download from GitHub**, **Join user group**, and **Update later** paths. GitHub Releases remains the only default download source; users with a slow route can obtain the synchronized installer from the QQ group, without built-in promotion or activation of third-party mirrors.
- The settings window now supports dragging, eight edge/corner resize handles, minimum dimensions, responsive scrolling, and persisted bounds across reopen. It clamps itself to the visible viewport when the app window or DPI changes.
- Added the independent `dsh-particle-theme` full-page particle theme, extending the particle whale into the main interface. Focused editing, dialogs, reduced-motion preference, and hidden pages automatically reduce or stop density, opacity, and speed, with a settings toggle and an adaptive extension seam.

## 2.4.0 - 2026-08-18

中文：

- SSH 已连接终端在主机、监控和终端视图之间切换时保持挂载与在线，返回后不再重新建立连接；终端补齐右键菜单与原生编辑菜单粘贴入口。
- 桌面壳固定接管侧边栏左下角下载按钮：它始终打开桌面软件更新，即使远程插件升级或重新渲染也不会切回插件全家桶更新；社区插件更新继续只在扩展坞中进行。
- Windows runtime、终端及 PowerShell 工具统一继承隐藏控制台，修复执行 `pwsh` 工具时额外命令窗口闪现的问题。
- 皮肤启用状态完全迁移到 `profiles/desktop` 私有补丁，并在桌面启动时反向迁移、清理旧版写入全局 `~/.dsh/cordis.patch.yml` 的托管段，避免破坏官方 `dsh web` 的 YAML 与 profile。
- 安装预检增加唯一产品主程序名兜底，可清理注册表路径漂移、旧安装目录移动或路径不可见时残留的 2.2 主进程，避免旧卸载器返回错误码 2；官方 Web runtime 与无关 PowerShell/Node 进程仍受保护。
- 桌面自有标题栏、启动页、更新面板、扩展坞与社区提示完善明暗主题变量和窗口行为，一次性社区提示的发布目标同步到 2.4.0。
- 覆盖更新引入令牌绑定的关闭回执协议 v2：桌面端仅在 runtime 停止、扩展操作暂停和资源释放完成后原子写入回执，安装器校验 token、旧 PID 与完成状态；旧版或超时场景继续使用受限清理降级。
- 主界面和扩展坞拆分 preload，并用 renderer surface 注册表校验每个敏感 IPC 的真实发送方；新增 Desktop Contract 1.0.0 能力快照与稳定错误码，主界面不再持有插件写操作、QQ Bot 凭据和技能导入接口。
- 任务看板增加 profile 隔离的 Host 文件存储 v2、原子写入、损坏文件保留、SSE 多标签同步和 localStorage v1 复制校验迁移；2.4.x 保留 v1，Host 不可用时自动回退，浏览器定时调度行为不变。
- Desktop CI 新增官方目录选择器真实 E2E，发布门禁继续覆盖全仓验证、安装包内容校验和打包运行烟测。

English:

- Connected SSH terminals now remain mounted and online while switching among host, monitor, and terminal views. Returning no longer creates a new connection, and terminal paste is available through both the context menu and native Edit menu.
- The Desktop shell now permanently owns the lower-left sidebar download trigger. It always opens the Desktop application updater, even after the remote plugin is upgraded or re-renders; community plugin updates remain confined to Extension Dock.
- Windows runtime, terminal, and PowerShell tool processes now inherit a hidden console host, preventing an extra command window from flashing when a `pwsh` tool runs.
- Skin enablement state is fully isolated in the private `profiles/desktop` patch. Desktop startup reverse-migrates and removes legacy managed sections from global `~/.dsh/cordis.patch.yml`, preserving valid YAML and the official `dsh web` profile.
- Installer preflight now falls back to the unique Desktop product executable name when registry paths drift, an old installation is moved, or its path is inaccessible. This closes 2.2 main-process remnants before the legacy uninstaller can return code 2 while preserving the official web runtime and unrelated PowerShell or Node processes.
- Desktop-owned title bars, startup and update surfaces, Extension Dock, and community prompt now have more complete light/dark theme variables and window behavior. The one-time community prompt is targeted to the 2.4.0 release.
- In-place updates now use token-bound shutdown receipt protocol v2. Desktop atomically publishes an acknowledgement only after the runtime stops, extension operations quiesce, and resources are released; the installer validates the token, old PID, and completion state while legacy or timed-out releases retain the constrained cleanup fallback.
- Main and Extension Dock use split preloads, and a renderer-surface registry validates the real sender of every sensitive IPC call. Desktop Contract 1.0.0 adds capability snapshots and stable error codes; Main no longer holds plugin mutation, QQ Bot credential, or skill-import bridges.
- Task Board now has profile-isolated Host-file schema v2, atomic writes, corrupt-file preservation, SSE cross-tab synchronization, and a verified copy-first localStorage v1 migration. Version 2.4.x retains v1 and falls back when Host storage is unavailable, while browser scheduling stays unchanged.
- Desktop CI now includes a real official directory-picker E2E check, while release gates retain full repository verification, packaged-payload checks, and packaged runtime smoke coverage.

## 2.3.0 - 2026-08-17

中文：

- 新增只在 2.3.0 首次主界面启动时出现一次的 GitHub Star 引导弹窗，采用更克制的分层淡入、缓慢星轨与一次性光晕动画，并遵循系统“减少动态效果”设置。
- Star 引导展示状态由 Electron 主进程原子持久化，页面刷新和后续启动不会重复打扰；除固定仓库入口外，新增“加入社群，随时反馈 Bug”选项，复用受控社群 IPC，不请求 GitHub API、不虚构 Star 数量或点星结果。
- 修复旧安装目录已不存在时，PowerShell 安装预检因强制解析目录失败并被误报为“仍有后台进程”的问题；缺失目录现在直接视为无需清理。
- 安装检查改为 electron-builder 的单一 `customCheckAppRunning` 入口，读取当前目录和 HKCU/HKLM 记录的旧安装目录，兼容 0.1.9 直接升级；直接进程按旧主程序或旧 `resources` 的真实路径识别，外部后代必须另有安装根路径引用才会归因，不再全局按进程名或仅凭父子关系追杀，并区分真实冲突与脚本异常。
- 修复旧版本（如 2.2）升级时安装器反复误报“仍有后台进程”：旧运行时由安装目录外的隐藏 PowerShell/CMD/Node 后代承载，仅按可执行路径清理会漏杀。安装预检新增按命令行中的安装路径归因清理这些外部后代；针对 2.2 的 `powershell -EncodedCommand` 宿主，先解码 Base64 负载再匹配安装路径；匹配集合同时保留安装器或注册表提供的 Windows 8.3 短路径引用与规范化长路径，避免短路径命令行漏判；进程句柄无权打开时（如旧程序以管理员身份运行）回退到 WMI 可执行路径归属，让残留进程被明确报告而不是让文件复制半途失败。力杀循环加入等待退出与退避重试。归因只认安装根路径引用：官方 Web 端运行时（命令行指向 npm 全局目录或 `~/.dsh`）、同名程序和无安装路径引用的外部进程都不会被误杀。
- 与官方 Web 端共存：桌面运行时固定使用独立 profile（`profiles/desktop`），端口状态保存在该 profile 私有文件中；首选端口被占用（含被官方 Web 端占用）时自动回退到系统分配端口，两端可同时运行且互不抢占。对共享主目录的写入（settings.yaml 重试策略、托管补丁段）均为增量、原子操作，不覆盖用户或官方端既有配置。

English:

- Added a dismissible GitHub Star prompt shown once when the 2.3.0 main surface first opens, with restrained staggered entry, slow orbit motion, a one-shot halo, keyboard accessibility, theme support, and reduced-motion handling.
- The Electron main process atomically persists prompt display state, preventing repeat interruptions after reloads or later launches. A new community action provides a controlled path for ongoing bug feedback alongside the fixed repository action, without GitHub API requests or invented star results.
- Fixed upgrade preflight falsely reporting background processes when the previous installation directory had already been removed and mandatory PowerShell path resolution failed. A missing directory is now a clean no-op.
- Replaced duplicate early and framework-default process checks with one `customCheckAppRunning` path that reads current plus HKCU/HKLM legacy install roots and supports direct upgrades from 0.1.9. Direct processes are identified by real paths under the old app or `resources` tree; external descendants require a separate install-root reference for attribution and are never killed merely by name or parentage. Real conflicts and script failures retain distinct diagnostics.
- Fixed the installer repeatedly reporting "background processes still running" when upgrading from older releases (e.g. 2.2): legacy runtimes are hosted by hidden PowerShell/CMD/Node descendants outside the install directory, which executable-path-only cleanup missed. Preflight now attributes external processes whose command line references an install root, decoding `powershell -EncodedCommand` Base64 payloads (the 2.2 runtime host) before matching. Matching preserves both Windows 8.3 short-path references supplied by the installer or registry and their canonical long-path forms, preventing short command lines from being missed. It also falls back to the WMI executable path when a process handle cannot be opened (e.g. an elevated old instance), so stragglers are reported instead of failing the file copy midway. The force-kill loop waits for exits and retries with backoff. Attribution only trusts install-root references: an official web runtime (its command line points at the npm global directory or `~/.dsh`), same-name apps, and external processes without any install-path reference are never killed.
- Coexistence with the official web client: the desktop runtime always uses its own profile (`profiles/desktop`) and keeps its port state in that profile-private file. When the preferred port is occupied (including by the official web client), it falls back to a system-assigned port, so both clients can run side by side without stealing ports from each other. Writes to the shared home directory (settings.yaml retry policies, managed patch sections) are incremental and atomic, never overwriting existing user or official-client configuration.

## 2.2.0 - 2026-08-17

中文：

- Windows 运行时改由隐藏 PowerShell 控制台承载，使终端、PowerShell、CMD 和第三方子进程继承隐藏窗口，不再因遗漏单个 `windowsHide` 而弹出命令框；进程树清理继续显式隐藏。
- 新增旧 profile 托管识别：包身份与随 2.2 提供的版本一致，或旧 profile 曾明确声明该依赖时，自动接管为 Desktop 托管链接；未知用户目录仍保留并拒绝覆盖。
- 升级安装器按真实可执行路径识别旧安装主程序及旧 `resources` 内的后台进程并自动结束，无需用户按进程名手工清理；新增真实 Windows 清理、隐藏运行时和 2.1→2.2 profile 升级回归。
- 旧应用根进程确认后继续沿父子关系清理社区插件启动的 CMD、PowerShell、Node 与 `prepare` 后代；运行时端口持久化并在可用时跨重启复用，被占用才回退到自动分配。
- 插件恢复只接受明确加载失败或导入栈指向社区插件的强证据；端口占用、宿主失败及普通日志中出现插件名不再触发自动隔离或安全模式。
- 首次启动会识别并撤销 2.1 因“运行时 120 秒未就绪”写入的未知故障安全模式，同时保留用户插件文件；用户主动安全模式会显示明确提示，并可在插件恢复页一键恢复全部插件和重启。

English:

- Hosted the Windows runtime inside a hidden PowerShell console so terminal, PowerShell, CMD, and third-party descendants inherit a hidden window even when an individual dependency omits `windowsHide`; process-tree cleanup remains explicitly hidden.
- Added legacy-profile ownership recognition: Desktop adopts an unrecorded package when its identity and bundled version match, or when the previous profile explicitly declared that dependency. Unknown user-owned directories remain protected.
- The upgrade installer now identifies the previous app and background executables under its `resources` tree by their real executable paths and stops them automatically, with real Windows cleanup, hidden-runtime, and 2.1-to-2.2 migration regressions.
- After verifying an old app root, cleanup follows parent-child relationships to include CMD, PowerShell, Node, and `prepare` descendants launched by community plugins. The runtime port is persisted and reused across restarts while available, falling back to automatic allocation only on a real conflict.
- Plugin recovery now requires an explicit load failure or an importer stack attributed to a community package. Port conflicts, host failures, and incidental plugin-name mentions no longer trigger automatic isolation or safe mode.
- First launch repairs 2.1 safe-mode state caused by an unattributed 120-second readiness timeout without deleting plugin files. User-requested safe mode remains explicit and now offers a visible notice plus one-click restore-and-restart.

## 2.1.0 - 2026-08-17

中文：

- 自动更新加入国内 GitHub Release 镜像测速与故障切换，版本元数据仍来自 GitHub，安装包继续按 `latest.yml` 的 SHA-512 校验。
- 新增插件三层容灾：变更前快照、故障插件一次性自动隔离、连续失败后的安全模式，以及不依赖 DSH 插件系统的独立恢复入口。
- 统一皮肤中心、插件市场和桌面宿主的持久化口径，修复依赖层主题切换、旧禁用状态迁移、Windows 写后校验和 bundle 接线互相覆盖的问题。
- 修复升级时旧进程未退出、安装器无法删除旧文件、隐藏 PowerShell 窗口打断操作，以及中文或非系统盘工作区失败后重复重启的问题。
- 工具菜单新增扩展坞入口；扩展操作全程串行化，市场安装和更新统一交给桌面 PluginManager，失败可恢复旧清单、锁文件和运行时。
- 补齐内置主题依赖并升级内置插件组合，收紧共享构建配置、SDK source map 过滤、运行时依赖和打包完整性门禁。
- 加强窗口状态、日志、下载目标、QQ Bot、导航、运行时停止与重启、可选集成加载等 Electron 副作用隔离，并加入打包启动性能测量。

English:

- Added measured mainland-China GitHub Release mirrors with automatic fallback while keeping GitHub metadata and `latest.yml` SHA-512 verification authoritative.
- Added three-layer plugin resilience: pre-mutation snapshots, one-shot culprit isolation, safe mode after repeated failures, and an independent recovery surface that does not depend on the DSH plugin runtime.
- Unified Skin Center, marketplace, and Desktop persistence semantics, fixing dependency-only theme activation, legacy disabled-state migration, Windows post-write verification, and competing bundle wiring.
- Fixed update installation when stale processes hold old files, hidden PowerShell windows stealing focus, and repeated restart loops after failures in Unicode or non-system-drive workspaces.
- Exposed Extension Dock from the Tools menu, serialized extension mutations end to end, and routed marketplace install and update operations through Desktop PluginManager with manifest, lockfile, and runtime rollback.
- Completed missing built-in theme dependencies and refreshed the bundled plugin set while tightening shared build configuration, SDK source-map filtering, runtime dependency checks, and package integrity gates.
- Isolated Electron side effects across window state, logs, download destinations, QQ Bot, navigation, runtime stop/restart, and optional integrations, with packaged-startup measurements added to release validation.

## 2.0.0 - 2026-08-16

中文：

- 修复取消当前任务后排队消息滞留，并将已知的对象字符串取消错误替换为明确提示；长思考内容的折叠标题会吸附在滚动区域顶部。
- 新增对话 Skills 技能库，支持搜索、最近使用、滚轮与键盘导航；为瞬态模型 API 故障增加最多四次的有界退避重试。
- 新增 Linux SSH 实时监控和经过校验、需要确认的进程终止与 systemd 服务重启操作，保留原有实时终端能力。
- 新增运行时完整性预检，安装不完整时直接提示修复而不进入崩溃重启循环；统一桌面自有界面与 Harness 原生视觉。
- 删除启动页蓝色装饰点，增强右侧粒子鲸鱼的游动、呼吸、转向和尾部动作，并适配减少动态效果与后台暂停。
- 扩展坞新增插件实际版本、三态兼容性和社区更新检查；内置插件随 Desktop 更新，已知不兼容版本会被拦截，未知适配需明确确认。
- 社区插件升级改为运行中预取、离线精确切换和启动失败自动回滚；启动时只做本地兼容隔离，不访问注册表。
- 缓存运行包解析并并行检查 profile 链接，同机未变化配置中位耗时从约 54.9 ms 降至 13.2 ms。
- 将内置 dsh-web-ui 插件套件同步到 0.1.15，新增图像描述、量身 Agent、Harbor 与 QQ2006 皮肤，并吸收各插件的性能、设置和稳定性改进。
- 将腾讯 QQ Bot 升级到 0.3.0、扩展坞升级到 0.1.1、插件市场升级到 1.3.0；市场重启仍由 Electron 桌面宿主统一管理。
- 补齐 Windows 兼容：SFTP 路径规范化、更新超时测试、POSIX 权限测试隔离、共享路径测试和生成器路径识别。

English:

- Restored queued messages after cancellation, replaced the known object-string cancellation error with a clear message, and made the reasoning disclosure control sticky inside the conversation scroll area.
- Added a searchable Skills library with recent items, wheel and keyboard navigation, plus up to four bounded backoff retries for transient model API failures.
- Added live Linux SSH monitoring and validated, confirmation-gated process termination and systemd restart actions while preserving the existing real-time terminal.
- Added packaged-runtime integrity preflight so incomplete installs show repair guidance instead of entering a crash/restart loop, and aligned Desktop-owned surfaces with the native Harness visual system.
- Removed the decorative startup dot, expanded the right-side particle whale's swimming, breathing, heading, and tail motion, and added reduced-motion and hidden-document behavior.
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
