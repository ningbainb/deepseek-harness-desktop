import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_STRATEGY,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_MAX_CONTEXT_CHARS,
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_EXPERT_CALLS_PER_TURN,
  DEFAULT_ALLOW_REVIEW,
  DEFAULT_SHOW_EXPERT_ACTIVITY,
  DEFAULT_CONSECUTIVE_FAILURES_THRESHOLD,
  DEFAULT_AUTO_REVIEW_KEYWORDS,
  type ValueModeConfig,
} from './config.ts'

const ModelRouteSchema = z.object({
  provider: z.string(),
  model: z.string(),
  reasoningEffort: z.string(),
})

export const Config: z<ValueModeConfig> = z.object({
  enabled: z.boolean().default(false).volatile(),
  strategy: z.union(['saver', 'balanced', 'powerful']).default(DEFAULT_STRATEGY).volatile(),
  executor: ModelRouteSchema.volatile(),
  expert: ModelRouteSchema.volatile(),
  maxOutputTokens: z.number().default(DEFAULT_MAX_OUTPUT_TOKENS).volatile(),
  maxContextChars: z.number().default(DEFAULT_MAX_CONTEXT_CHARS).volatile(),
  maxDepth: z.number().default(DEFAULT_MAX_DEPTH).volatile(),
  allowReview: z.boolean().default(DEFAULT_ALLOW_REVIEW).volatile(),
  showExpertActivity: z.boolean().default(DEFAULT_SHOW_EXPERT_ACTIVITY).volatile(),
  maxExpertCallsPerTurn: z.number().default(DEFAULT_MAX_EXPERT_CALLS_PER_TURN).volatile(),
  consecutiveFailuresThreshold: z.number().default(DEFAULT_CONSECUTIVE_FAILURES_THRESHOLD).volatile(),
  autoReviewKeywords: z.array(z.string()).default(DEFAULT_AUTO_REVIEW_KEYWORDS).volatile(),
}) as unknown as z<ValueModeConfig>
