# Desktop Direct Load and Automatic Repair Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 Desktop 3.0.1 的启动恢复壳和全局迁移准入替换为零点击直接启动；完整 Profile 真实失败后，自动调用用户已配置模型修复用户插件或配置，验证失败则回滚并以同一 `DSH_HOME` 的内置 Profile 进入应用。

**Architecture:** Electron main 只协调三套同 Home Profile：原 `desktop`、一次性 `desktop-repair` 和 Desktop 管理的 `desktop-builtins`。数据兼容由各存储宽容读取；Repair Agent 运行在新的 host-only DSH bundle 中，通过受限 job 目录和事务候选副本与 Electron 通信，使用默认模型、有限备用模型、故障指纹预算、候选启动探针和原子回滚。

**Tech Stack:** Electron 43、Node ESM、TypeScript、Cordis/DSH 公共 SDK、`@deepseek-ai/dsh-agent`、`@deepseek-ai/dsh-agent-default-model`、Node test runner、Vitest、Playwright、pnpm workspace、electron-builder、electron-updater。

---

## 实施约束

每个任务先写失败测试，再写最小实现，再运行列出的定向测试，最后只提交该任务涉及的文件；任何一次提交都不能把迁移 gate 替换成新的模态选择界面。

实现过程中不得修改 DSH 官方包源码，所有 Agent 和工具扩展通过新 `dsh-` bundle 或 Desktop app 自己的公开集成完成。

正常 Profile 的用户依赖、bundle、patch、未知 manifest 字段、外部链接和原会话存储必须保留；测试中不得用人为添加的 `desktopVersion` 或 `version` 字段伪造历史版本事实。

Repair Agent 的自动写入权限以已确认设计为准：可以自动修改故障相关用户插件和 Profile 配置，但只能先改候选副本并通过验证；程序二进制只交给更新器。

## Task 1: 冻结零点击启动状态机

**Files:**

- Create: `apps/dsh-desktop/src/direct-startup-policy.mjs`
- Create: `apps/dsh-desktop/test/direct-startup-policy.test.mjs`
- Modify: `apps/dsh-desktop/src/repair-state.mjs`
- Modify: `apps/dsh-desktop/src/product-metrics.mjs`
- Modify: `apps/dsh-desktop/src/telemetry-events.mjs`
- Modify: `apps/dsh-desktop/test/repair-state.test.mjs`
- Modify: `apps/dsh-desktop/test/product-metrics.test.mjs`
- Modify: `apps/dsh-desktop/test/telemetry-events.test.mjs`

**Step 1: 写失败测试。**

覆盖新 Home、已有 Home、完整启动失败、模型未配置、候选修复成功、候选修复失败、同指纹预算耗尽和安装损坏；断言健康路径只返回 `start-full`，插件故障链只能按 `retry-full -> repair -> verify -> start-full/start-builtins` 变化，安装损坏只能返回 `repair-installation`。同时冻结 `direct_start_ready`、`full_start_failed`、`repair_agent_started`、`repair_agent_succeeded`、`repair_agent_failed`、`builtins_fallback_ready` 和 `installation_repair_required` 的固定 outcome/detail/bucket 维度。

```js
test('a healthy launch has no migration or recovery decision', () => {
  assert.deepEqual(nextDirectStartupAction({ installation: 'healthy', fullAttempts: 0 }), {
    type: 'start-full',
    profileName: 'desktop',
  })
})
```

**Step 2: 运行测试并确认失败。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/direct-startup-policy.test.mjs test/repair-state.test.mjs test/product-metrics.test.mjs test/telemetry-events.test.mjs`

Expected: FAIL，因为 `direct-startup-policy.mjs` 尚不存在，旧 Repair State 仍把迁移、Free Mode 和按钮动作作为主状态。

**Step 3: 实现有限状态机。**

导出固定 action 枚举、纯函数 `nextDirectStartupAction()` 和公开进度投影；公开投影只包含 `preparing`、`starting-full`、`retrying-full`、`repairing`、`verifying`、`ready-full`、`ready-builtins`、`installation-repair-required`，不包含迁移选择、safe mode 选择和 raw error。`ProductMetricsRecorder` 增加对应的固定枚举方法，调用方只能传阶段类别、结果类别和耗时 bucket，不接收原始错误、插件名、模型提示、文件路径、会话内容、provider key 或源码。

```js
export function nextDirectStartupAction(state) {
  if (state.installation !== 'healthy') return Object.freeze({ type: 'repair-installation' })
  if (state.fullAttempts === 0) return Object.freeze({ type: 'start-full', profileName: 'desktop' })
  if (state.fullAttempts === 1) return Object.freeze({ type: 'retry-full', profileName: 'desktop' })
  if (state.repairBudget === 'available') return Object.freeze({ type: 'repair' })
  return Object.freeze({ type: 'start-builtins', profileName: 'desktop-builtins' })
}
```

**Step 4: 运行测试并提交。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/direct-startup-policy.test.mjs test/repair-state.test.mjs test/product-metrics.test.mjs test/telemetry-events.test.mjs`

```bash
git add apps/dsh-desktop/src/direct-startup-policy.mjs apps/dsh-desktop/src/repair-state.mjs apps/dsh-desktop/src/product-metrics.mjs apps/dsh-desktop/src/telemetry-events.mjs apps/dsh-desktop/test/direct-startup-policy.test.mjs apps/dsh-desktop/test/repair-state.test.mjs apps/dsh-desktop/test/product-metrics.test.mjs apps/dsh-desktop/test/telemetry-events.test.mjs
git commit -m "feat(desktop): define zero-click startup policy"
```

