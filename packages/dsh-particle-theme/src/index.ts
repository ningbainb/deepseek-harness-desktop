import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import z from 'schemastery'

export const PARTICLE_THEME_SETTINGS_NAMESPACE = 'particle-theme'

export interface Config {
  enabled?: boolean
  theme?: string
  density?: number
  opacity?: number
  speed?: number
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  theme: z.string().pattern(/^whale$/).default('whale'),
  density: z.number().min(0.35).max(1.5).default(1),
  opacity: z.number().min(0.08).max(0.55).default(0.26),
  speed: z.number().min(0.4).max(1.6).default(1),
})

/** Register the persistent section once, including when a compatibility bridge owns it first. */
export function installParticleThemeSettings(ctx: Context, config: Config = {}): void {
  ctx.inject(['settings'], (sctx) => {
    const registered = sctx.settings.describe({ redactSecrets: true })
      .some(entry => String(entry.ns) === String(PARTICLE_THEME_SETTINGS_NAMESPACE))
    if (registered) return
    const scope = sctx.settings.register(PARTICLE_THEME_SETTINGS_NAMESPACE, Config, { base: config })
    scope.watch(() => { /* settings-scope publish updates the live browser canvas */ })
  })
}

/** Declare persistent settings; application is entirely browser-side. */
export function apply(ctx: Context, config: Config = {}): void {
  installParticleThemeSettings(ctx, config)
}
