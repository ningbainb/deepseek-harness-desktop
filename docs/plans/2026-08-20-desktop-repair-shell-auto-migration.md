# Desktop 修复壳与全权限自由模式实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

> **实施状态（2026-08-21）：** 已实现的最小闭环是：Desktop 会先创建独立本地恢复壳；后续迁移、Profile、Runtime 或安装检查失败会留在壳内，而不是回退为报错退出。已验证安全且不需确认的迁移 journal 会自动继续；需要确认、中断或阻断的迁移可从同一壳进入隔离自由模式。用户在原生确认后可以启动隔离的 `free-full-user` 会话；该会话使用当前 Windows 用户已有的 Agent、终端、文件、网络、工具和调度能力，并可从恢复壳选择本地目录或 `.tgz`，或输入受限的 npm、Git、HTTPS 外来插件来源。外来插件的安装清单只写入一次性隔离 Profile，正常 Desktop Profile 仍保持严格、不会被 Desktop 的安装流程覆盖；本地来源会在确认后按内容指纹复核并复制进会话 staging，远程来源只允许本次原生确认。复制原 Profile（包括固定 Home patch）到隔离自由会话时，Desktop 的复制流程不原地改写原 Profile。全权限会话不是 OS 沙箱：获准插件/Agent 仍能按当前 Windows 用户权限访问用户可访问的文件。已完成 `UserPluginArchive` 基础：可按原始字节保全 Profile 的 manifest、lock、patch、links、workspace 文件及完整 `node_modules` 树，记录文件/链接清单与 SHA-256，使用持久 journal 支持恢复。Windows 安装产物现已内置固定清单和完整性校验过的 MinGit，Desktop Runtime 与隔离插件安装优先使用它，且不改系统 PATH、注册表或权限；若包内副本损坏且系统 Git 也不可用，恢复壳仍可在一次原生确认后下载校验过的修复副本。
>
> **尚未完成、不得对用户宣称已完成的项目：** 尚未将 `UserPluginArchive` 事务接入每一次 normal Profile 的原地写入；因此也尚未完成“直接使用原 Profile”模式，不能宣称任意常规 Profile 改写前都已自动完成完整保全与回滚。独立 Repair Agent 的受限建议通道也仍未完成。远程 npm/Git/HTTPS 外来来源目前只允许“本次”原生确认，不能被误当成已经验证内容的持久信任。

**Goal:** 让 Desktop 无论遇到迁移、插件、Git 或 Runtime 故障都先进入本地界面；用户原生确认后，可在当前 Windows 用户权限范围内自由加载任意外来插件、使用 Agent、终端、文件、网络和调度能力，同时保留可回滚的用户资料副本。

**Architecture:** 将当前单一的 `MAIN` WebContents 拆成始终可用的本地 Desktop Shell 与可替换的 Runtime View。启动协调器只负责保证 Shell、归档和事务可靠；它不再把来源、兼容性、手改源码或未声明能力当作用户已确认的自由模式的拦截条件。自由模式的完整权限只在原生确认后签发，并始终受当前 Windows 用户本身的系统权限限制，不能把普通用户提升成管理员。

**Tech Stack:** Electron 43、Node ESM、Electron IPC 和 `contextBridge`、Node test runner、Vitest、`electron-builder`、`electron-updater`、现有 `MigrationAssistant`、`DesktopProfileBaselineQuarantine`、`PluginRecoveryStore`、`fflate`、SHA-256/SHA-512 完整性验证、Windows 打包产物 smoke 测试。

> **产品决定（2026-08-20，优先级最高）：** 用户在原生确认框选择“开启全权限自由模式”后，Desktop 必须把外来插件视作该用户主动运行的代码：不再因 registry、发布者、兼容性声明、手改源码、`file:`、`link:`、`workspace:`、目录、本地 `.tgz`、HTTPS 归档或安装脚本而拒绝加载。此授权包含该用户原有的文件、网络、终端、Agent、工具、后台自动化与调度能力。它不等于 UAC/管理员提权，也不能使损坏的 Desktop Runtime 变成可执行代码；若 Runtime 本体不完整，Shell 仍可进入并提供修复入口。

---

## 一、不可妥协的产品规则

当前看到的两张图不是随机弹窗：可识别的 2.5 到 3.0 状态会进入“继续迁移/回滚”的三按钮流程；`blocked` 迁移计划则在任何 `BrowserWindow` 创建前弹“退出”并 `app.quit()`。后者防止了误写状态，但违反了“用户必须先进入应用”的要求。

实施后必须满足以下规则：

1. Electron 在迁移扫描、Runtime 验证、包解析和 DSH 启动前创建本地 Desktop Shell。
2. 迁移阻断、journal 不可读、Git 缺失、Runtime 完整性失败、安装包依赖缺失、插件失败或市场网络超时，可以阻断 DSH，但绝不能阻断 Shell。
3. “自动迁移”只包括已有证据、可逆、可验证的步骤；不得自动覆盖未知的用户代码、手改插件或外部项目目录。
4. Profile 内用户插件、手改插件文件、原始 manifest、锁文件、patch、链接和工作区配置，在任何写入前必须私有地按原始字节保全。
5. `file:`、`link:`、workspace、junction、符号链接、目录、本地 `.tgz`、registry 包和 HTTPS 归档都可作为外来插件来源。用户经原生明确同意后，Desktop 直接按用户选择的来源加载，不再因来源、兼容性、手改状态或发布者身份拦截；只保留“运行时实际无法解析/加载”的技术错误反馈。
6. Git 是可选能力。用户首次原生确认后，Desktop 才可下载和维护受管 Portable Git；不得改系统 PATH、注册表，也不得执行下载的安装器或 SFX。
7. 当用户在自由模式明确同意后，其 Agent 与插件可使用该用户已有的 Shell、路径、网络、文件、工具和任务调度能力；修复中心仍用事务 API 执行影响 Desktop 数据的动作，以便失败时回滚，而不是把原始主进程对象暴露为一条不受控 IPC 字符串。
8. 每个写入、下载、恢复或启用动作仍记录持久事务、健康检查、审计记录和失败回滚。外来插件的“本次加载”“按内容信任”“始终信任此来源”是用户可选的显式授权范围；选定后 Desktop 不再为该范围的每次启动重复卡住确认，也不会重新执行 registry/兼容性拦截。
9. 用户可先在隔离工作台试跑外来插件；当原 Profile 已归档、无活跃迁移事务且用户确认“直接使用我的原配置”时，也可让同一来源直接挂入原工作区。此模式允许用户插件自由读取、写入和运行，但 Desktop 在启动前保存完整原始资料副本，失败时用户可一键回滚。
10. 唯一无条件承诺是：本地 Shell 可用且用户状态不丢失。不能承诺未知、任意或已不兼容的自定义插件会自动变得可运行。
11. 当正常启动被阻断时，Shell 自动进入“自由模式”，而不是只显示“退出”。自由模式可展示状态、导出诊断、管理归档、发起修复、打开帮助，并在 Runtime 本体可执行时提供全权限工作台。
12. 自由模式不把“Runtime 文件不存在、签名/包依赖闭包损坏”伪装成可强制继续：这是没有可执行程序，不是权限问题。此时用户仍能进入 Shell、修复或回退安装、导出资料；一旦 Runtime 完整，用户可选择全权限启动。活跃迁移 journal 与原 Profile 写入仍须先建立归档和可恢复事务，但不会再导致只剩“退出”弹窗。

### 自由模式：不再卡死，但不牺牲资料安全

自由模式不是一个阉割版工作台，而是故障下仍可操作的入口。默认进入 Shell；只有用户点选并在原生对话框确认后才进入全权限 Runtime，会话不再暗中关闭 Agent、工具、调度或外来插件。

| 层级 | 何时可用 | 用户能做什么 | 明确不能做什么 |
| --- | --- | --- | --- |
| `free-shell` | 每一次启动，无论迁移、Git、插件、Runtime 或包校验是否失败 | 进入 Desktop 本地界面；查看原因、归档和日志；导出诊断；选择修复、回滚、安装 Git 或开启全权限会话 | 无法执行已损坏或缺失的 Runtime；不能替 Windows 提升为管理员 |
| `free-safe-workbench` | Runtime 本体完整，但用户尚未确认完整权限 | 进入隔离的基础 DSH 工作台，查看资料和修复状态 | 不自动加载外来插件、不自动运行用户 Agent/调度；这是默认值，不是用户确认后的限制 |
| `free-full-user` | Runtime 本体完整，且用户完成原生全权限确认 | 按当前 Windows 用户权限运行 DSH、用户 Agent、终端、文件、网络、工具、后台自动化和调度；直接加载任意选定的外来插件来源；可选隔离 Profile 或已归档的原 Profile | 不绕过 Windows ACL/UAC；Runtime 自身损坏时不能启动；Desktop 仍保存回滚点而不是静默丢资料 |

具体降级策略如下：

1. **迁移需要确认、被阻断或中断：** 立即显示 `free-shell`。原资料保持冻结；用户可以看保全范围、回滚、导出诊断或进入临时工作台。只有通过 Repair Plan 的迁移步骤才能接触原 Profile。
2. **用户插件或 Profile loader 崩溃：** 先打开 Shell；用户可立即选择 `free-safe-workbench`，或确认后进入 `free-full-user`。完整模式不再删除、重装、禁用或兼容性拦截用户插件；先保存完整原始树，再让用户选择隔离 Profile 或原 Profile 直接运行。
3. **缺少 Git：** 基础界面和无 Git 功能继续可用；第一次经用户确认后下载并验证 Desktop 受管 Portable Git，后续由 Desktop 维护，不要求用户手动改系统环境。
4. **市场/网络超时：** 只显示非阻塞提示，正常或自由工作台均可进入；后台重试不能影响启动。
5. **Runtime 完整性失败或安装包缺少传递依赖：** 只能进入 `free-shell` 与 Repair Center，不能启用任何 DSH Runtime 工作台。此时没有可执行的 Runtime，不是权限不足；用户仍能验证安装、修复/回退版本、导出诊断和保护资料。

