import z from 'schemastery';
import { MODEL_PREFERENCES_SETTINGS_NAMESPACE, assertModelPreferences, } from "./core/config.js";
export const name = 'model-preferences';
export const inject = ['settings'];
export * from "./core/config.js";
/** Host loader schema for the durable model-picker preferences. */
export const Config = z.object({
    version: z.number().step(1).default(1),
    pinnedModels: z.array(z.object({
        provider: z.string().min(1).max(128),
        model: z.string().min(1).max(128),
    })).default([]),
    providerOrder: z.array(z.string().min(1).max(128)).default([]),
    disabledProviders: z.array(z.string().min(1).max(128)).default([]),
    recentModels: z.array(z.object({
        provider: z.string().min(1).max(128),
        model: z.string().min(1).max(128),
    })).default([]),
});
/** Install the Host settings namespace; model routing remains official SDK-owned. */
export function apply(ctx, initialConfig = { ...DEFAULT_CONFIG }) {
    let currentSource = () => initialConfig;
    ctx.settings.installSection(ctx, MODEL_PREFERENCES_SETTINGS_NAMESPACE, Config, initialConfig, {
        setSource: source => {
            currentSource = () => source();
        },
        onChange: () => {
            currentSource = currentSource;
        },
        validate: value => {
            assertModelPreferences(value);
        },
    });
}
const DEFAULT_CONFIG = {
    version: 1,
    pinnedModels: [],
    providerOrder: [],
    disabledProviders: [],
    recentModels: [],
};
