import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { CLEARANCE_REFRESH, installDafeiyuClearance, projectDafeiyuPosition } from '../src/client/dafeiyu-clearance.ts'

const require = createRequire(new URL('../../dsh-web-ui-settings/package.json', import.meta.url))
const { JSDOM } = require('jsdom')
const viewport = { left: 0, top: 0, width: 800, height: 600 }
const raw = { left: 600, top: 360, width: 180, height: 220, minTop: 40 }
const composer = { left: 160, top: 420, width: 620, height: 160 }

describe('Dafeiyu display geometry', () => {
  it('moves the entire root above the composer without changing its raw anchor', () => {
    const input = Object.freeze({ ...raw })
    expect(projectDafeiyuPosition(input, viewport, [composer])).toEqual({ left: 600, top: 188 })
    expect(input).toEqual(raw)
    expect(projectDafeiyuPosition(input, viewport, [])).toEqual({ left: 600, top: 360 })
  })
  it('prefers clearance above the input even when a sideways move is shorter', () => {
    expect(projectDafeiyuPosition(raw, viewport, [{ left: 650, top: 440, width: 140, height: 120 }]))
      .toEqual({ left: 600, top: 208 })
  })
  it('respects the vendor titlebar floor and uses a free side when there is no room above', () => {
    expect(projectDafeiyuPosition({ ...raw, left: 580, top: 100, minTop: 80 }, viewport,
      [{ left: 500, top: 100, width: 300, height: 500 }])).toEqual({ left: 308, top: 100 })
  })
  it('avoids every visible composer and clamps into an offset viewport without touching inputs', () => {
    const result = projectDafeiyuPosition(raw, viewport, [composer, { left: 550, top: 120, width: 250, height: 220 }])
    expect(result.top).toBeGreaterThanOrEqual(raw.minTop)
    for (const block of [composer, { left: 550, top: 120, width: 250, height: 220 }]) {
      expect(result.left + raw.width <= block.left - 12 || result.left >= block.left + block.width + 12
        || result.top + raw.height <= block.top - 12 || result.top >= block.top + block.height + 12).toBe(true)
    }
    expect(projectDafeiyuPosition({ ...raw, left: -80, top: -40 },
      { left: 20, top: 50, width: 700, height: 500 }, [])).toEqual({ left: 32, top: 62 })
  })
  it('keeps an oversized root finite and present when the viewport cannot contain it', () => {
    const result = projectDafeiyuPosition({ ...raw, width: 1000, height: 900 }, viewport, [composer])
    expect(result).toEqual({ left: 12, top: 40 })
  })
})

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup() })

function documentFixture() {
  const dom = new JSDOM('<html><body><section><div data-composer-card></div></section><div class="dfy-root"><img class="dfy-img"></div></body></html>')
  cleanups.push(() => dom.window.close())
  const w = dom.window as Window & typeof globalThis
  Object.defineProperties(w, { innerWidth: { value: 800, configurable: true }, innerHeight: { value: 600, configurable: true } })
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0, reads = 0, resize: () => void = () => {}
  w.requestAnimationFrame = fn => { frames.set(++id, fn); return id }
  w.cancelAnimationFrame = frame => { frames.delete(frame) }
  w.ResizeObserver = class { constructor(callback: () => void) { resize = callback } observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver
  const card = w.document.querySelector('[data-composer-card]') as HTMLElement
  let bounds = { ...composer }
  card.getBoundingClientRect = () => { reads++; return { ...bounds, right: bounds.left + bounds.width, bottom: bounds.top + bounds.height } as DOMRect }
  card.getClientRects = () => [card.getBoundingClientRect()] as unknown as DOMRectList
  const measure = async () => {
    await Promise.resolve()
    const batch = [...frames.values()]; frames.clear()
    for (const frame of batch) frame(0)
    await Promise.resolve()
  }
  const dispose = installDafeiyuClearance(w, w.document)
  cleanups.push(dispose)
  return { w, card, frames, measure, dispose, resize: () => resize(), reads: () => reads, setBounds: (next: typeof bounds) => { bounds = next } }
}

describe('Dafeiyu observer lease', () => {
  it('projects cached visible geometry and coalesces resize/mutation work without an idle scan', async () => {
    const f = documentFixture()
    await f.measure()
    expect(f.w.__dshDafeiyuProjectPosition?.(raw)).toEqual({ left: 600, top: 188 })
    const reads = f.reads()
    for (let i = 0; i < 60; i++) f.w.__dshDafeiyuProjectPosition?.(raw)
    expect(f.reads()).toBe(reads)
    const image = f.w.document.querySelector('.dfy-img') as HTMLElement
    image.style.transform = 'translateY(2px)'; image.setAttribute('data-cute-motion', 'breathe')
    await Promise.resolve()
    expect(f.frames.size).toBe(0)
    f.setBounds({ ...composer, top: 400 }); f.resize(); f.resize(); f.w.dispatchEvent(new f.w.Event('resize'))
    expect(f.frames.size).toBe(1)
    await f.measure()
    expect(f.w.__dshDafeiyuProjectPosition?.(raw)).toEqual({ left: 600, top: 168 })
    await f.measure()
    expect(f.frames.size).toBe(0)
  })
  it('remeasures visibility and membership, refreshes the vendor, and restores raw display on unload', async () => {
    const f = documentFixture(), events: Event[] = []
    f.w.addEventListener(CLEARANCE_REFRESH, event => events.push(event))
    await f.measure()
    f.card.style.display = 'none'; await f.measure()
    expect(f.w.__dshDafeiyuProjectPosition?.(raw)).toEqual({ left: 600, top: 360 })
    f.card.style.display = ''; await f.measure()
    expect(f.w.__dshDafeiyuProjectPosition?.(raw)).toEqual({ left: 600, top: 188 })
    f.card.remove(); await f.measure()
    expect(f.w.__dshDafeiyuProjectPosition?.(raw)).toEqual({ left: 600, top: 360 })
    expect(events.length).toBeGreaterThanOrEqual(3)
    f.w.dispatchEvent(new f.w.Event('resize'))
    f.dispose()
    expect(f.frames.size).toBe(0)
    expect(f.w.__dshDafeiyuProjectPosition).toBeUndefined()
    const count = events.length
    f.resize(); f.w.dispatchEvent(new f.w.Event('resize')); await f.measure()
    expect(events.length).toBe(count)
  })
  it('preserves a foreign replacement hook during unload', async () => {
    const f = documentFixture(), replacement = () => ({ left: 30, top: 80 })
    f.w.__dshDafeiyuProjectPosition = replacement
    f.dispose()
    expect(f.w.__dshDafeiyuProjectPosition).toBe(replacement)
  })
  it('remeasures a same-size composer moving from the empty center to the history footer', async () => {
    const f = documentFixture()
    await f.measure()
    f.setBounds({ ...composer, top: 320 })
    f.card.parentElement!.className = 'empty-conversation'
    await f.measure()
    expect(f.w.__dshDafeiyuProjectPosition?.(raw)).toEqual({ left: 600, top: 88 })
    f.setBounds(composer)
    const history = f.w.document.createElement('article')
    f.card.parentElement!.prepend(history)
    await f.measure()
    expect(f.w.__dshDafeiyuProjectPosition?.(raw)).toEqual({ left: 600, top: 188 })
    f.setBounds({ ...composer, top: 400 })
    history.append(f.w.document.createTextNode('the first actual conversation reply'))
    await f.measure()
    expect(f.w.__dshDafeiyuProjectPosition?.(raw)).toEqual({ left: 600, top: 168 })
  })
})
