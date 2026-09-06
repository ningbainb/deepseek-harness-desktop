import type { ModelCatalogFailure, ModelProviderGroup, ModelSelection } from '@deepseek-ai/dsh-api-remotes/client';
import type { ModelCatalogModel } from '@deepseek-ai/dsh-client-connection/client';
/** Settings namespace registered by the Host half. */
export declare const MODEL_PREFERENCES_SETTINGS_NAMESPACE = "model-preferences";
/** Structured provider/model identity. Never collapse this into a display label. */
export interface ModelKey {
    provider: string;
    model: string;
}
/** Persisted model-picker preferences. */
export interface ModelPreferencesConfig {
    version: 1;
    pinnedModels: ModelKey[];
    providerOrder: string[];
    disabledProviders: string[];
    recentModels: ModelKey[];
}
export declare const DEFAULT_MODEL_PREFERENCES: ModelPreferencesConfig;
export declare const MAX_PINNED_MODELS = 2;
export declare const MAX_RECENT_MODELS = 8;
export declare const MAX_PREFERENCE_STRING_LENGTH = 128;
/** One model row after the user's preference projection has been applied. */
export interface SortedModelOption {
    provider: string;
    providerName: string;
    model: ModelCatalogModel;
    pinned: boolean;
    current: boolean;
    providerDisabled: boolean;
}
/** One provider group after ordering and disabled-provider filtering. */
export interface SortedProviderGroup {
    id: string;
    name: string;
    models: SortedModelOption[];
    providerDisabled: boolean;
}
/** Catalog projection shared by the composer seat, /model, and settings card. */
export interface SortedModelCatalog {
    pinned: SortedModelOption[];
    groups: SortedProviderGroup[];
    failures: readonly ModelCatalogFailure[];
}
export interface ModelCatalogSnapshot {
    current: ModelSelection | null;
    groups: readonly ModelProviderGroup[];
    failures: readonly ModelCatalogFailure[];
}
export declare class InvalidModelPreferencesError extends Error {
    constructor(message: string);
}
/** Compare two structured identities. */
export declare function sameModelKey(left: ModelKey | undefined, right: ModelKey | undefined): boolean;
/** Normalize a value received from a settings scope or an older profile. */
export declare function normalizeModelPreferences(value: unknown): ModelPreferencesConfig;
/** Strict validation used by the Host settings section before persistence. */
export declare function assertModelPreferences(value: unknown): asserts value is ModelPreferencesConfig;
/** Record a successful selection without disturbing pinned/provider settings. */
export declare function recordRecentModel(config: ModelPreferencesConfig, selection: ModelKey): ModelPreferencesConfig;
/** JSON-safe opaque command-row identity; decoding retains both structured fields. */
export declare function modelOptionId(key: ModelKey): string;
/** Decode a command option identity without treating a display string as authority. */
export declare function modelKeyFromOptionId(id: string): ModelKey | undefined;
/**
 * Apply pinned models, provider ordering, and disabled-provider filtering to a
 * Host catalog. Official provider/model order is preserved for all ties.
 */
export declare function sortModelCatalog(snapshot: ModelCatalogSnapshot, config: ModelPreferencesConfig, options?: {
    includeDisabled?: boolean;
}): SortedModelCatalog;
/** Flatten a projection in the same order used by both UI entry points. */
export declare function flattenModelOptions(catalog: SortedModelCatalog): SortedModelOption[];
/** Build the complete Host selection, retaining the current effort only for the same route. */
export declare function selectionForModel(option: Pick<SortedModelOption, 'provider' | 'model'>, current: ModelSelection | null, reasoningEffort?: string): ModelSelection;
/** Return all catalog providers in effective settings order, including disabled rows. */
export declare function providerIdsInOrder(groups: readonly ModelProviderGroup[], config: ModelPreferencesConfig): string[];
/** Move one provider in the effective order while preserving unknown providers. */
export declare function moveProvider(config: ModelPreferencesConfig, provider: string, direction: -1 | 1, knownProviders: readonly string[]): ModelPreferencesConfig;
//# sourceMappingURL=config.d.ts.map