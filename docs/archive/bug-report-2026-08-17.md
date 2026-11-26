# dsh-web-ui-desktop-next Bug 排查报告

- 排查日期：2026-08-17
- 排查对象：`dsh-web-ui-desktop-next` 工作区（含全部未提交改动，25 个文件约 +841/-150 行，不含锁文件的实质改动）
- 排查方式：全量流水线执行（typecheck / test / test:scripts / 全部仓库校验脚本 / window-chrome e2e / 重新构建）+ 未提交改动的逐文件静态审查 + 三方（desktop / dshmarket patch / skin-center patch）写同一 home patch 的交叉推理

## 一、总体结论

自动化基线全部通过，未发现会直接导致现有测试失败的问题：

| 检查项 | 结果 |
| --- | --- |
| `pnpm typecheck`（28 个包） | 通过 |
| `pnpm test`（desktop 134 项 + 各包全部） | 通过（exit 0） |
| `pnpm test:scripts`（100 项） | 通过 |
| release-notes / website / aggregate / gallery / skin-center / community / docs / sync-shared / runtime-deps 校验 | 全部通过 |
| `test:window-chrome:e2e`（Electron 端到端，本机实跑） | 通过 |
| lib 构建产物与 src 一致性（重建后无 diff） | 一致 |
| AGENTS.md 禁 emoji 规则（32 个改动文件扫描） | 无违规 |

但静态审查发现 **2 个代码级 bug、1 个行为回归风险、4 个流程/策略风险点**，均未被现有测试覆盖。按严重程度列出如下。

## 二、Bug 列表

### BUG-1【高】market 渠道安装的主题切换会被 `activateBundleTheme` 拒绝，且拒绝发生在内存激活之后

**位置**：`packages/dsh-desktop-compat/src/skin-state.ts:119-129`（`bundleNames`）、`skin-state.ts:176-179`（抛错分支）；配合 `patches/dshmarket@1.9.0.patch` 中 themes.js 的 `activateTheme` 改动。

**事实链**（三个组件对“什么是已安装主题/皮肤”的判定口径不一致）：

1. dshmarket 的安装路由只通过 pnpm 写入 profile `package.json` 的 **`dependencies`**（`dshmarket/lib/profile.js` 的 `readInstalled` 也只读 `dependencies`；`installedThemeNames` 以此为数据源）。
2. Desktop 自己的插件管理器安装时会**同时补写 `dsh.profile.bundles` 行**（`apps/dsh-desktop/src/extensions/plugins.mjs:464-468`、`373-377`）。
3. skin-center 把 **`dsh.profile.bundles` 与 `dependencies` 都算作接线通道**（`packages/skins/skin-center/src/skin-switch.ts:487-499` 的 `readProfileBundles` + `readProfileDependencies`）。
4. 而新增的 `DesktopSkinStateStore.bundleNames()`（skin-state.ts:119-129）**只读 `dsh.profile.bundles`**。

**后果**：凡是只出现在 `dependencies` 的主题（通过 dshmarket 自身 UI 安装、或 `dsh plugin add`、或旧版本 Desktop 遗留安装），在 Desktop 内经 market 切换时：

- `activateTheme` 先在内存中 live 激活（`setEntryDisabled(name, false)` 成功），**然后**才调用 `persistence.activateBundleTheme`；
- 后者抛出 `desktopSkinState: <name> is not a bundle-layer theme; use the skin center`；
- 路由以错误收场，但主题实际已在内存中生效；持久化状态未写入，重启后回退；报错文案还会误导用户去皮肤中心找一个皮肤中心并不认识的市场主题。

**测试盲区**：`apps/dsh-desktop/test/skin-market-persistence.test.mjs` 用的是 stub persistence（不校验 bundles，fixture 也只写了 `dependencies`）；`packages/dsh-desktop-compat/tests/skin-state.spec.ts` 的 fixture 则永远预写 `dsh.profile.bundles`。两侧各自都绿，组合起来才会炸。

**修复建议**（任选其一，或都做）：
- `bundleNames()` 同时并入 profile `dependencies` 的键（对齐 skin-center 的双通道口径）；
- 或在 dshmarket patch 的 Desktop 分支里，安装后补写 `dsh.profile.bundles` 行（对齐 desktop 插件管理器行为）。
- 补一条集成测试：manifest 只有 `dependencies` 时真实 `DesktopSkinStateStore.activateBundleTheme` 不抛错。

### BUG-2【中】skin-center 写后校验把“读失败”误判为“写失败”（Windows AV 场景可复现）

**位置**：`packages/skins/skin-center/src/skin-switch.ts:907-910`（workspace 版）与 `patches/@linxin666__dsh-client-ui-skin-center@0.1.18.patch`（发布版同逻辑）。

`readPatch()`（skin-switch.ts:651-657）捕获一切读取异常并返回 `''`。`writePatchAtomic` 重命名成功后若紧接着的一次读取因瞬时锁失败（Windows 上杀软/索引器锁定刚落盘文件是经典场景），`'' !== next` 成立，抛出 `skin state write verification failed`——但写入其实已成功。用户看到切换失败报错，实际皮肤已切换；GUI 状态与文件状态背离。

