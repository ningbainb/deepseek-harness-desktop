import { describe, expect, it } from 'vitest'

import {
  computeWhalePose,
  createWhaleParticleField,
  deriveWhalePalette,
  parseCssColor,
} from '../src/client/whale.ts'

describe('whale palette derivation', () => {
  it('parses hex and rgb() colors', () => {
    expect(parseCssColor('#3b82f6')).toEqual({ r: 59, g: 130, b: 246 })
    expect(parseCssColor('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseCssColor('rgb(31, 132, 177)')).toEqual({ r: 31, g: 132, b: 177 })
    expect(parseCssColor('rgba(31,132,177,0.5)')).toEqual({ r: 31, g: 132, b: 177 })
    expect(parseCssColor('')).toBeUndefined()
    expect(parseCssColor('oklch(0.7 0.1 240)')).toBeUndefined()
  })

  it('falls back to the startup-screen blue when the skin token is missing', () => {
    expect(deriveWhalePalette(undefined, true)[0]).toBe(deriveWhalePalette({ r: 104, g: 193, b: 242 }, true)[0])
    expect(deriveWhalePalette(undefined, false)[0]).toBe(deriveWhalePalette({ r: 31, g: 132, b: 177 }, false)[0])
  })

  it('lifts toward white on dark pages and deepens on light pages', () => {
    const base = { r: 100, g: 150, b: 200 }
    const dark = deriveWhalePalette(base, true)
    const light = deriveWhalePalette(base, false)
    expect(dark).toHaveLength(7)
    expect(light).toHaveLength(7)
    // dark: later buckets get brighter; light: later buckets get darker
    const channel = (color: string): number => Number(/rgb\((\d+)/u.exec(color)?.[1])
    expect(channel(dark[5])).toBeGreaterThan(channel(dark[0]))
    expect(channel(light[5])).toBeLessThan(channel(light[0]))
  })
})

describe('whale pose', () => {
  it('stays deterministic and inside gentle drift bounds', () => {
    const first = computeWhalePose(12.5, 1600, 900)
    const second = computeWhalePose(12.5, 1600, 900)
    expect(first).toEqual(second)
    expect(first.centerX).toBeGreaterThan(1600 * 0.5)
    expect(first.centerX).toBeLessThan(1600 * 0.62)
    expect(first.centerY).toBeGreaterThan(900 * 0.34)
    expect(first.centerY).toBeLessThan(900 * 0.5)
    expect(Math.abs(first.heading)).toBeLessThan(0.05)
    expect(first.breathe).toBeGreaterThan(0.98)
    expect(first.breathe).toBeLessThan(1.02)
  })
})

describe('whale silhouette field', () => {
  it('keeps the deterministic geometric fallback when no mask is provided', () => {
    const first = createWhaleParticleField(180)
    const second = createWhaleParticleField(180)
    expect(first).toHaveLength(180)
    expect(second).toEqual(first)
    expect(first.every((point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)).toBe(true)
    expect(first.some((point) => point.tail > 0.7)).toBe(true)
  })

  it('samples inside a provided mask and tags edges, sparks and color keys', () => {
    // Disc mask: alpha 255 inside a centered circle, 0 outside.
    const mask = {
      alphaAt: (px: number, py: number): number =>
        (px - 360) ** 2 + (py - 360) ** 2 <= 200 ** 2 ? 255 : 0,
    }
    const points = createWhaleParticleField(120, 0x5d51, mask)
    expect(points).toHaveLength(120)
    expect(points.every((point) => (point.x * 720 - 360) ** 2 + (point.y * 720 - 360) ** 2 <= 210 ** 2)).toBe(true)
    expect(points.some((point) => point.edge)).toBe(true)
    expect(points.every((point) => point.colorKey >= 0 && point.colorKey <= 6)).toBe(true)
  })
})
