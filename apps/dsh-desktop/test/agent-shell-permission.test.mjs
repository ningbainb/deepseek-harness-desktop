import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
