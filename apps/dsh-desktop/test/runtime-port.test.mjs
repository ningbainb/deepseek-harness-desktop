import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { persistRuntimePort, selectPreferredRuntimePort } from '../src/runtime-port.mjs'

test('preferred runtime port is reused only while it remains available', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-port-'))
  const path = join(root, 'profile', '.dsh-desktop-runtime.json')
  try {
    await persistRuntimePort(path, 43_125)
    assert.equal(await selectPreferredRuntimePort(path, {
      checkAvailable: async (port) => port === 43_125,
    }), 43_125)
    assert.equal(await selectPreferredRuntimePort(path, {
      checkAvailable: async () => false,
    }), 0)
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { version: 1, port: 43_125 })
    await persistRuntimePort(path, 43_126)
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { version: 1, port: 43_126 })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('missing or malformed runtime port state falls back to automatic allocation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-port-invalid-'))
  const path = join(root, 'runtime.json')
  try {
    assert.equal(await selectPreferredRuntimePort(path), 0)
    await writeFile(path, '{invalid')
    assert.equal(await selectPreferredRuntimePort(path), 0)
    await writeFile(path, JSON.stringify({ version: 1, port: 70_000 }))
    assert.equal(await selectPreferredRuntimePort(path), 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