自由会话默认使用每次会话唯一的 Desktop-owned 临时 Profile/状态目录，生命周期、哈希、来源和清理结果写入私有审计。用户可以在原生确认中选择“使用已归档的原 Profile”，此时启动前必须完成完整 Profile/插件树归档和 journal；会话不再限制用户插件、Agent、工具、调度或对原 Profile 的写入，但任何失败都提供回滚到归档副本的入口。

## 二、目标状态模型

Shell 只消费不可变、脱敏的 Repair State，绝不直接读取 Runtime 日志、Profile 文件或插件源码。

| 状态 | DSH Runtime | Shell 行为 | 自动动作 |
| --- | --- | --- | --- |
| `booting` | 未启动或启动中 | 显示 Desktop 首页和后台进度 | 只扫描 |
| `migrating-safe` | 已静止 | 显示快照和 journal 进度 | 执行确定性迁移 |
| `migration-review` | 已静止 | 显示保全范围和风险 | 等待一次确认 |
| `migration-repair-required` | 不启动 | 显示迁移修复、诊断和 Agent 计划 | 不改 Profile |
| `runtime-repair-required` | 不启动或已停止 | 显示 Git、安装包或 Runtime 诊断 | 仅运行已确认的修复 |
| `plugin-recovery` | 停止或基线模式 | 显示逐插件恢复 | 只恢复已验证的安全项 |
| `free-shell` | 不启动或不可准入 | 保持 Desktop 可用，显示恢复入口和离线能力 | 不写入原 Profile |
| `free-safe-workbench` | 在临时隔离 Profile 中运行 | 嵌入基础 DSH 工作台 | 只写临时会话状态 |
| `free-full-user` | 在隔离 Profile 或已归档保护的原 Profile 中运行 | 嵌入用户确认的完整 DSH、Agent、工具、调度和外来插件环境 | 当前 Windows 用户权限与用户选定的 Profile/来源 |
| `ready` | 运行中 | 将 Runtime View 嵌入 Shell | 稳定窗口后重置故障预算 |

分类必须是固定枚举，例如 `external-tool-missing`、`packaged-dependency-missing`、`runtime-integrity-failed`、`profile-loader-failure`、`migration-blocked`、`plugin-incompatible`、`network-degraded`、`unknown`。原始错误、路径、提示词、会话、工具结果、令牌和凭据不得出现在 Repair State、Agent 输入或公开诊断中。

## 三、实施任务

### 任务 1：冻结 Repair State 和 Repair Plan 契约

**文件：**

- 新建：`apps/dsh-desktop/src/repair-state.mjs`
- 新建：`apps/dsh-desktop/src/repair-plan.mjs`
- 新建：`apps/dsh-desktop/test/repair-state.test.mjs`
- 新建：`apps/dsh-desktop/test/repair-plan.test.mjs`
- 修改：`apps/dsh-desktop/src/startup-diagnostics.mjs`
- 修改：`docs/schemas/desktop-contract-v1.schema.json`
- 新建：`docs/schemas/desktop-repair-plan-v1.schema.json`
- 修改：`scripts/validate-public-schemas.mjs`
- 修改：`scripts/public-schema-validation.test.mjs`

**步骤 1：先写失败测试。**

为完整 Runtime 错误、包含 prompt/tool 字样的插件事故和私有 Windows 路径建立测试。投影结果只能有类别、16 位哈希指纹、受限说明、动作 ID 和时间；未知字段必须拒绝。

```js
assert.deepEqual(projectRepairState({
  category: 'packaged-dependency-missing',
  technicalDetails: 'OPENAI_API_KEY=secret C:\\Users\\alice\\private',
}), {
  version: 1,
  category: 'packaged-dependency-missing',
  fingerprint: /^[a-f0-9]{16}$/u,
  actions: ['verify-installation', 'export-diagnostics', 'exit'],
})
```

**步骤 2：运行失败测试。**

运行：`pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/repair-state.test.mjs test/repair-plan.test.mjs`

预期：因投影和解析器不存在而失败。

**步骤 3：实现严格白名单。**

`repair-state.mjs` 定义固定类别、动作 ID、长度上限和 SHA-256 派生的 16 位指纹。增加只读的 `mode: 'normal' | 'free-shell' | 'free-safe-workbench' | 'free-full-user'`、`freeWorkbenchAvailable`、`fullUserModeAvailable` 和固定拒绝原因；不得泄露临时 Profile 路径、原 Profile 路径或 Runtime 原始错误。`repair-plan.mjs` 只接受以下结构：

```js
{
  schemaVersion: 1,
  diagnosisIds: ['packaged-dependency-missing'],
  recommendedActionIds: ['verify-installation'],
  rationale: '受限的面向用户说明',
}
```

拒绝路径、命令、URL、脚本、未知字段和超出数量上限的 diagnosis/action。诊断导出只增加投影及动作结果。

**步骤 4：增加公开 schema 夹具。**

增加有效 Repair Plan，及未知动作、路径字段、命令字段、未知主版本的负例；注册到公开 schema 校验列表。

**步骤 5：验证。**

运行：`pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/repair-state.test.mjs test/repair-plan.test.mjs && node scripts/validate-public-schemas.mjs && node --test scripts/public-schema-validation.test.mjs`

预期：全部通过。

**步骤 6：提交。**

```bash
git add apps/dsh-desktop/src/repair-state.mjs apps/dsh-desktop/src/repair-plan.mjs apps/dsh-desktop/test/repair-state.test.mjs apps/dsh-desktop/test/repair-plan.test.mjs apps/dsh-desktop/src/startup-diagnostics.mjs docs/schemas/desktop-repair-plan-v1.schema.json docs/schemas/desktop-contract-v1.schema.json scripts/validate-public-schemas.mjs scripts/public-schema-validation.test.mjs
git commit -m "feat(desktop): define bounded repair state contract"
```

### 任务 2：创建独立受信任的 Recovery Surface

**文件：**

- 新建：`apps/dsh-desktop/src/preload-recovery.cjs`
- 新建：`apps/dsh-desktop/src/preload-runtime.cjs`
- 新建：`apps/dsh-desktop/src/ui/recovery.html`
- 新建：`apps/dsh-desktop/src/ui/recovery.css`
- 新建：`apps/dsh-desktop/src/ui/recovery.mjs`
- 修改：`apps/dsh-desktop/src/desktop-contract.mjs`
- 修改：`apps/dsh-desktop/src/desktop-surfaces.mjs`
- 修改：`apps/dsh-desktop/src/ipc.mjs`
- 修改：`apps/dsh-desktop/src/electron-app.mjs`
- 修改：`apps/dsh-desktop/test/desktop-contract.test.mjs`
- 修改：`apps/dsh-desktop/test/preload-surfaces.test.mjs`
- 修改：`apps/dsh-desktop/test/ipc.test.mjs`
- 新建：`apps/dsh-desktop/test/recovery-surface.test.mjs`

**步骤 1：先写 surface 隔离失败测试。**

断言 `RECOVERY` 和 `RUNTIME` 是不同注册 surface。Recovery preload 只暴露 `getStatus`、`getRepairState`、`getRepairPlan`、`applyRepairPlan`、`enterFreeMode`、`exportDiagnostics`、`openLogs`、`retry` 和 `exit`；Runtime preload 默认不暴露修复、迁移、更新、插件 mutation 或泛型 `desktop:action`。`MAIN`、`EXTENSIONS`、`COMMUNITY` 以及 Runtime View sender 都必须被拒绝 `repair:*` 和自由模式写操作。

**步骤 2：运行失败测试。**

运行：`pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/desktop-contract.test.mjs test/preload-surfaces.test.mjs test/ipc.test.mjs test/recovery-surface.test.mjs`

预期：因 `RECOVERY` 和独立 bridge 不存在而失败。

**步骤 3：实现能力边界。**

新增 `DESKTOP_SURFACES.RECOVERY`、`DESKTOP_SURFACES.RUNTIME` 以及仅供修复使用的 capability。添加独立的 Recovery 和 Runtime preload，不要扩展或复用 `preload-main.cjs`。注册以下 typed IPC：

```text
desktop:repair-status
desktop:repair-plan
desktop:repair-apply
desktop:repair-enter-free-mode
desktop:repair-external-source-select
desktop:repair-external-source-inspect
desktop:repair-external-source-authorize
desktop:repair-external-source-revoke
desktop:repair-external-workbench-start
desktop:repair-retry
desktop:repair-export-diagnostics
desktop:repair-open-logs
desktop:repair-exit
```

每次调用必须验证 Recovery WebContents 身份。不得经由 `desktop:action` 路由修复；既有泛型 `desktop:action('repair')` 对 Runtime sender 必须删除/拒绝，也不得给 Runtime WebContents 修复、迁移、更新或插件写权限。

**步骤 4：实现本地修复页面。**

`recovery.html` 必须是 file-backed、CSP 限制、没有远程资源的页面。它显示类别、安全说明、下一动作、进度、诊断导出、日志、重试和退出；默认不渲染原始技术详情。

**步骤 5：验证安全属性。**

