import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { BoundedLogStore } from '../src/log-store.mjs'
import {
  ensureDesktopProfile,
  readAgentTeamProfileEnabled,
  resolveDshCliPath,
  setAgentTeamProfileEnabled,
} from '../src/profile.mjs'
import { DshRuntimeController } from '../src/runtime-controller.mjs'

// Actual official Host composition in an isolated Home, with no model request.
// Creating a session forces Agent-scoped tool registration and catches the
// duplicate tool-name failure that the official Agent Team profile replaces.
test('Agent Team switch composes and creates an Agent session in the official runtime', { timeout: 180_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-agent-team-runtime-'))
  const logs = new BoundedLogStore({ directory: join(root, 'logs') })
  const profileDir = join(root, 'profiles', 'desktop')
  let controller
  try {
    await ensureDesktopProfile({ dshHome: root })
    assert.equal(await readAgentTeamProfileEnabled({ profileDir }), false)
    await setAgentTeamProfileEnabled({ profileDir, enabled: true })
    await ensureDesktopProfile({ dshHome: root })
    assert.equal(await readAgentTeamProfileEnabled({ profileDir }), true)

    controller = new DshRuntimeController({
      cliPath: resolveDshCliPath(),
      cwd: process.cwd(),
      dshHome: root,
      logStore: logs,
      startupTimeoutMs: 120_000,
    })
    const url = await controller.start()
    const exchange = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5_000) })
    assert.ok(exchange.ok || exchange.status === 303)
    const cookie = exchange.headers.get('set-cookie')?.split(';', 1)[0]
    async function rpc(method, args) {
      const response = await fetch(new URL(`/api/${method}`, url), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: `agent-team-${method}-${Date.now()}`,
          method,
          payload: { args },
        }),
        signal: AbortSignal.timeout(15_000),
      })
      assert.equal(response.ok, true)
      const body = await response.json()
      assert.equal(body.result?.ok, true, JSON.stringify(body))
      return body.result.value
    }

    const { presets } = await rpc('agentPresets/list', {})
    const preset = presets.find(item => item.broken !== true)
    assert.ok(preset, 'official runtime has no usable Agent preset')
    const workspacePath = join(root, 'workspace')
    await mkdir(workspacePath)
    const { workspace } = await rpc('workspace/create', { request: { path: workspacePath } })
    const created = await rpc('session/create', {
      request: { workspaceId: workspace.workspaceId, agentPreset: preset.id },
    })
    assert.equal(typeof created.sessionId, 'string')
    assert.equal(controller.status.state, 'ready')
  } catch (error) {
    throw new Error(`${error.message}\nRecent runtime log:\n${await logs.tail(60)}`, { cause: error })
  } finally {
    await controller?.stop()
    await logs.queue
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
