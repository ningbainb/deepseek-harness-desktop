import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, open, realpath, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WorkspaceGate } from './gate.ts'
import { isPathInside } from './gate.ts'

export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024
export interface AttachmentSession { header: { cwd?: string; origin?: string } }

/** Stream one user-selected file into its owning session's registered workspace. */
export function createAttachmentHandler(gate: WorkspaceGate, session: (id: string) => AttachmentSession | undefined, trusted: (req: IncomingMessage) => boolean) {
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
    if (req.method === 'HEAD') {
      try {
        const reference = decodeURIComponent(String(req.headers['x-dsh-path'] ?? ''))
        if (!reference.startsWith(`./.dsh-attachments/${sessionKey}/`) || reference.includes('\\')) throw new Error('invalid reference')
        const canonical = await realpath(join(admission.canonical, reference))
        if (!isPathInside(join(admission.canonical, '.dsh-attachments', sessionKey), canonical) || !(await stat(canonical)).isFile()) throw new Error('missing reference')
        send(200, {})
      } catch { send(404, {}) }
      return
    }
    let name: string
    try { name = decodeURIComponent(typeof rawName === 'string' ? rawName : '') } catch { send(400, { error: 'invalid filename' }); return }
    if (!name || name.length > 220 || /[\\/\x00-\x1f<>:"|?*]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) { send(400, { error: 'invalid filename' }); return }
    const advertised = Number(req.headers['content-length'])
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
