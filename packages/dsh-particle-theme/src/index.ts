import z from '@deepseek-ai/schemastery'

export const PARTICLE_THEME_SETTINGS_NAMESPACE = 'particle-theme'

export interface Config {
  enabled?: boolean
  theme?: string
  density?: number
  opacity?: number
  speed?: number
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true).volatile(),
  theme: z.string().pattern(/^whale$/).default('whale').volatile(),
  density: z.number().min(0.35).max(1.5).default(1).volatile(),
  opacity: z.number().min(0.08).max(0.55).default(0.26).volatile(),
  speed: z.number().min(0.4).max(1.6).default(1).volatile(),
}) as unknown as z<Config>

/** The official loader publishes volatile fields from the plugin entry. */
export function installParticleThemeSettings(_ctx?: unknown): void {}

/** The canvas is mounted by the browser entry. */
export function apply(): void {}
