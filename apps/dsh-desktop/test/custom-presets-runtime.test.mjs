import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { createScope } from '@deepseek-ai/dsh-scope'
import * as SubagentListCompatibility from '../src/runtime-subagent-list-compat.mjs'
import { BoundedLogStore } from '../src/log-store.mjs'
import { ensureDesktopProfile, resolveDshCliPath, resolveRuntimePackages } from '../src/profile.mjs'
import { DshRuntimeController } from '../src/runtime-controller.mjs'

async function createToolContext() {
  const ctx = new Context()
  const promptRoot = resolveRuntimePackages().get('@deepseek-ai/dsh-system-prompt')
  const { default: SystemPrompt } = await import(pathToFileURL(join(promptRoot, 'lib', 'index.js')).href)
  await ctx.plugin(SessionProjections)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  return ctx
}

test('legacy discovery compatibility rejects a missing control provider', async () => {
  const ctx = await createToolContext()
  try {
    await assert.rejects(SubagentListCompatibility.apply(ctx), /requires a sibling subagent-control provider/u)
  } finally {
    await ctx.fiber.dispose()
  }
})

test('legacy discovery rows retain the actual SDK control tools without duplicate registration', async () => {
  const ctx = await createToolContext()
  try {
    await ctx.plugin(Loader)
    ctx.provide('subagents', {})
    ctx.provide('agents', {})
    const controlRoot = resolveRuntimePackages().get('@deepseek-ai/dsh-tool-subagent-control')
    const control = await import(pathToFileURL(join(controlRoot, 'lib', 'index.js')).href)
    const modules = new Map([
      ['@deepseek-ai/dsh-tool-subagent-control', control],
      [SubagentListCompatibility.RETIRED_SUBAGENT_LIST_SPECIFIER, SubagentListCompatibility],
    ])
    ctx.loader.internal = { version: 'client', import: async name => {
      assert.ok(modules.has(name))
      if (name === '@deepseek-ai/dsh-tool-subagent-control') await new Promise(resolve => setImmediate(resolve))
      return modules.get(name)
    } }
    const key = {}
    const { EntryTree } = await import('@deepseek-ai/cordis-plugin-loader')
    class MemoryTree extends EntryTree { commit() {} }
    await ctx.plugin({ inject: ['loader'], async apply(child) {
      const scope = createScope(child, key)
      const tree = new MemoryTree(scope.ctx)
      await Promise.all([
        tree.create({ id: 'tool-subagent-control', name: '@deepseek-ai/dsh-tool-subagent-control' }),
        tree.create({ id: 'tool-subagent-list-agents', name: SubagentListCompatibility.RETIRED_SUBAGENT_LIST_SPECIFIER }),
      ])
      await tree.await()
      const legacy = tree.resolve('tool-subagent-list-agents').fiber
      await legacy.await()
      assert.equal(legacy.state, 2)
    } })
    for (const name of ['list_agents', 'send_message', 'interrupt_agent']) {
      assert.equal(ctx.tools.schemas(key).filter(tool => tool.name === name).length, 1)
      assert.equal(ctx.tools.get(name), undefined)
    }
  } finally {
    await ctx.fiber.dispose()
  }
})

test('legacy discovery compatibility rejects a disabled sibling provider', async () => {
  const ctx = await createToolContext()
  try {
    await ctx.plugin(Loader)
    ctx.provide('subagents', {})
    ctx.provide('agents', {})
    ctx.loader.internal = { version: 'client', import: async () => SubagentListCompatibility }
    await ctx.loader.create({ id: 'tool-subagent-control', name: '@deepseek-ai/dsh-tool-subagent-control', disabled: true })
    await ctx.loader.create({ id: 'tool-subagent-list-agents', name: SubagentListCompatibility.RETIRED_SUBAGENT_LIST_SPECIFIER })
    const legacy = ctx.loader.resolve('tool-subagent-list-agents').fiber
    await assert.rejects(legacy.await(), /requires a sibling subagent-control provider/u)
    assert.equal(ctx.tools.get('list_agents'), undefined)
  } finally {
    await ctx.fiber.dispose()
  }
})