## Task 2: 从正常启动链移除 Recovery Shell 和迁移 gate

**Files:**

- Modify: `apps/dsh-desktop/src/electron-app.mjs`
- Modify: `apps/dsh-desktop/src/ui/startup.html`
- Modify: `apps/dsh-desktop/src/ui/startup.mjs`
- Modify: `apps/dsh-desktop/test/startup-recovery-boundary.test.mjs`
- Modify: `apps/dsh-desktop/test/free-mode-electron-integration.test.mjs`
- Modify: `apps/dsh-desktop/test/migration-preflight.test.mjs`
- Modify: `apps/dsh-desktop/test/startup-surface.test.mjs`

**Step 1: 把源码顺序测试改成新契约。**

删除“必须先创建 Recovery Shell”的断言，新增“主窗口启动页先创建、正常路径不调用 `showStartupRecoveryShell()`、`preflightDesktopMigrationGate()` 不在 app bootstrap 中调用”的断言；保留 `preflightDesktopMigrationGate()` 自身的历史单元测试，直到 Task 12 清理死代码。

```js
test('Electron starts the normal surface without a migration admission gate', async () => {
  const source = await readFile(new URL('../src/electron-app.mjs', import.meta.url), 'utf8')
  const bootstrap = source.slice(source.indexOf('export async function startElectronApp'))
  assert.doesNotMatch(bootstrap, /await showStartupRecoveryShell\(\)/u)
  assert.doesNotMatch(bootstrap, /preflightDesktopMigrationGate\(/u)
})
```

**Step 2: 运行测试并确认失败。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/startup-recovery-boundary.test.mjs test/free-mode-electron-integration.test.mjs test/migration-preflight.test.mjs test/startup-surface.test.mjs`

Expected: FAIL，因为当前第一个窗口仍是 Recovery Shell，且 bootstrap 会调用迁移 preflight。

**Step 3: 实现直接 bootstrap。**

在 `app.whenReady()` 后直接创建现有启动页 BrowserWindow，删除无条件 `await showStartupRecoveryShell()` 和 `runStartupAfterRecoveryShell()` 包裹；移除 `MigrationAssistant.planMigration()`、自动 journal 创建/确认/推进和迁移失败 return 分支对正常启动的控制权。

保留 `MigrationAssistant`、旧 Recovery UI 和 journal 文件读取代码作为高级诊断兼容资产，但不能由普通 bootstrap 调用，也不能创建可见窗口；安装文件不可用时复用普通启动页展示 `installation-repair-required`，而不是创建第二个恢复窗口。

**Step 4: 删除启动页的决策按钮。**

`startup.html` 和 `startup.mjs` 只显示状态、进度和非阻塞故障摘要；删除启动页上的 `repair`、`safe-mode`、`upgrade-migration`、`enter-free-mode` 等 action 点击处理，诊断导出入口移到 Task 9 的高级设置。

**Step 5: 运行测试并提交。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/startup-recovery-boundary.test.mjs test/free-mode-electron-integration.test.mjs test/migration-preflight.test.mjs test/startup-surface.test.mjs test/startup-progress.test.mjs`

```bash
git add apps/dsh-desktop/src/electron-app.mjs apps/dsh-desktop/src/ui/startup.html apps/dsh-desktop/src/ui/startup.mjs apps/dsh-desktop/test/startup-recovery-boundary.test.mjs apps/dsh-desktop/test/free-mode-electron-integration.test.mjs apps/dsh-desktop/test/migration-preflight.test.mjs apps/dsh-desktop/test/startup-surface.test.mjs
git commit -m "fix(desktop): start without recovery shell or migration gate"
```

## Task 3: 保留原 Profile 并尝试加载全部插件

**Files:**

- Modify: `apps/dsh-desktop/src/profile.mjs`
- Modify: `apps/dsh-desktop/src/extensions/plugins.mjs`
- Modify: `apps/dsh-desktop/src/electron-app.mjs`
- Modify: `apps/dsh-desktop/test/profile.test.mjs`
- Modify: `apps/dsh-desktop/test/plugins.test.mjs`
- Modify: `apps/dsh-desktop/test/plugin-compatibility.test.mjs`
- Modify: `apps/dsh-desktop/test/plugin-recovery.test.mjs`

**Step 1: 写 Profile 保真测试。**

构造包含未知顶层字段、`pnpm.overrides`、用户 scripts、用户依赖、用户 bundle、`file:`、`link:`、`workspace:`、Git 和 registry spec 的旧 manifest，断言 `createDesktopProfileManifest()` 合并内置项后逐项保留；构造兼容性声明为 incompatible 的启用插件，断言启动准备不移除它。

```js
assert.deepEqual(result.dsh.profile.bundles, [
  ...BUILTIN_BUNDLES,
  '@user/local-link',
  '@user/old-plugin',
])
assert.equal(result.dependencies['@user/local-link'], 'link:C:/plugins/local-link')
assert.deepEqual(result.pnpm, existing.pnpm)
```

