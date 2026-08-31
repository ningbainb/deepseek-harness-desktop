export const VALUE_MODE_SETTINGS_NAMESPACE = 'value-mode';
export const DEFAULT_STRATEGY = 'balanced';
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
export const DEFAULT_MAX_CONTEXT_CHARS = 16000;
export const DEFAULT_MAX_DEPTH = 1;
export const DEFAULT_MAX_EXPERT_CALLS_PER_TURN = 3;
export const DEFAULT_ALLOW_REVIEW = true;
export const DEFAULT_SHOW_EXPERT_ACTIVITY = true;
export const DEFAULT_CONSECUTIVE_FAILURES_THRESHOLD = 2;
export const DEFAULT_AUTO_REVIEW_KEYWORDS = [
    'security',
    'auth',
    'credential',
    'migration',
    'updater',
    'database',
    'schema',
    'permission',
];
function hasAnyRouteValue(route) {
    return Boolean(route && ((typeof route.provider === 'string' && route.provider.trim().length > 0) ||
        (typeof route.model === 'string' && route.model.trim().length > 0)));
}
export function isCompleteModelRoute(route) {
    return (typeof route?.provider === 'string' &&
        route.provider.trim().length > 0 &&
        typeof route.model === 'string' &&
        route.model.trim().length > 0);
}
/** True when both model choices have been explicitly saved in Value Mode. */
export function hasExplicitModelRoutes(config) {
    return isCompleteModelRoute(config?.executor) && isCompleteModelRoute(config?.expert);
}
/**
 * Resolve the expert route used by the controller. A complete explicit Value
 * Mode selection always wins. A partial selection is retained only when there
 * is no usable host default, so an available default can heal an incomplete
 * legacy config without overwriting a deliberate expert choice.
 */
export function resolveExpertRoute(config, defaultExpert) {
    if (isCompleteModelRoute(config?.expert))
        return config.expert;
    if (defaultExpert !== undefined)
        return defaultExpert;
    if (hasAnyRouteValue(config?.expert))
        return config?.expert;
    return defaultExpert;
}
/** Apply the host default model as the effective expert/controller route. */
export function resolveEffectiveConfig(config = {}, defaultExpert) {
    const expert = resolveExpertRoute(config, defaultExpert);
    return expert === undefined ? { ...config } : { ...config, expert };
}
export function isConfigured(config, defaultExpert) {
    if (!config)
        return false;
    const exec = config.executor;
    const exp = resolveExpertRoute(config, defaultExpert);
    return (isCompleteModelRoute(exec) &&
        isCompleteModelRoute(exp));
}
export function isEffectivelyActive(config, defaultExpert) {
    return config?.enabled === true && isConfigured(config, defaultExpert);
}
export function resolveResolvedConfig(config, defaultExpert) {
    const strategy = config?.strategy ?? DEFAULT_STRATEGY;
    const defaultReviewForStrategy = strategy === 'saver' ? false : (config?.allowReview ?? DEFAULT_ALLOW_REVIEW);
    const expert = resolveExpertRoute(config, defaultExpert);
    return {
        enabled: config?.enabled ?? false,
        strategy,
        executor: {
            provider: config?.executor?.provider?.trim() || undefined,
            model: config?.executor?.model?.trim() || undefined,
            reasoningEffort: config?.executor?.reasoningEffort?.trim() || undefined,
        },
        expert: {
            provider: expert?.provider?.trim() || undefined,
            model: expert?.model?.trim() || undefined,
            reasoningEffort: expert?.reasoningEffort?.trim() || undefined,
        },
        maxOutputTokens: Math.max(256, config?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS),
        maxContextChars: Math.max(1000, config?.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS),
        maxDepth: Math.max(1, config?.maxDepth ?? DEFAULT_MAX_DEPTH),
        allowReview: defaultReviewForStrategy,
        showExpertActivity: config?.showExpertActivity ?? DEFAULT_SHOW_EXPERT_ACTIVITY,
        maxExpertCallsPerTurn: Math.max(1, config?.maxExpertCallsPerTurn ?? DEFAULT_MAX_EXPERT_CALLS_PER_TURN),
        consecutiveFailuresThreshold: Math.max(1, config?.consecutiveFailuresThreshold ?? DEFAULT_CONSECUTIVE_FAILURES_THRESHOLD),
        autoReviewKeywords: Array.isArray(config?.autoReviewKeywords) && config.autoReviewKeywords.length > 0
            ? config.autoReviewKeywords
            : [...DEFAULT_AUTO_REVIEW_KEYWORDS],
    };
}
/**
 * Merge global config with session-specific overrides.
 */
export function resolveSessionConfig(globalConfig = {}, override) {
    if (!override)
        return globalConfig;
    return {
        ...globalConfig,
        ...(override.enabled !== undefined ? { enabled: override.enabled } : {}),
        ...(override.strategy !== undefined ? { strategy: override.strategy } : {}),
        ...(override.expert !== undefined ? { expert: override.expert } : {}),
    };
}
