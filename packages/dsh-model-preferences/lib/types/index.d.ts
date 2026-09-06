import type { Context } from '@deepseek-ai/cordis';
import z from 'schemastery';
import { type ModelPreferencesConfig } from './core/config.ts';
export declare const name = "model-preferences";
export declare const inject: string[];
export * from './core/config.ts';
/** Host loader schema for the durable model-picker preferences. */
export declare const Config: z<ModelPreferencesConfig>;
/** Install the Host settings namespace; model routing remains official SDK-owned. */
export declare function apply(ctx: Context, initialConfig?: ModelPreferencesConfig): void;
//# sourceMappingURL=index.d.ts.map