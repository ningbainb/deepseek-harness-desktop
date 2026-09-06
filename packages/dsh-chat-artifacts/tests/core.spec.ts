import { describe, expect, it } from 'vitest'
import {
  ARTIFACT_DEFAULT_HEIGHT,
  ARTIFACT_MAX_BYTES,
  ARTIFACT_MAX_HEIGHT,
  ARTIFACT_MIN_HEIGHT,
  artifactSourceFromMeta,
  isArtifactRecord,
  normalizeArtifactArgs,
  utf8ByteLength,
  validateArtifactHtml,
} from '../src/core/types.ts'

describe('artifact HTML boundary', () => {
  it('accepts inline CSS, SVG, and media data URLs', () => {
    const html = [
      '<style>.node { background: url(data:image/svg+xml;base64,AAAA); }</style>',
      '<div class="node"><svg viewBox="0 0 20 20" role="img"><circle cx="10" cy="10" r="8" /></svg></div>',
    ].join('')
    expect(validateArtifactHtml(html)).toEqual([])
  })

  it.each([
    ['script element', '<script>document.body.textContent = "x"</script>'],
    ['event handler', '<button onclick="alert(1)">Open</button>'],
    ['external image', '<img src="https://example.com/a.png">'],
    ['external stylesheet', '<style>@import url("https://example.com/a.css");</style>'],
    ['nested frame', '<iframe src="https://example.com"></iframe>'],
    ['form', '<form action="/submit"><input></form>'],
    ['runtime API', '<div>fetch("/data")</div>'],
  ])('rejects %s', (_label, html) => {
    expect(validateArtifactHtml(html).length).toBeGreaterThan(0)
  })

  it('enforces the byte cap before an artifact can be persisted', () => {
    const html = 'x'.repeat(ARTIFACT_MAX_BYTES + 1)
    expect(utf8ByteLength(html)).toBe(ARTIFACT_MAX_BYTES + 1)
    expect(() => normalizeArtifactArgs({
      title: 'Large',
      kind: 'report',
      html,
    })).toThrow(String(ARTIFACT_MAX_BYTES))
  })

  it('normalizes defaults and rejects an out-of-range height', () => {
    expect(normalizeArtifactArgs({
      title: '  Roadmap  ',
      kind: 'roadmap',
      html: '<div>Q1</div>',
    })).toEqual({
      title: 'Roadmap',
      kind: 'roadmap',
      html: '<div>Q1</div>',
      height: ARTIFACT_DEFAULT_HEIGHT,
    })
    expect(() => normalizeArtifactArgs({
      title: 'Too short',
      kind: 'flow',
      html: '<div>Flow</div>',
      height: ARTIFACT_MIN_HEIGHT - 1,
    })).toThrow(String(ARTIFACT_MIN_HEIGHT))
    expect(() => normalizeArtifactArgs({
      title: 'Too tall',
      kind: 'flow',
      html: '<div>Flow</div>',
      height: ARTIFACT_MAX_HEIGHT + 1,
    })).toThrow(String(ARTIFACT_MAX_HEIGHT))
  })
})

describe('durable artifact metadata', () => {
  const record = {
    artifactId: 'artifact_test123',
    title: 'Flow',
    kind: 'flow' as const,
    html: '<div>Start</div>',
    height: 420,
    bytes: utf8ByteLength('<div>Start</div>'),
    sha256: 'a'.repeat(64),
  }

  it('soft-validates replay metadata and extracts bounded source on failure', () => {
    expect(isArtifactRecord(record)).toBe(true)
    expect(isArtifactRecord({ ...record, html: '<script>x</script>' })).toBe(false)
    expect(isArtifactRecord({ ...record, title: 'x'.repeat(161) })).toBe(false)
    expect(isArtifactRecord({ ...record, description: {} })).toBe(false)
    expect(artifactSourceFromMeta({ html: '<script>x</script>' })).toBe('<script>x</script>')
    expect(artifactSourceFromMeta({ html: 'x'.repeat(ARTIFACT_MAX_BYTES + 1) })).toBeUndefined()
  })
})
