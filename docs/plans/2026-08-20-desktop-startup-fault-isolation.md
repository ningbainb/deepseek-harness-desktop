# Desktop 启动故障隔离与恢复：缺陷记录与永久方案

> **实施状态（2026-08-20）：** 本次已落实 Git Graph 缺 Git 的插件边界修复，以及 Crashpad 未归因崩溃的可逆安全模式/基线回退。其余结构化运行时证据、启动页体验和发布门禁项保留为后续加固任务，不能以计划文本替代实际验收。

**Goal:** 让缺失的可选系统依赖、未知的用户插件、损坏或无法枚举的用户加载配置都不能永久阻塞 DeepSeek Harness Desktop 进入可用界面。

**Architecture:** 在功能插件、Runtime 生命周期和 Desktop 恢复层分别建立故障边界。可选 Git 功能在插件宿主层降级为“不可用”；Runtime 把崩溃阶段和退出信息作为结构化事实交给恢复器；恢复器按 Desktop 自有、用户可变、原始未知加载器三类来源执行可逆隔离，而不依赖第三方依赖树或日志正则猜测责任方。

**Tech Stack:** Node.js ESM、Electron、DSH Runtime、Cordis、pnpm、Vitest、Node test runner、Windows Git for Windows/PowerShell 运行环境。

---

## 范围与不可变约束

- 本计划只记录和处理两类已确认的“正在准备本地环境 08%”故障；二者的事实、根因和修复边界必须独立保存，不能因同样表现为 08% 而合并归因。
- 不自动删除用户项目、会话、凭据、插件文件或 `node_modules`；隔离必须是可恢复的原子操作，并保留原始字节或恢复事务。
- 不以“重装应用”“删除 `.dsh`”或“重新下载依赖”作为产品修复。它们可能改变表象，但不可重复、可能丢失用户状态，也不能阻止下一次启动再次失败。
- 未经证据不得把 Crashpad 退出码归咎于某一个社区插件。恢复可以隔离一组用户激活源，但诊断和界面必须标为“未归因”，不能伪造单一罪魁。
- 崩溃页和“导出诊断日志”必须由 Electron 壳提供，不能依赖 DSH Web、插件清单读取或 Runtime 正常启动。

## 已确认缺陷记录

### A. 内置 Git Graph 在 Windows 缺少 Git 时致命退出

**症状：** 从 2.5 升级到 2.6 或 2.7 的 Windows 用户，在启动页看到 08%。Runtime 已输出 `dsh web: http://127.0.0.1:...`，随后立即退出，Desktop 没有收到主界面加载完成信号。

**证据：** `dsh-startup-diagnostics-2026-08-20_07-06-02.txt` 的 2.7.0 启动片段依次记录 `packages=35`、`dsh web: ...`、`dsh: fatal load failure: Error: spawn git.exe ENOENT`、`[process] exited code=1 signal=null`。同一份历史日志中，2.5 的 Aion Git 检查也会遇到 `spawn git ENOENT`，但它记录错误后仍有 `renderer-loaded`；从 2.6 起变成致命的 `git.exe` 路径。

**根因：** `packages/dsh-git-graph/src/host/git-service.ts` 的 `subprocessRunner()` 在 win32 通过 `gitSpawnArgv()` 启动 `git.exe`，但同步 `ctx.subprocess.spawn()` 抛出的 `ENOENT` 和异步 `handle.done` 的拒绝没有转换为普通 Git 执行失败。Git Graph 是 `@linxin666/dsh-web-ui-all` 的 Desktop 内置聚合包，因此该未捕获异常穿透 DSH loader，令整个 Runtime 在 Web 服务就绪后退出。

**非根因：** 这份诊断中的 35 个包均为 Desktop 内置/托管包，不能归因到用户插件或用户依赖树。安装目录、用户名、profile 内容和 2.5 的 PowerShell `-WindowStyle Hidden` 崩溃也不是本次 `git.exe ENOENT` 的直接原因；后者是另一项已修复的启动包装缺陷。Aion 面板打印的 `spawn git ENOENT` 只是缺少 Git 的旁证，其错误已经被捕获，不能把它当作 Runtime 致命点。

**永久修复判定：** 系统没有 Git 或 `git.exe` 不在 PATH 时，Git Graph 仅显示为不可用或无仓库；DSH Runtime 仍必须到达主界面。任何 Git 子进程启动失败都不得以异常形式离开 Git Graph 的宿主边界。