测试 sandbox、context isolation、禁用 Node integration、拒绝 `window.open`、拒绝权限请求，以及 Recovery Window 不允许导航到 Runtime URL。

**步骤 6：运行测试并提交。**

运行：`pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/desktop-contract.test.mjs test/preload-surfaces.test.mjs test/ipc.test.mjs test/recovery-surface.test.mjs`

```bash
git add apps/dsh-desktop/src/preload-recovery.cjs apps/dsh-desktop/src/ui/recovery.html apps/dsh-desktop/src/ui/recovery.css apps/dsh-desktop/src/ui/recovery.mjs apps/dsh-desktop/src/desktop-contract.mjs apps/dsh-desktop/src/desktop-surfaces.mjs apps/dsh-desktop/src/ipc.mjs apps/dsh-desktop/src/electron-app.mjs apps/dsh-desktop/test/desktop-contract.test.mjs apps/dsh-desktop/test/preload-surfaces.test.mjs apps/dsh-desktop/test/ipc.test.mjs apps/dsh-desktop/test/recovery-surface.test.mjs
git commit -m "feat(desktop): add isolated recovery surface"
```

### 任务 3：让 Desktop Shell 常驻，Runtime 变为可替换 View

**文件：**

- 新建：`apps/dsh-desktop/src/desktop-shell.mjs`
- 修改：`apps/dsh-desktop/src/electron-app.mjs`
- 修改：`apps/dsh-desktop/src/navigation-policy.mjs`
- 修改：`apps/dsh-desktop/src/renderer-permissions.mjs`
- 新建：`apps/dsh-desktop/test/desktop-shell.test.mjs`
- 修改：`apps/dsh-desktop/test/startup-surface.test.mjs`
- 修改：`apps/dsh-desktop/test/runtime-integration.test.mjs`

**步骤 1：先写生命周期失败测试。**

使用 fake Electron view，断言：

1. Shell 在迁移/Runtime 扫描之前创建并显示；
2. 只有官方 loopback Runtime `ready` 后才可附加 Runtime View；
3. Runtime 崩溃只隐藏/卸载 Runtime View，Shell 仍可交互；
4. 非 loopback URL、popup、导航和权限请求一律拒绝。

**步骤 2：运行失败测试。**

运行：`pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/desktop-shell.test.mjs test/startup-surface.test.mjs test/runtime-integration.test.mjs`

预期：当前 `mainWindow.loadURL(status.url)` 会整体替换 file-backed 页面，测试失败。

**步骤 3：实现 `DesktopShell`。**

在 `app.whenReady()` 后立即创建 Shell Window，并在整个生命周期保持 file URL。仅当 loopback origin 验证成功后，通过独立 `WebContentsView` 或等价 Runtime View 显示 DSH Web；将 Runtime View 注册为 `RUNTIME` surface，使用零权限或最小 scoped `preload-runtime.cjs`，绝不能沿用 `preload-main.cjs`。窗口 chrome、bounds、tray 和 deep-link 归 Shell 所有。

**步骤 4：处理现有 `startup.html`。**

如果保留它，只能作为 Shell 内的轻量加载组件；不要保留第二个高权限启动页。修复 UI 的唯一所有者是新的 Recovery surface。

**步骤 5：运行测试并提交。**

运行：`pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/desktop-shell.test.mjs test/startup-surface.test.mjs test/runtime-integration.test.mjs test/preload-surfaces.test.mjs`

```bash
git add apps/dsh-desktop/src/desktop-shell.mjs apps/dsh-desktop/src/electron-app.mjs apps/dsh-desktop/src/navigation-policy.mjs apps/dsh-desktop/src/renderer-permissions.mjs apps/dsh-desktop/test/desktop-shell.test.mjs apps/dsh-desktop/test/startup-surface.test.mjs apps/dsh-desktop/test/runtime-integration.test.mjs
git commit -m "refactor(desktop): keep shell alive across runtime failures"
```

### 任务 3A：实现用户确认后的全权限自由模式

**文件：**

- 新建：`apps/dsh-desktop/src/free-mode-session.mjs`
- 新建：`apps/dsh-desktop/src/free-mode-policy.mjs`
- 新建：`apps/dsh-desktop/src/free-mode-permission-contract.mjs`
- 新建：`apps/dsh-desktop/src/external-plugin-source.mjs`
- 新建：`apps/dsh-desktop/src/external-plugin-trust-store.mjs`
- 新建：`apps/dsh-desktop/src/external-plugin-session.mjs`
- 修改：`apps/dsh-desktop/src/desktop-shell.mjs`
- 修改：`apps/dsh-desktop/src/startup-recovery-coordinator.mjs`
- 修改：`apps/dsh-desktop/src/electron-app.mjs`
- 修改：`apps/dsh-desktop/src/runtime-controller.mjs`
- 修改：`apps/dsh-desktop/src/runtime-provider.mjs`
- 修改：`apps/dsh-desktop/src/repair-service.mjs`
- 修改：`apps/dsh-desktop/src/desktop-contract.mjs`
- 修改：`apps/dsh-desktop/src/ipc.mjs`
- 修改：`apps/dsh-desktop/src/preload-recovery.cjs`
- 修改：`apps/dsh-desktop/src/ui/recovery.html`
- 修改：`apps/dsh-desktop/src/ui/recovery.mjs`
- 新建：`apps/dsh-desktop/test/free-mode-policy.test.mjs`
- 新建：`apps/dsh-desktop/test/free-mode-session.test.mjs`
- 新建：`apps/dsh-desktop/test/free-mode-permission-contract.test.mjs`
- 新建：`apps/dsh-desktop/test/external-plugin-source.test.mjs`
- 新建：`apps/dsh-desktop/test/external-plugin-trust-store.test.mjs`
- 新建：`apps/dsh-desktop/test/external-plugin-session.test.mjs`
- 修改：`apps/dsh-desktop/test/recovery-surface.test.mjs`
- 修改：`apps/dsh-desktop/test/runtime-integration.test.mjs`
- 修改：`apps/dsh-desktop/test/runtime-controller.test.mjs`

**步骤 1：先冻结自由模式的用户授权契约。**

定义 `FreeModePolicy`，输入只能是已投影的 Repair State、Runtime admission 结果和 Repair Service 状态；不要把原始异常、路径或 Profile 内容交给 renderer。它必须只返回以下固定动作：

- `open-free-shell`：始终允许；
- `open-free-safe-workbench`：只在 Runtime 身份、包依赖闭包和 loopback admission 全部通过时允许；
- `open-free-full-user`：只在前述 admission 通过、主进程完成原生完整权限确认后允许；
- `use-original-profile-in-full-user-mode`：仅在原 Profile 已成功归档、没有活跃 journal、用户在原生确认页选择“直接使用我的原配置”时允许；
- `approve-external-plugin-source`、`revoke-external-plugin-trust`：只允许 Recovery surface 调用；
- `retry-verified-runtime`：只重试同一已验证 Runtime，不重扫/不改写旧 Profile；
- `verify-installation`、`install-managed-git`、`create-plugin-archive`、`restore-archive`、`continue-approved-migration`：走既有 Repair Plan/确认路径；
- `exit`。

Repair Plan 的自动动作仍拒绝 `force-runtime`、`bypass-integrity` 与 `ignore-active-journal`，因为这些动作没有可执行的可信 Runtime 或会破坏事务；但这不限制用户在 `free-full-user` 里使用自己的 Agent、终端、文件、网络、调度或任意插件。外来插件来源只能由 native 文件/目录选择器、主进程扫描到的既有引用，或用户在本地 Shell 明确输入的文本产生；随后主进程 canonicalize、生成 source ID、展示原生确认。确认后，不再执行 registry、兼容性、发布者、元数据、手改文件或“是否 DSH bundle”的 Desktop 级拦截；由 Runtime 自己尝试加载并把真实失败返回 Shell。唯一仍不可替代的是 Runtime 本体完整性和 Windows 权限边界。Repair UI 的事务句柄只在主进程保存，防止一个网页字符串误写别的 Profile；用户在 Shell 中仍可发起所有同等动作。

**步骤 2：先写策略失败测试。**

覆盖以下矩阵：

1. `migration-blocked`、journal 不可读、Git 缺失、用户插件崩溃均允许 `open-free-shell`；
2. 仅在 verified Runtime + 完整 loader closure 时允许 `open-free-safe-workbench` 与经确认的 `open-free-full-user`；
3. `runtime-integrity-failed`、`packaged-dependency-missing`、未知 Runtime 身份、活跃 journal 一律拒绝临时 Runtime；
4. 所有拒绝结果携带固定 reason code，而不是原始错误文本；
5. Runtime/extension/community sender 不能伪造全权限 grant 或绕过原生确认；用户通过 Shell 发起的完整模式操作可运行全部既有功能。
6. 用户未授权时，外来插件不自动进入工作台；授权后可以选择隔离 Profile 或已归档的原 Profile，且不因 compatibility/source gate 被拒绝；撤销授权后下次启动不再自动装载。

运行：`pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/free-mode-policy.test.mjs test/recovery-surface.test.mjs test/ipc.test.mjs`

**步骤 3：实现 `FreeModeSession`，并把全权限与原资料保全同时做实。**

每个自由会话创建不可预测的 `userData/recovery/free-sessions/<session-id>/` 目录，记录最小 manifest：会话 ID、创建/清理时间、Runtime identity fingerprint、状态、临时 Profile 根、授权范围和结果。该目录必须由 Desktop 主进程创建、权限收紧、原子写入；不得接受 renderer/Agent 指定的目录。默认目标是隔离 Profile；用户选择“直接使用我的原配置”时，必须先创建完整 UserPluginArchive 和 journal，随后把原 Profile 作为明确的、可回滚的启动目标。

