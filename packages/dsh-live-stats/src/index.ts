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
export function apply(ctx: Context, config: Config = {}): void {
  let current: () => Config = () => config ?? {}
  let disposeProjection: (() => void) | undefined
  const ledgerStore = new LedgerStore()

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
export { LedgerStore } from './ledger-store.ts'
export { makeLiveStatsRoutes, BALANCE_API_PATH, STATS_API_PATH } from './routes.ts'
export { createLiveTokenUsageProjectionDefinition } from './projection.ts'
export { resolveEstimatorConfig } from './estimator.ts'
export { estimateTokenCost, resolvePricePeriod, resolvePricingConfig } from './pricing.ts'
export type { EstimatorConfig, EstimatorSpec } from './estimator.ts'
export type { PriceMode, PricePeriod, PricingConfig, PricingSpec, TokenCostEstimate, TokenUsageBuckets } from './pricing.ts'
export type { DailyUsageRecord, HeatmapDay, ModelBreakdownEntry, UsageStatsSummary } from './ledger-store.ts'
