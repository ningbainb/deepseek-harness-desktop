import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { assertDisposableInstallerRunner, installerChecksum, previousInstallerVersion } from '../scripts/verify-release-installer.mjs'

test('production Setup retains legacy upgrades and permits exact newer release coverage', () => {
  assert.equal(previousInstallerVersion({}), '4.3.0')
  assert.equal(previousInstallerVersion({ DSH_DESKTOP_PREVIOUS_RELEASE_VERSION: '5.0.0' }), '5.0.0')
  for (const version of ['', '../5.0.0', '5.0.1-beta.1', 'desktop-v5.0.0']) {
    assert.throws(() => previousInstallerVersion({ DSH_DESKTOP_PREVIOUS_RELEASE_VERSION: version }))
  }
})

test('real Setup acceptance refuses local accounts and non-Windows runners', () => {
  const runner = { GITHUB_ACTIONS: 'true', RUNNER_TEMP: 'C:\\runner\\temp' }
  assert.doesNotThrow(() => assertDisposableInstallerRunner('win32', runner))
  assert.throws(() => assertDisposableInstallerRunner('linux', runner))
  assert.throws(() => assertDisposableInstallerRunner('win32', {}))
  assert.throws(() => assertDisposableInstallerRunner('win32', { ...runner, GITHUB_ACTIONS: 'false' }))
  assert.throws(() => assertDisposableInstallerRunner('win32', { ...runner, RUNNER_TEMP: 'relative' }))
})

test('previous Setup receipt requires the exact filename and matching bytes', () => {
  const bytes = Buffer.from('isolated-setup-fixture')
  const digest = createHash('sha256').update(bytes).digest('hex')
  const file = 'DeepSeek-Harness-Desktop-Setup-4.3.0-x64.exe'
  const receipt = `${digest}  ${file}\r\n`
  assert.equal(installerChecksum(bytes, receipt, file), digest)
  assert.throws(() => installerChecksum(Buffer.from('modified'), receipt, file))
  assert.throws(() => installerChecksum(bytes, receipt, `${file}.blockmap`))
  assert.throws(() => installerChecksum(bytes, receipt.repeat(2), file))
})
