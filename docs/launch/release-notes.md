# DeepSeek Harness Desktop 2.2.0

## 中文

### 本次亮点

- 彻底修复 Windows 运行终端时偶发弹出 CMD 或 PowerShell 窗口的问题。Desktop 现在通过隐藏的 Windows PowerShell 控制台承载 DSH 运行时，终端、工具命令和第三方插件启动的后代进程都会继承隐藏窗口。普通子进程与进程树清理仍显式使用 `windowsHide`，形成双层保护。
- 修复从 2.0/2.1 升级后旧插件或 `schemastery` 目录被所有权保护拦截、导致启动失败的问题。2.2 会检查包身份；当现有包与随 2.2 提供的版本一致，或旧 profile 曾明确声明该依赖时，自动转换为 Desktop 托管链接并补写所有权记录。
- 升级安装器会读取进程的真实可执行路径，自动识别并结束旧安装目录中的主程序以及旧 `resources` 树内的后台进程。识别不依赖容易误伤的进程名，也不会结束其他目录中的同名程序；正常覆盖更新无需用户再打开任务管理器手工结束后台。
- 对用户自行安装的社区插件，安装器会从已确认的旧 Desktop/运行时根进程继续追踪父子关系，将插件启动的 CMD、PowerShell、Node、pnpm `prepare` 等后代一并结束。只有仍属于这棵进程树的后台才会处理，用户独立打开的同名终端不会被误杀。
- Desktop 会把成功启动后的回环端口写入 profile；下次启动先检查该端口是否仍可绑定，可用就继续复用，真正被其他程序占用时才回退到系统自动分配并保存新端口。因此普通重启不再无故换端口，同时不会因强占端口导致启动失败。
- 插件故障恢复改用强归因：只有明确的插件加载失败，或异常导入/堆栈路径确实指向该社区包时，才允许自动隔离。端口占用、宿主异常、升级中断或普通日志里顺带出现插件名，都只记录诊断而不自动禁用插件或进入安全模式。
- 2.2 首次启动会自动撤销 2.1 因未知“运行时 120 秒未就绪”写入的安全模式，按原版本恢复被停用依赖且不删除插件目录。用户主动进入的安全模式不会被擅自退出；主窗口会明确提示，插件恢复页提供“恢复全部并重启”。
- 迁移不会放宽未知目录的安全保护。无法由包身份、版本或旧 profile 声明确认来源的目录，尤其是用户自行放入且版本冲突的内容，仍会原样保留并拒绝覆盖，避免为了恢复启动而误删用户控制的包。
- Windows 隐藏运行时使用编码后的 PowerShell 命令，无需 `shell: true`，支持安装路径中的空格、中文和单引号。运行时输出继续实时回传给启动检测和日志，退出码也会由隐藏宿主准确传递给 Desktop 的崩溃与恢复逻辑。

### 验证

- 新增真实 Windows 隐藏宿主集成测试，实际启动 Node 模式运行时并验证标准输出与非零退出码可以完整转发。
- 新增 2.1 形态 profile 的升级回归：版本一致的旧包以及由旧 profile 明确声明的旧版本都能自动迁移，无法确认归属的冲突版本仍会被保护且内容保持不变。
- 保留真实 Windows 安装器预检：验证旧主程序和旧资源后台会被自动结束，同时其他路径中的同名进程不参与清理。
- 扩展 Windows 预检回归，让旧资源进程启动一个位于系统目录的模拟插件后台，确认该后代能按父子关系自动结束。
- 新增端口状态读写、端口可用/占用选择、重启参数复用，以及端口错误日志不触发插件隔离的回归。
- 打包版三次启动回归同时覆盖旧安全模式误判自动修复、社区插件原地恢复和端口稳定复用。
- 保留并加强打包运行时源码检查，确保普通后台命令和 `taskkill` 清理进程都包含隐藏窗口选项。
- 发布前继续执行 Desktop 全量 Node 测试、根级脚本测试、类型检查、文档与官网版本门禁，以及 Windows x64 打包和真实安装版启动 smoke。

### 下载与校验

下载 `DeepSeek-Harness-Desktop-Setup-2.2.0-x64.exe`，并使用同一 GitHub Release 中的 `SHA256SUMS.txt` 校验安装包。2.1 用户可直接覆盖更新，无需手动结束旧后台，也无需删除 `.dsh` 或 `node_modules`；安装预检和首次启动会分别完成进程清理与兼容迁移。应用仍会在后台选择可用下载源，并按 `latest.yml` 的可信摘要验证安装包。

### 说明

