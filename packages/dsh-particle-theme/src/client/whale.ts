import {
  AdaptiveFrameBudget,
  type ParticleRuntimeState,
  type ParticleThemeDefinition,
  type ParticleThemeScene,
} from './theme.ts'
import { OFFICIAL_WHALE_PATH } from './official-whale.ts'

/**
 * Whale particle scene for the main window. Shares the official DeepSeek
 * silhouette and the bucketed glow rendering with the desktop startup screen
 * (apps/dsh-desktop/src/ui/whale-particles.mjs), toned down to read as a calm
 * background layer: no pointer interaction, no ripples, no reveal spiral.
 * Colors follow the active skin via --dsw-* tokens instead of fixed hues.
 */

const MASK_SIZE = 720
const EYE_X = 388
const EYE_Y = 354
const SPARK_KEY = 6

interface WhalePoint {
  /** Unit-square coordinates inside the silhouette mask space. */
  x: number
  y: number
  size: number
  alpha: number
  phase: number
  /** 0 in the head, 1 at the tail tip — drives the tail wave amplitude. */
  tail: number
  /** Belly-fin weight for the fin wave. */
  fin: number
  edge: boolean
  spark: boolean
  colorKey: number
  /** Per-frame draw cache (filled by the render pass before bucketing). */
  x0: number
  y0: number
  r0: number
}

interface AmbientPoint {
  x: number
  y: number
  size: number
  phase: number
  speed: number
}

export interface Rgb {
  r: number
  g: number
  b: number
}

interface WhaleMask {
  alphaAt: (px: number, py: number) => number
}

function randomSource(seed = 0x5d51): () => number {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0x100000000
  }
}

/** Rasterize the official silhouette once; undefined where 2D canvas is missing (jsdom). */
function createWhaleMask(document: Document): WhaleMask | undefined {
  const canvas = document.createElement('canvas')
  canvas.width = MASK_SIZE
  canvas.height = MASK_SIZE
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return undefined
  context.fillStyle = '#fff'
  context.save()
  context.scale(MASK_SIZE / 50, MASK_SIZE / 50)
  context.fill(new Path2D(OFFICIAL_WHALE_PATH))
  context.restore()
  let pixels: Uint8ClampedArray
  try {
    pixels = context.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data
  } catch {
    return undefined
  }
  return {
    alphaAt: (px, py) => pixels[(py * MASK_SIZE + px) * 4 + 3],
  }
}

