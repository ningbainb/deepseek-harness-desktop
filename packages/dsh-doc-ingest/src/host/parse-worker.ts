import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parentPort, workerData } from 'node:worker_threads'
import type { OfficeContentNode } from 'officeparser/slim'
import { getDocumentProxy } from 'unpdf'
import type { DocumentResult, ParseRequest, ParseResponse } from '../core/types.ts'
import { validateArchive } from './archive.ts'
import { collectHeadings, metadataText, normalizeMarkdown, selectHeading, splitPageSelection } from './normalize.ts'
import { createSpreadsheetFormulaReader } from './spreadsheet-formulas.ts'

type DocumentRequest = Extract<ParseRequest, { kind: 'document' }>
type WebRequest = Extract<ParseRequest, { kind: 'web' }>
type Pdf = Awaited<ReturnType<typeof getDocumentProxy>>
type PdfOutlineEntry = NonNullable<Awaited<ReturnType<Pdf['getOutline']>>>[number]
const MAX_PDF_PAGES = 1000
const MAX_PDF_TEXT_CHARS = 8 * 1024 * 1024

function pdfAssets(): string | undefined {
  const packaged = fileURLToPath(new URL('./pdf-assets/', import.meta.url))
  if (existsSync(join(packaged, 'cmaps'))) return packaged
  try {
    return dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
  } catch {
    return
  }
}

class LocalPdfData {
  async fetch({ kind, filename }: { kind: string; filename: string }) {
    const directory = kind === 'cMapUrl' ? 'cmaps' : kind === 'standardFontDataUrl' ? 'standard_fonts' : undefined
    const root = pdfAssets()
    if (!directory || !root || !/^[a-z0-9_-]+(?:\.[a-z0-9_-]+)?$/iu.test(filename)) {
      throw new Error('The requested PDF data resource is unavailable.')
    }
    return readFile(join(root, directory, filename))
  }
}

function flattenPdfOutline(outline: readonly PdfOutlineEntry[]): Array<{ entry: PdfOutlineEntry; depth: number }> {
  const all: Array<{ entry: PdfOutlineEntry; depth: number }> = []
  const pending = outline.map(entry => ({ entry, depth: 0 })).reverse()
  while (pending.length && all.length < 512) {
    const node = pending.pop()!
    all.push(node)
    for (const entry of node.entry.items.toReversed()) pending.push({ entry, depth: node.depth + 1 })
  }
  return all
}

async function bookmarkPage(pdf: Pdf, entry: PdfOutlineEntry): Promise<number | undefined> {
  const destination = typeof entry.dest === 'string' ? await pdf.getDestination(entry.dest) : entry.dest
  const target: unknown = destination?.[0]
  if (typeof target === 'number' && Number.isSafeInteger(target)) return target + 1
  if (target && typeof target === 'object' && 'num' in target && 'gen' in target
    && typeof target.num === 'number' && typeof target.gen === 'number') {
    return (await pdf.getPageIndex({ num: target.num, gen: target.gen })) + 1
  }
}

