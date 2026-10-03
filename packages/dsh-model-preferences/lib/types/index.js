import z from '@deepseek-ai/schemastery';
export const name = 'model-preferences';
export const inject = ['settings'];
export * from "./core/config.js";
/** Host loader schema for the durable model-picker preferences. */
export const Config = z.object({
    version: z.number().step(1).default(1).volatile(),
    pinnedModels: z.array(z.object({
        provider: z.string().min(1).max(128),
        model: z.string().min(1).max(128),
    })).default([]).volatile(),
    providerOrder: z.array(z.string().min(1).max(128)).default([]).volatile(),
    disabledProviders: z.array(z.string().min(1).max(128)).default([]).volatile(),
    recentModels: z.array(z.object({
        provider: z.string().min(1).max(128),
        model: z.string().min(1).max(128),
    })).default([]).volatile(),
});
/** The loader owns volatile field persistence for this plugin entry. */
export function apply() { }
