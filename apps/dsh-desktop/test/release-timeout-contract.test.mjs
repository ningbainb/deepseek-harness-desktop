import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

const scriptDirectory = join(import.meta.dirname, '..', 'scripts')

test('directory picker Git setup retains its original fifteen-second budget', async () => {
  const script = await readFile(join(scriptDirectory, 'verify-directory-picker.mjs'), 'utf8')
  assert.match(script, /const fixtureGit = args => execFileSync\('git', args, \{[^\n]*timeout: 15_000,/u)
})

test('particle theme readiness retains its original fixed budget', async () => {
  const script = await readFile(join(scriptDirectory, 'verify-particle-theme.mjs'), 'utf8')
  assert.match(script, /^const runtimeReadyTimeoutMs = 150_000\r?$/mu)
})

test('DPI fixture launch retains its original thirty-second budget', async () => {
  const script = await readFile(join(scriptDirectory, 'verify-window-state-dpi.mjs'), 'utf8')
  assert.match(script, /\{ env, windowsHide: true, timeout: 30_000 \}/u)
})
