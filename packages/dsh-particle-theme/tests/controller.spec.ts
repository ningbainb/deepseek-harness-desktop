import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { ParticleThemeController } from '../src/client/controller.ts'
import { ParticleThemeRegistry, type ParticleThemeDefinition, type ParticleThemeSettings } from '../src/client/theme.ts'

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals() })

function scopeHarness(initial: ParticleThemeSettings) {
  let value = initial
  let listener = () => {}
  return {
    scope: {
      getSnapshot: () => ({ status: 'ready', writable: true, value, base: value, user: {} }) as SettingsScopeSnapshot<ParticleThemeSettings>,
      subscribe: (next: () => void) => { listener = next; return () => { listener = () => {} } },
      set: async () => {},
      unset: async () => {},
    },
    publish(next: ParticleThemeSettings) { value = next; listener() },
  }
}

describe('ParticleThemeController', () => {
  it('detects dynamic dialog visibility without full-document queries on repeated refresh', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    const update = vi.fn()
    const registry = new ParticleThemeRegistry()
    registry.register({ id: 'whale', create: () => ({ update, dispose() {} }) })
    const query = vi.spyOn(document, 'querySelectorAll')
    const controller = new ParticleThemeController({ scope: scopeHarness({ enabled: true }).scope, registry, document, window })
    controller.start()
    const dialog = document.createElement('div')
    dialog.getBoundingClientRect = () => ({ width: 400, height: 300 } as DOMRect)
    try {
      document.body.append(dialog)
      dialog.setAttribute('role', 'dialog')
      controller.refreshPageMode()
      expect(update.mock.lastCall?.[0].mode).toBe('dialog')
      dialog.hidden = true
      await Promise.resolve()
      expect(update.mock.lastCall?.[0].mode).toBe('normal')
      dialog.hidden = false
      await Promise.resolve()
      expect(update.mock.lastCall?.[0].mode).toBe('dialog')
      for (let i = 0; i < 100; i++) controller.refreshPageMode()
      expect(query).toHaveBeenCalledTimes(1)
      dialog.removeAttribute('role')
      await Promise.resolve()
      expect(update.mock.lastCall?.[0].mode).toBe('normal')
      dialog.setAttribute('aria-modal', 'true')
      await Promise.resolve()
      expect(update.mock.lastCall?.[0].mode).toBe('dialog')
      dialog.remove(); controller.refreshPageMode()
      expect(update.mock.lastCall?.[0].mode).toBe('normal')
      controller.dispose()
      document.body.append(dialog)
      controller.start()
      expect(update.mock.lastCall?.[0].mode).toBe('dialog')
      expect(query).toHaveBeenCalledTimes(2)
    } finally { controller.dispose() }
  })
  it('refreshes message clearance on scroll, resize and removal without a new polling loop', () => {
    let frame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1 })
    const flush = () => { const callback = frame; frame = undefined; callback?.(0) }
    document.body.innerHTML = '<main data-pane="conversation"><article data-chat-flow-kind="assistant"></article></main>'
    const message = document.querySelector('article')!
    let top = 160
    message.getBoundingClientRect = () => ({ left: 300, top, width: 400, height: 100, right: 700, bottom: top + 100 } as DOMRect)
    const update = vi.fn()
    const registry = new ParticleThemeRegistry()
    registry.register({ id: 'whale', create: () => ({ update, dispose() {} }) })
    const controller = new ParticleThemeController({ scope: scopeHarness({ enabled: true }).scope, registry, document, window })
    controller.start()
    const canvas = document.querySelector('canvas')!
    canvas.getBoundingClientRect = () => ({ left: 0, top: 32, width: 1000, height: 768, right: 1000, bottom: 800 } as DOMRect)
    try {
      flush()
      expect(update.mock.lastCall?.[0].contentRects).toEqual([{ x: 296, y: 124, width: 408, height: 108 }])
      top = 220
      message.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new Event('resize'))
      flush()
      expect(update.mock.lastCall?.[0].contentRects[0].y).toBe(184)
      message.remove()
      controller.refreshPageMode(); flush()
      expect(update.mock.lastCall?.[0].contentRects).toEqual([])
    } finally { controller.dispose() }
  })
  it('applies live reduced-motion changes and removes the listener on disposal', () => {
    const media = Object.assign(new EventTarget(), { matches: false })
    vi.stubGlobal('matchMedia', () => media)
    const update = vi.fn()
    const registry = new ParticleThemeRegistry()
    registry.register({ id: 'whale', create: () => ({ update, dispose() {} }) })
    const controller = new ParticleThemeController({ scope: scopeHarness({ enabled: true }).scope, registry, document, window })
    controller.start()
    media.matches = true; media.dispatchEvent(new Event('change'))
    expect(update.mock.lastCall?.[0].mode).toBe('reduced')
    media.matches = false; media.dispatchEvent(new Event('change'))
    expect(update.mock.lastCall?.[0].mode).toBe('normal')
    controller.dispose()
    const calls = update.mock.calls.length
    media.matches = true; media.dispatchEvent(new Event('change'))
    expect(update).toHaveBeenCalledTimes(calls)
  })
  it('keeps native drafts clear through resize, scroll, remount and legacy fallback', () => {
    let frame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1 })
    const flush = () => { const callback = frame; frame = undefined; callback?.(0) }
    let resize = () => {}
    const disconnect = vi.fn(), unobserve = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback }
      observe() {}
      unobserve = unobserve
      disconnect = disconnect
    })
    const registry = new ParticleThemeRegistry()
    registry.register({ id: 'whale', create: () => ({ update() {}, dispose() {} }) })
    const controller = new ParticleThemeController({ scope: scopeHarness({ enabled: true }).scope, registry, document, window })
    const composer = document.createElement('div')
    composer.dataset.composerSeat = ''
    let top = 500
    composer.getBoundingClientRect = () => ({ top, width: 600, height: 180 } as DOMRect)
    document.body.append(composer)
    controller.start()
    try {
      flush()
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-dsh-particle-theme]')!
      expect(canvas.style.clipPath).toBe(`inset(0px 0px ${window.innerHeight - 500}px 0px)`)
      top = 380; resize(); flush()
      expect(canvas.style.clipPath).toBe(`inset(0px 0px ${window.innerHeight - 380}px 0px)`)
      top = 340; composer.dispatchEvent(new Event('scroll')); flush()
      expect(canvas.style.clipPath).toBe(`inset(0px 0px ${window.innerHeight - 340}px 0px)`)
      composer.remove()
      const rail = document.createElement('div')
      rail.dataset.dshFileAttachments = ''; rail.innerHTML = '<span data-state="ready"></span>'
      rail.getBoundingClientRect = () => ({ top: 480, width: 500, height: 70 } as DOMRect)
      document.body.append(rail)
      controller.refreshPageMode(); flush()
      expect(unobserve).toHaveBeenCalledWith(composer)
      expect(canvas.style.clipPath).toBe(`inset(0px 0px ${window.innerHeight - 480}px 0px)`)
      rail.hidden = true; controller.refreshPageMode(); flush()
      expect(canvas.style.clipPath).toBe('')
    } finally { controller.dispose() }
    expect(disconnect).toHaveBeenCalledOnce()
  })
  it('mounts one pointer-transparent canvas, follows settings, and disposes cleanly', () => {
    const harness = scopeHarness({ enabled: true })
    const updates: string[] = []
    const dispose = vi.fn()
    const registry = new ParticleThemeRegistry()
    registry.register({
      id: 'whale',
      create: ({ canvas }) => {
        expect(canvas.getAttribute('aria-hidden')).toBe('true')
        return { update: state => updates.push(state.mode), dispose }
      },
    } satisfies ParticleThemeDefinition)
    const controller = new ParticleThemeController({ scope: harness.scope, registry, document, window })
    controller.start()
    expect(document.querySelectorAll('canvas[data-dsh-particle-theme="whale"]')).toHaveLength(1)
    expect(updates.at(-1)).toBe('normal')
    window.dispatchEvent(new CustomEvent('dsh:window-motion', { detail: true }))
    expect(updates.at(-1)).toBe('hidden')
    window.dispatchEvent(new CustomEvent('dsh:window-motion', { detail: false }))
    expect(updates.at(-1)).toBe('normal')

    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.getBoundingClientRect = () => ({ x: 0, y: 0, width: 400, height: 300, top: 0, right: 400, bottom: 300, left: 0, toJSON: () => ({}) })
    document.body.append(dialog)
    controller.refreshPageMode()
    expect(updates.at(-1)).toBe('dialog')

    harness.publish({ enabled: false })
    expect(document.querySelector('canvas[data-dsh-particle-theme]')).toBeNull()
    expect(dispose).toHaveBeenCalledOnce()
    controller.dispose()
  })
})