**Step 2: 运行测试并确认失败。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/profile.test.mjs test/plugins.test.mjs test/plugin-compatibility.test.mjs test/plugin-recovery.test.mjs`

Expected: 至少未知 manifest 字段保留测试失败；旧恢复测试仍预期自动停用插件或写入 safe mode。

**Step 3: 修改 manifest 合并语义。**

`createDesktopProfileManifest()` 先浅保留 existing，再只替换 Desktop 管理的 `name`、`private`、内置依赖和内置 bundle；保留 existing `dsh` 和 `dsh.profile` 的未知字段，去重但不重排用户 bundle；只清理明确列入 `RETIRED_MANAGED_PACKAGES` 的 Desktop 自有旧包。

**Step 4: 让兼容性只做异步诊断。**

从 bootstrap 删除 `pluginManager.reconcileCompatibility()`、`recoverProfileAfterPluginInspectionFailure()`、baseline quarantine 和自动 `DesktopPluginRecovery.#recoverFromCrash()` 改写原 Profile 的调用；Runtime ready 后可以后台调用只读 `pluginManager.inspectCompatibility()` 生成 lock，任何失败只写日志。

将 `reconcileCompatibility()` 保留为设置中用户主动操作的兼容 API，或改名为 `inspectCompatibility()` 后删除 mutation 分支；普通启动测试必须证明 incompatible、unknown 和无法读取 package manifest 都不会在 loader 尝试前改变 bundle 列表。

**Step 5: 运行测试并提交。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/profile.test.mjs test/plugins.test.mjs test/plugin-compatibility.test.mjs test/plugin-recovery.test.mjs test/runtime-integration.test.mjs`

```bash
git add apps/dsh-desktop/src/profile.mjs apps/dsh-desktop/src/extensions/plugins.mjs apps/dsh-desktop/src/electron-app.mjs apps/dsh-desktop/test/profile.test.mjs apps/dsh-desktop/test/plugins.test.mjs apps/dsh-desktop/test/plugin-compatibility.test.mjs apps/dsh-desktop/test/plugin-recovery.test.mjs
git commit -m "fix(desktop): preserve and load the complete user profile"
```

## Task 4: 取消插件来源和声明式兼容准入

**Files:**

- Modify: `apps/dsh-desktop/src/external-plugin-source.mjs`
- Modify: `apps/dsh-desktop/src/extension-ipc.mjs`
- Modify: `apps/dsh-desktop/src/extensions/plugins.mjs`
- Modify: `apps/dsh-desktop/test/external-plugin-source.test.mjs`
- Modify: `apps/dsh-desktop/test/extension-ipc.test.mjs`
- Modify: `packages/dsh-web-ui-settings/src/client/community-guard.ts`
- Modify: `packages/dsh-web-ui-settings/tests/community-guard.spec.ts`

**Step 1: 写所有来源可安装测试。**

覆盖 registry、npm alias、Git HTTPS、Git SSH、本地目录、`.tgz`、`file:`、`link:` 和 `workspace:`；断言用户明确发起安装后不需要 publisher/trust/compatibility approval，只在 spec 无法解析、安装命令失败或安装结果不是 DSH bundle 时返回技术错误。

**Step 2: 运行测试并确认失败。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/external-plugin-source.test.mjs test/extension-ipc.test.mjs && pnpm --filter @linxin666/dsh-client-ui-web-ui-settings exec vitest run tests/community-guard.spec.ts`

Expected: FAIL，因为现有外来来源和社区 guard 会按来源、allowlist 或 trust 决定能否继续。

**Step 3: 收窄校验为技术可执行性。**

保留字符串长度、NUL、参数边界、路径存在性和 package bundle 入口校验；删除发布者、来源类型、兼容性范围和 allowlist 拒绝。所有进程调用仍使用 argv 和 `shell: false`，这属于执行正确性，不是插件来源准入。

