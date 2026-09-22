import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { TerminalShellPreferencesStore } from '../src/terminal-shell-preferences.mjs'

test('terminal shell preference persists a fixed choice and rejects executable input', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-terminal-shell-'))
  try {
    const path = join(directory, 'terminal-shell.json')
    const store = new TerminalShellPreferencesStore(path)
    assert.equal(await store.load(), 'auto')
    assert.equal(await store.save('wsl'), 'wsl')
    assert.equal(await new TerminalShellPreferencesStore(path).load(), 'wsl')
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { shellId: 'wsl' })
    assert.throws(() => store.save('powershell.exe -Command evil'), /invalid/u)
    assert.equal(await store.load(), 'wsl')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
