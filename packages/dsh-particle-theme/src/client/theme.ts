/** Runtime primitives shared by particle-theme controllers and scene definitions. */

export const PARTICLE_THEME_NAMESPACE = 'particle-theme'

export interface ParticleThemeSettings {
  enabled?: boolean
  theme?: string
  density?: number
  opacity?: number
  speed?: number
}

export interface ResolvedParticleThemeSettings {
  enabled: boolean
  theme: string
  density: number
  opacity: number
  speed: number
}

export type ParticlePageMode = 'normal' | 'focused' | 'dialog' | 'reduced' | 'hidden'

export interface ParticlePageProfile {
  density: number
  opacity: number
  speed: number
}

export interface ParticleContentRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ParticleRuntimeState {
  settings: ResolvedParticleThemeSettings
  mode: ParticlePageMode
  profile: ParticlePageProfile
  /** Visible message areas in CSS canvas coordinates; optional for older scenes. */
  contentRects?: readonly ParticleContentRect[]
}

export interface ParticleThemeScene {
  update(state: ParticleRuntimeState): void
  dispose(): void
}

export interface ParticleThemeCreateContext {
  canvas: HTMLCanvasElement
  document: Document
  window: Window
}

export interface ParticleThemeDefinition {
  id: string
  create(context: ParticleThemeCreateContext): ParticleThemeScene
}

const PROFILES: Readonly<Record<ParticlePageMode, ParticlePageProfile>> = Object.freeze({
  normal: Object.freeze({ density: 1, opacity: 1, speed: 1 }),
  focused: Object.freeze({ density: 0.58, opacity: 0.48, speed: 0.68 }),
  dialog: Object.freeze({ density: 0.34, opacity: 0.34, speed: 0.52 }),
  reduced: Object.freeze({ density: 0.2, opacity: 0.42, speed: 0 }),
  hidden: Object.freeze({ density: 0, opacity: 0, speed: 0 }),
})

function clamp(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback
}

export function resolveParticleThemeSettings(input: ParticleThemeSettings | undefined): ResolvedParticleThemeSettings {
  return {
    enabled: input?.enabled !== false,
    theme: input?.theme === 'whale' ? input.theme : 'whale',
    density: clamp(input?.density, 1, 0.35, 1.5),
    opacity: clamp(input?.opacity, 0.26, 0.08, 0.55),
    speed: clamp(input?.speed, 1, 0.4, 1.6),
  }
}

export function resolvePageMode(input: {
  hidden: boolean
  reducedMotion: boolean
  dialog: boolean
  editable: boolean
}): ParticlePageMode {
  if (input.hidden) return 'hidden'
  if (input.reducedMotion) return 'reduced'
  if (input.dialog) return 'dialog'
  if (input.editable) return 'focused'
  return 'normal'
}

export function pageProfile(mode: ParticlePageMode): ParticlePageProfile {
  return PROFILES[mode]
}

/** Small registry seam: future themes add a definition without changing the controller. */
export class ParticleThemeRegistry {
  private readonly definitions = new Map<string, ParticleThemeDefinition>()

  register(definition: ParticleThemeDefinition): () => void {
    if (!definition?.id || this.definitions.has(definition.id)) {
      throw new Error(`particle theme ${definition?.id || '(empty)'} is already registered`)
    }
    this.definitions.set(definition.id, definition)
    return () => {
      if (this.definitions.get(definition.id) === definition) this.definitions.delete(definition.id)
    }
  }

  get(id: string): ParticleThemeDefinition | undefined {
    return this.definitions.get(id)
  }

  list(): string[] {
    return [...this.definitions.keys()].sort()
  }
}

/** Frame-time feedback that only changes quality after sustained evidence. */
export class AdaptiveFrameBudget {
  private slowFrames = 0
  private fastFrames = 0
  quality = 1

  record(frameMs: number): number {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return this.quality
    if (frameMs > 26) {
      this.slowFrames += 1
      this.fastFrames = 0
      if (this.slowFrames >= 40) {
        this.quality = Math.max(0.45, Math.round((this.quality - 0.12) * 100) / 100)
        this.slowFrames = 0
      }
    } else if (frameMs < 18) {
      this.fastFrames += 1
      this.slowFrames = Math.max(0, this.slowFrames - 1)
      if (this.fastFrames >= 180) {
        this.quality = Math.min(1, Math.round((this.quality + 0.05) * 100) / 100)
        this.fastFrames = 0
      }
    } else {
      this.slowFrames = Math.max(0, this.slowFrames - 1)
      this.fastFrames = 0
    }
    return this.quality
  }
}
