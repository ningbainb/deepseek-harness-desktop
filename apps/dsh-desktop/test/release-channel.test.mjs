import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  DEFAULT_UPDATE_CHANNEL,
  ReleaseChannelState,
  desktopStateMarkers,
  evaluateUpdateForChannel,
  hasExistingDesktopState,
  initialUpdateChannel,
  isPrereleaseVersion,
  normalizeUpdateChannel,
  updaterChannelFor,
} from '../src/release-channel.mjs'

test('release channels default existing installations to stable and map to updater metadata channels', () => {
  assert.equal(DEFAULT_UPDATE_CHANNEL, 'stable')
  assert.equal(normalizeUpdateChannel(undefined), 'stable')
  assert.equal(normalizeUpdateChannel('BETA'), 'beta')
  assert.equal(normalizeUpdateChannel('unknown'), 'stable')
  assert.equal(updaterChannelFor('stable'), 'latest')
  assert.equal(updaterChannelFor('beta'), 'beta')
  assert.equal(isPrereleaseVersion('3.1.0-beta.1'), true)
  assert.equal(isPrereleaseVersion('not-a-version'), false)
  assert.equal(initialUpdateChannel({ hasPersistedPreference: false, hasExistingDesktopState: false, appVersion: '3.1.0-beta.1' }), 'beta')
  assert.equal(initialUpdateChannel({ hasPersistedPreference: true, hasExistingDesktopState: false, appVersion: '3.1.0-beta.1' }), 'stable')
  assert.equal(initialUpdateChannel({ hasPersistedPreference: false, hasExistingDesktopState: true, appVersion: '3.1.0-beta.1' }), 'stable')
  assert.equal(initialUpdateChannel({ hasPersistedPreference: false, hasExistingDesktopState: false, appVersion: '3.1.0' }), 'stable')
})

test('only a clean prerelease installation is seeded to beta', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-release-channel-'))
  const userData = join(root, 'user-data')
  const desktopProfileDir = join(root, 'dsh-home', 'profiles', 'desktop')
  t.after(() => rm(root, { recursive: true, force: true }))

  assert.equal(await hasExistingDesktopState({ userData, desktopProfileDir }), false)
  assert.equal(desktopStateMarkers({ userData, desktopProfileDir }).length, 9)
  assert.equal(initialUpdateChannel({
    hasPersistedPreference: false,
    hasExistingDesktopState: await hasExistingDesktopState({ userData, desktopProfileDir }),
    appVersion: '3.1.0-beta.1',
  }), 'beta')

  await mkdir(desktopProfileDir, { recursive: true })
  await writeFile(join(desktopProfileDir, 'package.json'), '{"private":true}\n', 'utf8')
  assert.equal(await hasExistingDesktopState({ userData, desktopProfileDir }), true)
  assert.equal(initialUpdateChannel({
    hasPersistedPreference: false,
    hasExistingDesktopState: await hasExistingDesktopState({ userData, desktopProfileDir }),
    appVersion: '3.1.0-beta.1',
  }), 'stable')
})

test('stable never accepts a prerelease while beta can receive prereleases', () => {
  assert.deepEqual(evaluateUpdateForChannel({
    currentVersion: '3.0.0',
    candidateVersion: '3.1.0-beta.1',
    channel: 'stable',
  }), {
    accepted: false,
    reason: 'channel-mismatch',
  })
  assert.deepEqual(evaluateUpdateForChannel({
    currentVersion: '3.0.0',
    candidateVersion: '3.1.0-beta.1',
    channel: 'beta',
  }), {
    accepted: true,
    reason: 'newer',
  })
})

test('switching from a newer beta to stable never schedules a downgrade', () => {
  const state = new ReleaseChannelState({ currentVersion: '3.1.0-beta.2' })
  assert.equal(state.channel, 'stable')
  assert.deepEqual(state.setChannel('stable'), {
    channel: 'stable',
    updaterChannel: 'latest',
    allowPrerelease: false,
    allowDowngrade: false,
  })
  assert.deepEqual(state.evaluate('3.0.0'), {
    accepted: false,
    reason: 'downgrade',
  })
  assert.deepEqual(state.evaluate('3.1.0'), {
    accepted: true,
    reason: 'newer',
  })
})
