import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { resolveEstimatorConfig } from './estimator.ts'
import type { EstimatorConfig } from './estimator.ts'
import { createLiveTokenUsageProjectionDefinition } from './projection.ts'
import { resolvePricingConfig } from './pricing.ts'
import type { PriceMode } from './pricing.ts'
import { BalanceService } from './balance-service.ts'
import { LedgerStore } from './ledger-store.ts'
import { makeLiveStatsRoutes } from './routes.ts'

/** Services required by the host projection plugin. */
export const inject = ['sessionProjections']

/**
 * Settings namespace of the live-stats capability — the section the web
 * settings surface edits.
 */
export const LIVE_STATS_SETTINGS_NAMESPACE = settingsNamespace('live-stats')

/** Plugin configuration for provider-independent token estimation. */
export interface Config extends EstimatorConfig {
  /** Master switch for the plugin (browser half + host projection). */
  enabled?: boolean
  /** Whether the client should render the estimated cost line. */
  showCost?: boolean
  /** Which DeepSeek price period the cost line should use. */
  priceMode?: PriceMode
}

/** Runtime schema for {@link Config}. */
export const Config: z<Config> = z.object({
  charsPerToken: z.number().min(0.01).default(4),
  blockOverhead: z.number().step(1).min(0).default(4),
  roleOverhead: z.number().step(1).min(0).default(4),
  enabled: z.boolean().default(true),
  showCost: z.boolean().default(true),
  priceMode: z.string().pattern(/^(auto|peak|offpeak)$/).default('auto') as unknown as z<PriceMode>,
})

/**
 * Register the replayable live-token projection and balance HTTP routes.
 */
export function apply(
  ctx: Context,
  config: Config = {},
  deps?: { ledgerFilePath?: string },
): void {
  let current: () => Config = () => config ?? {}
  let disposeProjection: (() => void) | undefined
  const ledgerStore = new LedgerStore(
    deps?.ledgerFilePath === undefined ? undefined : { filePath: deps.ledgerFilePath },
  )

  const rebuild = (): void => {
    if (disposeProjection !== undefined) {
      disposeProjection()
      disposeProjection = undefined
    }
    if ((current().enabled ?? true) === false) return
    const source = current()
    const spec = resolveEstimatorConfig({
      ...(source.charsPerToken === undefined ? {} : { charsPerToken: source.charsPerToken }),
      ...(source.blockOverhead === undefined ? {} : { blockOverhead: source.blockOverhead }),
      ...(source.roleOverhead === undefined ? {} : { roleOverhead: source.roleOverhead }),
    })
    disposeProjection = ctx.sessionProjections.register(createLiveTokenUsageProjectionDefinition(
      spec,
      resolvePricingConfig({ priceMode: source.priceMode }),
      source.showCost !== false,
    ))
  }

  // Persist every settled step into the ledger. The projection fold stays
  // pure (it replays on cold loads), so recording lives in this runtime
  // subscription; the durable `session:turn:step` dedupe key keeps replays
  // from double-counting. `onChanged` also fires per streamed delta — the
  // in-memory watermark skips those without touching the ledger.
  ctx.effect(() => {
    const settledWatermarks = new Map<string, string>()
    return ctx.sessionProjections.onChanged((session, key) => {
      if (key !== 'liveTokenUsage') return
      const last = ctx.sessionProjections.stateOf(session, 'liveTokenUsage')?.last
      if (!last) return
      const watermark = `${last.turn}:${last.step}`
      if (settledWatermarks.get(session.id) === watermark) return
      settledWatermarks.set(session.id, watermark)
      const model = session.requestContext()?.model ?? session.requestHeader()?.config.model
      ledgerStore.recordUsage({
        ...(model === undefined ? {} : { model }),
        inputTokens: last.buckets.uncachedInputTokens,
        outputTokens: last.buckets.outputTokens,
        cacheReadTokens: last.buckets.cacheReadTokens,
        cacheWriteTokens: last.buckets.cacheWriteTokens,
        ...(last.peakTokensPerSecond === undefined ? {} : { peakTps: last.peakTokensPerSecond }),
        dedupeKey: `${session.id}:${watermark}`,
      })
    })
  }, 'live-stats: ledger bridge')

  // When webServer is mounted, register balance and stats routes
  ctx.inject(['webServer'], (hostCtx) => {
    const balanceService = new BalanceService(undefined, hostCtx)
    const routes = makeLiveStatsRoutes({ service: balanceService, ledger: ledgerStore })
    hostCtx.effect(() => {
      const disposers = routes.map((route) => hostCtx.webServer.register(route))
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'live-stats: routes')
  })

  installSettingsSection(ctx, LIVE_STATS_SETTINGS_NAMESPACE, Config, config ?? {}, {
    setSource: (source) => { current = source },
    onChange: rebuild,
  })
  rebuild()
}

export { BalanceService } from './balance-service.ts'
export { LedgerStore, PEAK_TPS_ALGORITHM_VERSION } from './ledger-store.ts'
export { makeLiveStatsRoutes, BALANCE_API_PATH, STATS_API_PATH } from './routes.ts'
export { createLiveTokenUsageProjectionDefinition } from './projection.ts'
export { resolveEstimatorConfig } from './estimator.ts'
export { estimateTokenCost, resolvePricePeriod, resolvePricingConfig } from './pricing.ts'
export type { EstimatorConfig, EstimatorSpec } from './estimator.ts'
export type { PriceMode, PricePeriod, PricingConfig, PricingSpec, TokenCostEstimate, TokenUsageBuckets } from './pricing.ts'
export type { DailyUsageRecord, HeatmapDay, ModelBreakdownEntry, UsageStatsSummary } from './ledger-store.ts'
