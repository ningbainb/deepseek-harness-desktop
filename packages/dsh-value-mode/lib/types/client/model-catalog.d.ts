import type { Context } from '@deepseek-ai/cordis';
import type { ValueModeModelCatalog } from './ModelPicker.tsx';
import type { ValueModeLocaleKey } from './locales.ts';
export declare const MODEL_CATALOG_TIMEOUT_MS = 10000;
export declare class ModelCatalogChangedError extends Error {
    name: string;
}
/** A bounded advisory read, not a replacement for the native selection directory. */
export declare function createModelCatalogLoader(ctx: Context, translate: (key: ValueModeLocaleKey) => string): () => Promise<ValueModeModelCatalog>;
//# sourceMappingURL=model-catalog.d.ts.map