### B. Crashpad `0xFFFF7003` 的未归因进程崩溃未进入恢复隔离

**症状：** `dsh-plugin-diagnostics-2026-08-20.json` 保存了一次 2026-08-19 的事故：Runtime 已输出 `dsh web: http://127.0.0.1:62126`，随后写入 Crashpad `not connected` 并以 Windows 代码 `0xFFFF7003`（signed `-36861`）退出。事故记录为 `identified=false`、`reasonCode=unknown`、`safeMode=false`、`disabledPlugins=[]`，因此用户配置没有被隔离，容易回到同一启动失败循环。

**证据边界：** 该导出的诊断在导出时 `runtime.state=ready`，这只表示后续某次启动已经恢复，不能否定历史崩溃。Profile 当时有 39 个依赖和 14 个启用 bundle，其中包含 `dsh-visualize`、`modlens`、`aegis`、`superdesign-dsh`、`dsh-vision-toolkit`、`creght-skills` 等用户来源激活项。Crashpad 文本没有原始异常栈、转储或最后加载的插件，因此它足以证明“无归因的进程级崩溃”，不足以锁定任一社区包。

**根因：** 已确认的是恢复设计缺口，而非具体插件根因。`apps/dsh-desktop/src/plugin-recovery.mjs` 当前把自动安全模式和基线隔离主要限定为日志匹配“plugin/bootstrap/loader”等字样的场景；仅有 Crashpad 终止码的事故不满足该文字分类，最终走“culprit was not reliable; preserving all plugins”。该判定没有利用“用户可变激活存在”和“Runtime 在启动生命周期中异常退出”这两个更可靠的结构化事实。

**非根因：** 不能凭这份 JSON 断言 Git Graph、任意一个外部插件、安装路径或“依赖没有下载完整”就是崩溃源。重新安装/重新下载依赖可能让某次启动碰巧成功，但不是证据，也无法确保用户下一次安装插件后仍可启动。

**永久修复判定：** 即使 Desktop 无法读取第三方包清单、无法解析用户的依赖树、没有 crash dump，用户也应在有限次自动恢复后进入 Desktop 基线环境。用户插件和原始加载输入应可从恢复中心显式还原，且隔离动作不应假称找到了故障插件。

## 目标恢复决策

| Runtime 结果 | 可靠事实 | Desktop 动作 | 用户数据处理 |
| --- | --- | --- | --- |
| 已知内置可选功能缺失，例如 Git 不存在 | 错误在该功能插件的宿主边界内 | 功能降级，Runtime 继续启动 | 不改 profile、不禁用插件 |
| 已知宿主/安装问题，例如端口冲突、损坏的 Runtime、已知 PowerShell 包装故障 | 结构化主机类别匹配，或基线环境也复现 | 停止自动重启，显示崩溃页、重试和导出诊断 | 保留所有用户配置 |
| 未归因 Runtime 崩溃且 Desktop profile 明确有用户来源依赖或 bundle | 第三方包树无需可读，只读取 Desktop profile 自身 | 一次原子安全模式：停用非 Desktop 托管依赖和 bundle，重建 Desktop profile 后启动 | 记录可恢复的依赖规格与快照 |
| 未归因 Runtime 崩溃且有原始/损坏/无法枚举的用户 loader 输入 | 解析失败、原始 home/profile patch，或安全模式无法取得可变候选 | 使用私有基线隔离：归档原始 loader 输入并移动用户 `node_modules`，只生成 Desktop 基线 | 原始字节和包树保留在私有恢复档案中 |
| Desktop 基线仍然崩溃 | 基线无用户激活也无法启动 | 打开重启熔断，保留恢复页；不再自动修改配置 | 只允许显式重试、导出和人工恢复 |

这张表的关键是按“可变来源”和“生命周期阶段”决策，而不是按插件名称、依赖树是否完整或单行错误文本决策。安全模式只处理可枚举的用户声明；私有基线处理无法枚举的 loader；两条路径都必须可逆。

## 实施任务

### Task 1: 把 Git 缺失限制在 Git Graph 插件内

**Files:**

- Modify: `packages/dsh-git-graph/src/host/git-service.ts`
- Modify: `packages/dsh-git-graph/tests/git-service.spec.ts`
- Test: `packages/dsh-git-graph/tests/git-service.spec.ts`

**Step 1: 编写失败用例。**

