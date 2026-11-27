import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const MAX_TRANSCRIPT_BYTES = 2 * 1024 * 1024
const MAX_MESSAGES = 120
const MAX_MESSAGE_CHARS = 2400

export interface AcpTranscriptMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
}

export function scopedAcpSessionKey(principalId: string, sessionId: string): string {
  return createHash('sha256').update(JSON.stringify([principalId, sessionId])).digest('hex')
}

function summary(text: string): string {
  const redacted = text
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/giu, '[redacted private key]')
    .replace(/\bBearer[ \t]+[A-Za-z0-9_.~+\/=-]+/giu, 'Bearer [redacted]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret)["']?[ \t]*[:=][ \t]*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/giu, '$1[redacted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/gu, '[redacted]')
    .trim()
  return redacted.length > MAX_MESSAGE_CHARS ? redacted.slice(0, MAX_MESSAGE_CHARS) + '…' : redacted
}

export class AcpTranscriptStore {
  constructor(private readonly directory: string) {}

  private filename(principalId: string, sessionId: string): string {
    const owner = createHash('sha256').update(principalId).digest('hex')
    return join(this.directory, owner, scopedAcpSessionKey(principalId, sessionId) + '.jsonl')
  }

  async read(principalId: string, sessionId: string): Promise<AcpTranscriptMessage[]> {
    const filename = this.filename(principalId, sessionId)
    try {
      const info = await stat(filename)
      if (!info.isFile() || info.size > MAX_TRANSCRIPT_BYTES) throw new Error('ACP transcript size limit exceeded')
      return (await readFile(filename, 'utf8')).split('\n').filter(Boolean).slice(-MAX_MESSAGES).map(line => {
        const entry = JSON.parse(line) as Partial<AcpTranscriptMessage>
        if (typeof entry.id !== 'string' || typeof entry.text !== 'string' || (entry.role !== 'user' && entry.role !== 'assistant')) {
          throw new Error('ACP transcript contains an invalid record')
        }
        return { id: entry.id, text: entry.text, role: entry.role }
      })
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return []
      throw error
    }
  }

  async append(principalId: string, sessionId: string, user: string, assistant: string): Promise<void> {
    const filename = this.filename(principalId, sessionId)
    const rows = await this.read(principalId, sessionId)
    rows.push({ id: randomUUID(), role: 'user', text: summary(user) })
    if (assistant.trim()) rows.push({ id: randomUUID(), role: 'assistant', text: summary(assistant) })
    await mkdir(dirname(filename), { recursive: true, mode: 0o700 })
    const temp = filename + '.tmp-' + randomUUID()
    try {
      await writeFile(temp, rows.slice(-MAX_MESSAGES).map(row => JSON.stringify(row)).join('\n') + '\n', {
        encoding: 'utf8', mode: 0o600, flag: 'wx',
      })
      await rename(temp, filename)
    } finally {
      await rm(temp, { force: true })
    }
  }
}
