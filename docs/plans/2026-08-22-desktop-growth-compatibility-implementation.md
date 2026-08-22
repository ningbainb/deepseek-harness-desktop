# Desktop Growth and Credential Compatibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 恢复旧模型 API Key 的零点击兼容读取，恢复官方 Desktop 的匿名 DAU、MAU、国家、应用内更新和拓展坞漏斗分析，在设置旁增加一键拓展坞入口与前 3 次启动提示，并产出可验证的无签名 NSIS 正式候选包。

**Architecture:** Electron main 负责产品拥有的旧凭据只读兼容、匿名周期身份、更新回执和引导状态；渲染器通过窄 Desktop Contract 能力打开拓展坞；现有遥测客户端只在官方包中发送固定低基数事件；Cloudflare Worker 从请求上下文补充国家并在 D1 中维护周期去重与聚合，管理页只展示群体指标。

**Tech Stack:** Electron 43、Node ESM、React、TypeScript、Cordis/DSH 公共 SDK、Vitest、Node test runner、Playwright、Cloudflare Workers、D1、pnpm workspace、electron-builder NSIS。

---

## 实施约束

每个任务先补失败测试，再写最小实现，再运行定向测试并提交；秘密值和自由文本不得进入日志、遥测、测试快照或发布清单。

不得修改 DSH 官方源码，不得恢复启动迁移 gate，不得把当前凭据覆盖为旧值，不得在非官方构建中默认开启网络埋点。

本计划中的“发布”只指生成本地正式候选产物；标签、推送、GitHub Release、远程 Worker 部署和生产变量变更需要单独授权。

## Task 1: 冻结凭据兼容契约

**Files:**

- Create: `apps/dsh-desktop/src/legacy-credential-compat.mjs`
- Create: `apps/dsh-desktop/test/legacy-credential-compat.test.mjs`
- Modify: `apps/dsh-desktop/src/electron-app.mjs`
- Modify: `apps/dsh-desktop/test/electron-app.test.mjs`

**Step 1: 写失败测试。**

用临时 `userData` 和假秘密覆盖 versioned `refs`、历史平铺映射、损坏 YAML、非法引用名、多个 active Free Mode 目录、当前环境变量优先和旧文件字节不变。

断言模块返回 `environment` 与不含值的诊断摘要，序列化摘要、日志捕获和异常文本均不包含假秘密。

**Step 2: 运行测试并确认失败。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/legacy-credential-compat.test.mjs test/electron-app.test.mjs`

Expected: FAIL，因为兼容读取模块尚不存在，Runtime 环境只合并现有 Desktop 环境。

**Step 3: 实现只读兼容解析。**

限定候选目录为产品拥有的 `free-mode-sessions` 布局，按更新时间选择有效候选；解析 `refs` 或旧平铺字符串映射，只接受 `/^[A-Z][A-Z0-9_]{1,127}$/`，并用 `currentEnvironment[key] ?? legacyValue` 合并。

模块不返回来源文件正文，不记录值，不写文件；读取错误转换为固定类别。

**Step 4: 接入 Runtime 环境。**

在 Electron 构建 DSH 子进程环境时合并恢复引用，确保当前凭据和当前环境优先；UI 和日志只接收恢复数量。

**Step 5: 运行测试并提交。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/legacy-credential-compat.test.mjs test/electron-app.test.mjs`

```bash
git add apps/dsh-desktop/src/legacy-credential-compat.mjs apps/dsh-desktop/src/electron-app.mjs apps/dsh-desktop/test/legacy-credential-compat.test.mjs apps/dsh-desktop/test/electron-app.test.mjs
git commit -m "fix(desktop): recover missing legacy api keys"
```

## Task 2: 把旧凭据加入历史 Home 与打包直启矩阵

**Files:**

- Modify: `apps/dsh-desktop/scripts/run-packaged-direct-start-matrix.mjs`
- Modify: `apps/dsh-desktop/test/packaged-direct-start-matrix.test.mjs`
- Modify: `apps/dsh-desktop/scripts/verify-packaged-desktop.mjs`

**Step 1: 写失败矩阵断言。**

增加只有旧 Free Mode `.credentials.yaml` 的 3.0 样本，以及同时含当前和旧 Key 的冲突样本；记录 Runtime 子进程看到的引用名和来源类别，绝不记录值。

