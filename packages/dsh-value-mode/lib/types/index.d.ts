/**
 * @module @linxin666/dsh-value-mode
 * Value Mode (性价比模式) DSH Plugin
 *
 * Balances coding performance and model cost by using the expert model as the
 * top-level controller and the configured executor model for delegated child
 * agents.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type ValueModeConfig } from './core/config.ts';
export declare const name = "value-mode";
export declare const inject: string[];
export * from './core/config.ts';
export * from './core/schema.ts';
export * from './core/policy.ts';
export * from './core/expert.ts';
export * from './core/state.ts';
export * from './core/model-selection.ts';
export * from './core/runtime-telemetry.ts';
export { dshHome } from './dsh-home.ts';
/** Absolute path of the bundled Value Mode agent-preset tree. */
export declare function bundledPresetsRoot(): string;
/**
 * Apply the Value Mode host plugin to Cordis context.
 */
export declare function apply(ctx: Context, initialConfig?: ValueModeConfig): void;
//# sourceMappingURL=index.d.ts.map