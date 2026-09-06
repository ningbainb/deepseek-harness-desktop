/**
 * Drag-to-composer pure helper tests: MIME detection and the draft splicing
 * rule (separator spacing around the caret, empty path, out-of-range caret).
 */
import { describe, expect, it } from 'vitest'
import {
  FILE_DRAG_MIME,
  MAX_SAFE_IMAGE_BYTES,
  calculateScaledDimensions,
  compressImageFileToFit,
  formatDroppedFile,
  formatGenericFileAttachment,
  formatImageAttachment,
  hasFileDrag,
  insertPathIntoDraft,
  isImageFile,
  isPureImageDrag,
} from '../src/client/drag/file-drag.ts'

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
    const smallImage = {
      name: 'icon.png',
      type: 'image/png',
      size: 150_000,
    } as unknown as File
    const result = await compressImageFileToFit(smallImage)
    expect(result).toBe(smallImage)
  })
})
