/**
 * Shared, DOM-free contracts and validation for Chat Artifact.
 *
 * The same validator runs before a value enters the session log and again
 * before a replayed value reaches an iframe. Keeping it DOM-free means the
 * host and browser halves cannot drift on the security boundary.
 */

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
}

export interface NormalizedArtifactArgs {
  title: string
  kind: ArtifactKind
  html: string
  height: number
  description?: string
}

export interface ArtifactRecord extends NormalizedArtifactArgs {
  artifactId: string
  bytes: number
  sha256: string
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

/** Validate the subset of HTML that the safe artifact frame is allowed to host. */
export function validateArtifactHtml(html: string): string[] {
  const issues: string[] = []
  const add = (message: string): void => {
    if (!issues.includes(message)) issues.push(message)
  }

  if (html.trim().length === 0) add('HTML must not be empty')
  if (utf8ByteLength(html) > ARTIFACT_MAX_BYTES) {
    add('HTML exceeds the ' + ARTIFACT_MAX_BYTES + '-byte limit')
  }
  if (html.includes('\u0000')) add('NUL characters are not allowed')

  if (/<\s*\/?\s*(?:script|iframe|object|embed|applet|portal|form|base|link)\b/i.test(html)) {
    add('script, nested frame, object, embed, form, base, and link elements are not allowed')
  }
  if (/<\s*\/?\s*(?:html|head|body)\b/i.test(html)) add('document shell elements are not allowed')
  if (/<\s*meta\b/i.test(html)) add('meta elements are not allowed')
  if (/\bsrcdoc\s*=/i.test(html)) add('srcdoc attributes are not allowed')
  if (/\bon[a-z][\w:-]*\s*=/i.test(html)) add('inline event-handler attributes are not allowed')
  if (/(?:javascript|vbscript)\s*:/i.test(html)) add('script URL schemes are not allowed')
  if (/@import\b/i.test(html)) add('CSS @import is not allowed')
  if (/(?:expression\s*\(|-moz-binding\b|behavior\s*:)/i.test(html)) {
    add('legacy CSS execution hooks are not allowed')
  }
  if (/(?:fetch\s*\(|XMLHttpRequest\b|WebSocket\s*\(|EventSource\s*\(|sendBeacon\s*\(|window\.open\b|document\.cookie\b|parent\.|top\.|opener\b|electron\b|require\s*\(|process\.)/i.test(html)) {
    add('network, parent-window, Electron, and Node execution APIs are not allowed')
  }

  const urlAttribute = /\b(?:src|href|action|formaction|poster|cite|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
  for (let match = urlAttribute.exec(html); match !== null; match = urlAttribute.exec(html)) {
    const value = match[1] ?? match[2] ?? match[3] ?? ''
    if (
      /^(?:https?:|ftp:|file:|\/\/|javascript:|vbscript:)/i.test(value)
      || /^data:(?!image\/|font\/|audio\/|video\/)/i.test(value)
    ) {
      add('external URLs and non-media data URLs are not allowed')
      break
    }
  }

  const cssUrl = /\burl\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]+))\s*\)/gi
  for (let match = cssUrl.exec(html); match !== null; match = cssUrl.exec(html)) {
    const value = match[1] ?? match[2] ?? match[3] ?? ''
    if (
      !/^#/i.test(value)
      && !/^blob:/i.test(value)
      && !/^data:(?:image\/|font\/|audio\/|video\/)/i.test(value)
    ) {
      add('CSS resource URLs must be local fragment, blob, or media data URLs')
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
  if (!Number.isSafeInteger(height) || height < ARTIFACT_MIN_HEIGHT || height > ARTIFACT_MAX_HEIGHT) {
    issues.push('height must be an integer between ' + ARTIFACT_MIN_HEIGHT + ' and ' + ARTIFACT_MAX_HEIGHT)
  }
  if (description !== undefined && Array.from(description).length > ARTIFACT_MAX_DESCRIPTION_LENGTH) {
    issues.push('description must be at most ' + ARTIFACT_MAX_DESCRIPTION_LENGTH + ' characters')
  }
  issues.push(...validateArtifactHtml(html))

  if (issues.length > 0) throw new ArtifactValidationError(issues)

  return {
    title,
    kind,
    html,
    height,
    ...(description === undefined || description.length === 0 ? {} : { description }),
  }
}

/** Softly validate a presentationMeta value received from a durable session. */
export function isArtifactRecord(value: unknown): value is ArtifactRecord {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<ArtifactRecord>
  return (
    typeof candidate.artifactId === 'string'
    && /^artifact_[A-Za-z0-9_-]+$/.test(candidate.artifactId)
    && candidate.artifactId.length <= 80
    && typeof candidate.title === 'string'
    && candidate.title.trim().length > 0
    && Array.from(candidate.title).length <= ARTIFACT_MAX_TITLE_LENGTH
    && typeof candidate.kind === 'string'
    && (ARTIFACT_KINDS as readonly string[]).includes(candidate.kind)
    && typeof candidate.html === 'string'
    && validateArtifactHtml(candidate.html).length === 0
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