/** Geometric fallback for environments without canvas (tests); mirrors the old hand-tuned shape. */
function insideWhaleFallback(x: number, y: number): boolean {
  const body = ((x - 0.43) / 0.35) ** 2 + ((y - 0.52) / 0.205) ** 2 <= 1
  const head = ((x - 0.2) / 0.18) ** 2 + ((y - 0.5) / 0.18) ** 2 <= 1
  const tailTop = x >= 0.69 && x <= 0.98 && y >= 0.2 && y <= 0.52 && y >= 0.2 + (x - 0.69) * 0.35
  const tailBottom = x >= 0.69 && x <= 0.98 && y >= 0.52 && y <= 0.82 && y <= 0.82 - (x - 0.69) * 0.35
  const fin = ((x - 0.43) / 0.19) ** 2 + ((y - 0.69) / 0.13) ** 2 <= 1 && y > 0.64
  return body || head || tailTop || tailBottom || fin
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

function makePoint(x: number, y: number, edge: boolean, random: () => number): WhalePoint {
  const maskX = x * MASK_SIZE
  const maskY = y * MASK_SIZE
  const tail = clamp01((maskX - 470) / 170)
  const tailGlow = clamp01((maskX - 500) / 220)
  const spark = random() < 0.07
  return {
    x,
    y,
    size: edge ? 0.5 + random() * 0.72 : 0.42 + random() * 1.08,
    alpha: edge ? 0.58 + random() * 0.34 : 0.3 + random() * 0.34,
    phase: random() * Math.PI * 2,
    tail,
    fin: clamp01(1 - Math.abs(maskX - 302) / 88) * clamp01((maskY - 258) / 78),
    edge,
    spark,
    colorKey: spark ? SPARK_KEY : Math.min(5, Math.floor(tailGlow * 4) + (edge ? 2 : 0)),
    x0: 0,
    y0: 0,
    r0: 0,
  }
}

/**
 * Sample `count` points from the whale silhouette. With a mask, grid-samples
 * exactly like the startup screen (jittered 5px lattice) so coverage is dense
 * and even, then thins deterministically to the requested budget. Without a
 * mask (jsdom, canvas-less environments) falls back to the geometric
 * approximation so the scene still renders. Deterministic for a given seed.
 */
export function createWhaleParticleField(count: number, seed = 0x5d51, mask?: WhaleMask): WhalePoint[] {
  const random = randomSource(seed)
  const target = Math.max(32, Math.round(count))
  if (mask === undefined) {
    const points: WhalePoint[] = []
    for (let attempts = 0; points.length < target && attempts < target * 60; attempts += 1) {
      const x = random()
      const y = random()
      if (!insideWhaleFallback(x, y)) continue
      points.push(makePoint(x, y, false, random))
    }
    return points
  }
  const step = Math.max(2, Math.round(MASK_SIZE / 144))
  const clampPixel = (value: number): number => Math.max(0, Math.min(MASK_SIZE - 1, Math.round(value)))
  const dense: WhalePoint[] = []
  for (let gy = 0; gy < MASK_SIZE; gy += step) {
    for (let gx = 0; gx < MASK_SIZE; gx += step) {
      const px = clampPixel(gx + (random() - 0.5) * step * 0.7)
      const py = clampPixel(gy + (random() - 0.5) * step * 0.7)
      if (mask.alphaAt(px, py) < 40 || random() < 0.12) continue
      const edge = mask.alphaAt(Math.max(0, px - step), py) < 40
        || mask.alphaAt(Math.min(MASK_SIZE - 1, px + step), py) < 40
        || mask.alphaAt(px, Math.max(0, py - step)) < 40
        || mask.alphaAt(px, Math.min(MASK_SIZE - 1, py + step)) < 40
      dense.push(makePoint(px / MASK_SIZE, py / MASK_SIZE, edge, random))
    }
  }
  if (dense.length <= target) return dense
  // Even-stride subset keeps silhouette coverage uniform at any budget.
  const points: WhalePoint[] = []
  const stride = dense.length / target
  for (let index = 0; index < target; index += 1) points.push(dense[Math.floor(index * stride)])
  return points
}

export function parseCssColor(raw: string): Rgb | undefined {
  const text = raw.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/iu.exec(text)
  if (hex) {
    const value = hex[1].length === 3
      ? hex[1].split('').map((c) => c + c).join('')
      : hex[1]
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    }
  }
  const rgb = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*[,\s]\s*(\d+(?:\.\d+)?)\s*[,\s]\s*(\d+(?:\.\d+)?)/iu.exec(text)
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) }
  }
  return undefined
}

function mixChannel(a: number, b: number, k: number): number {
  return Math.round(a + (b - a) * k)
}

function mixColor(from: Rgb, to: Rgb, k: number): string {
  return `rgb(${mixChannel(from.r, to.r, k)}, ${mixChannel(from.g, to.g, k)}, ${mixChannel(from.b, to.b, k)})`
}

/**
 * Seven bucket colors (six gradient + one spark highlight) derived from the
 * active skin's business-primary token. Dark pages lift toward white so the
 * additive glow reads like the startup screen; light pages deepen toward
 * navy so particles stay visible without additive blending.
 */
export function deriveWhalePalette(base: Rgb | undefined, dark: boolean): string[] {
  const root = base ?? (dark ? { r: 104, g: 193, b: 242 } : { r: 31, g: 132, b: 177 })
  const colors: string[] = []
  for (let bucket = 0; bucket < 6; bucket += 1) {
    const t = (bucket + 0.5) / 6
    colors.push(dark
      ? mixColor(root, { r: 255, g: 255, b: 255 }, t * 0.38)
      : mixColor(root, { r: 12, g: 48, b: 72 }, t * 0.38))
  }
  colors.push(dark
    ? mixColor(root, { r: 255, g: 255, b: 255 }, 0.72)
    : mixColor(root, { r: 8, g: 36, b: 56 }, 0.5))
  return colors
}

