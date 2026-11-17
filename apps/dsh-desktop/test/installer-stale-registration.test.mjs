import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

test('empty registry keys are absent and historical uninstall aliases are owned by exact target', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-stale-registration-'))
  try {
    const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
      join(import.meta.dirname, 'fixtures/installer-stale-registration.ps1'), '-Helper',
      join(import.meta.dirname, '../build/installer-upgrade-transaction.ps1'), '-Root', root], { windowsHide: true })
    assert.match(stdout, /PASS stale-registration/u)
  } finally { await rm(root, { recursive: true, force: true }) }
})
