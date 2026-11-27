export const DOCUMENT_FORMATS = ['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'pdf'] as const
export type DocumentFormat = typeof DOCUMENT_FORMATS[number]
export type ArchiveFormat = Exclude<DocumentFormat, 'pdf' | 'rtf'>

export interface ReadOptions {
  pages?: string
  sheet?: string
  section?: string
  signal?: AbortSignal
}

export type DocumentSelection = Omit<ReadOptions, 'signal'>

export interface DocumentMetadata {
  format: DocumentFormat | 'html'
  title?: string
  author?: string
  domain?: string
  summary?: string
  wordCount?: number
  pages?: number
  sheets: string[]
  headings: string[]
  scannedPdf?: boolean
}

export interface DocumentResult {
  metadata: DocumentMetadata
  markdown: string
}

export type ParseRequest =
  | { kind: 'document'; format: DocumentFormat; bytes: Uint8Array<ArrayBuffer>; selection: DocumentSelection; inspect: boolean }
  | { kind: 'web'; html: string; url: string }

export type ParseResponse =
  | { ok: true; result: DocumentResult }
  | { ok: false; message: string }

export const MAX_FILE_BYTES = 32 * 1024 * 1024
export const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024
export const MAX_ARCHIVE_RATIO = 100
export const MAX_WEB_BYTES = 8 * 1024 * 1024
export const MAX_PARSE_MS = 15_000
export const MAX_MARKDOWN_BYTES = 8 * 1024 * 1024
export const MAX_INLINE_BYTES = 12 * 1024