/** Gentle swim pose shared with the startup screen, amplitudes dampened for a background layer. */
export function computeWhalePose(elapsed: number, width: number, height: number): {
  centerX: number
  centerY: number
  heading: number
  tailPhase: number
  finPhase: number
  breathe: number
} {
  const pathPhase = elapsed * 0.07
  return {
    centerX: width * (0.56 + Math.sin(pathPhase) * 0.028 + Math.sin(pathPhase * 0.47 + 1.2) * 0.006),
    centerY: height * (0.42 + Math.sin(pathPhase * 1.3 + 0.6) * 0.042 + Math.sin(elapsed * 0.31) * 0.006),
    heading: Math.cos(pathPhase) * 0.03 + Math.sin(elapsed * 0.2 + 0.4) * 0.006,
    tailPhase: elapsed * 1.5,
    finPhase: elapsed * 1.0,
    breathe: 1 + Math.sin(elapsed * 0.6) * 0.008,
  }
}

function darkPage(document: Document): boolean {
  if (document.body?.hasAttribute('data-ds-dark-theme')) return true
  const scheme = document.defaultView?.getComputedStyle(document.documentElement).colorScheme
  return scheme?.includes('dark') === true
}

const easeOut = (value: number): number => 1 - (1 - clamp01(value)) ** 3

