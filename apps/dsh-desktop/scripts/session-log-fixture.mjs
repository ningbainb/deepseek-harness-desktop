import assert from 'node:assert/strict'
import { appendFile, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'

const SESSION_LOG_PATTERN = /\.jsonl(?:\.zstd)?$/u

function decodeZstdFrames(source) {
  const chunks = []
  let offset = 0
  while (offset < source.length) {
    const decoded = zstdDecompressSync(source.subarray(offset), { info: true })
    const consumed = decoded.engine.bytesWritten
    if (!Number.isSafeInteger(consumed) || consumed <= 0 || offset + consumed > source.length) {
      throw new Error(`invalid Zstandard frame length at byte ${offset}`)
    }
    chunks.push(decoded.buffer)
    offset += consumed
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function findSessionLogs(root) {
  const files = await readdir(root, { recursive: true }).catch(error => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  return files.filter(file => SESSION_LOG_PATTERN.test(file)).map(file => join(root, file))
}

export async function readSessionLogText(path) {
  const source = await readFile(path)
  return path.endsWith('.zstd') ? decodeZstdFrames(source) : source.toString('utf8')
}

export async function appendSessionLogText(path, text) {
  const source = Buffer.from(text, 'utf8')
  await appendFile(path, path.endsWith('.zstd') ? zstdCompressSync(source) : source)
}

/** Session creation can acknowledge before its queued JSONL write is durable. */
export async function waitForSessionLog(root, sessionId, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let files = []
  while (Date.now() < deadline) {
    files = await readdir(root, { recursive: true }).catch(error => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    for (const file of files.filter(file => SESSION_LOG_PATTERN.test(file))) {
      try {
        const text = await readSessionLogText(join(root, file))
        const end = text.indexOf('\n')
        if (end < 0) continue
        if (JSON.parse(text.slice(0, end)).id === sessionId) return
      } catch {
        // The Runtime may still be appending the first compressed frame.
        // Retry until the complete, parseable header becomes durable.
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.fail(`session header was not persisted before shutdown; files=${JSON.stringify(files)}`)
}