**Step 2: 运行矩阵单测并确认失败。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/packaged-direct-start-matrix.test.mjs`

Expected: FAIL，因为 fixture 和凭据检查尚未实现。

**Step 3: 扩展脚本和秘密扫描。**

为矩阵生成假凭据，验证只补缺失项、原文件 SHA-256 不变，并扫描 stdout、stderr、诊断和状态文件不存在假秘密。

**Step 4: 运行测试并提交。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/packaged-direct-start-matrix.test.mjs`

```bash
git add apps/dsh-desktop/scripts/run-packaged-direct-start-matrix.mjs apps/dsh-desktop/scripts/verify-packaged-desktop.mjs apps/dsh-desktop/test/packaged-direct-start-matrix.test.mjs
git commit -m "test(desktop): cover packaged credential compatibility"
```

## Task 3: 实现官方包匿名周期身份与状态存储

**Files:**

- Create: `apps/dsh-desktop/src/product-analytics-state.mjs`
- Create: `apps/dsh-desktop/test/product-analytics-state.test.mjs`
- Modify: `apps/dsh-desktop/src/telemetry-config.mjs`
- Modify: `apps/dsh-desktop/test/telemetry-config.test.mjs`
- Modify: `apps/dsh-desktop/build/telemetry-config.json`

**Step 1: 写失败测试。**

冻结随机秘密创建、同日同月稳定、跨日和跨月变化、状态损坏恢复、原子写入、官方包启用、开发版与第三方包关闭的行为。

测试只比较派生值相等性和格式，不快照秘密。

**Step 2: 运行测试并确认失败。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/product-analytics-state.test.mjs test/telemetry-config.test.mjs`

Expected: FAIL，因为周期身份和官方构建门禁尚不存在。

**Step 3: 实现状态和派生。**

用 `crypto.randomBytes()` 创建本地秘密，以 HMAC-SHA-256 派生 UTC 日、UTC 月标识；状态文件使用临时文件加原子替换，权限尽量限制为当前用户。

遥测配置资源增加 `officialBuild`，端点为空或开发模式时禁用。

**Step 4: 运行测试并提交。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/product-analytics-state.test.mjs test/telemetry-config.test.mjs`

```bash
git add apps/dsh-desktop/src/product-analytics-state.mjs apps/dsh-desktop/src/telemetry-config.mjs apps/dsh-desktop/build/telemetry-config.json apps/dsh-desktop/test/product-analytics-state.test.mjs apps/dsh-desktop/test/telemetry-config.test.mjs
git commit -m "feat(desktop): add rotating anonymous analytics identity"
```

## Task 4: 扩展低基数事件和应用内更新回执

**Files:**

- Create: `apps/dsh-desktop/src/update-analytics-receipt.mjs`
- Create: `apps/dsh-desktop/test/update-analytics-receipt.test.mjs`
- Modify: `apps/dsh-desktop/src/telemetry-events.mjs`
- Modify: `apps/dsh-desktop/src/product-metrics.mjs`
- Modify: `apps/dsh-desktop/src/telemetry-client.mjs`
- Modify: `apps/dsh-desktop/src/electron-app.mjs`
- Modify: `apps/dsh-desktop/test/telemetry-events.test.mjs`
- Modify: `apps/dsh-desktop/test/product-metrics.test.mjs`
- Modify: `apps/dsh-desktop/test/telemetry-client.test.mjs`

**Step 1: 写失败测试。**

冻结活跃、更新和拓展坞事件词表、允许维度、匿名周期字段和自由文本拒绝；覆盖下载、安装请求、目标版本启动后只发送一次完成，以及手动覆盖安装不计完成。

**Step 2: 运行测试并确认失败。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/update-analytics-receipt.test.mjs test/telemetry-events.test.mjs test/product-metrics.test.mjs test/telemetry-client.test.mjs`

Expected: FAIL，因为新事件、周期身份和更新回执不存在。

**Step 3: 实现事件与回执。**

让客户端在允许事件上附加 `dailyActor` 和 `monthlyActor`，仍保持队列上限和 2 秒超时；更新器阶段原子写回执，匹配目标版本时发送并消费一次。

**Step 4: 运行测试并提交。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/update-analytics-receipt.test.mjs test/telemetry-events.test.mjs test/product-metrics.test.mjs test/telemetry-client.test.mjs`

