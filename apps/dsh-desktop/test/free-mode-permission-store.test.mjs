import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  FreeModePermissionStore,
  freeModePermissionSourceFromDescriptor,
} from '../src/free-mode-permission-store.mjs'

const SOURCE = Object.freeze({
  id: 'sha256:'.concat('a'.repeat(64)),
  contentSha256: 'b'.repeat(64),
})
const APPROVAL = Object.freeze({
  method: 'native-user-confirmation',
  userConfirmed: true,
  confirmationId: 'native-free-mode-confirmation',
  approvedAt: '2026-08-20T13:00:00.000Z',
})

async function withStore(run) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-free-mode-store-'))
  const path = join(directory, 'free-mode-permissions.json')
  let nextId = 0
  const createStore = () => new FreeModePermissionStore({
    path,
    idFactory: () => `grant-${++nextId}`,
  })
  try {
    return await run({ directory, path, createStore })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('content and source full-user grants persist without raw filesystem paths', async () => {
  await withStore(async ({ path, createStore }) => {
    const first = createStore()
    await first.approve({ trustScope: 'source', source: SOURCE, approval: APPROVAL })
    const serialized = await readFile(path, 'utf8')
    assert.equal(serialized.includes('C:\\Users'), false)
    assert.equal(serialized.includes('canonicalPath'), false)

    const restored = createStore()
    assert.equal((await restored.authorize({
      source: { ...SOURCE, contentSha256: 'c'.repeat(64) },
      sessionId: 'later-session',
    })).allowed, true)
    assert.deepEqual((await restored.list()).map((entry) => entry.trustScope), ['source'])
  })
})

test('once grants are retained only in their current session', async () => {
  await withStore(async ({ path, createStore }) => {
    const first = createStore()
    await first.approve({
      trustScope: 'once',
      source: SOURCE,
      sessionId: 'free-session-1',
      approval: APPROVAL,
    })
    await assert.rejects(readFile(path, 'utf8'), { code: 'ENOENT' })
    assert.equal((await first.authorize({ source: SOURCE, sessionId: 'free-session-1' })).allowed, true)
    assert.equal((await first.authorize({ source: SOURCE, sessionId: 'free-session-2' })).allowed, false)
    assert.equal(await first.clearSession('free-session-1'), 1)
  })
})

test('revocation is durable and forged permission JSON never becomes a grant', async () => {
  await withStore(async ({ createStore }) => {
    const store = createStore()
    const approved = await store.approve({ trustScope: 'content', source: SOURCE, approval: APPROVAL })
    assert.equal(await store.revoke(approved.grantId, { revokedAt: '2026-08-20T13:01:00.000Z' }), true)
    const restored = createStore()
    assert.equal((await restored.authorize({ source: SOURCE })).allowed, false)
  })
})

test('source conversion accepts only a descriptor digest pair', () => {
  assert.deepEqual(freeModePermissionSourceFromDescriptor({
    sourceId: SOURCE.id,
    contentFingerprint: `sha256:${SOURCE.contentSha256}`,
  }), SOURCE)
  assert.throws(() => freeModePermissionSourceFromDescriptor({ sourceId: SOURCE.id }), /descriptor/u)
})