async function readPdf(request: DocumentRequest): Promise<DocumentResult> {
  if (request.selection.sheet) throw new Error('A PDF does not have workbook sheets.')
  const pdf = await getDocumentProxy(request.bytes, {
    useWorkerFetch: false,
    useWasm: false,
    BinaryDataFactory: LocalPdfData,
    disableFontFace: true,
    maxImageSize: 16_777_216,
    cMapUrl: 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'standard_fonts/',
    wasmUrl: 'wasm/',
  }).catch(() => { throw new Error('Could not parse the PDF. It may be malformed or encrypted.') })
  try {
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error('The PDF has more than 1000 pages.')
    const selected = splitPageSelection(request.selection.pages, pdf.numPages)
    const info = await pdf.getMetadata().catch(() => undefined)
    const fields = info?.info as { Title?: string; Author?: string } | undefined
    const outline = await pdf.getOutline().catch(() => undefined)
    const bookmarks = flattenPdfOutline(outline ?? [])
    const headings = bookmarks.map(({ entry }) => metadataText(entry.title)).filter((title): title is string => title !== undefined).slice(0, 100)
    const section = request.selection.section?.normalize('NFKC').trim().toLowerCase()
    const bookmark = section === undefined ? -1 : bookmarks.findIndex(({ entry }) =>
      metadataText(entry.title)?.normalize('NFKC').toLowerCase() === section)
    let sectionStart = 1
    let sectionEnd = pdf.numPages
    if (bookmark >= 0) {
      const current = bookmarks[bookmark]
      const first = await bookmarkPage(pdf, current.entry)
      if (first === undefined || first < 1 || first > pdf.numPages) throw new Error('The PDF bookmark has no readable page.')
      sectionStart = first
      for (const candidate of bookmarks.slice(bookmark + 1)) {
        if (candidate.depth > current.depth) continue
        const next = await bookmarkPage(pdf, candidate.entry)
        if (next !== undefined && next > first) {
          sectionEnd = Math.min(sectionEnd, next - 1)
          break
        }
      }
    }
    let textLength = 0
    let hasText = false
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const shouldRead = !request.inspect && pageNumber >= sectionStart && pageNumber <= sectionEnd
        && (selected === undefined || selected.has(pageNumber))
      if (!shouldRead && hasText) continue
      const page = await pdf.getPage(pageNumber)
      try {
        const content = await page.getTextContent()
        let text = ''
        for (const item of content.items) {
          if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ')
        }
        if (text.trim().length > 0) hasText = true
        if (!shouldRead) continue
        textLength += text.length
        if (textLength > MAX_PDF_TEXT_CHARS) throw new Error('Extracted PDF text exceeds the size limit. Select fewer pages.')
        pages.push(`## Page ${pageNumber}\n\n${text.trim()}`)
      } finally {
        page.cleanup()
      }
    }
    const markdown = request.selection.section && bookmark === -1
      ? selectHeading(pages.join('\n\n'), request.selection.section)
      : pages.join('\n\n')
    return {
      metadata: {
        format: 'pdf',
        title: metadataText(fields?.Title),
        author: metadataText(fields?.Author),
        headings,
        sheets: [],
        pages: pdf.numPages,
        scannedPdf: !hasText,
      },
      markdown: normalizeMarkdown(markdown),
    }
  } finally {
    await pdf.loadingTask.destroy()
  }
}

function outlineFromNodes(nodes: OfficeContentNode[]): string[] {
  const headings: string[] = []
  const pending = [...nodes].reverse()
  while (pending.length > 0 && headings.length < 100) {
    const node = pending.pop()!
    if (node.type === 'heading') {
      const title = metadataText(node.text)
      if (title) headings.push(title)
    }
    if (node.children) for (let index = node.children.length - 1; index >= 0; index--) pending.push(node.children[index])
  }
  return headings
}