```bash
git add apps/dsh-desktop/src/update-analytics-receipt.mjs apps/dsh-desktop/src/telemetry-events.mjs apps/dsh-desktop/src/product-metrics.mjs apps/dsh-desktop/src/telemetry-client.mjs apps/dsh-desktop/src/electron-app.mjs apps/dsh-desktop/test/update-analytics-receipt.test.mjs apps/dsh-desktop/test/telemetry-events.test.mjs apps/dsh-desktop/test/product-metrics.test.mjs apps/dsh-desktop/test/telemetry-client.test.mjs
git commit -m "feat(desktop): measure active use and in-app updates"
```

## Task 5: 扩展 Worker 数据库、摄取与保留期

**Files:**

- Create: `apps/dsh-telemetry-worker/migrations/0003_product_actors.sql`
- Modify: `apps/dsh-telemetry-worker/src/index.ts`
- Modify: `apps/dsh-telemetry-worker/test/index.test.ts`
- Modify: `apps/dsh-telemetry-worker/wrangler.toml`

**Step 1: 写失败测试。**

覆盖 DAU、MAU、国家去重、事件去重、无国家回退 `ZZ`、重复事件幂等、非法 actor 拒绝、IP 和自由文本不落库，以及 35 天、13 个月、400 天清理边界。

**Step 2: 运行测试并确认失败。**

Run: `pnpm --filter @linxin666/dsh-telemetry-worker test`

Expected: FAIL，因为现有 D1 只有事件日聚合，没有周期匿名去重表。

**Step 3: 添加 schema 和摄取事务。**

增加日/月 actor、国家 actor、漏斗 actor 和聚合表；从 `request.cf.country` 规范化二位国家代码，在同一事务中 `INSERT OR IGNORE` 去重并更新聚合。

定时任务按表执行固定保留期删除，不提供单 actor 查询 API。

**Step 4: 运行测试并提交。**

Run: `pnpm --filter @linxin666/dsh-telemetry-worker test`

```bash
git add apps/dsh-telemetry-worker/migrations/0003_product_actors.sql apps/dsh-telemetry-worker/src/index.ts apps/dsh-telemetry-worker/test/index.test.ts apps/dsh-telemetry-worker/wrangler.toml
git commit -m "feat(telemetry): aggregate anonymous desktop activity"
```

## Task 6: 恢复管理面板产品分析

**Files:**

- Modify: `apps/dsh-telemetry-worker/src/index.ts`
- Modify: `apps/dsh-telemetry-worker/test/index.test.ts`
- Modify: `apps/dsh-telemetry-worker/README.md`

**Step 1: 写失败测试。**

冻结管理 API 和 HTML 中 DAU、MAU、国家、版本、应用内更新漏斗、拓展坞漏斗的查询与空状态；断言没有 actor 明细或 IP 下钻。

**Step 2: 运行测试并确认失败。**

Run: `pnpm --filter @linxin666/dsh-telemetry-worker test`

Expected: FAIL，因为管理页只支持既有事件次数和网站下载国家。

**Step 3: 实现聚合查询与页面。**

为 7 日、28 日和月窗口提供群体指标，表格按国家、版本和固定漏斗阶段展示；所有查询使用参数化 SQL 和固定排序。

**Step 4: 运行测试并提交。**

Run: `pnpm --filter @linxin666/dsh-telemetry-worker test`

```bash
git add apps/dsh-telemetry-worker/src/index.ts apps/dsh-telemetry-worker/test/index.test.ts apps/dsh-telemetry-worker/README.md
git commit -m "feat(telemetry): restore desktop analytics dashboard"
```

## Task 7: 为主界面开放窄拓展坞能力

**Files:**

- Modify: `apps/dsh-desktop/src/desktop-contract.mjs`
- Modify: `apps/dsh-desktop/src/preload-main.cjs`
- Modify: `apps/dsh-desktop/test/desktop-contract.test.mjs`
- Modify: `apps/dsh-desktop/test/preload-main.test.mjs`
- Modify: `packages/dsh-desktop-client/src/index.ts`
- Modify: `packages/dsh-desktop-client/test/index.test.ts`

**Step 1: 写失败测试。**

断言主界面拥有 `extensions.open` 但没有 `extensions.manage`，一次 SDK 调用映射到 `toolAction('extensions')`，普通 Web 返回不可用。

