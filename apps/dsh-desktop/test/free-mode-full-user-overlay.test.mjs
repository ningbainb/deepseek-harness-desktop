import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  FULL_USER_RUNTIME_OVERLAY,
  FREE_MODE_FULL_USER_OVERLAY,
  FREE_MODE_FULL_USER_OVERLAY_FILENAME,
  freeModeFullUserOverlayPath,
  isolatedRecoveryFullUserOverlayPath,
  primaryFullUserOverlayPath,
  writeFreeModeFullUserOverlay,
  writeIsolatedRecoveryFullUserOverlay,
  writePrimaryFullUserOverlay,
} from '../src/free-mode-full-user-overlay.mjs'

test('the isolated Free Mode overlay has final sandbox and approval rows', () => {
  assert.match(FREE_MODE_FULL_USER_OVERLAY, /id: sandbox-policy/u)
  assert.match(FREE_MODE_FULL_USER_OVERLAY, /mode: danger-full-access/u)
  assert.match(FREE_MODE_FULL_USER_OVERLAY, /id: approval/u)
  assert.match(FREE_MODE_FULL_USER_OVERLAY, /policy: never/u)
  assert.match(FREE_MODE_FULL_USER_OVERLAY, /disabled: false/u)
})

test('primary and isolated recovery overlays are fixed Desktop-owned state files', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'dsh-full-user-overlays-'))
  try {
    const primary = await writePrimaryFullUserOverlay({ userData, idFactory: () => 'primary-test' })
    const recovery = await writeIsolatedRecoveryFullUserOverlay({ userData, idFactory: () => 'recovery-test' })
    assert.equal(primary, primaryFullUserOverlayPath({ userData }))
    assert.equal(recovery, isolatedRecoveryFullUserOverlayPath({ userData }))
    assert.equal(await readFile(primary, 'utf8'), FULL_USER_RUNTIME_OVERLAY)
    assert.equal(await readFile(recovery, 'utf8'), FULL_USER_RUNTIME_OVERLAY)
    assert.match(primary, /runtime-overlays[\\/]primary-full-user\.yml$/u)
    assert.match(recovery, /runtime-overlays[\\/]isolated-recovery-full-user\.yml$/u)
  } finally {
    await rm(userData, { recursive: true, force: true })
  }
})

test('an isolated Free Mode overlay is atomically written inside its session home', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-free-full-user-overlay-'))
  try {
    const path = await writeFreeModeFullUserOverlay({ dshHome: home, idFactory: () => 'test-overlay' })
    assert.equal(path, freeModeFullUserOverlayPath({ dshHome: home }))
    assert.equal(path, join(home, FREE_MODE_FULL_USER_OVERLAY_FILENAME))
    assert.equal(await readFile(path, 'utf8'), FREE_MODE_FULL_USER_OVERLAY)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('overlay paths reject a renderer-shaped relative home', () => {
  assert.throws(() => freeModeFullUserOverlayPath({ dshHome: 'relative' }), /absolute path/u)
  assert.throws(() => primaryFullUserOverlayPath({ userData: 'relative' }), /absolute path/u)
})