为 win32 runner 增加两个 seam 测试：`ctx.subprocess.spawn()` 同步抛出 `{ code: 'ENOENT', message: 'spawn git.exe ENOENT' }`，以及返回的 `handle.done` 异步拒绝。两个用例都要断言 `GitService.status()` 解析为 `null`，而不是拒绝 Promise；直接 runner 结果必须是稳定的 `{ exitCode: 127, stdout: '', stderr: ... }`。

**Step 2: 验证失败。**

运行 `pnpm --filter @linxin666/dsh-client-ui-git-graph test`。当前未捕获的实现应使同步或异步 no-Git 用例失败。

**Step 3: 实现最小故障边界。**

在 `subprocessRunner()` 内分别捕获 spawn 抛错和 `handle.done` 拒绝，保留经过限制的错误文本作为 `stderr`，并返回 exit code 127。保持 `git.exe` 的 win32 argv 规则，不走 `cmd.exe` 或 shell，以免破坏 Git 的 `%` 格式参数和现有命令注入边界。不要通过安装 Git、修改 PATH 或抛出全局异常来解决问题。

**Step 4: 验证通过。**

再次运行上述包测试，并运行 `pnpm --filter @linxin666/dsh-client-ui-git-graph typecheck` 和 `pnpm --filter @linxin666/dsh-client-ui-git-graph build`。确认正常 Git 结果仍保留原始 stdout/stderr，缺失 Git 时 `/git/status` 的语义为“无可用仓库”。

**Step 5: 提交。**

在独立实现分支中提交 Git Graph 的代码和测试，提交信息限定为“fix(git-graph): degrade when git is unavailable”。

### Task 2: 让 Runtime 报告结构化启动/崩溃阶段，并让恢复器独占恢复重启

**Files:**

- Modify: `apps/dsh-desktop/src/runtime-controller.mjs`
- Modify: `apps/dsh-desktop/src/plugin-recovery.mjs`
- Modify: `apps/dsh-desktop/src/electron-app.mjs`
- Test: `apps/dsh-desktop/test/runtime-controller.test.mjs`
- Test: `apps/dsh-desktop/test/plugin-recovery.test.mjs`

**Step 1: 编写失败用例。**

构造一个先发出 `dsh web:`、再以 `0xFFFF7003` 退出且没有插件名称的假 Runtime。断言恢复器收到的内部崩溃上下文包含启动序号、`before-web-ready` 或 `after-web-ready` 阶段、原始 exit code/signal、稳定指纹和有限行日志；同时断言恢复启动不会与 RuntimeController 的延迟自动重启竞争。

**Step 2: 验证失败。**

运行 `pnpm --filter @deepseek-ai/dsh-desktop test -- test/runtime-controller.test.mjs test/plugin-recovery.test.mjs`。现有逻辑只向恢复器提供格式化文本，Crashpad-only 事故会被保留为未知主机故障。

**Step 3: 实现结构化故障契约。**

在 RuntimeController 内部记录每次启动的唯一序号、已观察到的 `dsh web` 就绪里程碑和退出原始值；在崩溃时发出只供主进程使用的结构化上下文。Electron 在 `loadURL()` 成功后记录该序号的 renderer 已加载里程碑，用于日志和诊断，但不能把 URL、PID、用户路径或原始 stderr 暴露给 renderer。恢复器消费该上下文后先取得恢复所有权，暂停同一次崩溃的自动重启；恢复器决定不接管时才按受控路径恢复原有的一次重试语义。

**Step 4: 把分类从日志猜测改为来源与阶段判定。**

保留对已知端口、安装完整性和 PowerShell 包装故障的明确主机分类，但不能把所有没有“plugin”字样的退出都视为主机故障。`DesktopPluginRecovery` 应根据结构化阶段、profile 声明的用户可变激活和原始 loader 状态决定是否可逆隔离；Crashpad `not connected`/`0xFFFF7003` 只能标记为未归因进程崩溃，不能标记为某个插件。

**Step 5: 验证通过并提交。**

运行两份目标测试和 `pnpm --filter @deepseek-ai/dsh-desktop test`。独立提交 Runtime 契约、恢复器变更和测试，提交信息限定为“fix(desktop): recover opaque startup crashes deterministically”。

### Task 3: 让用户插件树不可读时也能进入可恢复基线

**Files:**

