import React from 'react'
import * as ReactJSX from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { PetSprite } from 'published-pet-under-test/PetSprite.tsx'
import { projectPetPosition } from 'published-pet-under-test/composer-clearance.ts'
import { installPetControlClearance, petControlOffset, petRailOffset } from '../src/pet-control-clearance.mjs'

function emittedComponent() {
  const path = process.env.DSH_PET_CLEARANCE_COMPONENT_EMIT
  if (!path) return PetSprite
  let module: { id: string; factory(require: (name: string) => unknown): { PetSprite: typeof PetSprite } } | undefined
  const target = window as Window & { __ModuleLoader__?: { load(value: typeof module): void } }
  const previous = target.__ModuleLoader__
  target.__ModuleLoader__ = { load(value) { module = value } }
  try { new Function('window', readFileSync(resolve(path), 'utf8'))(window) }
  finally { target.__ModuleLoader__ = previous }
  expect(module?.id).toBe('@linxin666/dsh-pet')
  return module!.factory(name => {
    if (name === 'react') return React
    if (name === 'react-dom') return ReactDOM
    if (name === 'react/jsx-runtime') return ReactJSX
    throw new Error(`Unexpected component runtime external: ${name}`)
  }).PetSprite
}
const UnderTest = emittedComponent()

let frames: Map<number, FrameRequestCallback>
let nextFrame: number
let boxes: WeakMap<Element, DOMRect>
let observers: { callback: ResizeObserverCallback; targets: Set<Element>; disconnect: ReturnType<typeof vi.fn> }[]
const rect = (left: number, top: number, width: number, height: number) => new DOMRect(left, top, width, height)

beforeEach(() => {
  frames = new Map(); nextFrame = 0; boxes = new WeakMap(); observers = []
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 })
  Object.defineProperty(window, 'dshDesktop', { configurable: true, value: {} })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })
  vi.stubGlobal('PointerEvent', MouseEvent)
  vi.stubGlobal('ResizeObserver', class {
    targets = new Set<Element>()
    disconnect = vi.fn(() => this.targets.clear())
    constructor(public callback: ResizeObserverCallback) { observers.push(this) }
    observe(element: Element) { this.targets.add(element) }
    unobserve(element: Element) { this.targets.delete(element) }
  })
  Object.defineProperty(Element.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const saved = boxes.get(this)
    if (saved) return saved
    const element = this as HTMLElement
    if (element.style?.right && element.style?.bottom) {
      const sprite = element.querySelector('[role="button"]') as HTMLElement
      const width = Number.parseFloat(sprite?.style.width || '100')
      const height = Number.parseFloat(sprite?.style.height || '100')
      return rect(window.innerWidth - Number.parseFloat(element.style.right) - width,
        window.innerHeight - Number.parseFloat(element.style.bottom) - height, width, height)
    }
    return rect(0, 0, 0, 0)
  })
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function () {
    return [this.getBoundingClientRect()] as unknown as DOMRectList
  })
})