class WhaleParticleScene implements ParticleThemeScene {
  private readonly context: CanvasRenderingContext2D
  private readonly budget = new AdaptiveFrameBudget()
  private readonly buckets: number[][] = Array.from({ length: (SPARK_KEY + 1) * 8 }, () => [])
  private whale: WhalePoint[] = []
  private ambient: AmbientPoint[] = []
  private mask: WhaleMask | undefined
  private palette: { at: number; dark: boolean; colors: string[] } | undefined
  private areaCache: { at: number; rect: { x: number; y: number; width: number; height: number } } | undefined
  private state: ParticleRuntimeState | undefined
  private frame: number | undefined
  private lastFrame = 0
  private startedAt = 0
  private stopped = false
  private targetCount = 0

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly document: Document,
    private readonly window: Window,
    context: CanvasRenderingContext2D,
  ) {
    this.context = context
  }

  update(state: ParticleRuntimeState): void {
    this.state = state
    if (state.mode === 'hidden') {
      if (this.frame !== undefined) this.window.cancelAnimationFrame(this.frame)
      this.frame = undefined
      return
    }
    this.schedule()
  }

  dispose(): void {
    this.stopped = true
    if (this.frame !== undefined) this.window.cancelAnimationFrame(this.frame)
    this.frame = undefined
  }

  private schedule(): void {
    if (this.stopped || this.frame !== undefined) return
    this.frame = this.window.requestAnimationFrame((now) => { this.draw(now) })
  }

  private resize(): { width: number; height: number } {
    const width = Math.max(1, this.canvas.clientWidth || this.window.innerWidth)
    const height = Math.max(1, this.canvas.clientHeight || this.window.innerHeight)
    const ratio = Math.min(1.5, this.window.devicePixelRatio || 1)
    const pixelWidth = Math.max(1, Math.round(width * ratio))
    const pixelHeight = Math.max(1, Math.round(height * ratio))
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth
      this.canvas.height = pixelHeight
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    return { width, height }
  }

  private ensureParticles(width: number, height: number, state: ParticleRuntimeState): void {
    // A silhouette needs far more points than the old loose cloud to read as
    // a whale; the bucketed batch fill keeps thousands of arcs cheap. The
    // startup screen runs ~3.7k points, so ~2.4k here stays well inside the
    // proven frame budget while keeping the shape legible.
    const areaCount = Math.max(900, Math.min(3_600, Math.round((width * height) / 640)))
    const nextTarget = Math.max(60, Math.round(areaCount * state.settings.density * state.profile.density * this.budget.quality))
    if (Math.abs(nextTarget - this.targetCount) < Math.max(40, this.targetCount * 0.12)) return
    this.targetCount = nextTarget
    this.mask ??= createWhaleMask(this.document)
    this.whale = createWhaleParticleField(nextTarget, 0x5d51, this.mask)
    const random = randomSource(0x1eaf + nextTarget)
    this.ambient = Array.from({ length: Math.max(16, Math.round(nextTarget * 0.04)) }, () => ({
      x: random(),
      y: random(),
      size: 0.45 + random() * 1.15,
      phase: random() * Math.PI * 2,
      speed: 0.08 + random() * 0.18,
    }))
  }

  /** Anchor the whale inside the conversation column so it blends with the
   *  main surface instead of floating across the sidebar / right panel.
   *  getBoundingClientRect forces layout, so the lookup is throttled. */
  private conversationArea(width: number, height: number, now: number): { x: number; y: number; width: number; height: number } {
    if (this.areaCache && now - this.areaCache.at < 500) return this.areaCache.rect
    const pane = this.document.querySelector('[data-pane="conversation"], [class*="centerCol"]')
    const bounds = pane?.getBoundingClientRect()
    const rect = bounds && bounds.width > 100 && bounds.height > 100
      ? { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height }
      : { x: 0, y: 0, width, height }
    this.areaCache = { at: now, rect }
    return rect
  }

  /** Skin-aware palette with a short TTL so runtime skin switches are picked up. */
  private resolvePalette(dark: boolean, now: number): string[] {
    if (this.palette && this.palette.dark === dark && now - this.palette.at < 1_200) {
      return this.palette.colors
    }
    const probe = this.document.body ?? this.document.documentElement
    const view = this.document.defaultView
    const raw = view
      ? view.getComputedStyle(probe).getPropertyValue('--dsw-alias-state-business-primary')
        || view.getComputedStyle(probe).getPropertyValue('--dsw-alias-brand-primary')
      : ''
    const colors = deriveWhalePalette(raw ? parseCssColor(raw) : undefined, dark)
    this.palette = { at: now, dark, colors }
    return colors
  }

  private draw(now: number): void {
    this.frame = undefined
    const state = this.state
    if (this.stopped || !state || state.mode === 'hidden') return
    if (this.startedAt === 0) this.startedAt = now
    if (this.lastFrame > 0) this.budget.record(now - this.lastFrame)
    this.lastFrame = now
    const { width, height } = this.resize()
    this.ensureParticles(width, height, state)
    const context = this.context
    context.clearRect(0, 0, width, height)
    const elapsed = (now - this.startedAt) / 1_000 * state.settings.speed * state.profile.speed
    const opacity = state.settings.opacity * state.profile.opacity
    const dark = darkPage(this.document)
    const palette = this.resolvePalette(dark, now)
    // Soft global fade-in when the scene (re)appears; no spiral, no noise.
    const ramp = easeOut(elapsed / 1.4)

    context.save()
    if (dark) context.globalCompositeOperation = 'lighter'

    context.fillStyle = palette[2]
    context.globalAlpha = opacity * 0.3
    context.beginPath()
    for (const mote of this.ambient) {
      const x = mote.x * width + Math.sin(elapsed * mote.speed + mote.phase) * 12
      const y = (mote.y * height - elapsed * 3 * mote.speed + height) % height
      context.moveTo(x + mote.size, y)
      context.arc(x, y, mote.size, 0, Math.PI * 2)
    }
    context.fill()

    const area = this.conversationArea(width, height, now)
    const whaleWidth = Math.min(area.width * 0.68, area.height * 0.72, 720)
    const scale = whaleWidth / MASK_SIZE
    const pose = computeWhalePose(elapsed, area.width, area.height)
    pose.centerX += area.x
    pose.centerY += area.y
    // Light pages have no additive glow to lean on; compensate with stronger
    // alpha and a slightly larger radius floor so the silhouette reads as a
    // calm watermark on a white surface.
    const masterOpacity = opacity * (dark ? 1 : 3)
    const minRadius = dark ? 0.35 : 0.8
    const lightSizeBoost = dark ? 1 : 1.2
    const headingCos = Math.cos(pose.heading)
    const headingSin = Math.sin(pose.heading)
    const bodyPhase = pose.tailPhase * 0.48
    const finWaveAmp = Math.sin(pose.finPhase) * 10 * scale
    const pulsePhase = elapsed * 1.1
    const sizeScale = 0.72 + this.budget.quality * 0.28

    for (let index = 0; index < this.whale.length; index += 1) {
      const point = this.whale[index]
      const maskX = point.x * MASK_SIZE
      const localX = (maskX - MASK_SIZE / 2) * scale
      const bodyWave = Math.sin(bodyPhase + maskX * 0.014) * 2.4 * scale * (0.18 + point.tail * 0.82)
      const tailWave = Math.sin(pose.tailPhase + maskX * 0.018) * 14 * scale * point.tail
      const finWave = finWaveAmp * point.fin
      const localY = (point.y * MASK_SIZE - MASK_SIZE / 2) * scale * pose.breathe + bodyWave + tailWave + finWave
      const x = pose.centerX + localX * headingCos - localY * headingSin
      const y = pose.centerY + localX * headingSin + localY * headingCos
      const pulse = 0.82 + Math.sin(pulsePhase + point.phase) * 0.18
      const alpha = Math.min(1, point.alpha * ramp * (point.spark ? 1.5 : 1))
      const alphaKey = Math.min(7, (alpha * 8) | 0)
      point.x0 = x
      point.y0 = y
      point.r0 = Math.max(minRadius, point.size * scale * pulse * sizeScale * lightSizeBoost)
      this.buckets[point.colorKey * 8 + alphaKey].push(index)
    }

    for (let colorKey = 0; colorKey < palette.length; colorKey += 1) {
      context.fillStyle = palette[colorKey]
      for (let alphaKey = 0; alphaKey < 8; alphaKey += 1) {
        const bucket = this.buckets[colorKey * 8 + alphaKey]
        if (bucket.length === 0) continue
        context.globalAlpha = ((alphaKey + 0.5) / 8) * masterOpacity
        context.beginPath()
        for (let entry = 0; entry < bucket.length; entry += 1) {
          const point = this.whale[bucket[entry]]
          context.moveTo(point.x0 + point.r0, point.y0)
          context.arc(point.x0, point.y0, point.r0, 0, Math.PI * 2)
        }
        context.fill()
        bucket.length = 0
      }
    }

    // Eye: a small glow anchor shared with the startup screen.
    const eyeLocalX = (EYE_X - MASK_SIZE / 2) * scale
    const eyeLocalY = (EYE_Y - MASK_SIZE / 2) * scale * pose.breathe
    const eyeX = pose.centerX + eyeLocalX * headingCos - eyeLocalY * headingSin
    const eyeY = pose.centerY + eyeLocalX * headingSin + eyeLocalY * headingCos
    context.globalAlpha = Math.min(0.8, masterOpacity * 2.2) * ramp
    if (dark) {
      context.shadowColor = 'rgba(188, 244, 255, 0.85)'
      context.shadowBlur = 12
      context.fillStyle = 'rgb(220, 251, 255)'
    } else {
      context.fillStyle = palette[0]
    }
    context.beginPath()
    context.arc(eyeX, eyeY, Math.max(1.1, 1.8 * scale), 0, Math.PI * 2)
    context.fill()
    context.shadowBlur = 0

    context.restore()

    if (state.profile.speed > 0) this.schedule()
  }
}

export const WHALE_THEME_DEFINITION: ParticleThemeDefinition = {
  id: 'whale',
  create(createContext) {
    const { canvas, document, window } = createContext
    const drawingContext = canvas.getContext('2d')
    if (!drawingContext) return { update: () => {}, dispose: () => {} }
    return new WhaleParticleScene(canvas, document, window, drawingContext)
  },
}
