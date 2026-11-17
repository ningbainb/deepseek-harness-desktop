import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import type { ProjectionHandle } from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { resolveEstimatorConfig } from './estimator.ts'
import type { EstimatorConfig } from './estimator.ts'
import { createLiveTokenUsageProjectionDefinition } from './projection.ts'
import type { LiveTokenUsageState } from './projection.ts'
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
export const LIVE_STATS_SETTINGS_NAMESPACE = 'live-stats'

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
export const Config = z.object({
  charsPerToken: z.number().min(0.01).default(4).volatile(),
  blockOverhead: z.number().step(1).min(0).default(4).volatile(),
  roleOverhead: z.number().step(1).min(0).default(4).volatile(),
  enabled: z.boolean().default(true).volatile(),
  showCost: z.boolean().default(true).volatile(),
  priceMode: (z.string().pattern(/^(auto|peak|offpeak)$/).default('auto') as unknown as z<PriceMode>).volatile(),
})

type ConfigField<T> = T | { get(): T | undefined }
type LiveConfig = { [K in keyof Config]?: ConfigField<NonNullable<Config[K]>> }

function fieldValue<T>(field: ConfigField<T> | undefined, fallback: T): T {
  if (field === undefined) return fallback
  return typeof field === 'object' && field !== null && 'get' in field ? field.get() ?? fallback : field
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    'loader/volatile-update'(paths: readonly (readonly string[])[]): void
  }
}

/**
 * Register the replayable live-token projection and balance HTTP routes.
 */
export async function apply(
  ctx: Context,
  config: LiveConfig = {},
  deps?: { ledgerFilePath?: string },
): Promise<void> {
  const current = (): Config => ({
    charsPerToken: fieldValue(config.charsPerToken, 4),
    blockOverhead: fieldValue(config.blockOverhead, 4),
    roleOverhead: fieldValue(config.roleOverhead, 4),
    enabled: fieldValue(config.enabled, true),
    showCost: fieldValue(config.showCost, true),
    priceMode: fieldValue(config.priceMode, 'auto' as PriceMode),
  })
  let projection: ProjectionHandle<LiveTokenUsageState> | undefined
  let revision = 0
  let disposed = false
  let pending = Promise.resolve()
  let requestedConfig: string | undefined
  const ledgerStore = new LedgerStore(
    deps?.ledgerFilePath === undefined ? undefined : { filePath: deps.ledgerFilePath },
  )

  const rebuild = (): void => {
    const source = current()
    const signature = JSON.stringify(source)
    if (disposed || signature === requestedConfig) return
    requestedConfig = signature
    const requestedRevision = ++revision
    // Release the previous registration before acquiring the same key: the SDK
    // shares an existing unit until its final owner has finished disposal.
    pending = pending.then(async () => {
      const previous = projection
      await previous?.dispose()
      if (disposed || requestedRevision !== revision || source.enabled === false) return
      const spec = resolveEstimatorConfig({
        ...(source.charsPerToken === undefined ? {} : { charsPerToken: source.charsPerToken }),
        ...(source.blockOverhead === undefined ? {} : { blockOverhead: source.blockOverhead }),
        ...(source.roleOverhead === undefined ? {} : { roleOverhead: source.roleOverhead }),
      })
      const handle = await ctx.sessionProjections.register(createLiveTokenUsageProjectionDefinition(
        spec,
        resolvePricingConfig({ priceMode: source.priceMode }),
        source.showCost !== false,
      ))
      if (disposed || requestedRevision !== revision) await handle.dispose()
      else projection = handle
    }).catch(error => { ctx.logger.error(error) })
  }

  ctx.effect(() => () => {
    disposed = true
    ++revision
    // Also wait for a registration already in flight; it must release its
    // handle rather than publish it after the plugin has been unloaded.
    return pending.then(async () => {
      const previous = projection
      projection = undefined
      await previous?.dispose()
    })
  }, 'live-stats: projection lifecycle')

  // Persist every settled step into the ledger. The projection fold stays
  // pure (it replays on cold loads), so recording lives in this runtime
  // subscription; the durable `session:turn:step` dedupe key keeps replays
  // from double-counting. Observe Session events independently of registry
  // registration: onChanged disappears during an asynchronous config handoff.
  // The SDK explicitly retains handle reads after disposal, so keep the last
  // reader until its replacement is ready. Each settlement is read immediately,
  // rather than collapsing several steps into a later state's single `last`.
  ctx.effect(() => {
    const settledWatermarks = new Map<string, string>()
    return ctx.on('session/event', (session, event) => {
      if (disposed || current().enabled === false || event.type !== 'step/end') return
      const last = projection?.stateOf(session).last
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

  ctx.on('loader/volatile-update', rebuild)
  rebuild()
  // Cordis must not report the plugin ready before the typed ledger reader is
  // available; a settled step immediately after startup must be recorded.
  await pending
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