对照：同批新增的 `skin-state.ts` 的 `writeAtomic`（102-104 行）用裸 `readFileSync`，读异常会以异常传播而不是伪装成内容不一致——两个写入方行为不一致，skin-center 这边是错的一方。

**修复建议**：区分“读异常”与“内容不一致”（读异常直接抛原始错误或短暂重试），不要吞掉。

### BUG-3【低-中】market 状态迁移：无法映射 loader id 的历史禁用主题会被“复活”且 state.json 永不清除

**位置**：`patches/dshmarket@1.9.0.patch` 中 routes.js 的迁移段（`migrateLegacy` + `remaining` 逻辑）。

迁移时 `loaderId` 依赖 `profile/node_modules/<pkg>/cordis.patch.yml` 或存活 loader entry。二者皆缺时该名字永远进不了 `migrated`：

- `remaining` 被**永远**写回 state.json（每次挂载重写一遍），成为僵尸状态；
- 更重要的是行为回归：迁移后 boot 回放被 `if (config.skinState === undefined)` 整体跳过，这些此前被禁用的主题**没有任何渠道再被禁用**，重启后重新生效——升级前用户明确关掉的主题回来了。

**修复建议**：对映射失败的名字至少保留一个回放渠道（或迁移时写 `- id` 不可行则记日志并一次性清除），而不是静默丢掉用户选择。

### RISK-4【中】dshmarket patch 的 inject 同时等待 `desktopPnpm` + `desktopSkinState`，版本失配时 market 静默不挂载

**位置**：`patches/dshmarket@1.9.0.patch`（`hostCtx.inject(['desktopPnpm', 'desktopSkinState'], ...)`）。

若运行时 profile 里的 `@linxin666/dsh-desktop-compat` 是没有 `desktopSkinState` 服务的旧拷贝（例如旧版 Desktop 遗留的社区安装副本），inject 永不满足，Desktop 下的 market 整体不挂载——**没有任何错误日志**，插件商店直接消失。正常发行版用 `link:` 钉住版本不会触发，但失败模式是静默的。

**修复建议**：对 inject 加超时告警，或降级为只依赖 `desktopPnpm`、`desktopSkinState` 用可选探测。

### RISK-5【低】`activateBundleTheme` 全量改写共享 section，把 skin-center 的 `- insert:` 块降级为 `- id:` 行

**位置**：`packages/dsh-desktop-compat/src/skin-state.ts:184-196`（`renderRows` 只输出 `id/disabled` 形态）。

market 激活主题时，section 内 skin-center 写的 `- insert:` 接线块会被改写成 `disabled: true` 的 id 行（接线 name 丢失）。当前 round-trip 成立（skin-center 下次按自己注册表整段重渲染），属于有意设计的互斥，但对任何未来依赖 insert 块的第三写入方是隐性契约。顺带：`skin-state.ts:186-188` 先 `rows.set(id, false)` 再在 189 行全量置 `true`，前者赋值是无效代码（保留键本身有意义，赋 false 无意义），建议改为显式注释或调整顺序以免误读。

### RISK-6【低】`DSH_SKINS_DIR` 硬编码 `profiles/desktop` 路径

**位置**：`apps/dsh-desktop/src/runtime-controller.mjs:185`。

与同函数内 `DSH_PROFILE: 'desktop'` 当前一致，但把 profile 名再硬编码一遍；将来 profile 参数化（`ensureDesktopProfile` 本身支持 `profileName`）时会静默指向错误目录。建议从同一常量推导。

## 三、流程与策略备注（非代码 bug）

1. **本机 Node 版本不满足 engines**：本机 v23.8.0，仓库要求 `^22.19.0 || >=24.0.0`，pnpm 仅告警，全部检查仍通过；CI 用 Node 24，无实际影响。
2. **供应链护栏放宽**：`pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 新增了 `'@linxin666/*'` 通配。自有包豁免合理，但通配比按版本精确列举更宽，建议收窄为具体版本。
3. **window-chrome e2e 不在 PR CI**：`test:window-chrome:e2e` 与 `pack:verify` 只在 desktop-release 流程出现，`desktop-ci.yml` 未包含。本次 window-chrome 改动大（Help 菜单重构为 Tools+Help 双菜单），PR 阶段只有正则级单测兜底，本机实跑 e2e 通过。
4. **孤立文件**：`docs/launch/desktop-2.0-poster.png` 未被任何文件引用且未跟踪。提交前要么接入 website/docs，要么删除。

## 四、建议的提交前动作（按优先级）

1. 修 BUG-1（bundleNames 并入 dependencies 或 market 补写 bundles 行）+ 补集成测试。
2. 修 BUG-2（skin-center 写后校验区分读异常）。
3. 决策 BUG-3 的迁移兜底策略。
4. RISK-4 加失配可见性；顺手清理 RISK-5 的无效赋值与 RISK-6 的硬编码。
5. 处理 poster 孤立文件；考虑把 window-chrome e2e 纳入 CI（Windows runner 可跑）。