**Step 4: 运行测试并提交。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/external-plugin-source.test.mjs test/extension-ipc.test.mjs && pnpm --filter @linxin666/dsh-client-ui-web-ui-settings exec vitest run tests/community-guard.spec.ts`

```bash
git add apps/dsh-desktop/src/external-plugin-source.mjs apps/dsh-desktop/src/extension-ipc.mjs apps/dsh-desktop/src/extensions/plugins.mjs apps/dsh-desktop/test/external-plugin-source.test.mjs apps/dsh-desktop/test/extension-ipc.test.mjs packages/dsh-web-ui-settings/src/client/community-guard.ts packages/dsh-web-ui-settings/tests/community-guard.spec.ts
git commit -m "feat(desktop): accept user-selected plugin sources"
```

## Task 5: 将旧数据兼容下放到各存储

**Files:**

- Modify: `packages/dsh-task-board/src/host/v3-file-store.ts`
- Modify: `packages/dsh-task-board/src/core/store-v3.ts`
- Modify: `packages/dsh-task-board/tests/host-migration.spec.ts`
- Modify: `packages/dsh-task-board/tests/store-v3.spec.ts`
- Modify: `apps/dsh-desktop/src/api-retry-policy.mjs`
- Modify: `apps/dsh-desktop/src/electron-app.mjs`
- Modify: `apps/dsh-desktop/test/api-retry-policy.test.mjs`
- Modify: `apps/dsh-desktop/test/window-state.test.mjs`
- Modify: `apps/dsh-desktop/test/settings-window-state.test.mjs`
- Modify: `apps/dsh-desktop/test/runtime-port.test.mjs`
- Modify: `apps/dsh-desktop/test/update-channel-preferences.test.mjs`

**Step 1: 写“读不写”回归测试。**

加载仅有 `tasks-v2.json` 的 Task Board 后断言任务在内存中可见，但 `tasks-v3.json`、backup 和 migration marker 都不存在；第一次真实任务变更后才原子写 v3，并保持 v2 原字节。

对 window、settings-window、runtime-port 和 update-channel 构造缺字段、旧字段和未知字段，断言 load 不抛出、不写文件、返回规范化值；对 API retry 配置断言启动不再改写 `settings.yaml`。

**Step 2: 运行测试并确认失败。**

Run: `pnpm --filter @linxin666/dsh-client-ui-task-board exec vitest run tests/host-migration.spec.ts tests/store-v3.spec.ts && pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/api-retry-policy.test.mjs test/window-state.test.mjs test/settings-window-state.test.mjs test/runtime-port.test.mjs test/update-channel-preferences.test.mjs`

Expected: Task Board 目前在 `load()` 中发布 v3、备份并写 migration marker；Electron bootstrap 仍调用 `ensureApiRetryPolicies()` 写设置。

**Step 3: 实现惰性规范化。**

`HostTaskStoreV3.loadWithoutQueue()` 读取 v2 后只调用 `migrateV2DocumentToV3()` 得到内存 document，把 `migration.status` 标记为 `pending-write`；同步扩展 `TaskLedgerMigrationState` 的解析和测试。`save()`、`mutate()` 或 `clear()` 的第一次真实变更才执行 v3 publish 并将状态写成 `complete`，且不再创建全局启动依赖的 marker。

删除 Electron bootstrap 对 `ensureApiRetryPolicies()` 的调用；保留 `withDefaultApiRetryPolicies()` 作为纯规范化函数，只有用户下一次从设置服务保存 Provider 配置时才把缺省策略持久化，启动读取本身不写文件。

**Step 4: 运行测试并提交。**

Run: `pnpm --filter @linxin666/dsh-client-ui-task-board exec vitest run tests/host-migration.spec.ts tests/store-v3.spec.ts && pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/api-retry-policy.test.mjs test/window-state.test.mjs test/settings-window-state.test.mjs test/runtime-port.test.mjs test/update-channel-preferences.test.mjs`

```bash
git add packages/dsh-task-board/src/host/v3-file-store.ts packages/dsh-task-board/src/core/store-v3.ts packages/dsh-task-board/tests/host-migration.spec.ts packages/dsh-task-board/tests/store-v3.spec.ts apps/dsh-desktop/src/api-retry-policy.mjs apps/dsh-desktop/src/electron-app.mjs apps/dsh-desktop/test/api-retry-policy.test.mjs apps/dsh-desktop/test/window-state.test.mjs apps/dsh-desktop/test/settings-window-state.test.mjs apps/dsh-desktop/test/runtime-port.test.mjs apps/dsh-desktop/test/update-channel-preferences.test.mjs
git commit -m "refactor(desktop): read legacy state without startup migration"
```

## Task 6: 建立同 Home 完整重试和内置降级

**Files:**

- Create: `apps/dsh-desktop/src/startup-repair-coordinator.mjs`
- Create: `apps/dsh-desktop/test/startup-repair-coordinator.test.mjs`
- Modify: `apps/dsh-desktop/src/profile.mjs`
- Modify: `apps/dsh-desktop/src/runtime-controller.mjs`
- Modify: `apps/dsh-desktop/src/runtime-provider.mjs`
- Modify: `apps/dsh-desktop/src/electron-app.mjs`
- Modify: `apps/dsh-desktop/test/profile.test.mjs`
- Modify: `apps/dsh-desktop/test/runtime-controller.test.mjs`
- Modify: `apps/dsh-desktop/test/runtime-provider.test.mjs`

**Step 1: 写协调器失败测试。**

使用 fake providers 断言第一次 `desktop` 失败后停止残留进程并原配置重试一次；第二次失败且无 Repair Agent 结果时启动 `desktop-builtins`；两个 Provider 的 `dshHome` 必须完全相同，coordinator 不调用 `enterSafeMode()`、不写原 bundle 列表、不创建新 Home。

```js
assert.deepEqual(calls, [
  ['start', 'desktop'],
  ['stop', 'desktop'],
  ['start', 'desktop'],
  ['stop', 'desktop'],
  ['start', 'desktop-builtins'],
])
assert.equal(full.dshHome, builtins.dshHome)
```

**Step 2: 运行测试并确认失败。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/startup-repair-coordinator.test.mjs test/profile.test.mjs test/runtime-controller.test.mjs test/runtime-provider.test.mjs`

**Step 3: 生成 Desktop 管理 Profile。**

为 `ensureDesktopProfile()` 增加显式 `mode: 'full' | 'builtins' | 'repair'`；`full` 保留用户项，`builtins` 忽略该 Profile 中任何用户项并只写当前内置清单，`repair` 在 Task 8 接入修复 bundle。三种模式都使用同一个传入 `dshHome`，Profile 目录分别为 `desktop`、`desktop-builtins`、`desktop-repair`。

**Step 4: 实现协调器。**

协调器接收 provider factory、incident store、Repair Agent callback 和状态发布函数；所有状态转换串行执行，full retry 固定一次，任何 stop 超时先强制回收当前 child 再继续，builtins ready 是一次成功启动而不是 crash 页面。

