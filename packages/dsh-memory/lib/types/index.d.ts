import type { Context } from '@deepseek-ai/cordis';
import z from 'schemastery';
import { type MemoryConfig } from './core/config.ts';
export declare const name = "memory";
export declare const inject: string[];
export * from './core/config.ts';
export * from './core/schema.ts';
export * from './core/rank.ts';
export * from './core/query.ts';
export * from './core/service.ts';
export { MemoryStore, MemoryStoreError } from './store.ts';
export { makeMemoryRoutes, MEMORY_API_PREFIX } from './routes.ts';
export { createMemoryTool } from './tools.ts';
export declare const Config: z<MemoryConfig>;
/** Register owner-safe memory prompt, tool, settings and local routes. */
export declare function apply(ctx: Context, initialConfig?: MemoryConfig): void;
//# sourceMappingURL=index.d.ts.map