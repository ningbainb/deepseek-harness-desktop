import { MAX_MARKDOWN_BYTES } from '../core/types.ts'

const PRIVATE_KEY = /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/gu
const ASSIGNED_SECRET = /((?:["']?\b(?:api[_-]?key|secret|token|password|passwd|authorization|client[_-]?secret)\b["']?\s*[:=]\s*)(?:Bearer\s+)?)(["'][^"'\r\n]*["']|[^\s,;<>&]+)/giu
const ACCESS_TOKEN = /\b(?:sk-(?:proj-)?[A-Za-z0-9_\x2d]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|xox[baprs]-[0-9A-Za-z-]{12,})\b/gu

export function redact(value: string): string {
  return value
    .replace(PRIVATE_KEY, '[REDACTED PRIVATE KEY]')
    .replace(ASSIGNED_SECRET, '$1[REDACTED]')
    .replace(ACCESS_TOKEN, '[REDACTED]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/giu, '$1')
}

export function normalizeMarkdown(value: string): string {
  const cleaned = redact(value.replace(/\r\n?/gu, '\n').replace(/\x00/gu, '').trim())
  if (Buffer.byteLength(cleaned, 'utf8') > MAX_MARKDOWN_BYTES) {
    throw new Error('Extracted Markdown exceeds the size limit. Select fewer pages, a sheet, or a section.')
  }
  return cleaned
}

export function metadataText(value: unknown, limit = 256): string | undefined {
  if (typeof value !== 'string') return
  const text = redact(value.replace(/[\x00-\x1f\x7f]/gu, ' ')).trim()
  return text ? text.slice(0, limit) : undefined
}

interface Heading {
  title: string
  level: number
  offset: number
}

function markdownHeadings(markdown: string): Heading[] {
  const headings: Heading[] = []
  let fence: { mark: string; count: number } | undefined
  let offset = 0
  for (const line of markdown.split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line)
    if (marker && (!fence || (marker[1][0] === fence.mark && marker[1].length >= fence.count && marker[2].trim() === ''))) {
      fence = fence ? undefined : { mark: marker[1][0], count: marker[1].length }
    } else if (!fence) {
      const match = /^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+\s*)?$/u.exec(line)
      if (match) headings.push({ title: match[2].trim(), level: match[1].length, offset })
    }
    offset += line.length + 1
  }
  return headings
}

export function selectHeading(markdown: string, section: string): string {
  const headings = markdownHeadings(markdown)
  const match = headings.findIndex(heading => heading.title.normalize('NFKC').toLowerCase() === section.normalize('NFKC').trim().toLowerCase())
  if (match === -1) throw new Error('The requested document heading was not found.')
  const heading = headings[match]
  const next = headings.slice(match + 1).find(candidate => candidate.level <= heading.level)
  return markdown.slice(heading.offset, next?.offset).trimEnd()
}

export function collectHeadings(markdown: string): string[] {
  return markdownHeadings(markdown).slice(0, 100).map(heading => heading.title.slice(0, 256))
}

export function splitPageSelection(selection: string | undefined, count: number): Set<number> | undefined {
  if (selection === undefined) return
  if (!/^[1-9]\d*(?:-[1-9]\d*)?(?:,[1-9]\d*(?:-[1-9]\d*)?)*$/u.test(selection) || selection.length > 256) {
    throw new Error('Invalid page range. Use a one-based range such as 2-4 or 1,3.')
  }
  const pages = new Set<number>()
  for (const range of selection.split(',')) {
    const [first, last = first] = range.split('-').map(Number)
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first > last || last > count) {
      throw new Error('The requested page range is outside this document.')
    }
    for (let page = first; page <= last; page++) pages.add(page)
  }
  return pages
}