**Step 5: 运行测试并提交。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/startup-repair-coordinator.test.mjs test/profile.test.mjs test/runtime-controller.test.mjs test/runtime-provider.test.mjs test/runtime-integration.test.mjs`

```bash
git add apps/dsh-desktop/src/startup-repair-coordinator.mjs apps/dsh-desktop/src/profile.mjs apps/dsh-desktop/src/runtime-controller.mjs apps/dsh-desktop/src/runtime-provider.mjs apps/dsh-desktop/src/electron-app.mjs apps/dsh-desktop/test/startup-repair-coordinator.test.mjs apps/dsh-desktop/test/profile.test.mjs apps/dsh-desktop/test/runtime-controller.test.mjs apps/dsh-desktop/test/runtime-provider.test.mjs
git commit -m "feat(desktop): add same-home automatic startup fallback"
```

## Task 7: 建立故障指纹、预算和候选修复事务

**Files:**

- Create: `apps/dsh-desktop/src/repair-incident-store.mjs`
- Create: `apps/dsh-desktop/src/repair-workspace.mjs`
- Create: `apps/dsh-desktop/src/repair-transaction.mjs`
- Create: `apps/dsh-desktop/test/repair-incident-store.test.mjs`
- Create: `apps/dsh-desktop/test/repair-workspace.test.mjs`
- Create: `apps/dsh-desktop/test/repair-transaction.test.mjs`
- Modify: `apps/dsh-desktop/src/user-plugin-archive.mjs`
- Modify: `apps/dsh-desktop/test/user-plugin-archive.test.mjs`

**Step 1: 写故障预算测试。**

断言指纹只由 Desktop/Runtime 版本、规范化错误、启动阶段和 bundle 摘要构成，Windows 用户路径、API key 和日志正文不出现在持久文件；同版本同指纹只能 `claim()` 一次，新 Desktop 版本可以再次 claim。

**Step 2: 写候选副本和回滚测试。**

覆盖普通 `node_modules` 包、Profile 配置、目录 junction、符号链接和指向 Profile 外的 `link:` 包；候选 workspace 必须复制真实内容而不修改原目标，并把候选 manifest 依赖重写到 staging。应用前制造原文件哈希变化，断言事务拒绝覆盖；应用后制造 full restart 失败，断言所有原始字节、链接和缺失状态恢复。

**Step 3: 运行测试并确认失败。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/repair-incident-store.test.mjs test/repair-workspace.test.mjs test/repair-transaction.test.mjs test/user-plugin-archive.test.mjs`

**Step 4: 实现持久 incident store。**

目录为 `userData/repair-agent/incidents/<fingerprint>/`；状态只能按 `created -> claimed -> running -> verified/applied/rolled-back/exhausted` 转换，所有 JSON 原子写入，记录最多两个 model attempt 和十二个 tool action 摘要。

**Step 5: 实现 workspace 和 transaction。**

复用 `UserPluginArchive` 保存完整原 Profile tree，并扩展 transaction metadata 记录受影响的外部插件文件；`RepairWorkspace` 解析当前启用 bundle 的真实根，复制到 incident staging，提供路径边界检查、原文件哈希、候选哈希和 changed-files manifest。

```js
const transaction = await repairTransaction.begin({ incident, roots })
await transaction.stage()
await runRepair(transaction.workspace)
await transaction.verify()
await transaction.apply()
await transaction.commit()
```

