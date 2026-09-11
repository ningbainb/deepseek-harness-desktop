import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { messageClearanceRects } from './content-clearance.ts'
import { CONTENT_TARGET_ATTRIBUTES, ContentTargets } from './content-targets.ts'
import { DialogIndex } from './dialog-index.ts'
import {
  pageProfile,
  type ParticlePageMode,
  type ParticleContentRect,
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

function currentPageMode(document: Document, window: Window, dialogs: readonly Element[]): ParticlePageMode {
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
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
  private dialogs: DialogIndex | undefined
  private contentTargets: ContentTargets | undefined
  private sizeObserver: ResizeObserver | undefined
  private clipTargets = new Set<Element>()
  private contentRects: ParticleContentRect[] = []
  private contentKey = ''
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
    this.options.document.addEventListener('scroll', refresh, true)
    this.options.window.addEventListener('resize', refresh)
    if (typeof ResizeObserver === 'function') this.sizeObserver = new ResizeObserver(refresh)
    const reducedMotion = this.options.window.matchMedia?.('(prefers-reduced-motion: reduce)')
    reducedMotion?.addEventListener?.('change', refresh)
    const motion = (event: Event) => {
      this.interacting = (event as CustomEvent).detail === true
      this.refreshPageMode()
    }
    this.options.window.addEventListener('dsh:window-motion', motion)
    this.disposeListeners.push(
      () => this.options.document.removeEventListener('visibilitychange', refresh),
      () => this.options.document.removeEventListener('focusin', refresh),
      () => this.options.document.removeEventListener('focusout', refresh),
      () => this.options.document.removeEventListener('scroll', refresh, true),
      () => this.options.window.removeEventListener('resize', refresh),
      () => reducedMotion?.removeEventListener?.('change', refresh),
      () => this.options.window.removeEventListener('dsh:window-motion', motion),
    )
    this.dialogs = new DialogIndex(this.options.document)
    this.contentTargets = new ContentTargets(this.options.document)
    const observer = new MutationObserver(records => {
      this.dialogs?.update(records)
      this.contentTargets?.update(records)
      refresh()
    })
    observer.observe(this.options.document.documentElement, {
      attributes: true,
      attributeFilter: ['hidden', 'open', 'role', 'aria-hidden', 'aria-modal', 'style', 'class', ...CONTENT_TARGET_ATTRIBUTES],
      childList: true,
      subtree: true,
    })
    this.observer = observer
    this.syncSettings()
    this.refreshPageMode()
  }

  refreshPageMode(): void {
    // Public refresh and synchronous focus events can precede observer delivery.
    const records = this.observer?.takeRecords() ?? []
    this.dialogs?.update(records)
    this.contentTargets?.update(records)
    if (!this.clipFrame && !this.interacting) {
      this.clipFrame = this.options.window.requestAnimationFrame(() => {
        this.clipFrame = 0
        if (!this.canvas) return
        const { composers, messages } = this.contentTargets?.read() ?? { composers: [], messages: [] }
        const targets = new Set([...composers, ...messages])
        for (const old of this.clipTargets) if (!targets.has(old)) this.sizeObserver?.unobserve(old)
        for (const target of targets) if (!this.clipTargets.has(target)) this.sizeObserver?.observe(target)
        this.clipTargets = targets
        const tops = composers.filter(visible).map(target => target.getBoundingClientRect().top)
        const contentRects = messageClearanceRects(messages, this.canvas.getBoundingClientRect(),
          tops.length ? Math.min(...tops) : this.options.window.innerHeight)
        const contentKey = JSON.stringify(contentRects)
        // Native drafts need protection even without attachments or focus.
        // Retain the old attachment-rail boundary for older shells.
        const clip = tops.length ? `inset(0px 0px ${Math.max(0, this.options.window.innerHeight - Math.min(...tops))}px 0px)` : ''
        if (this.lastClip !== clip || this.contentKey !== contentKey) {
          this.contentKey = contentKey
          this.contentRects = contentRects
          this.canvas.dataset.dshParticleContentRects = contentKey
          this.lastClip = clip
          this.canvas.style.clipPath = clip
          if (tops.length) this.canvas.dataset.dshParticleContentBottom = String(Math.min(...tops))
          else delete this.canvas.dataset.dshParticleContentBottom
          // Reduced-motion scenes have no continuous loop; redraw their static
          // frame when the protected area changes as well.
          this.pushState()
        }
      })
    }
    const mode = this.interacting ? 'hidden' : currentPageMode(this.options.document, this.options.window, this.dialogs?.elements() ?? [])
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
    this.dialogs = undefined
    this.contentTargets = undefined
    this.sizeObserver?.disconnect()
    this.sizeObserver = undefined
    this.clipTargets.clear()
    this.contentRects = []
    this.contentKey = ''
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
      contentRects: this.contentRects,
    }
    this.scene.update(state)
  }
}
