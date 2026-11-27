/**
 * Shared, DOM-free contracts and validation for Chat Artifact.
 *
 * The same validator runs before a value enters the session log and again
 * before a replayed value reaches an iframe. Keeping it DOM-free means the
 * host and browser halves cannot drift on the security boundary.
 */

import {
  ARTIFACT_URL_ATTRIBUTE,
  HTML_ATTRIBUTE,
  HTML_TAG,
  isArtifactAttributeUrl,
  isArtifactResourceUrl,
  isLegacyRelativeMediaUrl,
} from './html.ts'

export const ARTIFACT_KINDS = [
  'architecture',
  'flow',
  'timeline',
  'comparison',
  'roadmap',
  'dashboard',
  'table',
  'wireframe',
  'report',
  'other',
] as const

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number]

export const ARTIFACT_MODES = ['static', 'interactive'] as const
export type ArtifactMode = (typeof ARTIFACT_MODES)[number]

export const ARTIFACT_MAX_BYTES = 512 * 1024
export const ARTIFACT_DEFAULT_HEIGHT = 420
export const ARTIFACT_MIN_HEIGHT = 240
export const ARTIFACT_MAX_HEIGHT = 720
export const ARTIFACT_MAX_TITLE_LENGTH = 160
export const ARTIFACT_MAX_DESCRIPTION_LENGTH = 500

export interface RenderArtifactArgs {
  title: string
  kind: ArtifactKind
  html: string
  height?: number
  description?: string
  mode?: ArtifactMode
}

export interface NormalizedArtifactArgs {
  title: string
  kind: ArtifactKind
  html: string
  height: number
  description?: string
  mode?: ArtifactMode
}

export interface ArtifactRecord extends NormalizedArtifactArgs {
  artifactId: string
  bytes: number
  sha256: string
  version?: number
  parentArtifactId?: string
}

export class ArtifactValidationError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(issues.join('; '))
    this.name = 'ArtifactValidationError'
    this.issues = [...issues]
  }
}

/** Return UTF-8 byte length without relying on a Node-only Buffer API. */
export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

