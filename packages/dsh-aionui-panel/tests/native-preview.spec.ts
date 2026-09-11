import { expect, it, vi } from 'vitest'
import { nativePreviewAddress, openNativePreview } from '../src/client/native-preview.ts'

it('encodes session-local paths without leaking URI delimiters into the address', () => {
  expect(nativePreviewAddress('session-one', './目录\\a#?.md')).toBe('dsh-resource://file/session/session-one/%E7%9B%AE%E5%BD%95/a%23%3F.md')
  for (const path of ['../secret.txt', 'a/../../secret.txt', '/etc/passwd', 'C:\\secret.txt', '\\\\host\\share', 'a\u0000b']) {
    expect(nativePreviewAddress('session-one', path)).toBeUndefined()
  }
})

it('opens common files once through the registered native reader', () => {
  const openResource = vi.fn(), claim = vi.fn(() => ({ kind: 'text' }))
  for (const path of ['readme.md', 'index.html', 'report.pdf', 'image.png', 'main.ts']) {
    expect(openNativePreview({ sidebar: { openResource }, registry: { claim }, sessionId: 'session-one', currentRoot: '/work' }, '/work', path)).toBe(true)
  }
  expect(openResource).toHaveBeenCalledTimes(5)
  expect(openResource).toHaveBeenLastCalledWith('dsh-resource://file/session/session-one/main.ts')
})

it('preserves specialized viewers, unavailable native hosts and session boundaries', () => {
  const openResource = vi.fn(), registry = { claim: vi.fn(() => ({ kind: 'text' })) }
  const options = { sidebar: { openResource }, registry, sessionId: 'session-one', currentRoot: '/work' }
  for (const path of ['sheet.csv', 'book.xlsx', 'slides.pptx']) expect(openNativePreview(options, '/work', path)).toBe(false)
  expect(openNativePreview(options, '/other', 'main.ts')).toBe(false)
  expect(openNativePreview({ ...options, sidebar: undefined }, '/work', 'main.ts')).toBe(false)
  expect(openNativePreview({ ...options, registry: { claim: () => { throw new Error('no native reader') } } }, '/work', 'main.ts')).toBe(false)
  expect(openResource).not.toHaveBeenCalled()
})