async function readOffice(request: DocumentRequest): Promise<DocumentResult> {
  const { format, bytes, selection } = request
  if (format === 'pdf') throw new Error('PDF must use the PDF parser.')
  const formulas = !request.inspect && (format === 'xlsx' || format === 'ods')
    ? await createSpreadsheetFormulaReader(format)
    : undefined
  if (format === 'rtf') {
    if (!/^\s*\{\\rtf\d/iu.test(new TextDecoder().decode(bytes.subarray(0, 32)))) {
      throw new Error('Document does not contain valid RTF.')
    }
  } else {
    await validateArchive(bytes, format, formulas)
  }
  const { OfficeParser } = await import('officeparser/slim')
  const ast = await OfficeParser.parseOffice(bytes, {
    fileType: format,
    allowRemoteAssets: false,
    extractAttachments: false,
    ignoreNotes: false,
    ignoreComments: true,
    ignoreSlideMasters: true,
    ocr: false,
  }).catch(() => { throw new Error('Could not parse the Office document. It may be malformed or encrypted.') })
  if (ast.type !== format) throw new Error('Document format does not match the file extension.')
  const headings = outlineFromNodes(ast.content)
  const sheets = ast.content.filter(node => node.type === 'sheet').filter(node => !node.metadata?.hidden)
  const slides = ast.content.filter(node => node.type === 'slide')
  const metadata: DocumentResult['metadata'] = {
    format,
    headings,
    sheets: sheets.map(node => metadataText(node.metadata?.sheetName)).filter((name): name is string => name !== undefined),
    title: metadataText(ast.metadata.title),
    author: metadataText(ast.metadata.author),
    ...(slides.length ? { pages: slides.length } : {}),
  }
  if (request.inspect) return { metadata, markdown: '' }

  if (selection.pages !== undefined) {
    if (!slides.length) throw new Error('Page selection is available for PDF and presentation slides.')
    const pages = splitPageSelection(selection.pages, slides.length)
    const selected = new Set(slides.filter((_, index) => pages?.has(index + 1)))
    ast.content = ast.content.filter(node => node.type !== 'slide' || selected.has(node))
  }
  if (selection.sheet !== undefined) {
    const sheet = sheets.find(node => node.metadata?.sheetName === selection.sheet)
    if (!sheet) throw new Error('The requested workbook sheet was not found.')
    ast.content = [sheet]
  } else if (format === 'xlsx' || format === 'ods') {
    ast.content = sheets
  }
  const { value } = await ast.to('md', { includeImages: false })
  const sheetNames = ast.content.filter(node => node.type === 'sheet').map(node => node.metadata?.sheetName)
    .filter((name): name is string => name !== undefined)
  const fullMarkdown = value + (formulas?.markdown(sheetNames) ?? '')
  const markdown = selection.section === undefined ? fullMarkdown : selectHeading(fullMarkdown, selection.section)
  return { metadata, markdown: normalizeMarkdown(markdown) }
}

async function readWeb(request: WebRequest): Promise<DocumentResult> {
  const { DOMParser, parseHTML } = await import('linkedom')
  // Turndown's bundled browser build captures window.DOMParser on import.
  // This adapter is confined to the worker and exposes no page execution.
  Object.defineProperty(globalThis, 'window', { value: { DOMParser }, configurable: true })
  const { default: Defuddle } = await import('defuddle/full')
  const { document } = parseHTML(request.html)
  for (const node of document.querySelectorAll('script, style, img, iframe, frame, object, embed, form, template, link, base')) {
    node.remove()
  }
  const fallback = document.querySelector('article,main')?.textContent ?? document.body.textContent ?? ''
  const result = new Defuddle(document, {
    url: request.url,
    markdown: true,
    useAsync: false,
    removeImages: true,
  }).parse()
  const content = result.content?.trim()
  const markdown = normalizeMarkdown(content && !content.startsWith('Partial conversion completed with errors. Original HTML:') ? content : fallback)
  return {
    metadata: {
      format: 'html',
      title: metadataText(result.title),
      author: metadataText(result.author),
      domain: new URL(request.url).hostname,
      summary: metadataText(result.description, 600) ?? metadataText(markdown, 600),
      wordCount: result.wordCount || markdown.split(/\s+/u).filter(Boolean).length,
      sheets: [],
      headings: collectHeadings(markdown),
    },
    markdown,
  }
}

async function parse(request: ParseRequest): Promise<DocumentResult> {
  if (request.kind === 'web') return readWeb(request)
  if (request.format === 'pdf') return readPdf(request)
  return readOffice(request)
}

if (parentPort) {
  const port = parentPort
  void parse(workerData as ParseRequest).then(
    (result) => port.postMessage({ ok: true, result } satisfies ParseResponse),
    (error: unknown) => port.postMessage({
      ok: false,
      message: error instanceof Error ? metadataText(error.message, 500) ?? 'Could not parse the document.' : 'Could not parse the document.',
    } satisfies ParseResponse),
  )
}
