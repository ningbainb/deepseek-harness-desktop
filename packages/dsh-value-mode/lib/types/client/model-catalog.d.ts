import type { Context } from '@deepseek-ai/cordis';
import type { ModelCatalogFailure, ModelProviderGroup } from '@deepseek-ai/dsh-api-remotes/client';
import type { ValueModeLocaleKey } from './locales.ts';
export interface ValueModeModelCatalog {
    /** Models exposed by currently registered provider routes. */
    groups: readonly ModelProviderGroup[];
    /** Provider-local lookup failures; successful groups remain selectable. */
    failures?: readonly ModelCatalogFailure[];
}
export type ModelCatalogLoader = (action?: 'retry') => Promise<ValueModeModelCatalog>;
export declare const MODEL_CATALOG_TIMEOUT_MS = 10000;
export declare const CODEX_MODEL_CATALOG_CHANGED = "dsh-codex-model-catalog-changed";
export declare class ModelCatalogChangedError extends Error {
    name: string;
}
/** A bounded advisory read, not a replacement for the native selection directory. */
export declare function createModelCatalogLoader(ctx: Context, translate: (key: ValueModeLocaleKey) => string): (request?: "retry" | number) => Promise<ValueModeModelCatalog>;
//# sourceMappingURL=model-catalog.d.ts.map