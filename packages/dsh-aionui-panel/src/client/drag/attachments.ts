import { reportFeatureEvent } from '../feature-telemetry.ts'
import { isIngestibleDocument } from '../../core/document-attachment.ts'

export interface FileEntry {
  id: string; name: string; size: number; state: 'pending' | 'ready' | 'failed'; error?: string
  reference?: string; file?: File; abort?: AbortController
  identity?: string; duplicate?: boolean
  path?: string; summaryState?: 'loading' | 'ready' | 'failed'; summaryBlock?: string
}
export interface AttachmentDraft {
  read(): string
  insert(reference: string): boolean
  remove(reference: string): void
  replace?(from: string, to: string): boolean
  subscribe(fn: () => void): () => void
}
export type UploadFile = (file: File, signal: AbortSignal) => Promise<{ path: string }>
type SummarizeFile = (path: string, signal: AbortSignal) => Promise<string>
const EXCERPT_START = '\n\n<!-- dsh-document-excerpt -->\n'
const EXCERPT_END = '\n<!-- /dsh-document-excerpt -->'

export function attachmentReference(name: string, path: string): string {
  const label = name.replace(/[\\[\]]/g, '\\$&')
  return `[${label}](<${encodeURI(path).replace(/[<>#?()]/g, char => '%' + char.charCodeAt(0).toString(16))}>)`
}

/** One queue per session, independent of its mounted composer. */
export class FileAttachmentQueue {
  private entries: FileEntry[] = []
  private listeners = new Set<() => void>()
  private running = false
  private disposed = false
  private off: () => void
  constructor(private draft: AttachmentDraft, private upload: UploadFile, private check?: (path: string) => Promise<boolean>, private summarize?: SummarizeFile) {
    this.restoreReferences()
    this.off = draft.subscribe(() => {
      const text = draft.read()
      const next = this.entries.filter(entry => !entry.reference || text.includes(entry.reference))
      const removed = next.length !== this.entries.length
      for (const entry of this.entries) if (!next.includes(entry)) entry.abort?.abort()
      this.entries = next
      // Input persistence may restore the draft after the queue mounts.
      if (this.restoreReferences() || removed) this.publish()
    })
  }
  private restoreReferences(): boolean {
    let added = false
    const text = this.draft.read()
    for (const match of text.matchAll(/\[((?:\\.|[^\]\\\n])+)\]\(<(\.\/\.dsh-attachments\/[^>\n]+)>\)/g)) {
      if (this.entries.some(entry => entry.reference === match[0])) continue
      added = true
      const check = this.check
      const entry: FileEntry = { id: crypto.randomUUID(), name: match[1]!.replace(/\\([\\[\]])/g, '$1'), size: 0, state: check ? 'pending' : 'ready', reference: match[0], path: match[2] }
      const excerptStart = match.index + match[0].length
      if (text.startsWith(EXCERPT_START, excerptStart)) {
        const excerptEnd = text.indexOf(EXCERPT_END, excerptStart + EXCERPT_START.length)
        if (excerptEnd >= 0) {
          entry.summaryBlock = text.slice(excerptStart, excerptEnd + EXCERPT_END.length)
          entry.summaryState = 'ready'
        }
      }
      this.entries.push(entry)
      if (check) void check(match[2]!).catch(() => false).then(exists => {
        if (this.disposed || !this.entries.includes(entry)) return
        entry.state = exists ? 'ready' : 'failed'
        if (!exists) entry.error = 'reference-missing'
        this.publish()
      })
    }
    return added
  }
  snapshot = (): readonly FileEntry[] => this.entries
  canSummarize = (entry: FileEntry): boolean => Boolean(this.summarize && this.draft.replace && entry.path && isIngestibleDocument(entry.name))
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish() { this.entries = [...this.entries]; for (const listener of this.listeners) listener() }
  add = (files: readonly File[]): void => {
    if (this.disposed) return
    for (const entry of this.entries) entry.duplicate = false
    for (const file of files) {
      const bridge = (globalThis as unknown as { dshDesktop?: { getDroppedFilePath?: (file: File) => string } }).dshDesktop
      let identity = ''
      try { identity = bridge?.getDroppedFilePath?.(file) || '' } catch { /* Ordinary web files have no local path. */ }
      // File object identity is the only trustworthy identity in ordinary web hosts.
      const duplicate = this.entries.find(entry => entry.file === file || identity && entry.identity === identity)
      if (duplicate) { duplicate.duplicate = true; continue }
      this.entries.push({ id: crypto.randomUUID(), name: file.name, size: file.size, state: 'pending', file, identity })
    }
    this.publish(); void this.run()
  }
  remove = (id: string): void => {
    const entry = this.entries.find(item => item.id === id)
    if (!entry) return
    entry.abort?.abort()
    this.entries = this.entries.filter(item => item !== entry)
    if (entry.reference) this.draft.remove(entry.reference + (entry.summaryBlock ?? ''))
    this.publish()
  }
  retry = (id: string): void => {
    const entry = this.entries.find(item => item.id === id)
    if (!entry?.file) return
    entry.state = 'pending'; entry.error = undefined
    this.publish(); void this.run()
  }
  useReference = (id: string): void => {
    const entry = this.entries.find(item => item.id === id)
    if (!entry?.reference) return
    entry.abort?.abort()
    if (entry.summaryBlock) this.draft.replace?.(entry.reference + entry.summaryBlock, entry.reference)
    entry.summaryState = undefined
    entry.summaryBlock = undefined
    this.publish()
  }
  useSummary = async (id: string): Promise<void> => {
    const entry = this.entries.find(item => item.id === id)
    if (!entry?.path || !entry.reference || !this.canSummarize(entry) || entry.summaryState === 'loading' || entry.summaryState === 'ready') return
    const abort = new AbortController()
    entry.abort = abort
    entry.summaryState = 'loading'
    this.publish()
    try {
      const summary = await this.summarize!(entry.path, abort.signal)
      if (abort.signal.aborted || this.disposed || !this.entries.includes(entry)) return
      const block = EXCERPT_START + summary.split(/\r?\n/u).map(line => `> ${line}`).join('\n') + EXCERPT_END
      if (!this.draft.replace?.(entry.reference, entry.reference + block)) throw new Error('draft changed')
      entry.summaryBlock = block
      entry.summaryState = 'ready'
    } catch {
      if (!abort.signal.aborted && !this.disposed && this.entries.includes(entry)) entry.summaryState = 'failed'
    } finally {
      if (entry.abort === abort) entry.abort = undefined
      if (!this.disposed) this.publish()
    }
  }
  private async run(): Promise<void> {
    if (this.running || this.disposed) return
    this.running = true
    try {
      while (!this.disposed) {
        const entry = this.entries.find(item => item.state === 'pending' && item.file)
        if (!entry) break
        const abort = new AbortController(); entry.abort = abort
        reportFeatureEvent({ feature: 'attachment', outcome: 'started', detail: 'file' })
        try {
          if (!entry.file) throw new Error('file-unavailable')
          if (entry.file.size > 100 * 1024 * 1024) throw new Error('size-limit')
          const result = await this.upload(entry.file, abort.signal)
          if (abort.signal.aborted || this.disposed || !this.entries.includes(entry)) {
            reportFeatureEvent({ feature: 'attachment', outcome: 'cancelled', detail: 'file' }); continue
          }
          const reference = attachmentReference(entry.name, result.path)
          // Draft notifications can be synchronous; mark ownership before insert.
          entry.reference = reference
          entry.path = encodeURI(result.path)
          if (!this.draft.insert(reference)) throw new Error('draft-unavailable')
          entry.reference = reference; entry.state = 'ready'; entry.file = undefined
          reportFeatureEvent({ feature: 'attachment', outcome: 'succeeded', detail: 'file' })
        } catch (error) {
          reportFeatureEvent({ feature: 'attachment', outcome: abort.signal.aborted || this.disposed ? 'cancelled' : 'failed', detail: 'file' })
          if (!this.entries.includes(entry) || this.disposed) continue
          if (entry.reference && !this.draft.read().includes(entry.reference)) entry.reference = undefined
          entry.state = 'failed'; entry.error = error instanceof Error ? error.message : 'upload-failed'
        }
        entry.abort = undefined; this.publish()
      }
    } finally { this.running = false }
  }
  dispose(): void {
    this.disposed = true; this.off()
    for (const entry of this.entries) entry.abort?.abort()
    this.listeners.clear(); this.entries = []
  }
}