这是社区构建版本，并非 DeepSeek、OpenAI 或腾讯官方发行版。当前安装包未使用商业代码签名证书，Windows SmartScreen 可能显示“未知发布者”。请只从本项目 GitHub Release 页面获取版本信息并核对 SHA-256 校验值。如果冲突目录既未被旧 profile 声明、版本也无法与桌面包对应，Desktop 会继续保守拒绝覆盖；此时应导出诊断信息后再处理，不要直接删除整个 `.dsh`。

## English

### Highlights

- Fixed the remaining Windows console flash when terminal commands launch CMD or PowerShell descendants. Desktop now hosts the DSH runtime inside a hidden Windows PowerShell console, so terminal sessions, tool commands, and third-party descendants inherit a hidden window. Ordinary subprocess creation and process-tree cleanup keep explicit `windowsHide` options as a second layer of protection.
- Fixed upgrade startup failures where ownership protection intercepted an older plugin or `schemastery` directory. Desktop 2.2 verifies package identity and adopts it when the installed version matches the bundled version or the previous profile explicitly declared that dependency, then writes the normal ownership record.
- The installer reads real executable paths and automatically stops the old app plus background executables inside the previous installation's `resources` tree. It does not rely on broad process-name matching and will not stop an identically named program from another directory, so normal in-place updates no longer require Task Manager cleanup.
- For user-installed community plugins, cleanup follows parent-child relationships from a verified old Desktop/runtime root and includes CMD, PowerShell, Node, and pnpm `prepare` descendants. Only processes still attributable to that tree are stopped; an independently opened terminal with the same executable name is not targeted.
- Desktop persists the loopback port after a successful launch. The next startup probes whether that port can still be bound, reuses it when available, and falls back to automatic allocation only for a real conflict before saving the new port. Ordinary restarts therefore keep a stable address without forcing an unavailable port.
- Plugin recovery now requires strong attribution: an explicit plugin-load failure or an importer/stack path pointing to the active community package. Port conflicts, host errors, interrupted upgrades, and incidental plugin-name mentions are recorded for diagnostics but no longer disable a plugin or enter safe mode automatically.
- On first launch, 2.2 repairs the exact 2.1 safe-mode state written for an unattributed 120-second readiness timeout, restoring remembered dependencies in place without deleting plugin directories. User-requested safe mode remains intact, receives a visible main-window notice, and has a Restore All and Restart action.
- The migration keeps its guard for unknown directories. Content that cannot be attributed by package identity, version, or an earlier profile declaration remains untouched and protected, preventing a startup repair from deleting a user-owned package.
- The hidden Windows host uses an encoded PowerShell command without `shell: true`, including safe handling for installation paths containing spaces, Unicode, and single quotes. Runtime output still reaches readiness detection and diagnostics in real time, while the native exit status is forwarded to Desktop crash classification and recovery.

### Verification

- Added a real Windows hidden-host integration test that launches a Node-mode runtime and verifies both streamed standard output and a nonzero exit status.
- Added preserved 2.1-shaped profile upgrade regressions: both a version-matching package and an older version explicitly declared by the legacy profile migrate, while an unattributed conflicting version remains present and protected.
- Kept the real Windows installer preflight regression, verifying automatic termination of the previous app and resource background processes without broad name-based cleanup.
- Extended Windows preflight coverage with a resource process that launches a simulated plugin helper from the system directory, proving that attributed descendants are stopped by ancestry.
- Added preferred-port persistence and availability-selection tests plus regressions proving that port/host errors containing incidental plugin names do not trigger isolation.
- The three-launch packaged migration regression now also proves automatic legacy false-positive repair, in-place community-plugin restoration, and stable port reuse together.
- Strengthened packaged-runtime source checks so both ordinary background commands and `taskkill` cleanup carry hidden-window behavior.
- Release validation continues to cover the complete Desktop Node suite, root script tests, type checking, documentation and website version gates, Windows x64 packaging, and a real packaged-startup smoke test.

### Download and verification

Download `DeepSeek-Harness-Desktop-Setup-2.2.0-x64.exe` and verify it with `SHA256SUMS.txt` from the same GitHub Release. Existing 2.1 installations can update in place without manually stopping stale background processes or deleting `.dsh`/`node_modules`; installer preflight and first startup perform process cleanup and compatibility migration respectively. Desktop still chooses an available download source in the background and validates the installer against the trusted digest from `latest.yml`.

### Notice

This is a community build and not an official DeepSeek, OpenAI, or Tencent distribution. The installer is not signed with a commercial code-signing certificate, so Windows SmartScreen may report an unknown publisher. Obtain release information only from this project's GitHub Release page and verify the SHA-256 checksum. If a conflicting directory was neither declared by the old profile nor attributable to the bundled package, Desktop deliberately keeps refusing replacement; export diagnostics before repair and do not delete the complete `.dsh` directory.
