import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, open, realpath, rm, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isIngestibleDocument } from '../core/document-attachment.ts'
import type { WorkspaceGate } from './gate.ts'
import { isPathInside } from './gate.ts'

export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024
export interface AttachmentSession { header: { cwd?: string; origin?: string } }

interface AttachmentSummaryOptions {
  canSummarize(id: string, req: IncomingMessage): boolean
  summarize(root: string, path: string, signal: AbortSignal): Promise<string>
}

/** Stream one user-selected file into its owning session's registered workspace. */
export function createAttachmentHandler(gate: WorkspaceGate, session: (id: string) => AttachmentSession | undefined, trusted: (req: IncomingMessage) => boolean, summary?: AttachmentSummaryOptions) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const send = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)) }
    if (!['POST', 'HEAD'].includes(req.method ?? '') || !trusted(req) || req.headers['x-dsh-attachment'] !== '1') { send(403, { error: 'attachment request forbidden' }); return }
    const id = req.headers['x-dsh-session']
    const rawName = req.headers['x-dsh-filename']
    const owner = typeof id === 'string' ? session(id) : undefined
    if (!owner?.header.cwd || owner.header.origin === 'subagent') { send(403, { error: 'session workspace unavailable' }); return }
    const admission = await gate(owner.header.cwd)
    if (!admission.ok) { send(403, { error: admission.error.message }); return }
    const sessionKey = createHash('sha256').update(id as string).digest('hex').slice(0, 32)
    const wantsSummary = req.method === 'POST' && req.headers['x-dsh-attachment-mode'] === 'summary'
    if (wantsSummary && !summary?.canSummarize(id as string, req)) { send(403, { error: 'document summary forbidden' }); return }
    if (req.method === 'HEAD' || wantsSummary) {
      let reference: string
      let target: string
      const attachmentRoot = join(admission.canonical, '.dsh-attachments', sessionKey)
      try {
        reference = decodeURIComponent(String(req.headers['x-dsh-path'] ?? ''))
        if (!reference.startsWith(`./.dsh-attachments/${sessionKey}/`) || reference.includes('\\') || reference.split('/').includes('..')) throw new Error('invalid reference')
        target = await realpath(join(admission.canonical, reference))
        if (!isPathInside(attachmentRoot, target) || !(await stat(target)).isFile()) throw new Error('missing reference')
      } catch { send(404, {}); return }
      if (!wantsSummary || !summary) { send(200, {}); return }
      if (!isIngestibleDocument(reference)) { send(415, { error: 'unsupported document' }); return }
      const controller = new AbortController()
      const cancel = () => controller.abort()
      res.once?.('close', cancel)
      try {
        const markdown = await summary.summarize(attachmentRoot, relative(attachmentRoot, target), controller.signal)
        if (controller.signal.aborted) return
        if (session(id as string) !== owner || !summary.canSummarize(id as string, req)) {
          send(403, { error: 'document summary forbidden' }); return
        }
        const excerpt = markdown.slice(0, 4000).replace(/[\uD800-\uDBFF]$/u, '').trim()
        if (!excerpt) { send(422, { error: 'document contains no extractable text' }); return }
        send(200, { summary: excerpt, truncated: excerpt.length < markdown.trim().length })
      } catch {
        if (!controller.signal.aborted) send(422, { error: 'document summary unavailable' })
      } finally { res.off?.('close', cancel) }
      return
    }
    let name: string
    try { name = decodeURIComponent(typeof rawName === 'string' ? rawName : '') } catch { send(400, { error: 'invalid filename' }); return }
    if (!name || name.length > 220 || /[\\/\x00-\x1f<>:"|?*]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) { send(400, { error: 'invalid filename' }); return }
    const httpLength = req.headers['content-length']
    const bridgeLength = req.headers['x-dsh-attachment-size']
    if (httpLength !== undefined && bridgeLength !== undefined && httpLength !== bridgeLength) {
      send(400, { error: 'attachment size mismatch' }); return
    }
    const advertised = Number(httpLength ?? bridgeLength)
    if (!Number.isSafeInteger(advertised) || advertised < 0 || advertised > MAX_ATTACHMENT_BYTES) { send(413, { error: 'attachment exceeds 100 MB or size unavailable' }); return }
    let directory: string | undefined
    let file: Awaited<ReturnType<typeof open>> | undefined
    try {
      let parent = admission.canonical
      for (const segment of ['.dsh-attachments', sessionKey]) {
        parent = join(parent, segment)
        await mkdir(parent, { recursive: false }).catch(error => { if (error.code !== 'EEXIST') throw error })
        const canonical = await realpath(parent)
        if (!isPathInside(admission.canonical, canonical)) throw new Error('attachment directory leaves workspace')
        parent = canonical
      }
      directory = await mkdtemp(join(parent, 'file-'))
      file = await open(join(directory, name), 'wx', 0o600)
      let bytes = 0
      for await (const raw of req) {
        const chunk = Buffer.from(raw)
        bytes += chunk.length
        if (bytes > advertised || bytes > MAX_ATTACHMENT_BYTES) throw new Error('attachment size exceeded')
        await file.writeFile(chunk)
      }
      if (bytes !== advertised || session(id as string) !== owner) throw new Error('attachment interrupted or session changed')
      await file.close(); file = undefined
      const relative = `./.dsh-attachments/${sessionKey}/${directory.split(/[\\/]/).pop()}/${name}`
      send(200, { path: relative, name, size: bytes })
    } catch (error) {
      await file?.close().catch(() => {})
      if (directory && isPathInside(admission.canonical, directory)) await rm(directory, { recursive: true, force: true }).catch(() => {})
      send(400, { error: error instanceof Error ? error.message : 'attachment failed' })
    }
  }
}