**Step 2: 运行测试并确认失败。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/desktop-contract.test.mjs test/preload-main.test.mjs && pnpm --filter @linxin666/dsh-desktop-client test`

Expected: FAIL，因为当前主界面不能使用拓展坞能力，SDK 检查的是管理权限。

**Step 3: 实现窄能力。**

增加 `extensions.open`，只允许打开 surface；安装、删除、更新仍要求 `extensions.manage`。SDK 在 Desktop main surface 使用新能力，在旧宿主上保留安全失败。

**Step 4: 运行测试并提交。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/desktop-contract.test.mjs test/preload-main.test.mjs`

Run: `pnpm --filter @linxin666/dsh-desktop-client test`

```bash
git add apps/dsh-desktop/src/desktop-contract.mjs apps/dsh-desktop/src/preload-main.cjs apps/dsh-desktop/test/desktop-contract.test.mjs apps/dsh-desktop/test/preload-main.test.mjs packages/dsh-desktop-client/src/index.ts packages/dsh-desktop-client/test/index.test.ts
git commit -m "feat(desktop): expose extension dock open capability"
```

## Task 8: 在设置旁增加一键入口与三次提示

**Files:**

- Create: `apps/dsh-desktop/src/dock-nudge-state.mjs`
- Create: `apps/dsh-desktop/test/dock-nudge-state.test.mjs`
- Modify: `apps/dsh-desktop/src/electron-app.mjs`
- Modify: `apps/dsh-desktop/src/preload-main.cjs`
- Modify: `packages/dsh-desktop-client/src/index.ts`
- Modify: `packages/dsh-web-ui-settings/package.json`
- Modify: `packages/dsh-web-ui-settings/src/client/index.ts`
- Create: `packages/dsh-web-ui-settings/src/client/desktop-extension-dock.tsx`
- Create: `packages/dsh-web-ui-settings/src/client/desktop-extension-dock.test.tsx`

**Step 1: 写失败状态和 UI 测试。**

覆盖首次到第三次展示、第四次不展示、点击、关闭、Escape、状态损坏、普通 Web 隐藏、一次点击打开、打开失败反馈、键盘可达和固定提示文案。

**Step 2: 运行测试并确认失败。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/dock-nudge-state.test.mjs`

Run: `pnpm --filter @linxin666/dsh-client-ui-web-ui-settings test`

Expected: FAIL，因为状态 IPC、槽位入口和组件尚不存在。

**Step 3: 实现主进程状态与窄 SDK。**

在 Electron `userData` 保存引导状态，通过固定 IPC 提供 `get`、`shown`、`dismiss` 和 `clicked`；状态损坏默认不展示，所有写入原子化。

**Step 4: 实现槽位组件。**

设置包在 `sidebar.footer.action` 注册 Desktop 专用入口，复用现有视觉变量；callout 不抢焦点，支持关闭和 Escape，点击后直接打开 `extensions`。

入口与提示动作记录固定拓展坞事件，失败只显示本地短提示。

**Step 5: 运行测试并提交。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/dock-nudge-state.test.mjs`

Run: `pnpm --filter @linxin666/dsh-client-ui-web-ui-settings test`

```bash
git add apps/dsh-desktop/src/dock-nudge-state.mjs apps/dsh-desktop/src/electron-app.mjs apps/dsh-desktop/src/preload-main.cjs apps/dsh-desktop/test/dock-nudge-state.test.mjs packages/dsh-desktop-client/src/index.ts packages/dsh-web-ui-settings/package.json packages/dsh-web-ui-settings/src/client/index.ts packages/dsh-web-ui-settings/src/client/desktop-extension-dock.tsx packages/dsh-web-ui-settings/src/client/desktop-extension-dock.test.tsx
git commit -m "feat(ui): add one-click desktop extension dock"
```

## Task 9: 补拓展坞 E2E 和视觉验收

**Files:**

- Modify: `apps/dsh-desktop/e2e/desktop.spec.ts`
- Modify: `apps/dsh-desktop/playwright.config.ts`
- Create: `apps/dsh-desktop/test-fixtures/dock-nudge-state.json`

**Step 1: 写失败 E2E。**

覆盖入口与设置相邻、点击一次打开拓展坞、前三次提示、关闭后不再出现、键盘操作、125% 与 150% 缩放、深浅主题和窄窗口不溢出。

**Step 2: 运行并确认失败。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop test:e2e --grep "extension dock entry"`

Expected: FAIL，因为打包 UI 尚无新入口。

**Step 3: 修正视觉和可访问性问题。**

只调整设置包自身样式和 aria 属性，不改变槽位所有者布局；保存通过场景截图作为本地验证产物，不提交临时截图。

**Step 4: 运行测试并提交。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop test:e2e --grep "extension dock entry"`

