import z from '@deepseek-ai/schemastery'
import {
  type ModelPreferencesConfig,
} from './core/config.ts'

export const name = 'model-preferences'
export const inject = ['settings']

export * from './core/config.ts'

/** Host loader schema for the durable model-picker preferences. */
export const Config: z<ModelPreferencesConfig> = z.object({
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
}) as unknown as z<ModelPreferencesConfig>

/** The loader owns volatile field persistence for this plugin entry. */
export function apply(): void {}