/** Validate artifact markup before it enters the isolated iframe. */
export function validateArtifactHtml(html: string, mode: ArtifactMode = 'static'): string[] {
  const issues: string[] = []
  const reasons = new Set<string>()
  const add = (message: string, index?: number): void => {
    if (reasons.has(message)) return
    reasons.add(message)
    if (index === undefined) {
      issues.push('html: ' + message)
      return
    }
    const line = html.slice(0, index).split(/\r\n?|\n/).length
    issues.push('html (line ' + line + '): ' + message)
  }

  if (html.length > ARTIFACT_MAX_BYTES || utf8ByteLength(html) > ARTIFACT_MAX_BYTES) {
    add('HTML exceeds the ' + ARTIFACT_MAX_BYTES + '-byte limit')
    return issues
  }
  if (html.trim().length === 0) add('HTML must not be empty')

  const reject = (pattern: RegExp, message: string): void => {
    const match = pattern.exec(html)
    if (match) add(message, match.index)
  }
  reject(/\u0000/, 'NUL characters are not allowed')
  reject(/<\s*\/?\s*(?:iframe|frame|frameset|object|embed|applet|portal|fencedframe|base|link)\b/i, 'nested frame, object, embed, base, and link elements are not allowed')
  reject(/<\s*(?:\/?\s*(?:html|head|body)\b|!doctype\b)/i, 'document shell elements are not allowed')
  reject(/<\s*meta\b/i, 'meta elements are not allowed')
  reject(/\bsrcdoc\s*=/i, 'srcdoc attributes are not allowed')
  if (mode === 'static') {
    reject(/<\s*\/?\s*(?:script|form)\b/i, 'script and form elements are not allowed in static mode')
    reject(/\bon[a-z][\w:-]*\s*=/i, 'inline event-handler attributes are not allowed in static mode')
  }
  reject(/(?:javascript|vbscript)\s*:/i, 'script URL schemes are not allowed')
  reject(/@import\b/i, 'CSS @import is not allowed')
  reject(/(?:expression\s*\(|-moz-binding\b|behavior\s*:)/i, 'legacy CSS execution hooks are not allowed')
  reject(/(?:\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\s*\(|\bEventSource\s*\(|\bsendBeacon\s*\(|\bwindow\s*\.\s*open\b|\bdocument\s*\.\s*cookie\b|\b(?:parent|top)\s*[.\[]|\bopener\b|\belectron\b|\brequire\s*\(|\bprocess\s*[.\[]|\b(?:window|document|self)\s*\.\s*location\b|\blocation\s*(?:=|\.\s*(?:assign|replace|href)\b)|\b(?:SharedWorker|Worker|ServiceWorker|RTCPeerConnection|WebTransport|BroadcastChannel)\s*\(|\bimport\s*\()/i, 'network, navigation, parent-window, Electron, and Node execution APIs are not allowed')

  for (const tag of html.matchAll(HTML_TAG)) {
    if (tag[1]) continue
    const tagName = tag[2]!.toLowerCase()
    const attributes = tag[3]!
    for (const attribute of attributes.matchAll(HTML_ATTRIBUTE)) {
      const name = attribute[1]!.toLowerCase()
      const value = attribute[2] ?? attribute[3] ?? attribute[4] ?? ''
      const start = tag.index + 1 + tagName.length + attribute.index
      const localUrl = isArtifactAttributeUrl(name, value)
        || (mode === 'static' && isLegacyRelativeMediaUrl(tagName, name, value))
      if (ARTIFACT_URL_ATTRIBUTE.test(name) && (!localUrl || (tagName === 'script' && name === 'src'))) {
        add('external URLs, executable resources, and non-media data URLs are not allowed in ' + name, start)
      }
      if (mode === 'interactive' && /^(?:set|animate|animatecolor|animatetransform)$/i.test(tagName)
        && name === 'attributename' && (ARTIFACT_URL_ATTRIBUTE.test(value.trim()) || /^on/i.test(value.trim()))) {
        add('SVG animation targeting a URL or event handler is not allowed', start)
      }
    }
  }

  const cssUrl = /\burl\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]+))\s*\)/gi
  for (const match of html.matchAll(cssUrl)) {
    const value = match[1] ?? match[2] ?? match[3] ?? ''
    if (!isArtifactResourceUrl(value)) {
      add('CSS resource URLs must be local fragment, blob, or media data URLs', match.index)
      break
    }
  }

  return issues
}

/** Normalize and validate the tool arguments before producing a durable record. */
export function normalizeArtifactArgs(args: RenderArtifactArgs): NormalizedArtifactArgs {
  const issues: string[] = []
  const title = typeof args.title === 'string' ? args.title.trim() : ''
  const html = typeof args.html === 'string' ? args.html : ''
  const kind = args.kind
  const height = args.height ?? ARTIFACT_DEFAULT_HEIGHT
  const mode = args.mode
  const description = args.description === undefined
    ? undefined
    : typeof args.description === 'string' ? args.description.trim() : ''

  if (title.length === 0) issues.push('title must not be empty')
  if (Array.from(title).length > ARTIFACT_MAX_TITLE_LENGTH) {
    issues.push('title must be at most ' + ARTIFACT_MAX_TITLE_LENGTH + ' characters')
  }
  if (!(ARTIFACT_KINDS as readonly string[]).includes(kind)) {
    issues.push('kind must be one of ' + ARTIFACT_KINDS.join(', '))
  }
  if (mode !== undefined && !(ARTIFACT_MODES as readonly string[]).includes(mode)) {
    issues.push('mode must be static or interactive')
  }
  if (!Number.isSafeInteger(height) || height < ARTIFACT_MIN_HEIGHT || height > ARTIFACT_MAX_HEIGHT) {
    issues.push('height must be an integer between ' + ARTIFACT_MIN_HEIGHT + ' and ' + ARTIFACT_MAX_HEIGHT)
  }
  if (description !== undefined && Array.from(description).length > ARTIFACT_MAX_DESCRIPTION_LENGTH) {
    issues.push('description must be at most ' + ARTIFACT_MAX_DESCRIPTION_LENGTH + ' characters')
  }
  issues.push(...validateArtifactHtml(html, mode))

  if (issues.length > 0) throw new ArtifactValidationError(issues)

  return {
    title,
    kind,
    html,
    height,
    ...(mode === undefined ? {} : { mode }),
    ...(description === undefined || description.length === 0 ? {} : { description }),
  }
}

export function isArtifactId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 80 && /^artifact_[A-Za-z0-9_-]+$/.test(value)
}

/** Softly validate a presentationMeta value received from a durable session. */
export function isArtifactRecord(value: unknown): value is ArtifactRecord {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<ArtifactRecord>
  return (
    isArtifactId(candidate.artifactId)
    && (candidate.parentArtifactId === undefined || isArtifactId(candidate.parentArtifactId))
    && (candidate.version === undefined || (Number.isSafeInteger(candidate.version) && candidate.version >= 1))
    && (candidate.mode === undefined || (ARTIFACT_MODES as readonly string[]).includes(candidate.mode))
    && typeof candidate.title === 'string'
    && candidate.title.trim().length > 0
    && Array.from(candidate.title).length <= ARTIFACT_MAX_TITLE_LENGTH
    && typeof candidate.kind === 'string'
    && (ARTIFACT_KINDS as readonly string[]).includes(candidate.kind)
    && typeof candidate.html === 'string'
    && validateArtifactHtml(candidate.html, candidate.mode).length === 0
    && typeof candidate.height === 'number'
    && Number.isSafeInteger(candidate.height)
    && candidate.height >= ARTIFACT_MIN_HEIGHT
    && candidate.height <= ARTIFACT_MAX_HEIGHT
    && Number.isSafeInteger(candidate.bytes)
    && candidate.bytes === utf8ByteLength(candidate.html)
    && typeof candidate.sha256 === 'string'
    && /^[a-f0-9]{64}$/.test(candidate.sha256)
    && (candidate.description === undefined
      || (typeof candidate.description === 'string'
        && Array.from(candidate.description).length <= ARTIFACT_MAX_DESCRIPTION_LENGTH))
  )
}

/** Extract bounded source text from malformed metadata for the error fallback. */
export function artifactSourceFromMeta(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const html = (value as { html?: unknown }).html
  if (typeof html !== 'string' || utf8ByteLength(html) > ARTIFACT_MAX_BYTES) return undefined
  return html
}