主进程构造不可伪造的内部 `RuntimeLaunchSpec`（`normal`、`free-safe`、`free-full-user-staged`、`free-full-user-original` 四种枚举），Runtime Controller/Provider 拒绝 renderer 指定的 Profile、`DSH_HOME`、环境变量、cwd 或 URL。`free-safe` 只传新建临时 Profile，并默认关闭用户插件、Agent 和自动化。两个 `free-full-user` 枚举只可由已签发的主进程 grant 创建：它们不关闭用户插件、外部 link/workspace、安装脚本、Agent/tool runner、后台自动化、Host/browser scheduler、文件、网络或终端能力。`free-full-user-staged` 写会话 Profile；`free-full-user-original` 使用已归档保护的原 Profile。二者均把完整权限限制为当前 Windows 用户已有权限，不能接受 renderer 伪造的路径、环境或 URL。

为落实“用户同意后可自由加载外来插件”，新增四个彼此独立的主进程模块：

1. `ExternalPluginSourceResolver` 接受既有 Profile 的 `file:`/`link:` 引用、用户 native 目录选择的包目录、本地 `.tgz`、workspace 实际目录，以及用户明确输入的 HTTPS/registry archive；把它们解析为私有 `ExternalPluginDescriptor`（candidate ID、来源类型、canonical realpath 或会话缓存、临时安装 spec、内容指纹和 loader 信息）。`workspace:*` 必须先解析到真实目录，不能原样写入临时 Profile。解析只用于定位，不能以 metadata、兼容性或包名把用户确认的来源否决。
2. `FreeModePermissionContract` 只在 native confirmation 成功后，由主进程签发 `full-user` grant；支持本次、按内容和按来源三种授权范围。序列化 JSON 不是授权本身，renderer 伪造相同 JSON 也不能取得权限。
3. `ExternalPluginTrustStore` 只能由主进程写入，保存 candidate/trust ID、来源类型、规范化来源标识、内容指纹、授权范围、用户确认时间、最近结果和可撤销状态；公开 Repair State 仅显示安全 fingerprint 和可信显示名，绝不回显原始路径。
4. `ExternalPluginSession` 在 `free-sessions/<session-id>` 创建独立 DSH Home、Profile、lock 和 `node_modules`，或者在 `free-full-user-original` 中绑定已归档的原 Profile。获得 grant 后，它直接执行批准来源的安装/加载，不调用 registry fetch、compatibility assessment、`reconcileCompatibility()`、安全模式或普通 PluginManager 的来源过滤。DSH 的真实加载错误只改变会话结果，不能删除或重写用户源码。

授权范围固定为：

1. **本次加载：** 仅当前临时会话直接加载该来源；
2. **按内容信任：** 之后仅当内容指纹仍相同才自动加载；内容变化时再次询问；
3. **始终信任此来源：** 面向高级用户，目录内代码变化或同一 HTTPS/registry 来源的后续内容仍自动加载；原生确认必须明确写出“未来修改也会执行”，可随时在 Shell 撤销。

用户确认后，主进程将来源显式写入选定 Profile 的插件清单，直接让 Runtime 读取该来源；不递归复制、归档或修改外部项目。HTTPS archive 只下载到会话缓存并记录内容指纹；若用户确认完整权限，安装脚本也按当前 Windows 用户权限运行。确认文案必须直说“它会运行 Node 代码，可能访问文件、网络、进程、Agent、终端和任务调度”。Desktop 不会把已确认的 Node 插件变成操作系统沙箱，也不会用兼容性检查再次阻断它；不过它不能突破 Windows ACL/UAC，也不能执行缺失或被破坏的 Runtime 本体。对原 Profile 的直接使用必须已有 archive/journal；失败时可从 Shell 回滚。外来插件崩溃时只回到 Shell、记录失败和提供“再次加载/本次禁用/撤销信任”，不得静默删除、隔离或重写用户源码。

退出时只清理临时会话目录；清理失败留下受限审计和下次重试，绝不以清理失败为由删改原资料。若用户要保留临时工作成果，只能选择“导出到用户新选定的位置”或经 Repair Plan 的导入预览；默认不合并。

**步骤 4：把自由模式接入常驻 Shell。**

Shell 中提供四个清楚的、不制造恐慌的入口：

1. **进入修复中心**：任何失败下均可用，显示问题类别、保全范围、回滚、安装验证、日志导出和受限 Agent 建议；
2. **进入安全临时工作台**：仅在策略允许时可用；说明“不会自动加载你的旧插件或修改旧资料”；
3. **开启全权限自由模式**：仅在 Runtime 本体可执行时可用；原生确认后允许插件、Agent、终端、网络、文件、工具与调度完整运行，并让用户选择隔离 Profile 或已归档的原 Profile；
4. **修复后启动原工作区**：只有健康检查、迁移 journal 和插件恢复均成功才出现。

当 Runtime 可执行时，另外提供 **加载我的外来插件**：用户从已有外部引用清单选择、通过 native 文件/目录选择器选取目录或 `.tgz`，或在本地 Shell 输入 `file:`、`link:`、workspace、HTTPS/registry 来源。确认页展示来源类别、内容指纹、授权范围、安装脚本、完整权限范围和“可随时撤销”。用户可选“仅在隔离 Profile 加载”或“直接使用已归档保护的原工作区”；两种方式都无需先把插件转为 Desktop 受管包，也不执行 registry/compatibility 预检查。

`blocked` 迁移、预检异常、Runtime 失败和重复 crash 全部切换到 `free-shell`，不得再走 `dialog.showMessageBox(...退出...)` 或 `app.quit()`。正常 Runtime 崩溃时卸载 Runtime View，保留 Shell，并在 crash ledger 超过预算后默认进入自由模式，而不是自动重启。

**步骤 5：处理迁移与临时会话的交叉边界。**

活跃 migration journal、未验证 snapshot、无法读取的 recovery storage、任何 Profile 写入意图存在时，不允许把同一原 Profile 交给自由 Runtime；Shell 仍保持可用。用户仍可选择隔离的 `free-full-user-staged`，它拥有完整插件/Agent/终端/调度权限，但不会与迁移触碰同一状态；要使用原 Profile 时先继续或回滚 journal。

当用户明确选择“继续已批准迁移”时，先关闭/销毁任何临时 Runtime View，等待会话确认停止，运行受控迁移，完成健康检查后才允许以原工作区启动。迁移失败则回到 `free-shell`，保留 journal/归档和完整操作记录。

**步骤 6：补充集成与打包验证。**

用真实路径夹具验证：

1. 图一的 `blocked` 迁移状态不再退出，Shell 在固定时限内可操作，Profile bytes 未变；
2. 图二的中断 journal 在 Shell 中显示继续/回滚；“稍后处理”进入 `free-shell`，不退出；
3. 手改插件、缺 Git、市场超时、Runtime crash 都能进入自由模式；
4. 安全临时工作台没有原 Profile/插件/Task/调度器引用；全权限隔离会话允许用户选择的插件、Agent、工具和调度，且 Runtime Controller 拒绝任何 renderer 注入的路径或环境；结束后原资料 SHA-256 完全不变；
5. 包依赖缺失和完整性失败只能进入 Shell，不能显示可点击的“强制启动 DSH”；
6. 打包版 Windows smoke 同时覆盖 `free-shell`、`free-safe-workbench`、用户确认的 `free-full-user`、拒绝的损坏 Runtime 和 Runtime View 无伪造修复授权。
7. 对目录、`.tgz`、`file:`/`link:`/workspace、用户确认的 HTTPS/registry 来源依次验证本次加载、按内容信任、内容变更后的重新确认、始终信任来源、撤销授权和插件崩溃回 Shell；每项都证明经过授权时没有 registry/compatibility gate，且原 Profile 与外部来源不会被 Desktop 自动改写。另验证“直接使用原工作区”先归档，写入失败/健康检查失败后恢复原始 manifest、lock、patch 和插件树字节。

运行：

```bash
pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/free-mode-permission-contract.test.mjs test/free-mode-policy.test.mjs test/free-mode-session.test.mjs test/external-plugin-source.test.mjs test/external-plugin-trust-store.test.mjs test/external-plugin-session.test.mjs test/recovery-surface.test.mjs test/runtime-integration.test.mjs test/startup-recovery-coordinator.test.mjs
pnpm --filter @deepseek-ai/dsh-desktop pack:smoke
```

```bash
git add apps/dsh-desktop/src/free-mode-permission-contract.mjs apps/dsh-desktop/src/free-mode-session.mjs apps/dsh-desktop/src/free-mode-policy.mjs apps/dsh-desktop/src/external-plugin-source.mjs apps/dsh-desktop/src/external-plugin-trust-store.mjs apps/dsh-desktop/src/external-plugin-session.mjs apps/dsh-desktop/src/desktop-shell.mjs apps/dsh-desktop/src/startup-recovery-coordinator.mjs apps/dsh-desktop/src/electron-app.mjs apps/dsh-desktop/src/runtime-controller.mjs apps/dsh-desktop/src/runtime-provider.mjs apps/dsh-desktop/src/repair-service.mjs apps/dsh-desktop/src/desktop-contract.mjs apps/dsh-desktop/src/ipc.mjs apps/dsh-desktop/src/preload-recovery.cjs apps/dsh-desktop/src/ui/recovery.html apps/dsh-desktop/src/ui/recovery.mjs apps/dsh-desktop/test/free-mode-permission-contract.test.mjs apps/dsh-desktop/test/free-mode-policy.test.mjs apps/dsh-desktop/test/free-mode-session.test.mjs apps/dsh-desktop/test/external-plugin-source.test.mjs apps/dsh-desktop/test/external-plugin-trust-store.test.mjs apps/dsh-desktop/test/external-plugin-session.test.mjs apps/dsh-desktop/test/recovery-surface.test.mjs apps/dsh-desktop/test/runtime-integration.test.mjs apps/dsh-desktop/test/runtime-controller.test.mjs
git commit -m "feat(desktop): add full-user free mode"
```

