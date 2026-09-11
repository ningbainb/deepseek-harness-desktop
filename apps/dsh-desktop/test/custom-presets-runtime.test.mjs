import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { BoundedLogStore } from '../src/log-store.mjs'
import { ensureDesktopProfile, resolveDshCliPath } from '../src/profile.mjs'
import { DshRuntimeController } from '../src/runtime-controller.mjs'

// Actual official Host and preset composition, isolated Home, no model request.
test('upgraded custom presets mount and create sessions through the official runtime', { timeout: 90_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-custom-presets-'))
  const logs = new BoundedLogStore({ directory: join(root, 'logs') })
  let controller
  try {
    const ids = ['liangshen', 'value-mode']
    for (const id of ids) {
      const source = await readFile(new URL(
        `../../../packages/dsh-${id}/presets/${id}/agent.cordis.yml`, import.meta.url), 'utf8')
      const target = join(root, '.agent-presets', id)
      await mkdir(target, { recursive: true })
      await writeFile(join(target, 'agent.cordis.yml'), source.replace('prefix:', 'text:'))
    }
    const sentinel = join(root, 'sessions', 'existing-history.txt')
    await mkdir(join(root, 'sessions'), { recursive: true })
    await writeFile(sentinel, 'existing-history-must-not-change')
    await ensureDesktopProfile({ dshHome: root })
    controller = new DshRuntimeController({ cliPath: resolveDshCliPath(), cwd: process.cwd(),
      dshHome: root, logStore: logs, startupTimeoutMs: 45_000 })
    const url = await controller.start()
    const exchange = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5_000) })
    assert.ok(exchange.ok || exchange.status === 303)
    const cookie = exchange.headers.get('set-cookie')?.split(';', 1)[0]
    async function rpc(method, args) {
      const response = await fetch(new URL(`/api/${method}`, url), {
        method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({ type: 'client-request', rpcId: `preset-${method}-${Date.now()}`,
          method, payload: { args } }), signal: AbortSignal.timeout(15_000),
      })
      assert.equal(response.ok, true)
      const body = await response.json()
      assert.equal(body.result?.ok, true, JSON.stringify(body))
      return body.result.value
    }
    const { presets } = await rpc('agentPresets/list', {})
    const workspacePath = join(root, 'workspace')
    await mkdir(workspacePath)
    const { workspace } = await rpc('workspace/create', { request: { path: workspacePath } })
    for (const id of ids) {
      const preset = presets.find(item => item.id === id)
      assert.ok(preset, `${id} missing from real runtime roster`)
      assert.ok(!preset.broken, JSON.stringify(preset))
      const created = await rpc('session/create', { request: { workspaceId: workspace.workspaceId, agentPreset: id } })
      assert.equal(typeof created.sessionId, 'string')
      const synced = await readFile(join(root, '.agent-presets', id, 'agent.cordis.yml'), 'utf8')
      assert.match(synced, /prefix: You are a helpful software engineer assistant\./u)
      console.log(`PASS official runtime ${id}: legacy preset refreshed, session created`)
    }
    assert.equal(await readFile(sentinel, 'utf8'), 'existing-history-must-not-change')
  } catch (error) {
    throw new Error(`${error.message}\nRecent runtime log:\n${await logs.tail(45)}`, { cause: error })
  } finally {
    await controller?.stop()
    await rm(root, { recursive: true, force: true })
  }
})
