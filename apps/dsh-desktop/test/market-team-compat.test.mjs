import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const baseRequire = createRequire(require.resolve('@deepseek-ai/dsh-base'))
const load = name => import(pathToFileURL(baseRequire.resolve(`@deepseek-ai/${name}`)).href)
const marketRoot = dirname(require.resolve('dsh-agent-plugins-market/package.json'))
const market = name => import(pathToFileURL(join(marketRoot, 'lib/packages/market-runtime/src/runtime/agents', name)).href)
import { wrapMarketTeamContext as wrap } from '../src/runtime-market-team-compat.mjs'

async function createContext(home) {
  const { Context } = await load('cordis')
  const ctx = new Context()
  for (const name of ['dsh-fs-local', 'dsh-session', 'dsh-session-projection', 'dsh-session-query',
    'dsh-session-persistence-jsonl', 'dsh-llm', 'dsh-system-prompt', 'dsh-tools', 'dsh-tool-executor-native',
    'dsh-agent', 'dsh-agent-loop', 'dsh-working-directory', 'dsh-subagent', 'dsh-agent-team']) {
    const plugin = await load(name)
    await ctx.plugin(plugin.default ?? plugin, name === 'dsh-session-persistence-jsonl' ? { root: home } : {})
  }
  return ctx
}