afterEach(() => {
  globalThis.dshPetControlClearance?.dispose()
  cleanup(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

function composer(bounds = rect(650, 480, 326, 200)) {
  const element = document.createElement('div')
  element.setAttribute('data-composer-card', '')
  boxes.set(element, bounds)
  document.body.append(element)
  return element
}

function mount(overrides: Record<string, unknown> = {}) {
  const track = { frames: [0], durations: [200], loop: true }
  const onDragEnd = vi.fn(), onPet = vi.fn(), onFeed = vi.fn()
  const props = {
    snapshot: null, definition: { id: 'clearance-pet', displayName: 'Test pet',
      cell: { width: 100, height: 100 }, columns: 1, rows: [1],
      tracks: Object.fromEntries(['idle', 'running', 'waiting', 'review', 'failed', 'waving', 'jumping', 'running-left', 'running-right'].map(key => [key, track])),
      atlasUrl: '/fixture.webp' },
    display: { visible: true, size: 100, right: 24, bottom: 120, bubbleScale: 1 },
    feedback: null, visual: <div>pet art</div>, onPet, onFeed, onDragEnd,
    onHide: vi.fn(), onRename: vi.fn(), onOpenSession: vi.fn(), onFeedbackDone: vi.fn(),
    t: (key: string) => key, ...overrides,
  }
  const commits = vi.fn()
  const result = render(<React.Profiler id="pet-clearance" onRender={commits}><UnderTest {...props} /></React.Profiler>)
  const sprite = screen.getByRole('button', { name: 'Test pet' })
  const float = sprite.parentElement!.parentElement!
  return { ...result, sprite, float, onDragEnd, onPet, onFeed, props, commits }
}

function overlaps(a: DOMRect, b: DOMRect) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

async function flush(timestamp = 1000) {
  await act(async () => { await Promise.resolve() })
  act(() => { const batch = [...frames.values()]; frames.clear(); batch.forEach(callback => callback(timestamp)) })
}

test('conversation scrolling with unchanged composer geometry does not commit extra pet renders', async () => {
  composer()
  const pet = mount()
  await flush()
  const commits = pet.commits.mock.calls.length
  for (let index = 0; index < 5; index++) {
    fireEvent.scroll(document)
    await flush(1100 + index * 100)
  }
  expect(pet.commits.mock.calls.length).toBe(commits)
  expect(pet.onDragEnd).not.toHaveBeenCalled()
})

test('actual published PetSprite avoids a visible composer without persisting its automatic displacement', async () => {
  const card = composer()
  const pet = mount()
  await flush()
  expect(overlaps(pet.float.getBoundingClientRect(), card.getBoundingClientRect())).toBe(false)
  expect(Number.parseFloat(pet.float.style.bottom)).toBe(228)
  expect(pet.props.display.bottom).toBe(120)
  expect(pet.onDragEnd).not.toHaveBeenCalled()
  fireEvent.click(pet.sprite)
  expect(pet.onPet).toHaveBeenCalledOnce()
  expect(pet.onDragEnd).not.toHaveBeenCalled()
})

test('drag starts at safe display, holds its position during capture, saves once and later clicks save nothing', async () => {
  const card = composer()
  const pet = mount()
  await flush()
  const safeRight = Number.parseFloat(pet.float.style.right), safeBottom = Number.parseFloat(pet.float.style.bottom)
  fireEvent.pointerDown(pet.sprite, { pointerId: 1, clientX: 900, clientY: 400 })
  expect(pet.sprite.setPointerCapture).toHaveBeenCalled()
  boxes.set(card, rect(500, 200, 490, 490))
  observers.forEach(observer => observer.callback([], observer as unknown as ResizeObserver))
  await flush()
  expect(Number.parseFloat(pet.float.style.bottom)).toBe(safeBottom)
  fireEvent.pointerMove(pet.sprite, { pointerId: 1, clientX: 780, clientY: 340 })
  fireEvent.pointerUp(pet.sprite, { pointerId: 1, clientX: 780, clientY: 340 })
  expect(pet.onDragEnd).toHaveBeenCalledExactlyOnceWith(safeRight + 120, safeBottom + 60)
  fireEvent.pointerDown(pet.sprite, { pointerId: 2, clientX: 600, clientY: 200 })
  fireEvent.pointerUp(pet.sprite, { pointerId: 2, clientX: 600, clientY: 200 })
  fireEvent.click(pet.sprite)
  expect(pet.onDragEnd).toHaveBeenCalledOnce()
})

test('composer replacement and resize remeasure through coalesced observers, without per-frame global queries', async () => {
  const card = composer()
  const query = vi.spyOn(document, 'querySelectorAll')
  const pet = mount()
  await flush()
  const previous = Number.parseFloat(pet.float.style.bottom)
  boxes.set(card, rect(650, 450, 326, 230))
  observers.forEach(observer => { observer.callback([], observer as unknown as ResizeObserver); observer.callback([], observer as unknown as ResizeObserver) })
  expect(frames.size).toBe(1)
  await flush()
  expect(Number.parseFloat(pet.float.style.bottom)).toBeGreaterThan(previous)
  const scans = query.mock.calls.filter(([selector]) => selector === '[data-composer-card]').length
  await flush(); await flush()
  expect(query.mock.calls.filter(([selector]) => selector === '[data-composer-card]').length).toBe(scans)
  card.remove()
  const replacement = composer(rect(550, 420, 430, 260))
  await flush()
  expect(overlaps(pet.float.getBoundingClientRect(), replacement.getBoundingClientRect())).toBe(false)
  pet.unmount()
  expect(observers.every(observer => observer.disconnect.mock.calls.length > 0)).toBe(true)
  expect(frames.size).toBe(0)
})

test('non-Desktop rendering retains the published raw position', async () => {
  Object.defineProperty(window, 'dshDesktop', { configurable: true, value: undefined })
  composer()
  const pet = mount()
  await flush()
  expect(pet.float.style.right).toBe('24px')
  expect(pet.float.style.bottom).toBe('120px')
  expect(pet.onDragEnd).not.toHaveBeenCalled()
})

test('pure projection considers all four edges, minimizes displacement and preserves its raw input', () => {
  const raw = { right: 200, bottom: 200 }, size = { width: 100, height: 100 }, viewport = { width: 500, height: 500 }
  const original = { ...raw }
  expect(projectPetPosition(raw, size, viewport, [])).toMatchObject({ ...raw, safe: true, reason: 'clear' })
  const left = projectPetPosition(raw, size, viewport, [{ left: 190, top: 0, width: 120, height: 500 }])
  expect(left).toMatchObject({ right: 318, bottom: 200, safe: true })
  const above = projectPetPosition(raw, size, viewport, [{ left: 0, top: 190, width: 500, height: 120 }])
  expect(above).toMatchObject({ right: 200, bottom: 318, safe: true })
  const right = projectPetPosition(raw, size, viewport, [{ left: 150, top: 0, width: 130, height: 500 }])
  expect(right).toMatchObject({ right: 112, bottom: 200, safe: true })
  const below = projectPetPosition(raw, size, viewport, [{ left: 0, top: 150, width: 500, height: 130 }])
  expect(below).toMatchObject({ right: 200, bottom: 112, safe: true })
  expect(raw).toEqual(original)
})

test('pure projection handles multiple obstacles and explicitly reports an impossible viewport', () => {
  const obstacles = [{ left: 190, top: 0, width: 120, height: 500 }, { left: 0, top: 190, width: 500, height: 120 }]
  const result = projectPetPosition({ right: 200, bottom: 200 }, { width: 100, height: 100 }, { width: 500, height: 500 }, obstacles)
  expect(result.safe).toBe(true)
  const shown = rect(500 - result.right - 100, 500 - result.bottom - 100, 100, 100)
  obstacles.forEach(block => expect(overlaps(shown, rect(block.left, block.top, block.width, block.height))).toBe(false))
  expect(projectPetPosition({ right: 10, bottom: 10 }, { width: 100, height: 100 }, { width: 80, height: 80 }, [])).toMatchObject({ safe: false, reason: 'no-space' })
  expect(projectPetPosition({ right: 10, bottom: 10 }, { width: 100, height: 100 }, { width: 500, height: 500 }, [{ left: 0, top: 0, width: 500, height: 500 }])).toMatchObject({ safe: false, reason: 'no-space' })
})

test('no-space remains visible and interactive without pretending it has cleared the composer', async () => {
  composer(rect(0, 0, 1000, 700))
  const pet = mount()
  await flush()
  expect(pet.float.getAttribute('data-dsh-pet-clearance-state')).toBe('no-space')
  expect(pet.sprite.getAttribute('role')).toBe('button')
  expect(pet.float.style.display).not.toBe('none')
  fireEvent.click(pet.sprite)
  expect(pet.onPet).toHaveBeenCalledOnce()
  expect(pet.onDragEnd).not.toHaveBeenCalled()
})

test('roaming starts at safe display but persists only its real action delta on top of the raw preference', async () => {
  composer()
  const bus = {} as { walk?: (direction: string, distance: number, speed: number) => number }
  const pet = mount({ bus })
  await flush()
  const startBottom = Number.parseFloat(pet.float.style.bottom)
  const started = performance.now()
  act(() => { expect(bus.walk?.('up', 60, 1000)).toBe(60) })
  await flush(started + 75)
  expect(Number.parseFloat(pet.float.style.bottom)).toBeGreaterThan(startBottom)
  expect(pet.onDragEnd).not.toHaveBeenCalled()
  await flush(started + 170)
  expect(Number.parseFloat(pet.float.style.bottom)).toBeCloseTo(startBottom + 60)
  expect(pet.onDragEnd).toHaveBeenCalledExactlyOnceWith(24, 180)
})

test('existing Desktop translate remains stable with composer ownership and a visible right-panel control', async () => {
  composer()
  const root = document.createElement('div')
  root.setAttribute('data-dsh-pet-root', '')
  document.body.append(root)
  const panel = document.createElement('aside')
  panel.setAttribute('data-sidebar-right-panel', 'push')
  const control = document.createElement('button')
  panel.append(control); document.body.append(panel)
  boxes.set(control, rect(866, 360, 110, 130))
  const pet = mount({ portalTarget: root })
  pet.float.style.position = 'fixed'
  const originalRect = pet.float.getBoundingClientRect.bind(pet.float)
  pet.float.getBoundingClientRect = () => {
    const base = originalRect()
    const [x = 0, y = 0] = pet.float.style.translate.split(' ').map(Number.parseFloat)
    return rect(base.left + (x || 0), base.top + (y || 0), base.width, base.height)
  }
  installPetControlClearance(petControlOffset, petRailOffset)
  await flush(); await flush()
  const translation = pet.float.style.translate
  expect(translation).not.toBe('')
  const displayed = pet.float.getBoundingClientRect()
  fireEvent.pointerDown(pet.sprite, { pointerId: 1, clientX: displayed.left + 50, clientY: displayed.top + 50 })
  await flush()
  expect(pet.float.getBoundingClientRect().left).toBe(displayed.left)
  fireEvent.pointerUp(pet.sprite, { pointerId: 1, clientX: displayed.left + 50, clientY: displayed.top + 50 })
  await flush(); await flush(); await flush()
  expect(pet.float.style.translate).toBe(translation)
  expect(pet.onDragEnd).not.toHaveBeenCalled()
  expect(overlaps(pet.float.getBoundingClientRect(), control.getBoundingClientRect())).toBe(false)
  panel.remove()
  await flush(); await flush()
  expect(pet.float.style.translate).toBe('')
})
