import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { BoundedLogStore } from '../src/log-store.mjs'
import { ensureDesktopProfile, resolveDshCliPath } from '../src/profile.mjs'
import { DshRuntimeController } from '../src/runtime-controller.mjs'

test('enabled actual market keeps its package/client identity and creates an owner session in the official Host', { timeout: 90_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-market-team-host-'))
  const logs = new BoundedLogStore({ directory: join(root, 'logs') })
  let controller
  try {
    await ensureDesktopProfile({ dshHome: root })
    await writeFile(join(root, 'cordis.patch.yml'), '- id: dsh-agent-plugins-market\n  disabled: false\n')
    controller = new DshRuntimeController({ cliPath: resolveDshCliPath(), cwd: process.cwd(), dshHome: root, logStore: logs, startupTimeoutMs: 45_000 })
    const url = await controller.start()
    const exchange = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5_000) })
    const cookie = exchange.headers.get('set-cookie')?.split(';', 1)[0]
    async function rpc(method, args) {
      const response = await fetch(new URL(`/api/${method}`, url), { method: 'POST',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({ type: 'client-request', rpcId: `market-${method}-${Date.now()}`, method, payload: { args } }),
        signal: AbortSignal.timeout(15_000) })
      assert.equal(response.ok, true)
      const body = await response.json()
      assert.equal(body.result?.ok, true, JSON.stringify(body))
      return body.result.value
    }
    const { presets } = await rpc('agentPresets/list', {})
    const preset = presets.find(item => !item.broken)
    assert.ok(preset)
    const workspacePath = join(root, 'workspace')
    await mkdir(workspacePath)
    const { workspace } = await rpc('workspace/create', { request: { path: workspacePath } })
    const created = await rpc('session/create', { request: { workspaceId: workspace.workspaceId, agentPreset: preset.id } })
    assert.equal(typeof created.sessionId, 'string')
    const response = await fetch(new URL('/api/agent-plugins/config', url), { headers: cookie ? { cookie } : {}, signal: AbortSignal.timeout(5_000) })
    assert.equal(response.ok, true, 'actual market config route must remain mounted')
    assert.equal(typeof await response.json(), 'object')
    const log = await logs.tail(300)
    assert.doesNotMatch(log, /tryMembership is not a function|disabling profile plugin row "dsh-agent-plugins-market"/u)
  } catch (error) {
    throw new Error(`${error.message}\nRecent runtime log:\n${await logs.tail(90)}`, { cause: error })
  } finally {
    await controller?.stop()
    await logs.queue
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
