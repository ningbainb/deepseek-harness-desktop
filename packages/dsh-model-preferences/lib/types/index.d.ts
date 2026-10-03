import z from '@deepseek-ai/schemastery';
import { type ModelPreferencesConfig } from './core/config.ts';
export declare const name = "model-preferences";
export declare const inject: string[];
export * from './core/config.ts';
/** Host loader schema for the durable model-picker preferences. */
export declare const Config: z<ModelPreferencesConfig>;
/** The loader owns volatile field persistence for this plugin entry. */
export declare function apply(): void;
//# sourceMappingURL=index.d.ts.map