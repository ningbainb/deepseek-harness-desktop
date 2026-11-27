import { describe, expect, it } from 'vitest'
import { buildSafeArtifactDocument } from '../src/client/SafeArtifactFrame.tsx'
import * as frame from '../src/client/frame-document.ts'
import { readArtifactTheme } from '../src/client/theme-bridge.ts'

describe('artifact document', () => {
  it('defaults to a scriptless policy and retains the content', () => {
    const html = buildSafeArtifactDocument('<p>Report</p>')
    expect(html).toContain("script-src 'none'")
    expect(html).toContain('<p>Report</p>')
  })

  it('runs inline scripts only with the bridge capability', () => {
    const fragment = '<script>document.title = "Report"</script>'
    const options = { mode: 'interactive' as const, token: 'a'.repeat(32) }
    const html = frame.buildSafeArtifactDocument(fragment, options)
    expect(html).toContain("script-src 'unsafe-inline'")
    expect(html).toContain("connect-src 'none'")
    expect(html).toContain("form-action 'none'")
    expect(html.indexOf('dshUi')).toBeLessThan(html.indexOf(fragment))
    expect(frame.buildSafeArtifactDocument(fragment, { mode: 'interactive' })).toContain("script-src 'none'")
  })

  it('measures settled static previews using a nonce limited to the host bridge', () => {
    const token = 'c'.repeat(32)
    const html = frame.buildSafeArtifactDocument('<p>Report</p>', { mode: 'static', token })
    expect(html).toContain("script-src 'nonce-" + token + "'")
    expect(html).toContain('<script nonce="' + token + '"')
    expect(html).toContain("connect-src 'none'")
    expect(html).not.toContain("script-src 'unsafe-inline'")
    expect(html).not.toContain('sendAction')
  })

  it('requires both the native origin and the guard marker', () => {
    const native = new URL('dsh-runtime://app/chat')
    expect(frame.canRunArtifactScripts(native, true)).toBe(true)
    expect(frame.canRunArtifactScripts(native, false)).toBe(false)
    expect(frame.canRunArtifactScripts(new URL('dsh-runtime://other/chat'), true)).toBe(false)
    expect(frame.canRunArtifactScripts(new URL('https://example.test'), true)).toBe(false)
  })
})

describe('artifact theme', () => {
  it('maps valid host variables and uses a safe fallback for malformed values', () => {
    const host = new Map([
      ['--dsw-bg', ' rgb(10 20 30) '],
      ['--dsw-text', ' #eee '],
      ['--dsw-accent', ';</style>'],
      ['--dsw-radius-md', '12px'],
    ])
    const theme = readArtifactTheme({ getPropertyValue: key => host.get(key) ?? '' }, true)
    expect(theme.scheme).toBe('dark')
    expect(theme.tokens['--ui-bg']).toBe('rgb(10 20 30)')
    expect(theme.tokens['--ui-text']).toBe('#eee')
    expect(theme.tokens['--ui-accent']).toBe('#a5b4fc')
    expect(theme.tokens['--ui-radius']).toBe('12px')
  })
})

describe('artifact frame messages', () => {
  const token = 'b'.repeat(32)
  const source = {} as Window
  function receive(data: unknown, origin = 'null', eventSource = source) {
    return frame.readArtifactFrameMessage({ data, origin, source: eventSource }, source, token)
  }

  it('accepts only the current opaque iframe and token', () => {
    const report = { channel: 'dsh-artifact', token, type: 'resize', height: 325 }
    expect(receive(report)).toEqual({ type: 'resize', height: 325 })
    expect(receive(report, 'https://example.test')).toBeUndefined()
    expect(receive(report, 'null', {} as Window)).toBeUndefined()
    expect(receive({ ...report, token: 'c'.repeat(32) })).toBeUndefined()
  })

  it('checks action shape and bounds the JSON before decoding', () => {
    const request = { channel: 'dsh-artifact', token, type: 'action', action: 'apply-filter' }
    expect(receive({ ...request, payload: '{"year":2026}' })).toEqual({
      type: 'action', action: 'apply-filter', payload: { year: 2026 },
    })
    expect(receive({ ...request, payload: '{invalid' })).toBeUndefined()
    expect(receive({ ...request, payload: '"' + 'x'.repeat(8192) + '"' })).toBeUndefined()
    expect(receive({ ...request, action: 'a'.repeat(65), payload: 'null' })).toBeUndefined()
  })

  it('bounds diagnostic text and ignores invalid locations', () => {
    const notice = { channel: 'dsh-artifact', token, type: 'diagnostic', message: 'e'.repeat(1000), line: 9, column: -1 }
    expect(receive(notice)).toEqual({ type: 'diagnostic', message: 'e'.repeat(500), line: 9 })
  })
})
