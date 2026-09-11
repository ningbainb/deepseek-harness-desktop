import { afterEach, expect, it, vi } from 'vitest'
import { WHALE_THEME_DEFINITION } from '../src/client/whale.ts'
import { pageProfile, resolveParticleThemeSettings } from '../src/client/theme.ts'

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = '' })

it('clears overlapping message areas after all drawing and redraws reduced-motion clearance', () => {
  let frame: FrameRequestCallback | undefined
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1 })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  const canvas = document.createElement('canvas')
  const calls: Array<{ name: string; args: number[] }> = []
  const context = Object.fromEntries(['setTransform', 'clearRect', 'save', 'restore', 'beginPath', 'moveTo', 'arc', 'fill']
    .map(name => [name, (...args: number[]) => { calls.push({ name, args }) }])) as unknown as CanvasRenderingContext2D
  Object.defineProperty(canvas, 'getContext', { value: () => context })
  const scene = WHALE_THEME_DEFINITION.create({ canvas, document, window })
  const contentRects = [{ x: 300, y: 100, width: 400, height: 80 }, { x: 320, y: 120, width: 400, height: 80 }]
  const state = { settings: resolveParticleThemeSettings(undefined), mode: 'reduced' as const, profile: pageProfile('reduced'), contentRects }
  const flush = () => { const callback = frame; frame = undefined; callback?.(2000) }
  scene.update(state); flush()
  expect(calls.some(call => call.name === 'fill')).toBe(true)
  expect(calls.slice(-3)).toEqual([
    { name: 'restore', args: [] },
    { name: 'clearRect', args: [300, 100, 400, 80] },
    { name: 'clearRect', args: [320, 120, 400, 80] },
  ])
  expect(frame).toBeUndefined()
  calls.length = 0
  scene.update({ ...state, contentRects: [] }); flush()
  expect(calls.filter(call => call.name === 'clearRect')).toHaveLength(1)
  expect(calls.at(-1)?.name).toBe('restore')
  scene.dispose()
})
