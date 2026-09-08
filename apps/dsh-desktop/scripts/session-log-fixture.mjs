import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Session creation can acknowledge before its queued JSONL write is durable. */
export async function waitForSessionLog(root, sessionId, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let files = []
  while (Date.now() < deadline) {
    files = await readdir(root, { recursive: true }).catch(error => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    for (const file of files.filter(file => file.endsWith('.jsonl'))) {
      const text = await readFile(join(root, file), 'utf8')
      const end = text.indexOf('\n')
      if (end < 0) continue
      if (JSON.parse(text.slice(0, end)).id === sessionId) return
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.fail(`session header was not persisted before shutdown; files=${JSON.stringify(files)}`)
}