test('legacy discovery resolution preserves existing exports and unrelated failures', () => {
  const resolve = SubagentListCompatibility.resolveDesktopSubagentListCompatibility
  const retired = SubagentListCompatibility.RETIRED_SUBAGENT_LIST_SPECIFIER
  const current = { url: 'file:///existing-export.mjs' }
  assert.equal(resolve(retired, {}, () => current), current)
  const denied = Object.assign(new Error('not exported'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
  assert.match(resolve(retired, {}, () => { throw denied }).url, /runtime-subagent-list-compat\.mjs$/u)
  assert.throws(() => resolve('unrelated/package', {}, () => { throw denied }), error => error === denied)
  const missing = Object.assign(new Error('missing package'), { code: 'ERR_MODULE_NOT_FOUND' })
  assert.throws(() => resolve(retired, {}, () => { throw missing }), error => error === missing)
})

test('legacy discovery resolution hook is removed with its owning context', async () => {
  const ctx = new Context()
  const root = resolveRuntimePackages().get('@deepseek-ai/dsh-tool-subagent-control')
  const require = createRequire(join(root, 'package.json'))
  const retired = SubagentListCompatibility.RETIRED_SUBAGENT_LIST_SPECIFIER
  try {
    assert.throws(() => require.resolve(retired), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
    SubagentListCompatibility.installDesktopSubagentListCompatibility(ctx)
    assert.match(require.resolve(retired), /runtime-subagent-list-compat\.mjs$/u)
  } finally {
    await ctx.fiber.dispose()
  }
  assert.throws(() => require.resolve(retired), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
})

// Actual official Host and preset composition, isolated Home, no model request.
test('upgraded custom presets mount and create sessions through the official runtime', { timeout: 90_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-custom-presets-'))
  const logs = new BoundedLogStore({ directory: join(root, 'logs') })
  let controller
  try {
    const ids = ['liangshen', 'value-mode']
    const legacyPresetFiles = new Map()
    for (const id of ids) {
      const sourceDir = new URL(`../../../packages/dsh-${id}/presets/${id}/`, import.meta.url)
      const target = join(root, '.agent-presets', id)
      await cp(sourceDir, target, { recursive: true })
      const agentFile = join(target, 'agent.cordis.yml')
      const source = await readFile(agentFile, 'utf8')
      await writeFile(agentFile, source.replace('prefix:', 'text:'))
      legacyPresetFiles.set(id, await readFile(agentFile, 'utf8'))
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
      if (id === 'liangshen') {
        const declared = await rpc('agentPresets/read', { agentPreset: id })
        assert.equal(declared.agentPreset, id)
        assert.match(declared.content, /^- id: tool-catalog$/mu, 'the active published rc.2 preset must replace the old tool bootstrap')
        assert.match(declared.content, /^- id: minimal-prompt$/mu)
        assert.doesNotMatch(declared.content, /^- id: tool-bootstrap$/mu)
        const published = resolveRuntimePackages().get('@linxin666/dsh-liangshen')
        assert.ok((await readFile(join(published, 'presets', id, 'tool-catalog.mjs'))).length > 100)
        assert.equal(synced, legacyPresetFiles.get(id), 'the declarative preset must not overwrite legacy user files')
        assert.deepEqual(await readFile(join(root, '.agent-presets', id, 'tool-bootstrap.mjs')),
          await readFile(new URL(`../../../packages/dsh-${id}/presets/${id}/tool-bootstrap.mjs`, import.meta.url)))
      } else {
        assert.match(synced, /prefix: You are a helpful software engineer assistant\./u)
      }
      console.log(`PASS official runtime ${id}: active preset verified, session created, legacy data preserved`)
    }
    assert.equal(await readFile(sentinel, 'utf8'), 'existing-history-must-not-change')
  } catch (error) {
    throw new Error(`${error.message}\nRecent runtime log:\n${await logs.tail(45)}`, { cause: error })
  } finally {
    await controller?.stop()
    // Runtime shutdown can enqueue its final log line just before resolving.
    // Drain the bounded store before removing the isolated Home so Windows
    // does not race an in-flight log write during recursive cleanup.
    await logs.tail(1)
    await rm(root, { recursive: true, force: true })
  }
})