- Modify: `apps/dsh-desktop/src/extensions/plugins.mjs`
- Modify: `apps/dsh-desktop/src/profile-baseline-quarantine.mjs`
- Modify: `apps/dsh-desktop/src/plugin-recovery.mjs`
- Modify: `apps/dsh-desktop/test/plugin-recovery.test.mjs`
- Test: `apps/dsh-desktop/test/plugins.test.mjs`

**Step 1: 编写失败用例。**

覆盖四种 profile：可解析且含外部依赖/bundle、第三方 `package.json` 无法读取、Desktop profile `package.json` 无法解析、home/profile patch 含未知 loader。每个 fixture 都模拟无插件名的 Crashpad 退出，断言最终会启动一次 Desktop 基线，而不是停在 08% 或无限重启。

**Step 2: 验证失败。**

运行 `pnpm --filter @deepseek-ai/dsh-desktop test -- test/plugins.test.mjs test/plugin-recovery.test.mjs`。现有 Crashpad-only 路径不会稳定地进入安全模式或基线隔离。

**Step 3: 使用不读取第三方包的来源清单。**

继续让 `PluginManager.recoveryCandidates()` 只读取 Desktop profile 自己的 `dependencies` 与 `dsh.profile.bundles`，以 Desktop 托管包集合为唯一保护边界；不得为了恢复而遍历第三方 `node_modules`、执行插件脚本或解析其依赖树。对于读取失败或没有可枚举候选但仍存在用户 loader 的情况，直接选择 `DesktopProfileBaselineQuarantine`。

**Step 4: 扩展基线隔离资格。**

把基线隔离从“文本看起来像 plugin bootstrap”改为“未归因启动崩溃 + 用户可变 activation 可见/不可读”。保留该类的原始 profile manifest、profile/home patch、Desktop link 记录和同卷 `node_modules` 移动；生成的基线只能包含 Desktop 已知托管包。安全模式成功后不自动恢复用户插件，基线成功后也不自动覆盖档案；恢复必须由用户在恢复中心显式触发，并在启动失败时回滚到基线。

**Step 5: 验证恢复原子性并提交。**

断言中断在 archive、移动 `node_modules`、写基线、恢复原配置的每一个阶段都不会丢失原始内容；断言正常用户插件在恢复前不被重新激活。运行目标测试及 `pnpm --filter @deepseek-ai/dsh-desktop test`，然后独立提交，提交信息限定为“fix(desktop): isolate opaque user startup activations”。

### Task 4: 保证崩溃页、恢复说明和诊断导出始终可用

**Files:**

- Modify: `apps/dsh-desktop/src/ui/startup.html`
- Modify: `apps/dsh-desktop/src/ui/startup.mjs`
- Modify: `apps/dsh-desktop/src/ipc.mjs`
- Modify: `apps/dsh-desktop/src/startup-diagnostics.mjs`
- Test: `apps/dsh-desktop/test/startup-surface.test.mjs`
- Test: `apps/dsh-desktop/test/recovery-surface.test.mjs`
- Test: `apps/dsh-desktop/test/ipc.test.mjs`
- Test: `apps/dsh-desktop/test/startup-diagnostics.test.mjs`

**Step 1: 编写失败用例。**

模拟基线隔离已执行、基线也失败以及恢复器读取插件清单超时。断言本地启动页不再呈现静态 08%：它显示“已隔离用户加载项”或“基础 Runtime 失败”的准确状态，始终提供重试、打开日志、导出诊断以及适用时的恢复/还原入口。

**Step 2: 验证失败。**

运行 `pnpm --filter @deepseek-ai/dsh-desktop test -- test/startup-surface.test.mjs test/recovery-surface.test.mjs test/ipc.test.mjs test/startup-diagnostics.test.mjs`。任何依赖 Runtime 状态或未处理 IPC 拒绝而让页面维持 08% 的断言都必须失败。

**Step 3: 实现可解释且脱离 Runtime 的恢复表面。**

沿用 `export-diagnostics` 的本地 IPC 通道和有限时收集机制，补充结构化的恢复原因、是否已进入基线、可恢复项数量和不含隐私内容的错误指纹。不要把原始 plugin 配置、路径、提示词、密钥、会话内容或完整 stderr 送到 renderer；诊断压缩包继续在用户选定位置本地写入，并保持确认、脱敏和原子写入。

**Step 4: 验证通过并提交。**

