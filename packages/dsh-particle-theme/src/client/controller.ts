import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import {
  pageProfile,
  type ParticlePageMode,
  type ParticleRuntimeState,
  ParticleThemeRegistry,
  type ParticleThemeScene,
  type ParticleThemeSettings,
  resolvePageMode,
  resolveParticleThemeSettings,
} from './theme.ts'

const STYLE_ID = 'dsh-particle-theme-style'

const PARTICLE_THEME_CSS = `
canvas.dsh-particle-theme-canvas {
  position: fixed;
  z-index: 3;
  top: var(--dsh-desktop-window-chrome-height, 0px);
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: calc(100% - var(--dsh-desktop-window-chrome-height, 0px));
  pointer-events: none !important;
  contain: strict;
}
`

function editable(element: Element | null): boolean {
  if (!element) return false
  const tag = element.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || (element as HTMLElement).isContentEditable
}

function visible(element: Element): boolean {
  if (element.closest('[hidden]')) return false
  const view = element.ownerDocument.defaultView
  const style = view?.getComputedStyle(element)
  if (style?.display === 'none' || style?.visibility === 'hidden') return false
  const box = element.getBoundingClientRect()
  return box.width > 0 && box.height > 0
}

function currentPageMode(document: Document, window: Window): ParticlePageMode {
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')]
  return resolvePageMode({
    hidden: document.hidden,
    reducedMotion: media?.matches === true,
    dialog: dialogs.some(visible),
    editable: editable(document.activeElement),
  })
}

export interface ParticleThemeControllerOptions {
  scope: SettingsScope<ParticleThemeSettings>
  registry: ParticleThemeRegistry
  document: Document
  window: Window
}

/** Binds settings + page state onto exactly one global pointer-transparent scene. */
export class ParticleThemeController {
  private scene: ParticleThemeScene | undefined
  private canvas: HTMLCanvasElement | undefined
  private style: HTMLStyleElement | undefined
  private unsubscribe: (() => void) | undefined
  private observer: MutationObserver | undefined
  private mode: ParticlePageMode = 'normal'
  private settings = resolveParticleThemeSettings(undefined)
  private started = false
  private lastClip: string | undefined
  private clipFrame = 0
  private interacting = false
  private disposeListeners: Array<() => void> = []

  constructor(private readonly options: ParticleThemeControllerOptions) {}

  start(): void {
    if (this.started) return
    this.started = true
    this.style = this.options.document.createElement('style')
    this.style.id = STYLE_ID
    this.style.textContent = PARTICLE_THEME_CSS
    this.options.document.head.append(this.style)
    this.unsubscribe = this.options.scope.subscribe(() => { this.syncSettings() })
    const refresh = () => { this.refreshPageMode() }
    this.options.document.addEventListener('visibilitychange', refresh)
    this.options.document.addEventListener('focusin', refresh)
    this.options.document.addEventListener('focusout', refresh)
    this.options.window.addEventListener('resize', refresh)
    const motion = (event: Event) => {
      this.interacting = (event as CustomEvent).detail === true
      this.refreshPageMode()
    }
    this.options.window.addEventListener('dsh:window-motion', motion)
    this.disposeListeners.push(
      () => this.options.document.removeEventListener('visibilitychange', refresh),
      () => this.options.document.removeEventListener('focusin', refresh),
      () => this.options.document.removeEventListener('focusout', refresh),
      () => this.options.window.removeEventListener('resize', refresh),
      () => this.options.window.removeEventListener('dsh:window-motion', motion),
    )
    const observer = new MutationObserver(refresh)
    observer.observe(this.options.document.body, {
      attributes: true,
      attributeFilter: ['hidden', 'open', 'aria-hidden', 'aria-modal', 'style', 'class'],
      childList: true,
      subtree: true,
    })
    this.observer = observer
    this.syncSettings()
    this.refreshPageMode()
  }

  refreshPageMode(): void {
    if (!this.clipFrame && !this.interacting) {
      this.clipFrame = this.options.window.requestAnimationFrame(() => {
        this.clipFrame = 0
        if (!this.canvas) return
        const rail = this.options.document.querySelector('[data-dsh-file-attachments]:has([data-state])')
        const box = rail?.getBoundingClientRect()
        // Leave the attachment/composer band clear; all upper-page effects remain enabled.
        const clip = box && box.height > 0 ? `inset(0px 0px ${Math.max(0, this.options.window.innerHeight - box.top)}px 0px)` : ''
        if (this.lastClip !== clip) { this.lastClip = clip; this.canvas.style.clipPath = clip }
      })
    }
    const mode = this.interacting ? 'hidden' : currentPageMode(this.options.document, this.options.window)
    if (mode === this.mode) return
    this.mode = mode
    this.pushState()
  }

  dispose(): void {
    if (!this.started) return
    this.started = false
    this.options.window.cancelAnimationFrame(this.clipFrame); this.clipFrame = 0
    for (const dispose of this.disposeListeners.splice(0)) dispose()
    this.interacting = false
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.observer?.disconnect()
    this.observer = undefined
    this.disposeScene()
    this.style?.remove()
    this.style = undefined
  }

  private syncSettings(): void {
    const snapshot = this.options.scope.getSnapshot()
    const next = resolveParticleThemeSettings(snapshot.value)
    const mustRecreate = this.settings.theme !== next.theme || this.settings.enabled !== next.enabled
    this.settings = next
    if (mustRecreate) this.disposeScene()
    if (this.settings.enabled && !this.scene) this.createScene()
    this.pushState()
  }

  private createScene(): void {
    const definition = this.options.registry.get(this.settings.theme)
    if (!definition) return
    const canvas = this.options.document.createElement('canvas')
    canvas.className = 'dsh-particle-theme-canvas'
    canvas.dataset.dshParticleTheme = definition.id
    canvas.setAttribute('aria-hidden', 'true')
    this.options.document.body.append(canvas)
    this.lastClip = undefined
    this.canvas = canvas
    this.scene = definition.create({ canvas, document: this.options.document, window: this.options.window })
  }

  private disposeScene(): void {
    this.scene?.dispose()
    this.scene = undefined
    this.canvas?.remove()
    this.canvas = undefined
  }

  private pushState(): void {
    if (!this.settings.enabled || !this.scene) return
    if (this.canvas) this.canvas.dataset.dshParticleMode = this.mode
    const state: ParticleRuntimeState = {
      settings: this.settings,
      mode: this.mode,
      profile: pageProfile(this.mode),
    }
    this.scene.update(state)
  }
}
