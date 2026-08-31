import z from 'schemastery';
import { DEFAULT_STRATEGY, DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_MAX_CONTEXT_CHARS, DEFAULT_MAX_DEPTH, DEFAULT_MAX_EXPERT_CALLS_PER_TURN, DEFAULT_ALLOW_REVIEW, DEFAULT_SHOW_EXPERT_ACTIVITY, DEFAULT_CONSECUTIVE_FAILURES_THRESHOLD, DEFAULT_AUTO_REVIEW_KEYWORDS, } from "./config.js";
const ModelRouteSchema = z.object({
    provider: z.string(),
    model: z.string(),
    reasoningEffort: z.string(),
});
export const Config = z.object({
    enabled: z.boolean().default(false),
    strategy: z.union(['saver', 'balanced', 'powerful']).default(DEFAULT_STRATEGY),
    executor: ModelRouteSchema,
    expert: ModelRouteSchema,
    maxOutputTokens: z.number().default(DEFAULT_MAX_OUTPUT_TOKENS),
    maxContextChars: z.number().default(DEFAULT_MAX_CONTEXT_CHARS),
    maxDepth: z.number().default(DEFAULT_MAX_DEPTH),
    allowReview: z.boolean().default(DEFAULT_ALLOW_REVIEW),
    showExpertActivity: z.boolean().default(DEFAULT_SHOW_EXPERT_ACTIVITY),
    maxExpertCallsPerTurn: z.number().default(DEFAULT_MAX_EXPERT_CALLS_PER_TURN),
    consecutiveFailuresThreshold: z.number().default(DEFAULT_CONSECUTIVE_FAILURES_THRESHOLD),
    autoReviewKeywords: z.array(z.string()).default(DEFAULT_AUTO_REVIEW_KEYWORDS),
});