```bash
git add apps/dsh-desktop/e2e/desktop.spec.ts apps/dsh-desktop/playwright.config.ts apps/dsh-desktop/test-fixtures/dock-nudge-state.json
git commit -m "test(desktop): verify extension dock onboarding"
```

## Task 10: 恢复官方发布的分析配置注入

**Files:**

- Modify: `.github/workflows/desktop-release.yml`
- Modify: `apps/dsh-desktop/scripts/write-telemetry-config.mjs`
- Modify: `apps/dsh-desktop/test/telemetry-config-script.test.mjs`
- Modify: `docs/adr/0007-default-on-anonymous-product-metrics.md`
- Modify: `apps/dsh-telemetry-worker/README.md`

**Step 1: 写失败测试。**

覆盖正式构建必须从 `vars.DSH_TELEMETRY_ENDPOINT` 生成带 `officialBuild: true` 的临时资源，端点缺失时 release fail closed，本地和源码包保持空端点；打包完成后不把生产端点写回 Git。

**Step 2: 运行测试并确认失败。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/telemetry-config-script.test.mjs`

Expected: FAIL，因为当前发布工作流明确要求端点为空。

**Step 3: 实现发布注入并更新隐私决策。**

工作流在 pack 前读取仓库变量并生成候选资源，pack 后恢复工作区空配置；ADR 明确周期匿名标识、国家级地区、保留期和关闭条件。

**Step 4: 运行测试并提交。**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/telemetry-config-script.test.mjs`

```bash
git add .github/workflows/desktop-release.yml apps/dsh-desktop/scripts/write-telemetry-config.mjs apps/dsh-desktop/test/telemetry-config-script.test.mjs docs/adr/0007-default-on-anonymous-product-metrics.md apps/dsh-telemetry-worker/README.md
git commit -m "build(desktop): inject official analytics endpoint"
```

## Task 11: 全量验证并生成无签名 NSIS 候选

**Files:**

- Modify if required: `apps/dsh-desktop/scripts/write-release-manifest.mjs`
- Modify if required: `apps/dsh-desktop/scripts/verify-release-manifest.mjs`
- Create locally, do not commit: `apps/dsh-desktop/dist/DeepSeek-Harness-Desktop-Setup-<version>-x64.exe`
- Create locally, do not commit: `apps/dsh-desktop/dist/SHA256SUMS.txt`
- Create locally, do not commit: `apps/dsh-desktop/dist/release-manifest.json`

**Step 1: 运行工作区和 Desktop 全量测试。**

Run: `pnpm verify`

Run: `pnpm --filter @deepseek-ai/dsh-desktop test`

Run: `pnpm --filter @linxin666/dsh-telemetry-worker test`

Expected: PASS；Windows 符号链接能力缺失时只允许既有明确 skip。

**Step 2: 构建无签名 NSIS。**

Run from `apps/dsh-desktop`: `$env:REQUIRE_SIGNING='false'; pnpm pack:win`

Expected: 生成 NSIS setup 和 unpacked 应用，签名检查记录 unsigned 而非失败。

**Step 3: 验证打包直启和隐私。**

Run from `apps/dsh-desktop`: `pnpm test:packaged-direct-start-matrix`

Run from `apps/dsh-desktop`: `pnpm test:e2e`

Run from `apps/dsh-desktop`: `pnpm verify:packaged`

Expected: 历史 Home、旧 Key、更新回执和拓展坞路径通过，产物和日志不含假秘密或开发端点。

**Step 4: 生成校验和和 unsigned manifest。**

Run from `apps/dsh-desktop`: `pnpm release:checksums`

Run from `apps/dsh-desktop`: `$env:REQUIRE_SIGNING='false'; pnpm release:manifest`

Run from `apps/dsh-desktop`: `$env:REQUIRE_SIGNING='false'; pnpm release:verify`

Expected: installer SHA-256 与 manifest 匹配，manifest 明确 `signed: false`。

**Step 5: 检查工作区并提交必要脚本修正。**

Run: `git status --short`

只提交源代码、测试和文档，不提交 `dist`、生产端点或秘密。

```bash
git add apps/dsh-desktop/scripts/write-release-manifest.mjs apps/dsh-desktop/scripts/verify-release-manifest.mjs
git commit -m "build(desktop): verify unsigned release candidate"
```

如果脚本无需修改，则不创建空提交。