### 任务 4：增加跨重启的启动故障预算和分类器

**文件：**

- 新建：`apps/dsh-desktop/src/startup-fault-store.mjs`
- 新建：`apps/dsh-desktop/src/startup-fault-classifier.mjs`
- 新建：`apps/dsh-desktop/test/startup-fault-store.test.mjs`
- 新建：`apps/dsh-desktop/test/startup-fault-classifier.test.mjs`
- 修改：`apps/dsh-desktop/src/runtime-controller.mjs`
- 修改：`apps/dsh-desktop/src/electron-app.mjs`
- 修改：`apps/dsh-desktop/src/startup-diagnostics.mjs`
- 修改：`apps/dsh-desktop/test/runtime-controller.test.mjs`

**步骤 1：先写跨重启失败测试。**

使用临时 `userData` 目录，记录同一 pre-ready 崩溃两次，重新构造 controller/store，断言不会再次 spawn Runtime；模拟稳定 ready 窗口后，断言只有该事件能重置预算。

```js
await store.recordPreReadyFailure({ fingerprint: 'a'.repeat(16), category: 'external-tool-missing' })
await store.recordPreReadyFailure({ fingerprint: 'a'.repeat(16), category: 'external-tool-missing' })
assert.equal((await store.admission()).allowed, false)
```

**步骤 2：增加分类负例。**

断言 `spawn git.exe ENOENT` 是 `external-tool-missing`；`app.asar.unpacked` 下的 `ERR_MODULE_NOT_FOUND` 是 `packaged-dependency-missing`；Profile loader 错误是 `profile-loader-failure`；市场请求超时是 `network-degraded`。所有 host/install 类故障都不得自动隔离用户插件。

**步骤 3：实现持久、受限 ledger。**

将类别、指纹、时间、次数和结果用原子写入存到 `userData/startup-faults/state.json`，设置受限保留；只有 Runtime 稳定运行达到阈值才重置。不可读 ledger 是 Repair State，不得当作新安装。

**步骤 4：接入 admission gate。**

Runtime spawn 前读取 ledger。同一签名重复时转为 `runtime-repair-required`，不得再隐藏重启；用户可通过确认的修复动作显式重试。

**步骤 5：测试并提交。**

运行：`pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/startup-fault-store.test.mjs test/startup-fault-classifier.test.mjs test/runtime-controller.test.mjs`

```bash
git add apps/dsh-desktop/src/startup-fault-store.mjs apps/dsh-desktop/src/startup-fault-classifier.mjs apps/dsh-desktop/src/runtime-controller.mjs apps/dsh-desktop/src/electron-app.mjs apps/dsh-desktop/src/startup-diagnostics.mjs apps/dsh-desktop/test/startup-fault-store.test.mjs apps/dsh-desktop/test/startup-fault-classifier.test.mjs apps/dsh-desktop/test/runtime-controller.test.mjs
git commit -m "feat(desktop): persist startup fault circuit breaker"
```

### 任务 5：把所有 pre-bootstrap 迁移退出改为 Boot Coordinator 状态

**文件：**

- 新建：`apps/dsh-desktop/src/startup-recovery-coordinator.mjs`
- 新建：`apps/dsh-desktop/test/startup-recovery-coordinator.test.mjs`
- 修改：`apps/dsh-desktop/src/electron-app.mjs`
- 修改：`apps/dsh-desktop/src/migration-assistant.mjs`
- 修改：`apps/dsh-desktop/test/migration-preflight.test.mjs`
- 修改：`apps/dsh-desktop/test/migration-assistant.test.mjs`
- 修改：`apps/dsh-desktop/test/packaged-migration-dialog.test.mjs`

**步骤 1：替换旧测试期望。**

把“blocked preflight 在窗口创建前 hard-stop”的断言换成：Recovery Shell 已创建，`profile/bootstrap/runtime` mutation callback 均未执行，投影状态为 `migration-repair-required`。

**步骤 2：覆盖每个阻断条件。**

针对 unknown/conflicting version、不可读或损坏的 profile/task state、blocked Runtime support、plugin/provider 不兼容、journal 损坏和 journal 写入失败，断言：

```js
assert.equal(result.shellVisible, true)
assert.equal(result.runtimeStarted, false)
assert.equal(result.profileMutated, false)
assert.equal(result.repairState.category, 'migration-blocked')
```

**步骤 3：实现 `StartupRecoveryCoordinator`。**

顺序必须固定：创建/显示 Shell；先列 journal 再扫描；活跃 journal 只能经过受控事务恢复；合格的自动迁移先持久化 snapshot/journal；`blocked`、不可读和预检异常全部转成 Repair State，绝不 `dialog + app.quit()`；预检失败后不得二次扫描并猜测新计划。

**步骤 4：保留自动迁移语义。**

`safe` 计划在 Shell 中显示进度并自动运行。`needs-confirmation` 在 Shell 先显示保全范围后，才请求一次原生确认。`blocked` 不启动原工作区的 DSH、不跑迁移，保持 Repair Center 和 `free-shell` 可操作；若 Runtime admission 已通过且没有活跃 journal，用户可进入隔离的 `free-safe-workbench` 或确认后的 `free-full-user-staged`。

**步骤 5：测试并提交。**

运行：`pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/migration-preflight.test.mjs test/migration-assistant.test.mjs test/startup-recovery-coordinator.test.mjs test/packaged-migration-dialog.test.mjs`

```bash
git add apps/dsh-desktop/src/startup-recovery-coordinator.mjs apps/dsh-desktop/src/electron-app.mjs apps/dsh-desktop/src/migration-assistant.mjs apps/dsh-desktop/test/startup-recovery-coordinator.test.mjs apps/dsh-desktop/test/migration-preflight.test.mjs apps/dsh-desktop/test/migration-assistant.test.mjs apps/dsh-desktop/test/packaged-migration-dialog.test.mjs
git commit -m "feat(desktop): route blocked migration to repair shell"
```

### 任务 6：在任何 Profile 写入前创建用户插件原始字节归档

**文件：**

- 新建：`apps/dsh-desktop/src/user-plugin-archive.mjs`
- 新建：`apps/dsh-desktop/test/user-plugin-archive.test.mjs`
- 修改：`apps/dsh-desktop/src/migration-assistant.mjs`
- 修改：`apps/dsh-desktop/src/profile-baseline-quarantine.mjs`
- 修改：`apps/dsh-desktop/src/extensions/plugins.mjs`
- 修改：`apps/dsh-desktop/src/plugin-recovery.mjs`
- 修改：`apps/dsh-desktop/test/plugins.test.mjs`
- 修改：`apps/dsh-desktop/test/profile.test.mjs`
- 修改：`apps/dsh-desktop/test/plugin-recovery.test.mjs`

**步骤 1：先写归档所有权测试。**

夹具必须包含：手改 `index.mjs` 的 Profile 内社区插件；手写 `cordis.patch.yml` 行；带 `scripts`、`pnpm.overrides`、`packageManager` 和自定义 `dsh` 字段的 `package.json`；用户自有 `cordis.yml` 与 `pnpm-workspace.yaml`；manifest 外但在 `node_modules` 的包；指向用户项目的 `file:`/`link:` 包；内容哈希异常的 Desktop-managed 包。

断言 Profile 内文件、manifest、lock、patch、links、workspace 文件和元数据都以 SHA-256 归档。默认断言外部链接目标不被递归读取或复制；若用户后来明确授权直接加载，断言只进行 Runtime 所需的直接模块读取，仍不递归归档、复制或修改外部目标。断言非 Desktop-owned manifest 字段和用户配置字节在迁移/回滚后完全一致，除非它们位于明确划定的 Desktop-managed block。

**步骤 2：写中断与回滚测试。**

在归档后、Profile 迁移前注入失败，原树必须保留；在 restore 中注入失败，归档必须保持完整；完整 restore 后，手改插件字节、链接元数据和 patch 字节必须逐字节一致。

**步骤 3：实现 `UserPluginArchive`。**

目录归档与 `MIGRATION_SNAPSHOT_ENTRIES` 分离，后者仍只保存 raw file state。整棵 Profile-owned `node_modules` 需要隔离时，复用同卷原子 rename 到私有 archive；选择性 Profile 内插件使用内容寻址的 raw-byte archive，记录文件类型和 symlink 元数据。归档 manifest、lock、patch、links、`cordis.yml` 和 `pnpm-workspace.yaml` 时必须先按原始字节保存，再做任何解析。

使用 `intent -> archived -> applied -> committed/rolled-back` 持久事务；read、lstat、归档或 journal 任意失败，都必须在 pnpm、Profile normalizer、安全模式或迁移写入前停止。

**步骤 4：接入所有 mutation 边界。**

`MigrationAssistant` Profile 修改、`PluginManager` 安全模式/兼容性修改、baseline quarantine，以及调用 pnpm 的修复动作都要求成功归档。复用 `DesktopProfileBaselineQuarantine` 的整树 move，不要新写危险的递归 copy。manifest 更新改为 managed-field patch/AST merge：只能修改 Desktop-owned dependency、bundle 和明确的 patch 段；保留未知顶层字段和用户 workspace/configuration 原始字节。如果不能证明 merge 安全，返回 `migration-repair-required`，不得写入。

