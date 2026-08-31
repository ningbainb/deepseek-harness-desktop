/**
 * Localized wire/type surface for @deepseek-ai/dsh-token-meter's client
 * namespace.
 *
 * The dsh source checkout's token-meter carries a personal customization —
 * the liveTokenUsage projection (per-step token estimates plus generation
 * throughput) that this plugin registers into the session-projection map
 * table. The official package does not export it, so the types are declared
 * here (structural copies of the customized projection interfaces) and the
 * map-table augmentation is re-declared against the official
 * session-projection types.
 */

declare module '@deepseek-ai/dsh-token-meter/client' {
  /** Durable provider usage accumulated across the complete durable log. */
  export interface TokenUsageProjection {
    uncachedInputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
  }

  /** Newest request pressure paired with the newest known route capacity. */
  export interface ContextPressureProjection {
    pressureTokens?: number
    projectedTokens?: number
    contextWindow?: number
  }

  /** Heuristic system/tools/message composition of the next request. */
  export interface ContextBreakdownProjection {
    systemTokens: number
    toolsTokens: number
    messageTokens: number
  }

  /** Live per-step token estimates plus streaming throughput. */
  export interface LiveTokenUsageProjection extends TokenUsageProjection {
    /** True while any active step's buckets are heuristic estimates. */
    estimated: boolean
    /** Latest rolling one-second output rate from streamed deltas. */
    tokensPerSecond?: number
    /** Maximum rolling one-second output rate observed in the latest step. */
    peakTokensPerSecond?: number
    /** Current-session cost estimate in the projection currency. */
    estimatedCost?: number
    /** Currency code used for the cost estimate. */
    costCurrency?: string
    /** Current DeepSeek pricing period. */
    pricePeriod?: 'peak' | 'offpeak'
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Live per-step token estimates plus generation throughput. */
    liveTokenUsage: import('@deepseek-ai/dsh-token-meter/client').LiveTokenUsageProjection
  }

  interface SessionProjectionStateMap {
    /** Plain-JSON replay state owned by the Desktop Live Stats fold. */
    liveTokenUsage: import('../projection.ts').LiveTokenUsageState
  }
}

// Module-augmentation marker: makes this file an external module so the
// declare module blocks above merge (augment) their targets instead of
// shadowing them as ambient declarations.
export {}

