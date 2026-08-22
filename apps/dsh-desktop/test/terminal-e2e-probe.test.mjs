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