**Step 6: 运行测试并提交。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/repair-incident-store.test.mjs test/repair-workspace.test.mjs test/repair-transaction.test.mjs test/user-plugin-archive.test.mjs`

```bash
git add apps/dsh-desktop/src/repair-incident-store.mjs apps/dsh-desktop/src/repair-workspace.mjs apps/dsh-desktop/src/repair-transaction.mjs apps/dsh-desktop/src/user-plugin-archive.mjs apps/dsh-desktop/test/repair-incident-store.test.mjs apps/dsh-desktop/test/repair-workspace.test.mjs apps/dsh-desktop/test/repair-transaction.test.mjs apps/dsh-desktop/test/user-plugin-archive.test.mjs
git commit -m "feat(desktop): add transactional repair workspaces"
```

## Task 8: 创建内置 DSH Repair Agent bundle

**Files:**

- Create: `packages/dsh-desktop-repair/package.json`
- Create: `packages/dsh-desktop-repair/AGENTS.md`
- Create: `packages/dsh-desktop-repair/cordis.patch.yml`
- Create: `packages/dsh-desktop-repair/tsconfig.json`
- Create: `packages/dsh-desktop-repair/tsconfig.build.json`
- Create: `packages/dsh-desktop-repair/tsdown.config.ts`
- Create: `packages/dsh-desktop-repair/src/index.ts`
- Create: `packages/dsh-desktop-repair/src/job.ts`
- Create: `packages/dsh-desktop-repair/src/model-runner.ts`
- Create: `packages/dsh-desktop-repair/src/tools.ts`
- Create: `packages/dsh-desktop-repair/tests/job.spec.ts`
- Create: `packages/dsh-desktop-repair/tests/model-runner.spec.ts`
- Create: `packages/dsh-desktop-repair/tests/tools.spec.ts`
- Create: `packages/dsh-desktop-repair/README.md`
- Create: `packages/dsh-desktop-repair/README.zh.md`
- Create: `packages/dsh-desktop-repair/README.i18n.yaml`
- Modify: `apps/dsh-desktop/package.json`
- Modify: `pnpm-lock.yaml`

**Step 1: 写 job 和模型选择失败测试。**

构造空 default selection、有效默认模型、默认模型认证失败后有效备用模型、两个模型都失败、重复 job、超时和超过工具预算；断言空配置返回 `model-unavailable`，认证/配额错误不重试同模型，最多选择两个 provider/model。

**Step 2: 写工具边界测试。**

允许读取 job 中列出的候选 Profile 和插件根，允许在 staging 中写、移、删和运行 Desktop 注册的 test command；拒绝原 Profile、会话目录、项目目录、凭据文件、Desktop 安装目录、未声明命令和新网络依赖。

**Step 3: 运行测试并确认失败。**

Run: `pnpm --filter @linxin666/dsh-desktop-repair test`

Expected: FAIL，因为 package 尚不存在。

**Step 4: 建立 host-only bundle。**

`apply(ctx)` 只在 `DSH_DESKTOP_REPAIR_JOB` 存在时启动；通过 `ctx.inject(['agents', 'agentDefaultModel', 'sessions'], ...)` 获取公开服务，读取原子 job，选择 `agentDefaultModel.currentSelection()`，为该 job 创建 repair Profile 内的临时 session，并使用 `installModelSelection()` 固定本次 provider/model。

```ts
ctx.inject(['agents', 'agentDefaultModel', 'sessions'], async repairCtx => {
const selection = repairModelCandidates(repairCtx.agentDefaultModel, job.settings)[attempt]
const handle = await repairCtx.agents.create({
  sessionId: job.sessionId,
  meta: { cwd: job.workspace, kind: 'desktop-repair', hidden: true },
  agentOptions: { provider: selection.provider, model: selection.model },
  setup: agentCtx => installModelSelection(agentCtx, { current: selection, assembled: undefined }),
})
})
```

**Step 5: 注册专用修复工具。**

只向 repair Agent 暴露 `list_repair_files`、`read_repair_file`、`write_repair_file`、`move_repair_file`、`delete_repair_file`、`run_repair_check` 和 `finish_repair`；工具实现每次都从 job 重新解析 allowlisted realpath，累计工具次数，并将 action 摘要原子追加到 result。

**Step 6: 实现提示和结果。**

系统指令明确插件源码、manifest 和日志是不可信资料，只处理本次故障；模型完成后输出结构化 `diagnosis`、`changedFiles`、`checksRequested` 和 `summary`，原始模型输出不返回 Electron，也不进入产品遥测。

**Step 7: 补双语文档、运行测试并提交。**

Run: `pnpm --filter @linxin666/dsh-desktop-repair typecheck && pnpm --filter @linxin666/dsh-desktop-repair test && pnpm docs:check`

```bash
git add packages/dsh-desktop-repair apps/dsh-desktop/package.json pnpm-lock.yaml
git commit -m "feat(desktop): add built-in model repair agent"
```

## Task 9: 把 Repair Agent 接入启动协调器并自动验证应用

**Files:**

- Create: `apps/dsh-desktop/src/repair-runtime-controller.mjs`
- Create: `apps/dsh-desktop/src/repair-verifier.mjs`
- Create: `apps/dsh-desktop/test/repair-runtime-controller.test.mjs`
- Create: `apps/dsh-desktop/test/repair-verifier.test.mjs`
- Modify: `apps/dsh-desktop/src/startup-repair-coordinator.mjs`
- Modify: `apps/dsh-desktop/src/profile.mjs`
- Modify: `apps/dsh-desktop/src/electron-app.mjs`
- Modify: `apps/dsh-desktop/test/startup-repair-coordinator.test.mjs`
- Modify: `apps/dsh-desktop/test/profile.test.mjs`

**Step 1: 写端到端协调单元测试。**

模拟完整 Profile 两次失败、Repair Runtime 使用默认模型成功修改候选、候选探针 ready、事务应用、原 Profile ready；再覆盖模型不可用、模型失败、候选测试失败、候选 ready 但应用后 full 失败和 rollback 失败报告。除安装损坏外，所有分支最终必须是 `ready-full` 或 `ready-builtins`。

**Step 2: 运行测试并确认失败。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/repair-runtime-controller.test.mjs test/repair-verifier.test.mjs test/startup-repair-coordinator.test.mjs test/profile.test.mjs`

**Step 3: 实现 Repair Runtime controller。**

使用现有 `DshRuntimeController` 创建 profileName=`desktop-repair` 的隐藏 child，环境设置 `DSH_DESKTOP_REPAIR_JOB=<absolute job.json>`、`DSH_DESKTOP_BACKGROUND_AUTOMATION=0`、`DSH_DESKTOP_REPAIR_MODE=1`；监听 result 文件或 child 退出，九十秒超时后停止 child，不占主 Runtime 端口。

**Step 4: 实现 verifier。**

先按 changed package 运行已登记的 build/typecheck/test；再以临时 candidate Profile 和同一 Home 启动无窗口探针，要求 Runtime ready 且稳定十秒。探针关闭后台调度、不打开 renderer、不写用户 session；任一步失败都返回有限错误类别。

**Step 5: 串起自动应用和回滚。**

协调器 claim 指纹后创建 transaction，运行 Repair Runtime，验证 candidate，应用事务并重启 `desktop`；重启失败则 rollback 并启动 `desktop-builtins`。成功时 commit archive、清理候选 Profile、把 incident 标记为 applied。

