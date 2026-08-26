/** Host-only Desktop repair agent. It is inert outside a managed repair job. */
import type { Context } from '@deepseek-ai/cordis';
export * from './job.ts';
export * from './model-runner.ts';
export * from './tools.ts';
export declare const name = "desktop-repair";
export declare function apply(ctx: Context): void;