**步骤 5：测试并提交。**

运行：`pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/user-plugin-archive.test.mjs test/plugins.test.mjs test/profile.test.mjs test/plugin-recovery.test.mjs`

```bash
git add apps/dsh-desktop/src/user-plugin-archive.mjs apps/dsh-desktop/src/migration-assistant.mjs apps/dsh-desktop/src/profile-baseline-quarantine.mjs apps/dsh-desktop/src/extensions/plugins.mjs apps/dsh-desktop/src/plugin-recovery.mjs apps/dsh-desktop/test/user-plugin-archive.test.mjs apps/dsh-desktop/test/plugins.test.mjs apps/dsh-desktop/test/profile.test.mjs apps/dsh-desktop/test/plugin-recovery.test.mjs
git commit -m "feat(desktop): preserve user-modified plugins before repair"
```

### 任务 7：定义安全自动迁移和逐插件恢复策略

**文件：**

- 新建：`apps/dsh-desktop/src/plugin-migration-policy.mjs`
- 新建：`apps/dsh-desktop/test/plugin-migration-policy.test.mjs`
- 修改：`apps/dsh-desktop/src/migration-assistant.mjs`
- 修改：`apps/dsh-desktop/src/migration-task-ledger.mjs`
- 修改：`apps/dsh-desktop/src/plugin-recovery.mjs`
- 修改：`apps/dsh-desktop/test/migration-runtime-matrix.test.mjs`
- 修改：`apps/dsh-desktop/test/migration-task-ledger.test.mjs`
- 修改：`apps/dsh-desktop/test/plugin-recovery.test.mjs`

**步骤 1：写策略分类测试。**

每个插件只能属于以下一个类别：

```text
managed-safe
registry-pinned-stageable
profile-custom-preserve
external-reference-preserve
external-user-approved-load
modified-managed-preserve
incompatible-isolate
unknown-review
```

只有 `managed-safe` 可以自动改写。锁定版本的 registry 包可以重建，但保持禁用直到健康检查；修改过或外部引用的插件只归档、保留，绝不自动覆盖。`external-user-approved-load` 不是自动迁移类别：只有用户在 Shell 选择并确认来源后，才可在 `free-full-user-staged` 或已归档保护的原 Profile 中直接加载；不要求将它转为受管包，也不因崩溃而自动删除。

**步骤 2：增加真实迁移夹具。**

为 2.3 至 2.7 的真实 Profile 路径构造手改插件、Task/Run/Evidence、custom patch、兼容插件、不兼容插件和外部链接。只要保全字节或外部目标被 Desktop 改写，safe migration 必须失败；用户主动授权的外部插件则必须能在临时工作台直接加载，且不会被递归复制或写回原 Profile。

**步骤 3：实现 journal 步骤。**

扩展 journal：

```text
capture-user-plugin-archive
normalize-desktop-managed-profile
stage-known-good-runtime-tree
migrate-task-ledger
restore-and-health-check-one-plugin-at-a-time
commit-or-rollback
```

迁移 worker 必须关闭后台调度。活跃 journal 期间不得启动正常 DSH Web。第一个插件健康检查失败时，将该插件恢复到 archive/isolation，保留无关插件，只有策略允许才继续。

**步骤 4：增加恢复控制。**

每个插件状态为 `preserved`、`staged`、`enabled`、`incompatible`、`restore-failed` 或 `externally-trusted`。用户可选“恢复原始字节”“保持隔离”“修复后重试”“本次直接加载”“按内容信任”“始终信任此来源”“长期挂入原工作区”“撤销外来信任”；只有“恢复原始字节”会从 raw archive 写回；“长期挂入原工作区”必须走独立 archive/journal 事务，其余外来信任只影响临时启动清单。

**步骤 5：测试并提交。**

运行：`pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/plugin-migration-policy.test.mjs test/migration-task-ledger.test.mjs test/migration-runtime-matrix.test.mjs test/plugin-recovery.test.mjs`

```bash
git add apps/dsh-desktop/src/plugin-migration-policy.mjs apps/dsh-desktop/src/migration-assistant.mjs apps/dsh-desktop/src/migration-task-ledger.mjs apps/dsh-desktop/src/plugin-recovery.mjs apps/dsh-desktop/test/plugin-migration-policy.test.mjs apps/dsh-desktop/test/migration-task-ledger.test.mjs apps/dsh-desktop/test/migration-runtime-matrix.test.mjs apps/dsh-desktop/test/plugin-recovery.test.mjs
git commit -m "feat(desktop): automate safe migration and stage custom plugins"
```

### 任务 8：增加事务化 Repair Service

**文件：**

- 新建：`apps/dsh-desktop/src/repair-service.mjs`
- 新建：`apps/dsh-desktop/test/repair-service.test.mjs`
- 修改：`apps/dsh-desktop/src/ipc.mjs`
- 修改：`apps/dsh-desktop/src/electron-app.mjs`
- 修改：`apps/dsh-desktop/src/startup-diagnostics.mjs`
- 修改：`apps/dsh-desktop/test/ipc.test.mjs`
- 修改：`apps/dsh-desktop/test/startup-diagnostics.test.mjs`

**步骤 1：先写动作 admission 测试。**

服务必须拒绝未知动作、路径、命令、URL、并发重复请求、缺失原生确认、缺失 archive 和无效健康检查。初始 action ID 只允许：

```text
install-managed-git
verify-installation
download-desktop-update
enter-safe-mode
restore-plugin-snapshot
restore-baseline
retry-runtime
continue-migration
rollback-migration
approve-external-plugin-trust
revoke-external-plugin-trust
attach-external-plugin-to-original-profile
```

**步骤 2：写 transaction rollback 测试。**

让每个写入动作的 health check 失败，断言 archive/journal 回滚、audit 记为 `rolled-back`。`verify-installation` 和 `export-diagnostics` 是只读操作，不需要 snapshot。外来插件信任动作必须验证 native source selection、信任范围和撤销；本次/按内容/始终信任只改变 Desktop-owned trust store/临时会话清单，不得写入原 Profile 或外部插件目录；“长期挂入原工作区”必须先归档并在失败时完整 rollback。

**步骤 3：实现主进程队列和审计。**

使用一个 main-process queue。原子写 audit，只记录 action ID、Repair State fingerprint、时间、前置条件、确认结果、健康检查和回滚结果；不得记录原始日志、源码、项目路径、prompt 或插件代码。

**步骤 4：连接 Recovery-only IPC。**

Recovery surface 获取投影 plan 并请求具体动作；主进程显示原生确认并执行 `RepairService`。renderer 不得控制 command、path、package 名称或 URL。

**步骤 5：测试并提交。**

运行：`pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/repair-service.test.mjs test/ipc.test.mjs test/startup-diagnostics.test.mjs`

```bash
git add apps/dsh-desktop/src/repair-service.mjs apps/dsh-desktop/src/ipc.mjs apps/dsh-desktop/src/electron-app.mjs apps/dsh-desktop/src/startup-diagnostics.mjs apps/dsh-desktop/test/repair-service.test.mjs apps/dsh-desktop/test/ipc.test.mjs apps/dsh-desktop/test/startup-diagnostics.test.mjs
git commit -m "feat(desktop): add auditable repair transactions"
```

### 任务 9：增加经确认的 Desktop 受管 Portable Git

**文件：**

- 新建：`apps/dsh-desktop/src/managed-git.mjs`
- 新建：`apps/dsh-desktop/src/managed-git-policy.mjs`
- 新建：`apps/dsh-desktop/runtime-support/managed-git.json`
- 新建：`apps/dsh-desktop/test/managed-git.test.mjs`
- 修改：`apps/dsh-desktop/src/electron-app.mjs`
- 修改：`apps/dsh-desktop/src/runtime-controller.mjs`
- 修改：`apps/dsh-desktop/electron-builder.yml`
- 修改：`apps/dsh-desktop/scripts/verify-package.mjs`
- 修改：`apps/dsh-desktop/test/runtime-controller.test.mjs`
- 修改：`apps/dsh-desktop/test/runtime-integrity.test.mjs`
- 修改：`apps/dsh-desktop/test/packaged-smoke-runner.test.mjs`

**步骤 1：写坏 manifest 和不安全 archive 测试。**

覆盖不支持的平台、非 HTTPS/未知 host、非法版本、缺 SHA-256、archive root 不符、zip-slip、symlink entry、额外可执行文件、缺 `cmd/git.exe`、hash 不符、`git --version` 失败、中断下载和并发安装。

**步骤 2：实现 data-only pinned manifest。**

`managed-git.json` 包含 Windows x64 archive 的版本、允许的 HTTPS host、大小上限、SHA-256、archive root 和预期 `cmd/git.exe`。renderer 和 Agent 不得提供该数据。为 manifest 增加发布期校验。

**步骤 3：实现 `ManagedGitManager`。**

用仅 argv 的 spawn 和 timeout 探测 system Git。用户确认后，下载 pinned ZIP 到 staging，流式校验 SHA-256、验证 entries、原子解压至 `userData/managed-tools/git/<version>`、运行预期 `git --version`，最后才激活。任何错误清理 staging。不得执行下载的 installer/SFX，不得改全局 PATH/registry，不得请求 UAC。

**步骤 4：只注入已验证的 command 目录。**

以 `runtime-controller.mjs` 的环境构造为唯一注入点。优先 verified system Git；否则只把 verified managed Git command directory 加入 Runtime child PATH。Git Graph 自身只做优雅降级，不下载任何东西。