**Step 6: 运行测试并提交。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/repair-runtime-controller.test.mjs test/repair-verifier.test.mjs test/startup-repair-coordinator.test.mjs test/profile.test.mjs test/runtime-integration.test.mjs`

```bash
git add apps/dsh-desktop/src/repair-runtime-controller.mjs apps/dsh-desktop/src/repair-verifier.mjs apps/dsh-desktop/src/startup-repair-coordinator.mjs apps/dsh-desktop/src/profile.mjs apps/dsh-desktop/src/electron-app.mjs apps/dsh-desktop/test/repair-runtime-controller.test.mjs apps/dsh-desktop/test/repair-verifier.test.mjs apps/dsh-desktop/test/startup-repair-coordinator.test.mjs apps/dsh-desktop/test/profile.test.mjs
git commit -m "feat(desktop): automatically verify and apply model repairs"
```

## Task 10: 简化启动 UI 并增加高级修复记录

**Files:**

- Modify: `apps/dsh-desktop/src/ipc.mjs`
- Modify: `apps/dsh-desktop/src/ui/startup.html`
- Modify: `apps/dsh-desktop/src/ui/startup.mjs`
- Modify: `apps/dsh-desktop/src/ui/startup.css`
- Modify: `apps/dsh-desktop/src/notifications.mjs`
- Modify: `apps/dsh-desktop/src/startup-diagnostics.mjs`
- Modify: `apps/dsh-desktop/test/ipc.test.mjs`
- Modify: `apps/dsh-desktop/test/startup-surface.test.mjs`
- Modify: `apps/dsh-desktop/test/notifications.test.mjs`
- Modify: `apps/dsh-desktop/test/startup-diagnostics.test.mjs`
- Modify: `packages/dsh-web-ui-settings/src/protocol.ts`
- Modify: `packages/dsh-web-ui-settings/src/bridge.ts`
- Create: `packages/dsh-web-ui-settings/src/client/RepairStatusCard.tsx`
- Modify: `packages/dsh-web-ui-settings/src/client/WebUIPluginsCard.tsx`
- Modify: `packages/dsh-web-ui-settings/src/client/locales.ts`
- Create: `packages/dsh-web-ui-settings/tests/repair-status-card.spec.tsx`

**Step 1: 写零按钮 UI 测试。**

断言正常、重试、自动修复和验证阶段没有 action button、dialog 或 recovery window；内置模式 ready 后只发送一次通知，正文不要求用户操作，主窗口继续可用。

**Step 2: 写高级状态脱敏测试。**

`desktop:repair-status` 只返回 incident 时间、状态、fingerprint、provider/model 名称、相对 changed files、检查名和 apply/rollback 结果；API key、用户绝对路径、prompt、会话内容、原始模型输出和 tool arguments 都不能通过 IPC。

**Step 3: 运行测试并确认失败。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/ipc.test.mjs test/startup-surface.test.mjs test/notifications.test.mjs test/startup-diagnostics.test.mjs && pnpm --filter @linxin666/dsh-client-ui-web-ui-settings exec vitest run tests/repair-status-card.spec.tsx`

**Step 4: 实现启动展示和通知。**

启动页 copy 固定为“正在启动全部插件”“正在自动恢复”“正在自动修复插件”“正在验证修复”；内置模式通知固定为非模态，并链接到设置但没有强制按钮。

**Step 5: 实现设置卡。**

通过现有 Desktop bridge 读取 `desktop:repair-status`，默认折叠；展示最近一次结果和“打开日志”“导出诊断”高级链接，不提供迁移、隔离、复制 Profile 或切换 safe mode 按钮。

**Step 6: 运行测试并提交。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/ipc.test.mjs test/startup-surface.test.mjs test/notifications.test.mjs test/startup-diagnostics.test.mjs && pnpm --filter @linxin666/dsh-client-ui-web-ui-settings exec vitest run tests/repair-status-card.spec.tsx`

```bash
git add apps/dsh-desktop/src/ipc.mjs apps/dsh-desktop/src/ui/startup.html apps/dsh-desktop/src/ui/startup.mjs apps/dsh-desktop/src/ui/startup.css apps/dsh-desktop/src/notifications.mjs apps/dsh-desktop/src/startup-diagnostics.mjs apps/dsh-desktop/test/ipc.test.mjs apps/dsh-desktop/test/startup-surface.test.mjs apps/dsh-desktop/test/notifications.test.mjs apps/dsh-desktop/test/startup-diagnostics.test.mjs packages/dsh-web-ui-settings/src/protocol.ts packages/dsh-web-ui-settings/src/bridge.ts packages/dsh-web-ui-settings/src/client/RepairStatusCard.tsx packages/dsh-web-ui-settings/src/client/WebUIPluginsCard.tsx packages/dsh-web-ui-settings/src/client/locales.ts packages/dsh-web-ui-settings/tests/repair-status-card.spec.tsx
git commit -m "feat(desktop): expose quiet automatic repair status"
```

## Task 11: 用真实历史 Home 和故障注入替换迁移矩阵

**Files:**

- Create: `apps/dsh-desktop/test/fixtures/direct-start/README.md`
- Create: `apps/dsh-desktop/test/fixtures/direct-start/provenance.json`
- Create: `apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs`
- Create: `apps/dsh-desktop/scripts/verify-packaged-direct-start-matrix.mjs`
- Create: `apps/dsh-desktop/test/packaged-direct-start-matrix.test.mjs`
- Create: `apps/dsh-desktop/test/repair-agent-integration.test.mjs`
- Create: `apps/dsh-desktop/test/session-preservation.test.mjs`
- Modify: `apps/dsh-desktop/package.json`
- Modify: `.github/workflows/desktop-ci.yml`
- Modify: `.github/workflows/desktop-release.yml`

**Step 1: 建立有来源的 Home fixtures。**

从仓库的 2.3、2.4、2.5、2.6、2.7 和 3.0.1 release tag 或对应已发布安装 smoke 产物提取最小用户 Home；`provenance.json` 记录 tag、commit 和每个文本 fixture 的 SHA-256。删除现有迁移 fixture 中并非真实版本生成的 `version`/`desktopVersion` 证据，不复制项目内容和秘密。

**Step 2: 写 packaged direct-start matrix。**

每个 fixture 启动打包 exe，断言没有 recovery/migration window、原会话 marker 可从主 Runtime 读取、全部启用 bundle 至少被 loader 尝试、主窗口达到 full ready；另覆盖 fresh Home。

**Step 3: 写故障注入。**

提供本地测试插件：语法错误、错误 patch、启动 throw、链接包、模型可修复配置错误和不可修复 native ABI 错误；Provider 使用本地 deterministic fake，不产生真实 API 费用。断言可修复故障 full ready，不可修复故障 builtins ready，同 Home session marker 均可见。

**Step 4: 运行测试并确认失败。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/packaged-direct-start-matrix.test.mjs test/repair-agent-integration.test.mjs test/session-preservation.test.mjs`