export async function uploadAttachment(sessionId: string, file: File, signal: AbortSignal): Promise<{ path: string }> {
  const response = await fetch('/aionui-panel/attachments', {
    method: 'POST', signal, credentials: 'same-origin',
    headers: { 'content-type': 'application/octet-stream', 'x-dsh-attachment': '1', 'x-dsh-session': sessionId, 'x-dsh-filename': encodeURIComponent(file.name), 'x-dsh-attachment-size': String(file.size) }, body: file,
  })
  const result = await response.json() as { path?: string; error?: string }
  if (!response.ok || !result.path?.startsWith('./.dsh-attachments/')) throw new Error(result.error || 'upload-failed')
  return { path: result.path }
}

export async function checkAttachment(sessionId: string, path: string): Promise<boolean> {
  const response = await fetch('/aionui-panel/attachments', {
    method: 'HEAD', credentials: 'same-origin',
    headers: { 'x-dsh-attachment': '1', 'x-dsh-session': sessionId, 'x-dsh-path': path },
  })
  return response.ok
}

export async function summarizeAttachment(sessionId: string, path: string, signal: AbortSignal): Promise<string> {
  const response = await fetch('/aionui-panel/attachments', {
    method: 'POST', signal, credentials: 'same-origin',
    headers: { 'x-dsh-attachment': '1', 'x-dsh-attachment-mode': 'summary', 'x-dsh-session': sessionId, 'x-dsh-path': path },
  })
  const result = await response.json() as { summary?: string }
  if (!response.ok || typeof result.summary !== 'string' || result.summary.length > 4000) throw new Error('summary unavailable')
  return result.summary
}
