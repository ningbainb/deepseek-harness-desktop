/**
 * Drag-to-composer pure helper tests: MIME detection and the draft splicing
 * rule (separator spacing around the caret, empty path, out-of-range caret).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FILE_DRAG_MIME,
  MAX_SAFE_IMAGE_BYTES,
  MAX_SOURCE_IMAGE_BYTES,
  ImageProcessingError,
  calculateScaledDimensions,
  compressImageFileToFit,
  formatDroppedFile,
  formatGenericFileAttachment,
  formatImageAttachment,
  hasFileDrag,
  insertPathIntoDraft,
  isImageFile,
  isPureImageDrag,
  imageDimensionsFromHeader,
  processImageFilesSequentially,
} from '../src/client/drag/file-drag.ts'

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

function pngFile(name: string, width: number, height: number): File {
  return new File([pngHeader(width, height)], name, { type: 'image/png' })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('hasFileDrag', () => {
  it('detects the custom file MIME among drag types', () => {
    expect(hasFileDrag([FILE_DRAG_MIME])).toBe(true)
    expect(hasFileDrag(['text/plain', FILE_DRAG_MIME, 'text/uri-list'])).toBe(true)
    expect(hasFileDrag(['Files'])).toBe(false)
    expect(hasFileDrag(['text/plain'])).toBe(false)
    expect(hasFileDrag(undefined)).toBe(false)
    expect(hasFileDrag([])).toBe(false)
  })
})

describe('insertPathIntoDraft', () => {
  it('inserts into an empty draft', () => {
    expect(insertPathIntoDraft('', 'deploy/base/deployment.yaml')).toBe('deploy/base/deployment.yaml')
  })

  it('appends to the end by default', () => {
    expect(insertPathIntoDraft('check this', 'src/main.ts')).toBe('check this src/main.ts')
  })

  it('keeps an existing trailing space when appending', () => {
    expect(insertPathIntoDraft('check this ', 'src/main.ts')).toBe('check this src/main.ts')
  })

  it('inserts at a caret in the middle with both separators', () => {
    expect(insertPathIntoDraft('ab', 'x', 1)).toBe('a x b')
  })

  it('does not add a leading space at line start', () => {
    expect(insertPathIntoDraft('ab', 'x', 0)).toBe('x ab')
  })

  it('does not add a trailing space at the end', () => {
    expect(insertPathIntoDraft('ab', 'x', 2)).toBe('ab x')
  })

  it('inserts right after whitespace without a double space', () => {
    expect(insertPathIntoDraft('a  b', 'x', 3)).toBe('a  x b')
  })

  it('inserts right before whitespace without a double space', () => {
    expect(insertPathIntoDraft('a b ', 'x', 2)).toBe('a x b ')
  })

  it('keeps paths with spaces intact', () => {
    expect(insertPathIntoDraft('read', 'docs/My File.md')).toBe('read docs/My File.md')
  })

  it('is a no-op for an empty path', () => {
    expect(insertPathIntoDraft('abc', '')).toBe('abc')
    expect(insertPathIntoDraft('abc', '', 1)).toBe('abc')
  })

  it('clamps out-of-range carets', () => {
    expect(insertPathIntoDraft('ab', 'x', -5)).toBe('x ab')
    expect(insertPathIntoDraft('ab', 'x', 99)).toBe('ab x')
  })
})

describe('any-file drop formatting', () => {
  it('detects image files by extension and mime', () => {
    expect(isImageFile({ name: 'avatar.png' })).toBe(true)
    expect(isImageFile({ name: 'photo.jpg' })).toBe(true)
    expect(isImageFile({ name: 'blob', type: 'image/webp' })).toBe(true)
    expect(isImageFile({ name: 'code.ts' })).toBe(false)
  })

  it('formats image attachments into markdown image tags', () => {
    expect(formatImageAttachment('screenshot.png', 'C:/Users/test/screenshot.png')).toBe('![screenshot.png](C:/Users/test/screenshot.png)')
    expect(formatImageAttachment('screenshot.png')).toBe('![screenshot.png](screenshot.png)')
  })

  it('formats generic document and binary attachments into markdown links', () => {
    expect(formatGenericFileAttachment('report.pdf', 'C:/docs/report.pdf')).toBe('[report.pdf](C:/docs/report.pdf)')
    expect(formatGenericFileAttachment('archive.zip')).toBe('[archive.zip](archive.zip)')
  })

  it('formats dropped files with electron paths asynchronously', async () => {
    const fakeImage = { name: 'ui.png', type: 'image/png', size: 500, path: 'C:/app/ui.png' } as unknown as File
    expect(await formatDroppedFile(fakeImage)).toBe('![ui.png](C:/app/ui.png)')

    const fakePdf = { name: 'spec.pdf', type: 'application/pdf', size: 12000, path: 'C:/app/spec.pdf' } as unknown as File
    expect(await formatDroppedFile(fakePdf)).toBe('[spec.pdf](C:/app/spec.pdf)')
  })

  it('detects pure image drags to allow native image handling to take precedence', () => {
    expect(isPureImageDrag(['Files'], [{ kind: 'file', type: 'image/png' }])).toBe(true)
    expect(isPureImageDrag(['Files'], [{ kind: 'file', type: 'image/jpeg' }, { kind: 'file', type: 'image/webp' }])).toBe(true)
    expect(isPureImageDrag(['Files'], [{ kind: 'file', type: 'text/plain' }])).toBe(false)
    expect(isPureImageDrag(['Files'], [{ kind: 'file', type: 'image/png' }, { kind: 'file', type: 'text/plain' }])).toBe(false)
    expect(isPureImageDrag(['Files'], [{ kind: 'file', type: '' }])).toBe(false)
    expect(isPureImageDrag([FILE_DRAG_MIME], [{ kind: 'file', type: 'image/png' }])).toBe(false)
    expect(isPureImageDrag(undefined, [{ kind: 'file', type: 'image/png' }])).toBe(false)
    expect(isPureImageDrag(['Files'], [])).toBe(false)
  })

  it('calculates aspect-ratio preserving scaled dimensions for image compression', () => {
    // Normal small image: kept unchanged
    expect(calculateScaledDimensions(800, 600, 2048)).toEqual({ width: 800, height: 600 })
    // Wide 4K image: scaled down to max width 2048
    expect(calculateScaledDimensions(3840, 2160, 2048)).toEqual({ width: 2048, height: 1152 })
    // Tall 4K image: scaled down to max height 2048
    expect(calculateScaledDimensions(2160, 3840, 2048)).toEqual({ width: 1152, height: 2048 })
    // Square 5000x5000 image
    expect(calculateScaledDimensions(5000, 5000, 2048)).toEqual({ width: 2048, height: 2048 })
    // Edge case 0
    expect(calculateScaledDimensions(0, 0, 2048)).toEqual({ width: 0, height: 0 })
  })

  it('preserves small image files without unnecessary compression', async () => {
    const smallImage = pngFile('icon.png', 800, 600)
    const result = await compressImageFileToFit(smallImage)
    expect(result).toBe(smallImage)
  })

  it('parses dimensions from image headers before browser decoding', () => {
    expect(imageDimensionsFromHeader(pngHeader(3840, 2160))).toEqual({ width: 3840, height: 2160 })

    const gif = new Uint8Array(10)
    gif.set(new TextEncoder().encode('GIF89a'))
    new DataView(gif.buffer).setUint16(6, 640, true)
    new DataView(gif.buffer).setUint16(8, 480, true)
    expect(imageDimensionsFromHeader(gif)).toEqual({ width: 640, height: 480 })
  })

  it('rejects unsafe bytes and pixels before creating a decoded image', async () => {
    const createObjectUrl = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl })
    const hugeBytes = {
      name: 'huge.png',
      type: 'image/png',
      size: MAX_SOURCE_IMAGE_BYTES + 1,
      slice: () => new Blob([pngHeader(100, 100)]),
    } as unknown as File
    await expect(compressImageFileToFit(hugeBytes)).rejects.toMatchObject({ code: 'source-too-large' })
    await expect(compressImageFileToFit(pngFile('pixels.png', 8000, 8000))).rejects.toMatchObject({ code: 'source-too-large' })
    expect(createObjectUrl).not.toHaveBeenCalled()
  })

  it('processes image batches serially and honours cancellation', async () => {
    let activeProbes = 0
    let peakProbes = 0
    const order: string[] = []
    const file = (name: string): File => ({
      name,
      type: 'image/png',
      size: 24,
      slice: () => ({
        arrayBuffer: async () => {
          activeProbes += 1
          peakProbes = Math.max(peakProbes, activeProbes)
          order.push(`start:${name}`)
          await new Promise(resolve => setTimeout(resolve, 1))
          order.push(`end:${name}`)
          activeProbes -= 1
          return pngHeader(100, 100).buffer
        },
      }),
    } as unknown as File)
    const files = [file('a.png'), file('b.png'), file('c.png')]
    expect(await processImageFilesSequentially(files)).toEqual(files)
    expect(peakProbes).toBe(1)
    expect(order).toEqual(['start:a.png', 'end:a.png', 'start:b.png', 'end:b.png', 'start:c.png', 'end:c.png'])

    const controller = new AbortController()
    controller.abort()
    await expect(processImageFilesSequentially(files, { signal: controller.signal })).rejects.toEqual(
      expect.objectContaining<ImageProcessingError>({ code: 'aborted' }),
    )
  })

  it('closes ImageBitmap decoders and clears the canvas after compression', async () => {
    const close = vi.fn()
    const bitmap = { width: 2304, height: 2304, close } as unknown as ImageBitmap
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    const drawImage = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        drawImage,
        imageSmoothingEnabled: false,
        imageSmoothingQuality: 'low',
      })),
      toBlob: (callback: BlobCallback) => callback(new Blob(['compressed'])),
    }
    const createElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((name: string) => (
      name === 'canvas' ? canvas as unknown as HTMLCanvasElement : createElement(name)
    ))

    const result = await compressImageFileToFit(pngFile('bitmap.png', 2304, 2304))

    expect(result).not.toBeNull()
    expect(result.type).toBe('image/jpeg')
    expect(canvas.getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true })
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2048, 2048)
    expect(close).toHaveBeenCalledTimes(1)
    expect(canvas).toMatchObject({ width: 0, height: 0 })
  })

  it('releases decoded image and canvas resources when compression fails', async () => {
    const revokeObjectUrl = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl })
    class TestImage {
      naturalWidth = 4000
      naturalHeight = 3000
      width = 4000
      height = 3000
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      private value = ''
      set src(next: string) {
        this.value = next
        if (next !== '') queueMicrotask(() => this.onload?.())
      }
      get src(): string { return this.value }
    }
    vi.stubGlobal('Image', TestImage)
    const canvas = { width: 0, height: 0, getContext: () => null }
    const createElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((name: string) => (
      name === 'canvas' ? canvas as unknown as HTMLCanvasElement : createElement(name)
    ))

    await expect(compressImageFileToFit(pngFile('large.png', 4000, 3000))).rejects.toMatchObject({ code: 'canvas-unavailable' })
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:test')
    expect(canvas).toMatchObject({ width: 0, height: 0 })
  })
})
