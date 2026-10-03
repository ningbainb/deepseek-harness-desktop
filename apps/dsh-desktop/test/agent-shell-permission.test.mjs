import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { AgentShellPermissionStore, agentShellPermissionPath, parseAgentShellPermission } from '../src/agent-shell-permission.mjs'

test('Agent WSL permission defaults to ask and persists an explicit user choice', async () => {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-agent-shell-policy-'))
  try {
    const store = new AgentShellPermissionStore({ dshHome })
    assert.deepEqual(await store.status(), { mode: 'ask', valid: true })
    assert.deepEqual(await store.setMode('off'), { mode: 'off', valid: true })
    assert.deepEqual(await store.setMode('allow'), { mode: 'allow', valid: true })
    assert.equal((await readFile(agentShellPermissionPath(dshHome), 'utf8')).includes('"mode":"allow"'), true)
    await assert.rejects(store.setMode('unknown'), /unknown Agent shell permission mode/u)
  } finally { await rm(dshHome, { recursive: true, force: true }) }
})

test('invalid Agent WSL permission fails closed', async () => {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-agent-shell-policy-'))
  try {
    const path = agentShellPermissionPath(dshHome)
    await writeFile(path, '{"version":1,"mode":"invalid"}')
    const store = new AgentShellPermissionStore({ dshHome })
    assert.deepEqual(await store.status(), { mode: 'off', valid: false })
    assert.deepEqual(parseAgentShellPermission('invalid JSON'), { mode: 'off', valid: false })
  } finally { await rm(dshHome, { recursive: true, force: true }) }
})

test('Agent WSL permission creates a missing home and survives store recreation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-agent-shell-policy-'))
  const dshHome = join(root, 'new-home', 'nested')
  try {
    await new AgentShellPermissionStore({ dshHome }).setMode('off')
    assert.deepEqual(await new AgentShellPermissionStore({ dshHome }).status(), { mode: 'off', valid: true })
    assert.deepEqual(await readdir(dshHome), ['desktop-agent-shell.json'])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('Agent WSL permission serializes choices without exposing partial JSON to readers', async () => {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-agent-shell-policy-'))
  let reading = true
  let observed = 0
  try {
    const store = new AgentShellPermissionStore({ dshHome })
    await store.setMode('ask')
    const reader = (async () => {
      while (reading) {
        const snapshot = JSON.parse(await readFile(agentShellPermissionPath(dshHome), 'utf8'))
        assert.equal(snapshot.version, 1)
        assert.ok(['off', 'ask', 'allow'].includes(snapshot.mode))
        observed++
      }
    })()
    try {
      const modes = Array.from({ length: 60 }, (_, index) => index % 2 === 0 ? 'off' : 'ask')
      const results = await Promise.all(modes.map(mode => store.setMode(mode)))
      assert.deepEqual(results.map(result => result.mode), modes)
      assert.ok(results.every(result => result.valid))
    } finally {
      reading = false
      await reader
    }
    assert.ok(observed > 0)
    assert.deepEqual(await new AgentShellPermissionStore({ dshHome }).status(), { mode: 'ask', valid: true })
    assert.deepEqual(await readdir(dshHome), ['desktop-agent-shell.json'])
  } finally { reading = false; await rm(dshHome, { recursive: true, force: true }) }
})

test('Agent WSL permission reports a failed commit and keeps the write queue usable', async () => {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-agent-shell-policy-'))
  const path = agentShellPermissionPath(dshHome)
  try {
    await mkdir(path)
    const store = new AgentShellPermissionStore({ dshHome })
    await assert.rejects(store.setMode('allow'))
    assert.deepEqual(await store.status(), { mode: 'off', valid: false })
    assert.deepEqual(await readdir(dshHome), ['desktop-agent-shell.json'])
    await rm(path, { recursive: true })
    assert.deepEqual(await store.setMode('off'), { mode: 'off', valid: true })
  } finally { await rm(dshHome, { recursive: true, force: true }) }
})
