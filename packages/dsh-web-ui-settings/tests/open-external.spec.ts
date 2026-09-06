/** @vitest-environment jsdom */

import { describe, expect, it, vi, afterEach } from 'vitest'
import { openExternalUrl } from '../src/client/open-external.ts'

describe('openExternalUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects invalid or non-http(s) URLs', () => {
    const windowOpen = vi.spyOn(window, 'open')
    expect(openExternalUrl('javascript:alert(1)')).toBe(false)
    expect(openExternalUrl('file:///etc/passwd')).toBe(false)
    expect(openExternalUrl('invalid-url')).toBe(false)
    expect(windowOpen).not.toHaveBeenCalled()
  })

  it('uses about:blank popup bootstrap for Electron Desktop compatibility', () => {
    const fakePopup = { location: { href: '' } } as unknown as Window
    const windowOpen = vi.spyOn(window, 'open').mockReturnValue(fakePopup)

    const result = openExternalUrl('https://api.1521003.xyz/keys')
    expect(result).toBe(true)
    expect(windowOpen).toHaveBeenCalledWith('about:blank', '_blank')
    expect(fakePopup.location.href).toBe('https://api.1521003.xyz/keys')
  })

  it('falls back to direct window.open if about:blank fails or returns null', () => {
    let callCount = 0
    const fakePopup = {} as Window
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => {
      callCount++
      if (callCount === 1) return null
      return fakePopup
    })

    const result = openExternalUrl('https://api.1521003.xyz/wallet')
    expect(result).toBe(true)
    expect(windowOpen).toHaveBeenCalledTimes(2)
    expect(windowOpen).toHaveBeenLastCalledWith('https://api.1521003.xyz/wallet', '_blank', 'noreferrer,noopener')
  })
})
