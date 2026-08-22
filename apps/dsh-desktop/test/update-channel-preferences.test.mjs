import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  assertUpdateChannel,
  DesktopUpdateChannelStore,
  normalizeUpdateChannelPreference,
} from '../src/update-channel-preferences.mjs'

test('update channel preference keeps existing and malformed Desktop state on Stable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-update-channel-'))
  const path = join(directory, 'update-channel-preferences.json')
  const store = new DesktopUpdateChannelStore(path)
  try {
    assert.equal(await store.load(), 'stable')
    assert.deepEqual(await store.loadState(), { channel: 'stable', exists: false, valid: false })
    await writeFile(path, JSON.stringify({ channel: 'nightly' }), 'utf8')
    assert.equal(await store.load(), 'stable')
    assert.deepEqual(await store.loadState(), { channel: 'stable', exists: true, valid: false })
    await writeFile(path, '{not-json', 'utf8')
    assert.equal(await store.load(), 'stable')
    assert.deepEqual(await store.loadState(), { channel: 'stable', exists: true, valid: false })
    assert.deepEqual(normalizeUpdateChannelPreference({ channel: ' BETA ' }), { channel: 'beta' })
    assert.equal(assertUpdateChannel(' BETA '), 'beta')
    assert.throws(() => assertUpdateChannel('nightly'), /update channel/u)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('update channel preference serializes atomic Stable and Beta changes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-update-channel-'))
  const path = join(directory, 'update-channel-preferences.json')
  const store = new DesktopUpdateChannelStore(path)
  try {
    await Promise.all([store.save('beta'), store.save('stable')])
    assert.equal(await store.load(), 'stable')
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), {
      schemaVersion: 1,
      channel: 'stable',
    })
    assert.equal((await readdir(directory)).some((entry) => entry.includes('.tmp-') || entry.includes('.bak-')), false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
