import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { zstdCompressSync } from 'node:zlib'

import {
  appendSessionLogText,
  findSessionLogs,
  readSessionLogText,
  waitForSessionLog,
} from '../scripts/session-log-fixture.mjs'

test('session log fixture reads and appends plain JSONL', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-session-log-plain-'))
  const directory = join(root, 'workspace', 'session-plain')
  const path = join(directory, 'session.v3.jsonl')
  try {
    await mkdir(directory, { recursive: true })
    await writeFile(path, '{"id":"session-plain"}\n')
    await appendSessionLogText(path, '{"seq":0}\n')
    await waitForSessionLog(root, 'session-plain', 1_000)
    assert.deepEqual(await findSessionLogs(root), [path])
    assert.equal(await readSessionLogText(path), '{"id":"session-plain"}\n{"seq":0}\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('session log fixture reads every Zstandard frame and appends another frame', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-session-log-zstd-'))
  const directory = join(root, 'workspace', 'session-zstd')
  const path = join(directory, 'session.v3.jsonl.zstd')
  try {
    await mkdir(directory, { recursive: true })
    await writeFile(path, Buffer.concat([
      zstdCompressSync(Buffer.from('{"id":"session-zstd"}\n')),
      zstdCompressSync(Buffer.from('{"seq":0}\n')),
    ]))
    await appendSessionLogText(path, '{"seq":1}\n')
    await waitForSessionLog(root, 'session-zstd', 1_000)
    assert.deepEqual(await findSessionLogs(root), [path])
    assert.equal(await readSessionLogText(path), '{"id":"session-zstd"}\n{"seq":0}\n{"seq":1}\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
