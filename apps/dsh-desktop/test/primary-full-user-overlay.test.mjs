import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  FULL_USER_RUNTIME_OVERLAY,
  primaryFullUserOverlayPath,
  writePrimaryFullUserOverlay,
} from '../src/primary-full-user-overlay.mjs'

test('the primary full-user overlay has the fixed sandbox and approval rows', async () => {
  assert.match(FULL_USER_RUNTIME_OVERLAY, /id: sandbox-policy/u)
  assert.match(FULL_USER_RUNTIME_OVERLAY, /mode: danger-full-access/u)
  assert.match(FULL_USER_RUNTIME_OVERLAY, /id: approval/u)
  assert.match(FULL_USER_RUNTIME_OVERLAY, /policy: never/u)
  const userData = await mkdtemp(join(tmpdir(), 'dsh-primary-overlay-'))
  try {
    const path = await writePrimaryFullUserOverlay({ userData, idFactory: () => 'primary-test' })
    assert.equal(path, primaryFullUserOverlayPath({ userData }))
    assert.equal(await readFile(path, 'utf8'), FULL_USER_RUNTIME_OVERLAY)
    assert.match(path, /runtime-overlays[\\/]primary-full-user\.yml$/u)
  } finally {
    await rm(userData, { recursive: true, force: true })
  }
})

test('primary overlay paths reject renderer-shaped relative state directories', () => {
  assert.throws(() => primaryFullUserOverlayPath({ userData: 'relative' }), /absolute path/u)
})

