export declare const VALUE_MODE_SETTINGS_NAMESPACE = "value-mode";
export type ValueModeStrategy = 'saver' | 'balanced' | 'powerful';
export type ValueModeRole = 'controller' | 'subagent';
export interface ModelRouteSelection {
    provider?: string;
    model?: string;
    reasoningEffort?: string;
}
export interface SessionOverrideConfig {
    strategy?: ValueModeStrategy;
    expert?: ModelRouteSelection;
    enabled?: boolean;
}
export interface ValueModeConfig {
    enabled?: boolean;
    strategy?: ValueModeStrategy;
    executor?: ModelRouteSelection;
    expert?: ModelRouteSelection;
    maxOutputTokens?: number;
    maxContextChars?: number;
    maxDepth?: number;
    allowReview?: boolean;
    showExpertActivity?: boolean;
    maxExpertCallsPerTurn?: number;
    consecutiveFailuresThreshold?: number;
    autoReviewKeywords?: string[];
}
/**
 * Structural view of the host default-model selection used by the browser
 * onboarding flow and the host-side route fallback.
 */
export type DefaultModelSelection = ModelRouteSelection;
/**
 * Minimal browser-side view of the settings scope used by the Value Mode UI.
 * Keep this structural type local so leaf components do not create additional
 * direct imports from the runtime package.
 */
export interface ValueModeSettingsSnapshot<T> {
    status: 'loading' | 'ready' | 'unavailable';
    value: T | undefined;
    base: unknown;
    user: unknown;
    revision: number | undefined;
    writable: boolean;
    mode: 'host' | 'memory';
}
export interface ValueModeSettingsScope<T> {
    getSnapshot(): ValueModeSettingsSnapshot<T>;
    subscribe(listener: () => void): () => void;
}
export declare const DEFAULT_STRATEGY: ValueModeStrategy;
export declare const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
export declare const DEFAULT_MAX_CONTEXT_CHARS = 16000;
export declare const DEFAULT_MAX_DEPTH = 1;
export declare const DEFAULT_MAX_EXPERT_CALLS_PER_TURN = 3;
export declare const DEFAULT_ALLOW_REVIEW = true;
export declare const DEFAULT_SHOW_EXPERT_ACTIVITY = true;
export declare const DEFAULT_CONSECUTIVE_FAILURES_THRESHOLD = 2;
export declare const DEFAULT_AUTO_REVIEW_KEYWORDS: string[];
export declare function isCompleteModelRoute(route?: ModelRouteSelection): route is ModelRouteSelection & {
    provider: string;
    model: string;
};
/** True when both model choices have been explicitly saved in Value Mode. */
export declare function hasExplicitModelRoutes(config?: ValueModeConfig): boolean;
/**
 * Resolve the expert route used by the controller. A complete explicit Value
 * Mode selection always wins. A partial selection is retained only when there
 * is no usable host default, so an available default can heal an incomplete
 * legacy config without overwriting a deliberate expert choice.
 */
export declare function resolveExpertRoute(config?: ValueModeConfig, defaultExpert?: DefaultModelSelection): ModelRouteSelection | undefined;
/** Apply the host default model as the effective expert/controller route. */
export declare function resolveEffectiveConfig(config?: ValueModeConfig, defaultExpert?: DefaultModelSelection): ValueModeConfig;
export declare function isConfigured(config?: ValueModeConfig, defaultExpert?: DefaultModelSelection): boolean;
export declare function isEffectivelyActive(config?: ValueModeConfig, defaultExpert?: DefaultModelSelection): boolean;
export declare function resolveResolvedConfig(config?: ValueModeConfig, defaultExpert?: DefaultModelSelection): Required<ValueModeConfig>;
/**
 * Merge global config with session-specific overrides.
 */
export declare function resolveSessionConfig(globalConfig?: ValueModeConfig, override?: SessionOverrideConfig): ValueModeConfig;
//# sourceMappingURL=config.d.ts.map