**步骤 5：打包和测试并提交。**

将 `managed-git.json` 作为 extra resource。`verify-package.mjs` 断言资源被复制、能解析且 digest 符合预期。

运行：`pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/managed-git.test.mjs test/runtime-controller.test.mjs test/runtime-integrity.test.mjs test/packaged-smoke-runner.test.mjs`

```bash
git add apps/dsh-desktop/src/managed-git.mjs apps/dsh-desktop/src/managed-git-policy.mjs apps/dsh-desktop/runtime-support/managed-git.json apps/dsh-desktop/src/electron-app.mjs apps/dsh-desktop/src/runtime-controller.mjs apps/dsh-desktop/electron-builder.yml apps/dsh-desktop/scripts/verify-package.mjs apps/dsh-desktop/test/managed-git.test.mjs apps/dsh-desktop/test/runtime-controller.test.mjs apps/dsh-desktop/test/runtime-integrity.test.mjs apps/dsh-desktop/test/packaged-smoke-runner.test.mjs
git commit -m "feat(desktop): add verified managed git repair"
```

### 任务 10：增加修复 Agent 与全权限用户 Agent 两条路径

**文件：**

- 新建：`apps/dsh-desktop/src/repair-agent-adapter.mjs`
- 新建：`apps/dsh-desktop/test/repair-agent-adapter.test.mjs`
- 修改：`apps/dsh-desktop/src/repair-service.mjs`
- 修改：`apps/dsh-desktop/src/ui/recovery.html`
- 修改：`apps/dsh-desktop/src/ui/recovery.mjs`
- 修改：`apps/dsh-desktop/src/ipc.mjs`
- 修改：`apps/dsh-desktop/test/repair-service.test.mjs`
- 修改：`apps/dsh-desktop/test/ipc.test.mjs`

**步骤 1：写两条 Agent 路径的边界测试。**

向预启动 Repair Adapter 输入含 Shell command、路径、URL、未知动作、私有数据和过多动作的模型响应，必须拒绝；合法 typed Repair Plan 只能排序/解释已有 action ID。另为 `free-full-user` 写测试：已签发的主进程 grant 会让用户主动启动的 Agent 获得当前 Windows 用户已有的 shell、文件、网络、终端、工具与调度能力；未确认、伪造或已撤销 grant 时不得启动该 Agent。

**步骤 2：实现脱敏 `RepairBrief`。**

输入只来自 Repair State、插件 archive inventory hash、兼容性、迁移 journal、managed Git 状态和安装验证结果；不包含源码、Profile 文件、私有路径、密钥、对话、session history、tool call 或项目内容。

**步骤 3：实现 adapter 与完整用户 Agent 行为。**

Runtime 不可用时的 adapter 可不存在、可本地、也可使用用户选择的 Agent 连接；它接收 `RepairBrief`，返回 schema-validated `RepairPlan`，没有执行通道。Runtime 不可用时不能依赖普通 DSH Agent；本地 fallback 只能解释确定性 Repair Service 推荐，不依赖网络。Runtime 可执行且用户确认 `free-full-user` 后，用户可以启动自己的 DSH Agent，它不继承 Repair Adapter 的限制，而是获得用户确认的当前 OS 用户工具权限；对原 Profile 的写入仍通过已存在的 archive/journal 包裹，以便用户回滚。

**步骤 4：支持用户插件 bug 修复与可回滚源码修改。**

未确认完整权限时，保留单独确认流程：导出或 stage archive 中的插件副本；Repair Adapter 返回 unified diff 和测试说明；展示 diff 与受影响 archive 文件；仅当用户点“应用 staged patch”时，以事务写入 staged archive copy。已确认 `free-full-user` 时，用户的 Agent 可以直接修改用户选择的插件/项目，因为这正是用户授予的权限；Desktop 仍在启动前保全已选择的原 Profile/插件树，并提供“恢复到进入自由模式前”的回滚入口。

**步骤 5：测试并提交。**

运行：`pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/repair-agent-adapter.test.mjs test/repair-service.test.mjs test/ipc.test.mjs`

```bash
git add apps/dsh-desktop/src/repair-agent-adapter.mjs apps/dsh-desktop/src/repair-service.mjs apps/dsh-desktop/src/ui/recovery.html apps/dsh-desktop/src/ui/recovery.mjs apps/dsh-desktop/src/ipc.mjs apps/dsh-desktop/test/repair-agent-adapter.test.mjs apps/dsh-desktop/test/repair-service.test.mjs apps/dsh-desktop/test/ipc.test.mjs
git commit -m "feat(desktop): constrain agent-assisted repair plans"
```

### 任务 11：在 DSH loader 启动前发现安装包依赖闭包损坏

**文件：**

- 新建：`apps/dsh-desktop/src/runtime-installation-health.mjs`
- 新建：`apps/dsh-desktop/test/runtime-installation-health.test.mjs`
- 新建：`apps/dsh-desktop/scripts/verify-packaged-loader-closure.mjs`
- 新建：`apps/dsh-desktop/test/packaged-loader-closure.test.mjs`
- 修改：`apps/dsh-desktop/src/electron-app.mjs`
- 修改：`apps/dsh-desktop/scripts/verify-package.mjs`
- 修改：`apps/dsh-desktop/scripts/verify-packaged-smoke.mjs`
- 修改：`apps/dsh-desktop/package.json`
- 修改：`.github/workflows/desktop-release.yml`

**步骤 1：写与真实日志一致的失败分类测试。**

构造缺 `zod`、`yaml`、`ws`、`undici` 或 TypeBox leaf 的 `resources/app.asar.unpacked/node_modules` Runtime。断言结果为 `packaged-dependency-missing`，Repair Shell 可用，DSH 不启动，Profile/plugin archive 字节不变。

**步骤 2：实现只读 health check。**

loader 启动前验证 expected Runtime manifests 和关键文件；包失败不能尝试修复 Profile，而是提供 `verify-installation` 和已确认的更新/修复动作。

**步骤 3：增加打包产物的 transitive-loader closure gate。**

在受限子进程枚举真实启用的 loader entry，并验证它们在打包 Runtime layout 中可 resolve/import。顶层包存在绝不等于依赖健康。CI 输出只保留标识/数量，不含用户数据。

**步骤 4：接入发布门禁。**

添加 `test:packaged-loader-closure`，在 release workflow 的 `pack:verify:dir` 后运行；任何 loader 或 transitive dependency 缺失都阻止发布。

**步骤 5：测试并提交。**

运行：`pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/runtime-installation-health.test.mjs test/packaged-loader-closure.test.mjs && pnpm --filter @deepseek-ai/dsh-desktop run pack:verify:dir && pnpm --filter @deepseek-ai/dsh-desktop run test:packaged-loader-closure`

```bash
git add apps/dsh-desktop/src/runtime-installation-health.mjs apps/dsh-desktop/scripts/verify-packaged-loader-closure.mjs apps/dsh-desktop/src/electron-app.mjs apps/dsh-desktop/scripts/verify-package.mjs apps/dsh-desktop/scripts/verify-packaged-smoke.mjs apps/dsh-desktop/package.json apps/dsh-desktop/test/runtime-installation-health.test.mjs apps/dsh-desktop/test/packaged-loader-closure.test.mjs .github/workflows/desktop-release.yml
git commit -m "test(desktop): gate packaged loader dependency closure"
```

### 任务 12：让市场和可选集成严格后台降级

**文件：**

- 修改：通过 `rg -n "catalog fetch failed"` 定位的 market fetch owner
- 修改：`apps/dsh-desktop/src/electron-app.mjs`
- 新建或修改：market owner 的 retry-policy 测试文件
- 修改：`apps/dsh-desktop/test/runtime-integration.test.mjs`

**步骤 1：写启动隔离失败测试。**

模拟两次 30 秒 catalog timeout，断言 Shell 和 Runtime admission 不受影响，fatal startup fault 不增加，同一时间最多一个 catalog fetch。

**步骤 2：实现合并和后台重试。**

catalog refresh 移到 Shell 可用和 Runtime ready 之后；使用共享请求、受限 timeout、带 jitter 的重试、关闭时取消；只有用户实际需要市场功能时才显示 `network-degraded`。

**步骤 3：测试并提交。**

先运行步骤 1 定位出的包测试，再运行：`pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/runtime-integration.test.mjs`

```bash
git add <market-owner-files> apps/dsh-desktop/src/electron-app.mjs apps/dsh-desktop/test/runtime-integration.test.mjs
git commit -m "fix(market): decouple catalog retries from desktop startup"
```

### 任务 13：完成 Recovery Shell UX、诊断与插件恢复控制

**文件：**

- 修改：`apps/dsh-desktop/src/ui/recovery.html`
- 修改：`apps/dsh-desktop/src/ui/recovery.css`
- 修改：`apps/dsh-desktop/src/ui/recovery.mjs`
- 修改：`apps/dsh-desktop/src/startup-diagnostics.mjs`
- 修改：`apps/dsh-desktop/test/recovery-surface.test.mjs`
- 修改：`apps/dsh-desktop/test/startup-diagnostics.test.mjs`

**步骤 1：写 visual-state 失败测试。**

每个 Repair State 都必须有真实可操作动作，不能只显示假进度或 exit-only dialog。`migration-blocked` 时，“继续迁移”必须不可见/禁用；“进入自由模式”“导出诊断”“查看修复计划”“重新验证”“退出”必须可用。只有策略批准时才显示“进入临时工作台”；包完整性失败时不得显示“强制启动”。

