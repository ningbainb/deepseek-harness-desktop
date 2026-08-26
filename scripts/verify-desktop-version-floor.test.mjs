import assert from 'node:assert/strict'
import test from 'node:test'

import {
  evaluateDesktopVersionFloor,
  latestStableDesktopVersion,
  parseSemanticVersion,
} from './verify-desktop-version-floor.mjs'

test('semantic version parsing keeps prerelease identity without string ordering', () => {
  assert.deepEqual(parseSemanticVersion('3.10.0'), { major: 3, minor: 10, patch: 0, prerelease: false })
  assert.deepEqual(parseSemanticVersion('3.9.0-beta.2'), { major: 3, minor: 9, patch: 0, prerelease: true })
  assert.equal(parseSemanticVersion('3.0'), undefined)
  assert.equal(parseSemanticVersion('desktop-v3.0.9'), undefined)
})

test('the release floor is the highest stable tag and never a prerelease', () => {
  assert.equal(latestStableDesktopVersion([
    'desktop-v3.0.9',
    'desktop-beta-v3.1.0-rc.1',
    'desktop-v3.10.0',
    'desktop-v2.7.0',
  ]), '3.10.0')
  assert.equal(latestStableDesktopVersion(['desktop-beta-v4.0.0-rc.1']), undefined)
  assert.equal(latestStableDesktopVersion([]), undefined)
})

test('a main desktop version below the latest release tag fails the floor', () => {
  const rejected = evaluateDesktopVersionFloor({ version: '3.0.1', tags: ['desktop-v3.0.9'] })
  assert.deepEqual(rejected, { current: '3.0.1', floor: '3.0.9', ok: false })

  const equal = evaluateDesktopVersionFloor({ version: '3.0.9', tags: ['desktop-v3.0.9'] })
  assert.deepEqual(equal, { current: '3.0.9', floor: '3.0.9', ok: true })

  const next = evaluateDesktopVersionFloor({ version: '3.1.0', tags: ['desktop-v3.0.9'] })
  assert.deepEqual(next, { current: '3.1.0', floor: '3.0.9', ok: true })

  const numericOrder = evaluateDesktopVersionFloor({ version: '3.9.0', tags: ['desktop-v3.10.0'] })
  assert.equal(numericOrder.ok, false)
})

test('prereleases and malformed tags never raise or break the floor', () => {
  const result = evaluateDesktopVersionFloor({
    version: '3.0.9',
    tags: ['desktop-beta-v4.0.0-rc.1', 'weird-tag', 'desktop-v'],
  })
  assert.deepEqual(result, { current: '3.0.9', floor: undefined, ok: true })
})
