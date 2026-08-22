import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  readPackagedLegacyLocalStorage,
  seedPackagedLegacyLocalStorage,
} from '../scripts/packaged-legacy-localstorage.mjs'

async function allocateLoopbackPort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer()
    server.once('error', rejectPort)
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : undefined
      server.close((error) => error ? rejectPort(error) : resolvePort(port))
    })
  })
}

test('temporary Electron helper preserves a real loopback localStorage value in the packaged user-data directory', {
  skip: process.platform !== 'win32',
  timeout: 120_000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-packaged-localstorage-'))
  const sourcePath = join(root, 'legacy-task-store.json')
  const seedResultPath = join(root, 'seed-result.json')
  const readResultPath = join(root, 'read-result.json')
  try {
    await writeFile(sourcePath, `${JSON.stringify({
      schemaVersion: 1,
      tasks: [{ id: 'v1-task', executions: [{ id: 'v1-run' }] }],
    })}\n`)
    const port = await allocateLoopbackPort()
    const seeded = await seedPackagedLegacyLocalStorage({
      userData: join(root, 'user-data'),
      port,
      sourcePath,
      resultPath: seedResultPath,
      timeoutMs: 60_000,
    })
    const read = await readPackagedLegacyLocalStorage({
      userData: join(root, 'user-data'),
      port,
      resultPath: readResultPath,
      timeoutMs: 60_000,
    })
    assert.equal(seeded.found, true)
    assert.deepEqual(read, { mode: 'read', found: true, sha256: seeded.sha256, bytes: seeded.bytes })
    await assert.rejects(access(seedResultPath), (error) => error?.code === 'ENOENT')
    await assert.rejects(access(readResultPath), (error) => error?.code === 'ENOENT')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