**步骤 2：显示插件保全 inventory。**

仅当可信元数据已有 display name 才显示名称，否则显示通用 preserved-item ID。显示 source kind、archive 状态、hash fingerprint、兼容性结果和恢复选择；默认不显示原始路径或源码。

**步骤 3：补齐确认文案。**

managed Git、下载更新、restore、staged plugin enable 和 staged patch application 都要展示具体动作、数据范围、回滚能力和 post-action health check。确认绝不出现在 Runtime View 或 Agent response。

**步骤 4：扩充诊断隐私夹具。**

导出包含类别、指纹和 action audit，但不包含插件源码、patch bytes、prompt/session/tool output、私有路径、key 或 URL credential。

**步骤 5：测试并提交。**

运行：`pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/recovery-surface.test.mjs test/startup-diagnostics.test.mjs`

```bash
git add apps/dsh-desktop/src/ui/recovery.html apps/dsh-desktop/src/ui/recovery.css apps/dsh-desktop/src/ui/recovery.mjs apps/dsh-desktop/src/startup-diagnostics.mjs apps/dsh-desktop/test/recovery-surface.test.mjs apps/dsh-desktop/test/startup-diagnostics.test.mjs
git commit -m "feat(desktop): make repair center actionable and private"
```

### 任务 14：运行真实迁移与修复验收矩阵

**文件：**

- 新建：`apps/dsh-desktop/test/fixtures/repair-shell/`
- 新建：`apps/dsh-desktop/test/repair-shell-matrix.test.mjs`
- 新建：`apps/dsh-desktop/scripts/verify-packaged-repair-shell.mjs`
- 修改：`apps/dsh-desktop/test/packaged-migration-matrix.test.mjs`
- 修改：`apps/dsh-desktop/package.json`
- 修改：`.github/workflows/desktop-release.yml`
- 修改：`docs/upgrade-and-rollback.md`
- 修改：`docs/desktop.md`
- 修改：`docs/security-boundaries.md`
- 修改：`docs/runtime-support-policy.md`
- 修改：`docs/launch/release-notes.template.md`
- 修改：`CHANGELOG.md`

**步骤 1：建立精确夹具覆盖。**

为 Desktop 2.3、2.4、2.5、2.6、2.7 建立真实 Profile 路径夹具，并包含：clean safe migration、手改 Profile 内插件、custom patch、不兼容插件、external link、interrupted journal、Git 缺失、包依赖缺失、blocked version state、不可读状态和 market timeout；每类都覆盖 `free-shell`，在可信 Runtime 条件下覆盖 `free-safe-workbench` 和已确认的 `free-full-user`。

**步骤 2：写矩阵断言。**

每个夹具必须断言：

1. Shell 在 Runtime 工作前可见；
2. 原始 manifest/lock/patch/custom-plugin 字节可保全和恢复；
3. 外部链接项目不被复制或修改；用户授权后可在临时 Profile 直接加载，撤销后停止加载；
4. 只有策略允许的安全迁移自动完成；
5. blocked migration 进入 Repair Center，不自动退出；
6. Runtime/package/Git 失败不会删除用户插件，也不会无限重启；
7. rollback 恢复精确归档状态。
8. 自由工作台从不挂载原 Profile、原插件、Task ledger 或外部链接，结束后原资料哈希不变；
9. 被篡改 Runtime 或缺失传递依赖时，仍可进入 Shell，但不能启动临时 DSH；
10. Runtime View 调用 Repair、迁移、更新或插件 mutation IPC 一律被拒绝。
11. 用户授权的未知/不兼容外来插件不再被 registry/compatibility gate 阻止；只有不具备最小 bundle 结构、冒用受管核心包名或 Runtime/包自身不可信时拒绝，并始终回到 Shell 而非退出。

**步骤 3：增加打包 E2E。**

使用签名/unpacked Desktop 二进制运行每个夹具。只通过受批准的可见原生 UI 自动化驱动确认；不得增加 release binary 通过环境变量绕过确认的机制。失败夹具必须看到 Recovery Shell，只有 Runtime ready 后才能嵌入 DSH。

**步骤 4：增加 CI 门禁。**

添加 `test:repair-shell:e2e`，在 `pack:verify:dir` 后运行。release workflow 对同一产物运行 migration matrix、loader closure、recovery-shell matrix、package verify 和普通 packaged smoke。

**步骤 5：更新面向用户文档。**

文档必须说明：安全自动迁移政策；保全保证和边界；Recovery Shell 与自由模式的差别；用户授权外来插件可直接加载的范围（本次/按内容/始终信任来源）、Node 代码风险与撤销入口；何时可进入临时工作台、何时只能修复安装；Git/download/restore 的明确确认；Agent 限制；不静默安装系统组件；诊断导出与回滚。不允许声称可绕过 Desktop/Runtime 本身完整性门禁。

**步骤 6：最终验证。**

运行：

```bash
pnpm --filter @deepseek-ai/dsh-desktop test
pnpm --filter @deepseek-ai/dsh-desktop run pack:dir
pnpm --filter @deepseek-ai/dsh-desktop run pack:verify:dir
pnpm --filter @deepseek-ai/dsh-desktop run test:migration-matrix:e2e
pnpm --filter @deepseek-ai/dsh-desktop run test:packaged-loader-closure
pnpm --filter @deepseek-ai/dsh-desktop run test:repair-shell:e2e
pnpm docs:check
pnpm verify
```

预期：全部通过；任何失败路径都不能只留“退出”弹窗，也不能修改未归档的自定义插件状态。

**步骤 7：提交。**

```bash
git add apps/dsh-desktop/test/fixtures/repair-shell apps/dsh-desktop/test/repair-shell-matrix.test.mjs apps/dsh-desktop/scripts/verify-packaged-repair-shell.mjs apps/dsh-desktop/test/packaged-migration-matrix.test.mjs apps/dsh-desktop/package.json .github/workflows/desktop-release.yml docs/upgrade-and-rollback.md docs/desktop.md docs/security-boundaries.md docs/runtime-support-policy.md docs/launch/release-notes.template.md CHANGELOG.md
git commit -m "test(desktop): gate repair shell and custom plugin recovery"
```

## 四、发布与支持策略

1. 在默认开启自动迁移前先发布 Recovery Shell 和自由模式。任何损坏的 2.x 状态都必须在 coordinator 运行前拥有非破坏性入口；可信 Runtime 可在临时隔离工作台中使用，包完整性失败则至少保持离线 Shell 可用。
2. 首发仅对 `managed-safe` 默认自动迁移，并在 Shell 中可见插件 staging。`profile-custom-preserve`、`external-reference-preserve`、`modified-managed-preserve`、`unknown-review` 不自动改写；其中外来来源在用户明确授权后可立即进入 `free-full-user-staged` 加载，或在 archive/journal 完整时直接使用原工作区，而非被永久拦截。
3. 受管 Git catalog 必须是审核过的 pinned artifact。Git 下载失败永远不能阻止 Desktop 或迁移。
4. Runtime 不可用时的 Repair Adapter 首先 opt-in 发布，只能推荐可回滚计划；用户在 `free-full-user` 中启动的 Agent 则按该用户确认的完整工具权限工作，源码 patch/原 Profile 写入仍由 archive/journal 提供回滚。
5. 只有用户启用时才收集隐私安全的修复结果聚合数据；默认诊断留在本地且由用户主动导出。
6. 对现有 2.7 用户，支持流程必须区分缺 Git 和安装包依赖丢失。包闭包损坏时不得建议删除 Profile 数据，应使用验证过的 repair installer/update 路径。

## 五、完成定义

- 不再存在“迁移、Runtime、Git、安装包或 Profile 启动失败后，唯一响应是 `dialog.showMessageBox(... buttons: ['退出'])`”的路径。
- 本地 Shell 在 DSH 启动前可见，且 Runtime 失败后仍然可用。
- 每个阻断状态都可以进入 `free-shell`；在 Runtime/包可信且无活跃迁移事务时，用户还可进入 `free-safe-workbench`，或经原生确认进入全权限的 `free-full-user`。
- 用户一次明确授权后，可直接在全权限会话加载未知、手改、`file:`/`link:`/workspace、目录、归档或用户选择的远程外来插件；支持本次、按内容和始终信任来源，并可撤销。用户也可在 archive/journal 保护下直接使用原工作区。
- 不存在“强制启动被篡改 Runtime”的后门。全权限会话不会越过 Windows ACL/UAC；对原 Profile 的使用必须有 archive/journal，并由主进程事务协调。Runtime 页面不能伪造修复授权或把写入指向未选择的 Profile，但用户能通过 Shell 发起全部同等操作。
- 同一 pre-ready 故障跨应用重启不会形成无限循环。
- 每次自动迁移在 mutation 前都创建并验证持久 journal 和用户插件原始字节归档。
- Profile 内手改插件在成功、修复失败、中断、安全模式和 rollback 后可逐字节恢复。
- 用户拥有的 `package.json` 字段、`cordis.yml` 和 `pnpm-workspace.yaml` 保持逐字节一致，除非明确属于 Desktop-managed block。
- 外部项目链接只按引用保留，绝不自动递归复制或修改。
- Git 安装经过验证、按用户私有目录安装、可选、可回滚，不改变系统范围配置。
- Runtime 不可用时的 Repair Adapter 输出经过 schema 校验，不能执行任意命令、路径、URL 或写入；用户在全权限自由模式中主动运行的 Agent 则按用户所授的当前 OS 权限执行。
- 打包依赖缺失夹具进入 Repair Center 且不改 Profile，CI 在发布前拒绝该产物。
