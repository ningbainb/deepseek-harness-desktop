import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const exec = promisify(execFile)
const script = fileURLToPath(new URL('../scripts/verify-real-installer-overlay.ps1', import.meta.url))
const base = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script]
test('real installer preflight is read-only and reports the isolation boundary', { skip: process.platform !== 'win32' }, async () => {
  const { stdout } = await exec('powershell.exe', [...base, '-PreflightOnly'], { windowsHide: true, timeout: 30000 })
  const report = JSON.parse(stdout.replace(/^\uFEFF/u, ''))
  assert.equal(typeof report.readyForDisposableTest, 'boolean')
  assert.equal(report.readyForDisposableTest, report.existingInstallCount === 0 && !report.defaultHomeExists && report.activeApplicationCount === 0)
})
test('real installer refuses execution without explicit disposable-machine confirmation', { skip: process.platform !== 'win32' }, async () => {
  await assert.rejects(exec('powershell.exe', base, { windowsHide: true, timeout: 30000 }), error => {
    assert.notEqual(error.code, 0)
    assert.match(error.stderr, /Refusing installation: explicitly confirm/u)
    assert.doesNotMatch(error.stdout, /Evidence retained:/u)
    return true
  })
})
