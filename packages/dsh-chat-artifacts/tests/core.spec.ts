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

  it('allows opt-in local interactions while keeping the static default', () => {
    const html = '<form onsubmit="event.preventDefault()"><button>Save</button></form><script>document.querySelector("button").textContent = "Ready"</script>'
    expect(validateArtifactHtml(html)).not.toEqual([])
    expect(validateArtifactHtml(html, 'interactive')).toEqual([])
  })

  it.each([
    '<form action="/checkout"></form>',
    '<img srcset="/one.png 1x">',
    '<img src="&#x68;ttps://example.com/a.png">',
    '<img src=" ../asset.png">',
    '<script>document.location = "https://example.com"</script>',
    '<script>window.parent.document</script>',
    '<script>new WebSocket("wss://example.com")</script>',
    '<svg><set attributeName="href" to="javascript:alert(1)"/></svg>',
  ])('rejects interactive fragment outside its local sandbox policy %s', html => {
    expect(validateArtifactHtml('<p>Start</p>\n' + html, 'interactive')).toEqual(expect.arrayContaining([
      expect.stringMatching(/html \(line 2\)/),
    ]))
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

  it('replays static shells containing old relative media while enforcing interactive URL limits', () => {
    const html = '<p>Report</p><img src="./plot.png"><svg><image href="/plot.svg"/></svg>'
    const legacy = { ...record, html, bytes: utf8ByteLength(html) }
    expect(isArtifactRecord(legacy)).toBe(true)
    expect(validateArtifactHtml(html, 'interactive')).not.toEqual([])
    expect(isArtifactRecord({ ...legacy, mode: 'interactive' })).toBe(false)
    expect(validateArtifactHtml('<img src="//example.com/plot.png">')).not.toEqual([])
    expect(validateArtifactHtml('<a href="./report">Open</a>')).not.toEqual([])
  })

  it('honors interactive or versioned metadata and rejects invalid optional fields', () => {
    const html = '<script>document.body.classList.add("ready")</script>'
    const interactive = { ...record, html, bytes: utf8ByteLength(html), mode: 'interactive', version: 2 }
    expect(isArtifactRecord(interactive)).toBe(true)
    expect(isArtifactRecord({ ...interactive, mode: undefined })).toBe(false)
    expect(isArtifactRecord({ ...interactive, mode: 'dynamic' })).toBe(false)
    expect(isArtifactRecord({ ...interactive, version: 0 })).toBe(false)
    expect(isArtifactRecord({ ...interactive, parentArtifactId: '../../other' })).toBe(false)
  })
})

describe('artifact edits', () => {
  it('applies exact replacements in order, including literal dollar sequences', async () => {
    const { applyArtifactEdits } = await import('../src/core/patch.ts')
    expect(applyArtifactEdits('<p>Start</p>', [
      { oldString: 'Start', newString: 'Next' },
      { oldString: 'Next', newString: 'Cost $&' },
    ])).toBe('<p>Cost $&</p>')
  })

  it('rejects missing, ambiguous (including overlaps), and empty matches', async () => {
    const { applyArtifactEdits } = await import('../src/core/patch.ts')
    expect(() => applyArtifactEdits('aaa', [{ oldString: 'aa', newString: 'b' }])).toThrow(/edits\[0\].oldString.*unique/)
    expect(() => applyArtifactEdits('aaa', [{ oldString: '', newString: 'b' }])).toThrow(/edits\[0\].oldString.*empty/)
    expect(() => applyArtifactEdits('aaa', [{ oldString: 'b', newString: 'c' }])).toThrow(/edits\[0\].oldString.*not found/)
  })
})

describe('streaming artifact markup', () => {
  it('shows markup and complete styles while dropping scripts, handlers and partial tags', async () => {
    const { sanitizeStreamingHtml } = await import('../src/core/streaming.ts')
    expect(sanitizeStreamingHtml('<div><style>p{color:red}</style><script>alert(1)</script><p onclick="go()">Ready<img alt="partial')).toBe('<div><style>p{color:red}</style><p>Ready</p></div>')
    expect(sanitizeStreamingHtml('<p>Ready</p><script>document.body.')).toBe('<p>Ready</p>')
    expect(sanitizeStreamingHtml('<p>Ready</p><style>@import "https://example.com')).toBe('<p>Ready</p>')
  })

  it('drops active markup and URLs and guards the original byte cap', async () => {
    const { sanitizeStreamingHtml } = await import('../src/core/streaming.ts')
    expect(sanitizeStreamingHtml('<svg onload="x()"><path d="M0 0"/><animate to="x"/></svg><img src="&#x68;ttps://example.com/a"><iframe srcdoc="bad"></iframe>')).toBe('<svg><path d="M0 0"/></svg><img>')
    expect(sanitizeStreamingHtml('é'.repeat(ARTIFACT_MAX_BYTES / 2 + 1))).toBeUndefined()
  })
})
