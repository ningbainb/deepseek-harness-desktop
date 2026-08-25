export type PriceMode = 'auto' | 'peak' | 'offpeak'

export type PricePeriod = Exclude<PriceMode, 'auto'>

export interface TokenUsageBuckets {
  readonly uncachedInputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
}

export interface PricingConfig {
  readonly priceMode?: PriceMode
}

export interface PricingSpec {
  readonly priceMode: PriceMode
  readonly peak: PriceRates
  readonly offpeak: PriceRates
}

export interface PriceRates {
  readonly cacheReadPerMillion: number
  readonly inputPerMillion: number
  readonly outputPerMillion: number
}

export interface TokenCostEstimate {
  readonly amount: number
  readonly period: PricePeriod
}

const MILLION = 1_000_000

const DEFAULT_RATES: Pick<PricingSpec, 'peak' | 'offpeak'> = {
  peak: {
    cacheReadPerMillion: 0.1,
    inputPerMillion: 3,
    outputPerMillion: 9,
  },
  offpeak: {
    cacheReadPerMillion: 0.05,
    inputPerMillion: 1.5,
    outputPerMillion: 4.5,
  },
}

function isPriceMode(value: unknown): value is PriceMode {
  return value === 'auto' || value === 'peak' || value === 'offpeak'
}

/** Resolve the small user-facing price configuration into an immutable spec. */
export function resolvePricingConfig(config: PricingConfig = {}): PricingSpec {
  if (config.priceMode !== undefined && !isPriceMode(config.priceMode)) {
    throw new Error('live-stats: priceMode must be auto, peak, or offpeak')
  }
  return {
    priceMode: config.priceMode ?? 'auto',
    peak: { ...DEFAULT_RATES.peak },
    offpeak: { ...DEFAULT_RATES.offpeak },
  }
}

function beijingMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find(part => part.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

/** Resolve DeepSeek's current peak/off-peak slot using Beijing time. */
export function resolvePricePeriod(now: Date, mode: PriceMode = 'auto'): PricePeriod {
  if (mode === 'peak' || mode === 'offpeak') return mode
  const minutes = beijingMinutes(now)
  return (minutes >= 9 * 60 && minutes < 12 * 60)
    || (minutes >= 14 * 60 && minutes < 18 * 60)
    ? 'peak'
    : 'offpeak'
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0
}

/** Calculate the current-session cost from the disjoint token buckets. */
export function estimateTokenCost(
  buckets: TokenUsageBuckets,
  spec: PricingSpec,
  now: Date = new Date(),
): TokenCostEstimate {
  const period = resolvePricePeriod(now, spec.priceMode)
  const rates = spec[period]
  const uncachedInput = finiteNonNegative(buckets.uncachedInputTokens)
    + finiteNonNegative(buckets.cacheWriteTokens)
  const cacheRead = finiteNonNegative(buckets.cacheReadTokens)
  const output = finiteNonNegative(buckets.outputTokens)
  const amount = (
    uncachedInput * rates.inputPerMillion
    + cacheRead * rates.cacheReadPerMillion
    + output * rates.outputPerMillion
  ) / MILLION
  return { amount: Number.isFinite(amount) && amount >= 0 ? amount : 0, period }
}