运行上述测试，人工检查启动页在 Runtime 未就绪时仍可以导出诊断。提交 UI/IPC/诊断变更，提交信息限定为“fix(desktop): keep startup recovery actionable”。

### Task 5: 在发布门禁中覆盖 Windows 无 Git 与未归因崩溃恢复

**Files:**

- Modify: `apps/dsh-desktop/scripts/verify-package.mjs`
- Modify: `apps/dsh-desktop/scripts/packaged-smoke-runner.mjs`
- Modify: `.github/workflows/desktop-release.yml`
- Test: `apps/dsh-desktop/test/packaged-smoke-runner.test.mjs`
- Test: `apps/dsh-desktop/test/runtime-controller.test.mjs`
- Test: `apps/dsh-desktop/test/plugin-recovery.test.mjs`

**Step 1: 编写失败用例与运行矩阵。**

为 Windows 打包验证准备临时 `DSH_HOME` 和受控 PATH，其中保留运行 Desktop 所需的系统目录但不包含 Git。验证打包后的 Runtime 可到达主界面，而 Git Graph 不会使进程退出。再以测试 seam 模拟 `0xFFFF7003`，验证一次可逆安全模式/基线回退后无自动重启循环。

**Step 2: 验证失败。**

在 Windows runner 运行对应的 package smoke 命令。当前不带 Git 的包会复现 `spawn git.exe ENOENT`，而 Crashpad-only fixture 会保持未归因、未隔离状态。

**Step 3: 添加稳定发布门禁。**

将 no-Git 单测、Desktop 恢复单测和 Windows 打包 smoke 纳入 release workflow。测试只改变子进程环境和临时 profile，绝不修改开发机的 Git、用户 PATH 或真实 `.dsh`。发布验证应把“主界面可达”“恢复后没有重复崩溃循环”“诊断导出可用”作为通过条件，而不是只检查安装包生成成功。

**Step 4: 验证通过并提交。**

在可用平台运行 `pnpm --filter @linxin666/dsh-client-ui-git-graph test`、`pnpm --filter @deepseek-ai/dsh-desktop test`、`pnpm --filter @deepseek-ai/dsh-desktop pack:verify` 和对应 Windows packaged smoke。将无法在当前主机验证的签名/Windows 项明确标注为 CI 证据，不以本地猜测替代。

**Step 5: 提交和发布审查。**

将门禁与测试提交为独立变更，提交信息限定为“test(release): gate startup fault isolation”。发布前审查诊断脱敏、恢复档案可逆性、Windows CI 结果和安装包哈希。

## 回归验收清单

- Windows 没有安装 Git、或 Git 不在 PATH，启动 Desktop 后主界面可用；日志允许记录 Git Graph 功能降级，但不得出现 `dsh: fatal load failure: Error: spawn git.exe ENOENT`。
- 运行时先输出 `dsh web` 后以 `0xFFFF7003` 退出，且 profile 有用户插件时，Desktop 最多执行一次受控恢复并进入安全模式或基线，不重复启动相同故障配置。
- 用户 profile 的依赖树无法读取、单个包 `package.json` 损坏或未知 loader 直接写入 patch 时，恢复不需要枚举第三方包；它仍能生成 Desktop 基线并保留原始状态供还原。
- 基线环境自己失败时，Desktop 不删除或恢复用户配置，不出现无限重启，启动页仍可导出经过脱敏的诊断包。
- 安全模式、基线隔离和显式还原都具备中断回滚测试；无用户操作时不会自动重新启用被隔离插件。
- Crashpad 事故的对外文案始终为“未归因进程崩溃”，除非未来诊断包含可验证的插件栈、loader 路径或可重复最小复现。

## 当前用户恢复指引

1. 对 A 类 `git.exe ENOENT`，安装 Git for Windows 并确认新开的终端中 `git --version` 可运行，然后重新启动 Desktop。这是当前版本的临时解法，不取代上面的代码修复。
2. 对 B 类未归因 Crashpad 崩溃，先在启动页点击“导出诊断日志”；热修复发布后选择“安全模式”或“使用基线环境”，确认能进入主界面后再逐个恢复用户插件。
3. 不建议先删除 `%USERPROFILE%\\.dsh`、随机删除 profile、卸载重装或让自动化工具重装全部依赖。若仍无法进入基线，只提交导出的诊断包和复现步骤；恢复页会保留现场，便于继续定位主机级故障。

No commit, push, or production-code change is part of this documentation task.
