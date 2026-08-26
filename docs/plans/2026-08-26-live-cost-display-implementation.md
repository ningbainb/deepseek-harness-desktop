# 实时费用显示 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在现有 `dsh-live-stats` 插件的 composer 状态行中显示会话级 token 用量和按 DeepSeek 峰谷价格计算的估算费用，作为 Desktop 3.1.0 的首个功能。

**Architecture:** 复用现有 `liveTokenUsage` 会话投影，不新增 Electron IPC，也不修改 DSH 源码。Host 侧在投影 view 阶段根据四类 token bucket 计算费用，并把费用、货币和当前峰/谷档位作为可选投影字段发送给客户端；Browser 侧在现有 composer dock 中渲染一行紧凑的用量/价格信息。价格计算保持为独立纯模块，便于后续加入模型价格表或历史按调用时间计价。

**Tech Stack:** TypeScript, React 18, Cordis plugin SDK, schemastery, Zod, Vitest, CSS inline design tokens。

---

### Task 1: 建立峰谷计价纯逻辑

**Files:**
- Create: `packages/dsh-live-stats/src/pricing.ts`
- Create: `packages/dsh-live-stats/tests/pricing.spec.ts`

**Step 1: Write the failing test**

覆盖以下行为：北京时间 09:00–12:00 和 14:00–18:00 为 peak，其余为 offpeak；`auto`、`peak`、`offpeak` 三种模式可解析；费用按 uncached input + cache write、cache read、output 分桶计算；token 数为零和无效价格不会产生 NaN。

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @linxin666/dsh-live-stats test -- pricing.spec.ts`

Expected: FAIL because `pricing.ts` and its exported functions do not exist.

**Step 3: Write minimal implementation**

实现 `PriceMode`、`PricingSpec`、默认 DeepSeek v4-flash 当前峰谷价格、北京时间档位解析、价格配置校验和 `estimateTokenCost`。默认价格采用缓存命中 `0.05/0.10`、缓存未命中 `1.5/3`、输出 `4.5/9` 元/百万 token；`cacheWriteTokens` 按未命中输入价格计入。所有计算保留为人民币金额，结果归一化到非负有限数。

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @linxin666/dsh-live-stats test -- pricing.spec.ts`

Expected: PASS.

### Task 2: 将估算费用接入 liveTokenUsage 投影

**Files:**
- Modify: `packages/dsh-live-stats/src/index.ts`
- Modify: `packages/dsh-live-stats/src/projection.ts`
- Modify: `packages/dsh-live-stats/src/types/token-meter.d.ts`
- Modify: `packages/dsh-live-stats/tests/projection.spec.ts`

**Step 1: Write the failing test**

增加 projection 断言：usage chunk 产生的精确 token 用量能够得到对应费用；流式估算阶段也能得到费用；配置 `showCost: false` 时不发送可见费用；输出包含 `estimatedCost`、`costCurrency` 和 `pricePeriod`。

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @linxin666/dsh-live-stats test -- projection.spec.ts`

Expected: FAIL because the projection type and view do not yet contain price fields.

**Step 3: Write minimal implementation**

扩展插件配置 `showCost` 与 `priceMode`，默认开启和自动峰谷切换；让 projection definition 捕获已解析的 pricing spec，在 `view` 中从当前聚合 bucket 计算费用。费用字段使用可选扩展，保持旧客户端只读取 token/TPS 字段时的兼容性。扩展本地 token-meter 类型声明和 projection schema，但不改变持久化 state 版本或 session log 结构。

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @linxin666/dsh-live-stats test -- projection.spec.ts`

Expected: PASS.

### Task 3: 在 composer dock 显示费用

**Files:**
- Modify: `packages/dsh-live-stats/src/client/TpsLine.tsx`
- Modify: `packages/dsh-live-stats/src/client/index.ts`
- Modify: `packages/dsh-live-stats/tests/tps-line.spec.tsx`
- Modify: `packages/dsh-live-stats/tests/client-apply.spec.tsx`

**Step 1: Write the failing test**

增加 token 紧凑格式、人民币金额格式和费用行渲染断言；没有 projection 时不渲染；有 projection 时显示 `API 用量`、输入/输出 token 和 `≈¥` 金额；已有 TPS 行继续保留。

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @linxin666/dsh-live-stats test -- tps-line.spec.tsx client-apply.spec.tsx`

Expected: FAIL because the dock only renders TPS.

**Step 3: Write minimal implementation**

在现有 dock 中增加紧凑价格行，沿用 `--dsw-*` 设计 token 和 `dsh` composer 宽度变量。价格使用 `≈` 前缀，金额至少显示两位小数；输入 token 包含缓存命中/写入，输出 token 单独显示。保持原有 TPS 行的挂载顺序和 id，不新增 Electron 主进程逻辑。

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @linxin666/dsh-live-stats test -- tps-line.spec.tsx client-apply.spec.tsx`

Expected: PASS.

### Task 4: 增加设置开关、双语文档和包级验证

**Files:**
- Modify: `packages/dsh-live-stats/src/client/LiveStatsSettingsCard.tsx`
- Modify: `packages/dsh-live-stats/src/client/locales.ts`
- Modify: `packages/dsh-live-stats/README.md`
- Modify: `packages/dsh-live-stats/README.zh.md`
- Modify: `packages/dsh-live-stats/README.i18n.yaml`

**Step 1: Write the failing test**

扩展设置卡测试，确认显示费用开关存在、默认可继承、双语 key 集完整。

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @linxin666/dsh-live-stats test -- settings-card.spec.tsx`

Expected: FAIL because the setting and locale keys do not yet exist.

**Step 3: Write minimal implementation**

增加 `showCost` 设置字段和中英文文案，README 同步说明：费用是基于 provider token usage 的实时估算，默认按 DeepSeek 当前峰谷价计算，不代表最终账单；更新 i18n hash 文件。

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @linxin666/dsh-live-stats test`

Expected: PASS.

### Task 5: 构建与桌面端回归验证

**Files:**
- No new source files.

**Step 1: Run package typecheck and build**

Run: `pnpm --filter @linxin666/dsh-live-stats typecheck` and `pnpm --filter @linxin666/dsh-live-stats build`

Expected: both commands exit with code 0 and produce the package bundle.

**Step 2: Run desktop-related smoke checks**

Run: `pnpm --filter @deepseek-ai/dsh-desktop test -- test/desktop-surfaces.test.mjs test/app-version.test.mjs` from `apps/dsh-desktop` as supported by the repository scripts.

Expected: PASS; no Electron IPC or desktop shell contract is changed.

**Step 3: Check repository invariants**

Run: `pnpm docs:check`, `pnpm sync-shared:check`, and `pnpm dsh-audit:check`.

Expected: PASS. Do not bump the existing 3.0.9 tag during this feature work; the release version will be updated to 3.1.0 in the separate release-preparation step.
