import { reportFeatureEvent } from '../feature-telemetry.ts'

export interface FileEntry {
  id: string; name: string; size: number; state: 'pending' | 'ready' | 'failed'; error?: string
  reference?: string; file?: File; abort?: AbortController
  identity?: string; duplicate?: boolean
}
export interface AttachmentDraft {
  read(): string
  insert(reference: string): boolean
  remove(reference: string): void
  subscribe(fn: () => void): () => void
}
export type UploadFile = (file: File, signal: AbortSignal) => Promise<{ path: string }>

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
  constructor(private draft: AttachmentDraft, private upload: UploadFile, check?: (path: string) => Promise<boolean>) {
    // Restored drafts contain durable workspace references even after a reload.
    for (const match of draft.read().matchAll(/\[((?:\\.|[^\]\\\n])+)\]\(<(\.\/\.dsh-attachments\/[^>\n]+)>\)/g)) {
      const entry: FileEntry = { id: crypto.randomUUID(), name: match[1]!.replace(/\\([\\[\]])/g, '$1'), size: 0, state: check ? 'pending' : 'ready', reference: match[0] }
      this.entries.push(entry)
      if (check) void check(match[2]!).catch(() => false).then(exists => {
        if (this.disposed || !this.entries.includes(entry)) return
        entry.state = exists ? 'ready' : 'failed'
        if (!exists) entry.error = 'reference-missing'
        this.publish()
      })
    }
    this.off = draft.subscribe(() => {
      const text = draft.read()
      const next = this.entries.filter(entry => entry.state !== 'ready' || !entry.reference || text.includes(entry.reference))
      if (next.length !== this.entries.length) { this.entries = next; this.publish() }
    })
  }
  snapshot = (): readonly FileEntry[] => this.entries
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
    if (entry.reference) this.draft.remove(entry.reference)
    this.publish()
  }
  retry = (id: string): void => {
    const entry = this.entries.find(item => item.id === id)
    if (!entry?.file) return
    entry.state = 'pending'; entry.error = undefined
    this.publish(); void this.run()
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
          if (!this.draft.insert(reference)) throw new Error('draft-unavailable')
          entry.reference = reference; entry.state = 'ready'; entry.file = undefined
          reportFeatureEvent({ feature: 'attachment', outcome: 'succeeded', detail: 'file' })
        } catch (error) {
          reportFeatureEvent({ feature: 'attachment', outcome: abort.signal.aborted || this.disposed ? 'cancelled' : 'failed', detail: 'file' })
          if (!this.entries.includes(entry) || this.disposed) continue
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
    headers: { 'content-type': 'application/octet-stream', 'x-dsh-attachment': '1', 'x-dsh-session': sessionId, 'x-dsh-filename': encodeURIComponent(file.name) }, body: file,
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
