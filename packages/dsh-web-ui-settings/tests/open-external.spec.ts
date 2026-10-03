/** @vitest-environment jsdom */

import { describe, expect, it, vi, afterEach } from 'vitest'
import { openExternalUrl } from '../src/client/open-external.ts'

describe('openExternalUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('rejects invalid or non-http(s) URLs', () => {
    const windowOpen = vi.spyOn(window, 'open')
    expect(openExternalUrl('javascript:alert(1)')).toBe(false)
    expect(openExternalUrl('file:///etc/passwd')).toBe(false)
    expect(openExternalUrl('invalid-url')).toBe(false)
    expect(windowOpen).not.toHaveBeenCalled()
  })

  it('uses the trusted main bridge instead of any popup and preserves its receiver', () => {
    const bridge = { openExternalUrl: vi.fn(function (this: unknown, href: string) {
      expect(this).toBe(bridge)
      expect(href).toBe('https://example.com/path')
      return Promise.resolve(true)
    }) }
    vi.stubGlobal('dshDesktop', bridge)
    const popup = vi.spyOn(window, 'open')
    expect(openExternalUrl('https://example.com/path')).toBe(true)
    expect(bridge.openExternalUrl).toHaveBeenCalledTimes(1)
    expect(popup).not.toHaveBeenCalled()
  })

  it.each(['dshDesktopTransport', 'dshDockSettings'])('supports an isolated %s bridge', name => {
    const open = vi.fn().mockResolvedValue(true)
    vi.stubGlobal(name, { openExternalUrl: open })
    const popup = vi.spyOn(window, 'open')
    expect(openExternalUrl('http://example.com/path')).toBe(true)
    expect(open).toHaveBeenCalledExactlyOnceWith('http://example.com/path')
    expect(popup).not.toHaveBeenCalled()
  })

  it.each(['dshDesktop', 'dshDesktopTransport', 'dshDockSettings'])('fails closed when %s has no browser bridge', name => {
    vi.stubGlobal(name, {})
    const popup = vi.spyOn(window, 'open')
    expect(openExternalUrl('https://example.com')).toBe(false)
    expect(popup).not.toHaveBeenCalled()
  })

  it.each(['rejected', 'refused'])('reports an asynchronously %s bridge without popup fallback', async kind => {
    const open = kind === 'rejected' ? vi.fn().mockRejectedValue(new Error('offline')) : vi.fn().mockResolvedValue(false)
    vi.stubGlobal('dshDesktop', { openExternalUrl: open })
    const popup = vi.spyOn(window, 'open')
    const onFailure = vi.fn()
    expect(openExternalUrl('https://example.com', onFailure)).toBe(true)
    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1))
    expect(popup).not.toHaveBeenCalled()
  })

  it('does not retry a synchronous main bridge error through a legacy bridge or popup', () => {
    vi.stubGlobal('dshDesktop', { openExternalUrl: () => { throw new Error('offline') } })
    const legacy = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('dshDesktopTransport', { openExternalUrl: legacy })
    const popup = vi.spyOn(window, 'open')
    expect(openExternalUrl('https://example.com')).toBe(false)
    expect(legacy).not.toHaveBeenCalled()
    expect(popup).not.toHaveBeenCalled()
  })

  it('rejects credentials, raw controls and custom protocols before invoking the bridge', () => {
    const open = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('dshDesktop', { openExternalUrl: open })
    for (const href of ['https://user:secret@example.com', 'https://example.com/\npath', 'https://example.com/ with space', 'mailto:user@example.com', 'dsh-runtime://app', 'file:///C:/test', 'javascript:alert(1)', 'x'.repeat(8193)]) {
      expect(openExternalUrl(href)).toBe(false)
    }
    expect(open).not.toHaveBeenCalled()
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
