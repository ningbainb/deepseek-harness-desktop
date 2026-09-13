import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CWD_PROBE_MISMATCH,
  CWD_PROBE_SUCCESS,
  createPowerShellCwdProbe,
} from '../scripts/terminal-e2e-probe.mjs'

test('PowerShell cwd probe compares the full path but emits bounded result markers', () => {
  const expected = String.raw`C:\Users\runner admin\AppData\Local\Temp\dsh-terminal-e2e-long-path\dsh-home\profiles\desktop`
  const command = createPowerShellCwdProbe(expected)

  assert.match(command, /FromBase64String/u)
  assert.equal(command.includes(expected), false, 'the long path must not be echoed into the xterm viewport')
  assert.equal(command.includes(CWD_PROBE_SUCCESS), false, 'the echoed command must not contain the complete success marker')
  assert.equal(command.includes(CWD_PROBE_MISMATCH), false, 'the echoed command must not contain the complete mismatch marker')

  const encoded = command.match(/FromBase64String\('(?<encoded>[A-Za-z0-9+/=]+)'\)/u)?.groups?.encoded
  assert.equal(Buffer.from(encoded, 'base64').toString('utf8'), expected)
})

test('PowerShell cwd probe rejects invalid expected paths', () => {
  for (const value of ['', 'relative\\path', 'C:\\broken\0path']) {
    assert.throws(() => createPowerShellCwdProbe(value), /absolute path/u)
  }
})

// Execute the POSIX probe, including shell-sensitive characters and a symlink,
// so a command echoed by xterm cannot be mistaken for successful execution.
test('POSIX cwd probe verifies physical cwd and safely quotes paths', async () => {
  const { execFileSync } = await import('node:child_process')
  const { mkdtemp, mkdir, rm, symlink } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { createPosixCwdProbe } = await import('../scripts/terminal-e2e-probe.mjs')
  if (process.platform === 'win32') {
    assert.throws(() => createPosixCwdProbe('C:\\work'), /absolute path/)
    return
  }
  const root = await mkdtemp(join(tmpdir(), 'dsh-cwd-probe-'))
  try {
    const path = join(root, "space ' quote $ variable")
    await mkdir(path)
    const alias = join(root, 'alias')
    await symlink(path, alias)
    const command = createPosixCwdProbe(alias)
    assert.equal(command.includes(CWD_PROBE_SUCCESS), false)
    assert.equal(command.includes(CWD_PROBE_MISMATCH), false)
    assert.equal(execFileSync('/bin/sh', ['-c', command], { cwd: path, encoding: 'utf8' }).trim(), CWD_PROBE_SUCCESS)
    assert.equal(execFileSync('/bin/sh', ['-c', command], { cwd: root, encoding: 'utf8' }).trim(), CWD_PROBE_MISMATCH)
  } finally { await rm(root, { recursive: true, force: true }) }
})