test('real rc3 Host and market Team hooks preserve new-session, Team mode, pending role binding and live identity', { timeout: 30_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-market-team-compat-'))
  const ctx = await createContext(home)
  const cleanups = []
  t.after(async () => {
    try { for (const off of cleanups.reverse()) await off() }
    finally { await ctx.fiber.dispose(); await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
  })
  const { LlmAdapter } = await load('dsh-llm')
  const captures = []
  let blockNext = false
  const blocked = Promise.withResolvers()
  class Adapter extends LlmAdapter {
    async *stream(request) {
      captures.push(structuredClone({ messages: request.messages, model: request.model }))
      if (blockNext) {
        blocked.resolve()
        await new Promise(resolve => {
          if (request.signal.aborted) resolve()
          else request.signal.addEventListener('abort', resolve, { once: true })
        })
        request.signal.throwIfAborted()
      }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'done' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'done' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx.llm.registerAdapter(['market-test'], new Adapter())
  const compat = wrap(ctx)
  const { mountTeammateRoleTool } = await market('teammate-role-tool.js')
  const off = await mountTeammateRoleTool(compat, async () => [])
  let toolMounted = true
  cleanups.push(() => toolMounted ? off() : undefined)
  const { agent: lead } = await ctx.agents.create({ sessionId: 'market-compat-lead', meta: { cwd: home }, agentOptions: { provider: 'market-test', model: 'lead' } })
  assert.equal(compat.agentTeams.membership(lead).role, 'lead')
  assert.equal(ctx.agentTeams.isEnabled(lead), false)
  const admitted = async agent => {
    const set = await ctx.tools.resolve({ agent, signal: new AbortController().signal })
    try { return set.view(agent).has('spawn_teammate_role') } finally { set.dispose() }
  }
  assert.equal(await admitted(lead), false)
  await ctx.agentTeams.setEnabled(lead, true)
  assert.equal(await admitted(lead), true)
  const { TeammateRoleRuntime } = await market('teammate-role-runtime.js')
  // The mounted tool already owns the provider. Test its real runtime separately
  // after disposing it, preserving the same live root and journal.
  await off()
  toolMounted = false
  const runtime = new TeammateRoleRuntime(compat)
  cleanups.push(() => runtime.dispose())
  const result = await runtime.spawn(lead, { name: 'reviewer', agent: 'review-role', description: 'review', prompt: 'respond once' },
    { roleId: 'review-role', persona: 'MARKET_COMPAT_PERSONA', route: { provider: 'market-test', model: 'role-model' } }, new AbortController().signal)
  assert.equal(result.target, 'reviewer')
  const child = ctx.agents.list().find(agent => agent !== lead)
  assert.ok(child)
  const { agent: unrelated } = await ctx.agents.create({ sessionId: 'market-unrelated-root', meta: { cwd: home }, agentOptions: { provider: 'market-test', model: 'lead' } })
  await child.whenIdle()
  assert.equal(child.options.model, 'role-model')
  assert.equal(compat.agentTeams.membership(child).root, lead)
  assert.equal(compat.agentTeams.membership(child).role, 'member')
  assert.equal(child.session.snapshotEvents().filter(event => event.type === 'agent/inbox/spliced').flatMap(event => event.data.inserted).filter(message => message.source.kind === 'teammate-role-binding').length, 1)
  assert.ok(captures.some(request => JSON.stringify(request).includes('MARKET_COMPAT_PERSONA')))
  await assert.rejects(compat.agentTeams.spawnTeammate(child, { name: 'bad', prompt: [], context: 'fresh', signal: new AbortController().signal }), /Lead|lead/)
  assert.equal(compat.agentTeams.tryMembership({ id: lead.id, session: lead.session }), undefined)
  await ctx.agentTeams.setEnabled(lead, false)
  await assert.rejects(compat.agentTeams.spawnTeammate(lead, { name: 'disabled', prompt: [], context: 'fresh', signal: new AbortController().signal }), /enabled/)
  await ctx.agentTeams.setEnabled(lead, true)
  await runtime.dispose()
  assert.equal(ctx.agents.get(child.id), undefined)
  assert.equal(ctx.agents.get(unrelated.id), unrelated, 'exact receipt cleanup must preserve unrelated trees')
  const restoredRuntime = new TeammateRoleRuntime(compat)
  const replayOff = compat.effect(() => () => restoredRuntime.dispose(), 'dsh-agent-plugins-market: role teammates')
  cleanups.push(replayOff)
  const beforeReplay = captures.length
  await ctx.subagents.prompt({ childSessionId: child.id, requestId: 'market-replay', delivery: 'queue', content: [{ type: 'text', text: 'resume role' }] }, new AbortController().signal)
  const resumed = ctx.agents.get(child.id)
  assert.ok(resumed)
  assert.notEqual(resumed, child)
  await resumed.whenIdle()
  assert.equal(resumed.options.model, 'role-model')
  assert.equal(compat.agentTeams.membership(resumed).root, lead)
  assert.equal(compat.agentTeams.tryMembership(child), undefined, 'old activation cannot borrow a same-id resumed identity')
  assert.ok(captures.slice(beforeReplay).some(request => JSON.stringify(request).includes('MARKET_COMPAT_PERSONA')))
  assert.equal(resumed.session.snapshotEvents().filter(event => event.type === 'agent/inbox/spliced').flatMap(event => event.data.inserted).filter(message => message.source.kind === 'teammate-role-binding').length, 1, 'replay must not mint another role binding')
  blockNext = true
  await ctx.subagents.prompt({ childSessionId: child.id, requestId: 'market-block', delivery: 'queue', content: [{ type: 'text', text: 'wait for interruption' }] }, new AbortController().signal)
  await blocked.promise
  await ctx.subagents.prompt({ childSessionId: child.id, requestId: 'market-queued', delivery: 'queue', content: [{ type: 'text', text: 'MARKET_QUEUED_INPUT' }] }, new AbortController().signal)
  const atInterruption = captures.length
  await replayOff()
  assert.equal(ctx.agents.get(child.id), resumed, 'public SDK teardown retains a cold-resumed resident')
  assert.equal(ctx.agents.get(unrelated.id), unrelated, 'cold-resume interruption must preserve unrelated trees')
  assert.equal(resumed.status, 'idle')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(captures.length, atInterruption, 'interrupted role must not continue model execution')
  assert.ok(JSON.stringify([resumed.inbox.nextStep, resumed.inbox.nextTurn]).includes('MARKET_QUEUED_INPUT'), 'public interruption must preserve queued input')
  blockNext = false
  await ctx.subagents.prompt({ childSessionId: child.id, requestId: 'market-after-disable', delivery: 'queue', content: [{ type: 'text', text: 'retain original role' }] }, new AbortController().signal)
  await resumed.whenIdle()
  assert.ok(JSON.stringify(captures.at(-1)).includes('MARKET_COMPAT_PERSONA'), 'retained resident keeps durable persona after market role teardown')
  assert.equal(resumed.options.model, 'role-model')
  const remounted = Promise.withResolvers()
  const nextContext = wrap(ctx)
  const remountOff = nextContext.effect(async () => {
    const nextRuntime = new TeammateRoleRuntime(nextContext)
    await nextRuntime.restore()
    remounted.resolve()
    return () => nextRuntime.dispose()
  }, 'dsh-agent-plugins-market: role teammates')
  cleanups.push(remountOff)
  await remounted.promise
  await new Promise(resolve => setImmediate(resolve))
  await ctx.subagents.prompt({ childSessionId: child.id, requestId: 'market-reenabled', delivery: 'queue', content: [{ type: 'text', text: 'verify remounted role' }] }, new AbortController().signal)
  await resumed.whenIdle()
  const modelText = captures.at(-1).messages.flatMap(message => message.content.map(block => block.type === 'text' ? block.text : '')).join('\n')
  assert.equal(modelText.split('MARKET_COMPAT_PERSONA').length - 1, 1, 'reenabling market replaces its retained persona without duplicate model-text injection')
  await remountOff()
  await ctx.fiber.dispose()
  const restarted = await createContext(home)
  cleanups.push(() => restarted.fiber.dispose())
  restarted.llm.registerAdapter(['market-test'], new Adapter())
  const { agent: restartedLead } = await restarted.agents.resume({ resumeSessionId: lead.id, agentOptions: { provider: 'market-test', model: 'lead' } })
  const restartedCompat = wrap(restarted)
  const restartedRuntime = new TeammateRoleRuntime(restartedCompat)
  const restartedOff = restartedCompat.effect(() => () => restartedRuntime.dispose(), 'dsh-agent-plugins-market: role teammates')
  cleanups.push(restartedOff)
  await restarted.subagents.prompt({ childSessionId: child.id, requestId: 'market-host-restarted', delivery: 'queue', content: [{ type: 'text', text: 'restart persisted role' }] }, new AbortController().signal)
  const restartedChild = restarted.agents.get(child.id)
  await restartedChild.whenIdle()
  assert.equal(restartedCompat.agentTeams.membership(restartedChild).root, restartedLead)
  assert.equal(restartedCompat.agentTeams.tryMembership(lead), undefined)
  assert.equal(restartedCompat.agentTeams.tryMembership(resumed), undefined)
  assert.equal(restartedChild.options.model, 'role-model')
  const restartedText = captures.at(-1).messages.flatMap(message => message.content.map(block => block.type === 'text' ? block.text : '')).join('\n')
  assert.equal(restartedText.split('MARKET_COMPAT_PERSONA').length - 1, 1, 'a fresh Host reconstructs the original role exclusively from its persisted binding')
})
