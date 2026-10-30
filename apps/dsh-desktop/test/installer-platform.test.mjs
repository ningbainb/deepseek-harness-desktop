import assert from 'node:assert/strict'
import test from 'node:test'
import { windowsInstallerTestOptions } from './fixtures/installer-platform.mjs'

test('native installer capability is mandatory on Windows and explicitly bounded elsewhere', async () => {
  assert.equal(typeof windowsInstallerTestOptions, 'function', 'Native fixture registration must declare its Windows-only capability')
  assert.deepEqual(windowsInstallerTestOptions('win32'), { skip: false })
  for (const platform of ['darwin', 'linux']) {
    const options = windowsInstallerTestOptions(platform)
    assert.equal(typeof options.skip, 'string')
    assert.match(options.skip, /Windows-only/u)
    assert.match(options.skip, /PowerShell|Win32|NSIS/u)
  }
})
