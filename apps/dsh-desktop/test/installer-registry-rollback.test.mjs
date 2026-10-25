import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const fixture = join(import.meta.dirname, 'fixtures', 'installer-registry-rollback.ps1')
const helper = join(import.meta.dirname, '..', 'build', 'installer-upgrade-transaction.ps1')

for (const scenario of ['delete-denied', 'delete-throws', 'delete-then-error', 'read-before-delete-denied', 'read-after-delete-denied', 'snapshot-read-denied', 'foreign-replacement', 'absent-foreign', 'absent-owned']) {
  test(`installer registry rollback preserves exact owned state: ${scenario}`, {
    skip: process.platform !== 'win32', timeout: 30_000,
  }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-registry-rollback-'))
    const temporary = join(root, 'temp')
    await mkdir(temporary)
    try {
      const { stdout, stderr } = await exec('powershell.exe', [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', fixture, '-Helper', helper, '-Root', root, '-Scenario', scenario,
      ], { windowsHide: true, timeout: 20_000, env: { ...process.env, TEMP: temporary, TMP: temporary } })
      assert.match(stdout, new RegExp(`PASS ${scenario}`, 'u'))
      assert.equal(stderr.trim(), '')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}
