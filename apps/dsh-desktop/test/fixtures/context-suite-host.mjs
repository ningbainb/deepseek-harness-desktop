import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(new URL('../../package.json', import.meta.url))
const baseRequire = createRequire(require.resolve('@deepseek-ai/dsh-base'))
async function load(name) {
  let path
  try { path = require.resolve(name) } catch { path = baseRequire.resolve(name) }
  return import(pathToFileURL(path).href)
}
const { Context } = await load('@deepseek-ai/cordis')
const { LlmAdapter, createUserMessage } = await load('@deepseek-ai/dsh-llm')
const Memory = await load('@ningbainb/dsh-memory')
const PersonalPrompt = await load('@ningbainb/dsh-personal-prompt')
const UserScope = await load('@ningbainb/dsh-user-scope')

function modelText(request) {
  return request.messages.flatMap(message => message.content.map(block => block.type === 'text' ? block.text : '')).join('\n')
}
function occurrences(text, marker) { return text.split(marker).length - 1 }

async function hostFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-context-suite-'))
  const previousHome = process.env.DSH_HOME
  const previousCwd = process.cwd()
  const projectA = join(directory, 'project-a')
  const projectB = join(directory, 'project-b')
  await mkdir(projectA)
  await mkdir(projectB)
  process.env.DSH_HOME = join(directory, 'home')
  process.chdir(projectA)
  const ctx = new Context()
  const captures = []
  t.after(async () => {
    try { await ctx.fiber.dispose() } finally {
      process.chdir(previousCwd)
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })
  for (const name of ['@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-projection', '@deepseek-ai/dsh-session-query',
    '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-tool-executor-native',
    '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-agent-loop']) {
    const plugin = await load(name)
    await ctx.plugin(plugin.default ?? plugin, name === '@deepseek-ai/dsh-system-prompt' ? { personaPrefix: 'SUITE_NATIVE_PREFIX', personaSuffix: 'SUITE_NATIVE_SUFFIX' } : {})
  }
  class CaptureAdapter extends LlmAdapter {
    async *stream(request) {
      captures.push(structuredClone({ messages: request.messages, tools: request.tools }))
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'fixture response' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'fixture response' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx.llm.registerAdapter(['suite-capture'], new CaptureAdapter())
  const workspaces = [{ id: 'suite-project-a', sessionIds: ['suite-local-a', 'suite-remote-a'] }, { id: 'suite-project-b', sessionIds: ['suite-local-b'] }]
  ctx.provide('workspaceRegistry', { list: () => workspaces })
  await ctx.plugin(UserScope, { rootDir: join(directory, 'scope') })
  await ctx.userScope.ready()
  assert.equal(ctx.userScope.availabilityState(), 'ready')
  await ctx.plugin(Memory, { version: 1, enabled: true })
  await ctx.plugin(PersonalPrompt, { version: 1, enabled: true, profiles: [
    { id: 'suite-global', name: 'Global', scope: 'global', content: 'SUITE_P1_GLOBAL', enabled: true, updatedAt: 1 },
    { id: 'suite-project-a', name: 'Project A', scope: 'workspace', workspaceId: 'suite-project-a', content: 'SUITE_P1_PROJECT_A', enabled: true, updatedAt: 2 },
  ] })
  await ctx.plugin(await load('dsh-context'), { defaultPlacement: 'sidebar', promptPrefix: 'SUITE_CONTEXT_PREFIX {{literal}}', promptSuffix: 'SUITE_CONTEXT_SUFFIX' })
  const service = new Memory.MemoryService({ userScope: ctx.userScope, store: new Memory.MemoryStore({ rootDir: join(process.env.DSH_HOME, 'memory') }),
    resolveWorkspaceForSession: sessionId => workspaces.find(workspace => workspace.sessionIds.includes(sessionId))?.id })
  const local = service.localContext()
  assert.ok(local)
  await service.save(local, { scope: 'global', content: 'SUITE_M1_GLOBAL fixture convention', pinned: true })
  async function create(sessionId, cwd, scope = ctx.userScope.desktopScope()) {
    const handle = await ctx.userScope.run(scope, () => ctx.agents.create({ sessionId, meta: { cwd }, agentOptions: { provider: 'suite-capture', model: 'fixture' } }))
    const workspaceId = workspaces.find(workspace => workspace.sessionIds.includes(sessionId))?.id
    await ctx.userScope.registerSession({ sessionId, workspaceId, createdByPrincipalId: scope.principalId })
    return handle.agent
  }
  async function request(agent, scope = ctx.userScope.desktopScope()) {
    const previous = captures.length
    ctx.userScope.run(scope, () => agent.followup(createUserMessage({ content: [{ type: 'text', text: 'fixture convention please' }], source: { kind: 'user' } })))
    await agent.whenIdle()
    assert.equal(captures.length, previous + 1, JSON.stringify(agent.session.snapshotEvents().at(-1)))
    assert.equal(agent.session.snapshotEvents().at(-1).data.reason.kind, 'completed')
    return captures.at(-1)
  }
  return { ctx, directory, projectA, projectB, captures, service, create, request }
}

export { hostFixture, modelText, occurrences, load }