**Step 5: 实现 runner 和 CI。**

runner 只自动化进程拥有的窗口和本地 loopback，不点击任何恢复按钮；CI 先跑单元测试和 fake-model repair integration，release workflow 在签名前对 unpacked packaged app 跑完整 direct-start matrix。

**Step 6: 运行测试并提交。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop test`

Run with packaged directory: `pnpm --filter @deepseek-ai/dsh-desktop test:direct-start-matrix:e2e -- --desktop-exe apps/dsh-desktop/dist/win-unpacked/DeepSeek Harness Desktop.exe`

```bash
git add apps/dsh-desktop/test/fixtures/direct-start apps/dsh-desktop/scripts/direct-start-matrix-runner.mjs apps/dsh-desktop/scripts/verify-packaged-direct-start-matrix.mjs apps/dsh-desktop/test/packaged-direct-start-matrix.test.mjs apps/dsh-desktop/test/repair-agent-integration.test.mjs apps/dsh-desktop/test/session-preservation.test.mjs apps/dsh-desktop/package.json .github/workflows/desktop-ci.yml .github/workflows/desktop-release.yml
git commit -m "test(desktop): verify direct startup and automatic repair"
```

## Task 12: 删除启动迁移死链并发布 3.0.2

**Files:**

- Modify: `apps/dsh-desktop/src/electron-app.mjs`
- Delete or archive after reference audit: `apps/dsh-desktop/src/ui/recovery.html`
- Delete or archive after reference audit: `apps/dsh-desktop/src/ui/recovery.mjs`
- Delete or archive after reference audit: `apps/dsh-desktop/src/ui/recovery.css`
- Delete or retain diagnostics-only after reference audit: `apps/dsh-desktop/src/migration-assistant.mjs`
- Delete: `apps/dsh-desktop/scripts/verify-packaged-migration-matrix.mjs`
- Delete: `apps/dsh-desktop/scripts/packaged-migration-matrix-runner.mjs`
- Delete: `apps/dsh-desktop/test/packaged-migration-matrix.test.mjs`
- Modify: `apps/dsh-desktop/package.json`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `README.md`
- Modify: `docs/launch/release-notes.md`
- Modify: `docs/launch/desktop-release-workflow.md`
- Modify: `docs/upgrade-and-rollback.md`
- Modify: `docs/compatibility-policy.md`

**Step 1: 做引用审计。**

Run: `rg -n "showStartupRecoveryShell|preflightDesktopMigrationGate|MigrationAssistant|upgrade-migration|enter-free-mode|prepareSafeMode|packaged-migration" apps packages scripts .github docs --glob '!docs/plans/**' --glob '!docs/archive/**'`

将仍用于用户主动导入 Web Profile 的 `profile-migration.mjs` 与升级前 archive 能力保留；只删除启动迁移、恢复壳、safe mode 自动改写和旧 packaged migration matrix。任何无法在本任务安全删除的模块必须改成 diagnostics-only，且无 bootstrap 引用。

**Step 2: 更新版本和文档。**

将 root 和 Desktop app 版本更新为 3.0.2，更新 lockfile；发布说明明确“原 Home 直接启动、全部插件先加载、无迁移按钮、同 Home 内置降级、用户模型自动修复、模型费用熔断和二进制仅由更新器修复”。

**Step 3: 运行完整门禁。**

Run: `pnpm typecheck`

Run: `pnpm test`

Run: `pnpm test:scripts`

Run: `pnpm runtime-deps:check && pnpm dsh-imports:check && pnpm dsh-audit:check`

Run: `pnpm runtime-support:check && pnpm runtime-support-matrix:check && pnpm community-plugin-quality:check`

Run: `pnpm sync-shared:check && pnpm release:notes:check && pnpm docs:check`

Run: `pnpm --filter @deepseek-ai/dsh-desktop pack:dir`

Run: `pnpm --filter @deepseek-ai/dsh-desktop pack:verify:dir`

Run: `pnpm --filter @deepseek-ai/dsh-desktop pack:smoke`

Run: `pnpm --filter @deepseek-ai/dsh-desktop test:direct-start-matrix:e2e -- --desktop-exe apps/dsh-desktop/dist/win-unpacked/DeepSeek Harness Desktop.exe`

**Step 4: 提交发布候选。**

```bash
git add -A apps/dsh-desktop package.json pnpm-lock.yaml README.md docs/launch docs/upgrade-and-rollback.md docs/compatibility-policy.md
git commit -m "release(desktop): prepare 3.0.2 direct startup repair"
```

本计划不授权 push、tag、GitHub Release 或外部发布；完成本地门禁后再由维护者单独确认这些外部动作。

## 执行检查点

Task 1-3 完成后必须先做一次本地新 Home 与现有 Home smoke，确认无 Recovery Shell、原会话可见和全部 bundle 仍在，再继续改外部来源与存储。

Task 4-6 完成后必须证明无模型情况下也能零点击进入 full 或 builtins，不能让 Repair Agent 成为启动必要依赖。

Task 7-9 完成后必须用 deterministic fake model 证明成功应用、候选失败、并发冲突、full 重启失败和 rollback 全部收敛，才能启用真实用户模型选择。

Task 10-12 完成后必须跑打包矩阵；开发态单元测试通过不能替代 Windows 安装产物验证。
