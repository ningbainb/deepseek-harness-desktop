import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectFrameCounts, FRAME_COLUMNS, FRAME_HEIGHT, FRAME_WIDTH } from './spritesheet.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('spritesheet frame detection', () => {
  it('uses a readback canvas and retains the occupied frame counts', () => {
    const image = { naturalWidth: FRAME_COLUMNS * FRAME_WIDTH, naturalHeight: 9 * FRAME_HEIGHT } as HTMLImageElement
    const data = new Uint8ClampedArray(image.naturalWidth * image.naturalHeight * 4)
    const expected = [6, 8, 8, 4, 5, 8, 6, 6, 6]
    for (const [row, count] of expected.entries()) {
      for (let column = 0; column < count; column++) {
        const horizontal = column * FRAME_WIDTH + 12
        const vertical = row * FRAME_HEIGHT + 12
        data[(vertical * image.naturalWidth + horizontal) * 4 + 3] = 255
      }
    }
    const drawImage = vi.fn()
    const getImageData = vi.fn(() => ({ data }))
    const getContext = vi.fn(() => ({ drawImage, getImageData }))
    const canvas = { width: 0, height: 0, getContext }
    const createElement = vi.fn(() => canvas)
    vi.stubGlobal('document', { createElement })

    expect(detectFrameCounts(image)).toEqual(expected)
    expect(createElement).toHaveBeenCalledExactlyOnceWith('canvas')
    expect(getContext).toHaveBeenCalledExactlyOnceWith('2d', { willReadFrequently: true })
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(image, 0, 0)
    expect(getImageData).toHaveBeenCalledExactlyOnceWith(0, 0, image.naturalWidth, image.naturalHeight)
  })

  it('retains the fallback when the canvas context is unavailable', () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) })
    const image = { naturalWidth: FRAME_COLUMNS * FRAME_WIDTH, naturalHeight: 9 * FRAME_HEIGHT } as HTMLImageElement

    expect(detectFrameCounts(image)).toEqual(Array.from({ length: 9 }, () => FRAME_COLUMNS))
  })
})
