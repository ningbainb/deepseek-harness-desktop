import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire, registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:http'
import { installDesktopMarketTeamCompatibility, wrapSidebarTeamContext, SIDEBAR_TEAM_REVIEWED_ENTRY } from '../src/runtime-market-team-compat.mjs'

const require = createRequire(import.meta.url)
const baseRequire = createRequire(require.resolve('@deepseek-ai/dsh-base'))
const load = name => import(pathToFileURL(baseRequire.resolve(`@deepseek-ai/${name}`)).href)

test('actual sidebar Team write routes use the rc3 Host without weakening Team mode, revision or member authority', { timeout: 30_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-sidebar-team-'))
  const { Context } = await load('cordis')
  const ctx = new Context()
  let server
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve))
    await ctx.fiber.dispose()
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })
  for (const name of ['dsh-fs-local', 'dsh-session', 'dsh-session-projection', 'dsh-session-query',
    'dsh-session-persistence-jsonl', 'dsh-llm', 'dsh-system-prompt', 'dsh-tools', 'dsh-tool-executor-native',
    'dsh-agent', 'dsh-agent-loop', 'dsh-working-directory', 'dsh-subagent', 'dsh-agent-team']) {
    const plugin = await load(name)
    await ctx.plugin(plugin.default ?? plugin, name === 'dsh-session-persistence-jsonl' ? { root: home } : {})
  }
  const routes = []
  ctx.provide('webServer', { register(route) { routes.push(route); return () => {} }, registerUpgrade() { return () => {} } })
  ctx.provide('connection', { requestRejection: request => request.headers.authorization === 'Bearer fixture' ? undefined : 'unauthorized' })
  // Register before the compatibility hook so this observes its original
  // nextLoad result, never the replacement wrapper. No source is changed.
  const entryLoads = []
  const diagnostics = registerHooks({ load(url, context, nextLoad) {
    const original = nextLoad(url, context)
    if (/\/node_modules\/dsh-better-sidebar\/lib\/index\.js$/u.test(new URL(url).pathname)) {
      const source = original.source
      const bytes = typeof source === 'string' ? Buffer.from(source) : ArrayBuffer.isView(source)
        ? Buffer.from(source.buffer, source.byteOffset, source.byteLength) : source instanceof ArrayBuffer ? Buffer.from(source) : undefined
      const manifest = JSON.parse(readFileSync(new URL('../package.json', url), 'utf8'))
      const disk = readFileSync(new URL(url))
      entryLoads.push({ url, packageName: manifest.name, version: manifest.version, format: original.format,
        sourceType: typeof source, sourceConstructor: source?.constructor?.name,
        byteLength: bytes?.byteLength, sha256: bytes && createHash('sha256').update(bytes).digest('hex'),
        diskByteLength: disk.byteLength, diskSha256: createHash('sha256').update(disk).digest('hex'),
        diskCrlfCount: (disk.toString('utf8').match(/\r\n/gu) ?? []).length,
        diskLfSha256: createHash('sha256').update(disk.toString('utf8').replaceAll('\r\n', '\n')).digest('hex') })
    }
    return original
  } })
  ctx.effect(() => () => diagnostics.deregister(), 'sidebar entry identity diagnostics')
  installDesktopMarketTeamCompatibility(ctx)
  const sidebar = await import(pathToFileURL(require.resolve('dsh-better-sidebar')).href)
  t.diagnostic(JSON.stringify({ node: process.version, platform: process.platform,
    expectedEntry: SIDEBAR_TEAM_REVIEWED_ENTRY, originalEntryLoads: entryLoads,
    applyLooksWrapped: sidebar.apply.toString().includes('wrapSidebarTeamContext') }))
  await ctx.plugin(sidebar, {})
  let api = routes.find(route => route.path === '/sidebar/api')
  assert.ok(api)
  server = createServer((request, response) => { void api.handler(request, response) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const call = async (method, payload, authorized = true) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/sidebar/api/${method}`, { method: 'POST',
      headers: { 'content-type': 'application/json', ...(authorized ? { authorization: 'Bearer fixture' } : {}) },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(5_000) })
    return { status: response.status, body: await response.json() }
  }
  const { agent: lead } = await ctx.agents.create({ sessionId: 'sidebar-team-lead', meta: { cwd: home } })
  const payload = { rootSessionId: lead.id, subject: 'actual sidebar task', description: 'preserve official authority' }
  assert.equal((await call('teams.taskCreate', payload)).status, 404, 'Team off keeps the original no-Team response')
  assert.equal((await call('teams.taskCreate', { ...payload, rootSessionId: 'absent' })).status, 404)
  await ctx.agentTeams.setEnabled(lead, true)
  assert.equal(wrapSidebarTeamContext(ctx).agentTeams.tryMembership({ id: lead.id, session: lead.session }), undefined, 'same-id objects cannot borrow live authority')
  // Positive-control the regression itself with the unchanged vendor entry:
  // both real HTTP handlers fail on rc3 until the scoped projection is used.
  const adaptedApi = api
  const start = routes.length
  const originalUrl = pathToFileURL(require.resolve('dsh-better-sidebar'))
  originalUrl.searchParams.set('__desktop_sidebar_team_original', '1')
  await ctx.plugin(await import(originalUrl.href), {})
  api = routes.slice(start).find(route => route.path === '/sidebar/api')
  const originalTask = await ctx.agentTeams.createTask(lead, { subject: 'unadapted route control', description: 'actual official service' })
  for (const [method, request] of [
    ['teams.taskCreate', payload],
    ['teams.taskUpdate', { rootSessionId: lead.id, taskId: originalTask.id, expectedRevision: originalTask.revision, action: 'edit', subject: 'unadapted' }],
  ]) {
    const unadapted = await call(method, request)
    assert.equal(unadapted.status, 404)
    assert.match(unadapted.body.error.message, /tryMembership is not a function/u)
  }
  api = adaptedApi
  const created = await call('teams.taskCreate', payload)
  assert.equal(created.status, 200, JSON.stringify(created))
  const task = created.body.value.value
  assert.equal(task.subject, payload.subject)
  const edited = await call('teams.taskUpdate', { rootSessionId: lead.id, taskId: task.id, expectedRevision: task.revision, action: 'edit', subject: 'edited once' })
  assert.equal(edited.status, 200, JSON.stringify(edited))
  assert.equal(edited.body.value.value.subject, 'edited once')
  const stale = await call('teams.taskUpdate', { rootSessionId: lead.id, taskId: task.id, expectedRevision: task.revision, action: 'edit', subject: 'stale' })
  assert.equal(stale.status, 409)
  assert.equal(stale.body.error.code, 'team-conflict')
  assert.equal((await call('teams.taskCreate', payload, false)).status, 403)
  assert.equal(ctx.agentTeams.tryMembership, undefined, 'compatibility must not mutate the global official service')
  const { LlmAdapter } = await load('dsh-llm')
  const memberStarted = Promise.withResolvers()
  class Adapter extends LlmAdapter { async *stream(request) {
    // A completed rc3 activation is naturally released after its journal
    // flush. Keep this actual member running while HTTP authority is tested,
    // then stop it through the exact activation disposal capability.
    memberStarted.resolve()
    await new Promise(resolve => {
      if (request.signal.aborted) resolve()
      else request.signal.addEventListener('abort', resolve, { once: true })
    })
    request.signal.throwIfAborted()
    yield { type: 'finish', reason: { kind: 'stop' } }
  } }
  ctx.llm.registerAdapter(['sidebar-fixture'], new Adapter())
  ctx.subagents.registerProvider({ name: 'sidebar-native-child', inheritsParentContext: false, capabilities: {}, prepareContinuable: async () => ({}) })
  const { agent: routedLead } = await ctx.agents.create({ sessionId: 'sidebar-routed-lead', meta: { cwd: home }, agentOptions: { provider: 'sidebar-fixture', model: 'fixture' } })
  await ctx.agentTeams.setEnabled(routedLead, true)
  const activation = await ctx.subagents.startActivation({ parent: routedLead, provider: 'sidebar-native-child', name: 'member', label: 'member', prompt: [{ type: 'text', text: 'done' }], signal: new AbortController().signal, delivery: 'parent' })
  await memberStarted.promise
  assert.ok(ctx.agents.get(activation.childId), 'member authorization control requires a real resident child')
  const owned = await call('teams.taskCreate', { ...payload, rootSessionId: routedLead.id })
  assert.equal(owned.status, 200)
  const memberUpdate = await call('teams.taskUpdate', { rootSessionId: activation.childId, taskId: owned.body.value.value.id, expectedRevision: owned.body.value.value.revision, action: 'reassign', owner: 'lead' })
  assert.equal(memberUpdate.status, 400, JSON.stringify(memberUpdate))
  assert.match(memberUpdate.body.error.message, /only the Team Lead/u)
  await activation.dispose()
  await ctx.agentTeams.setEnabled(lead, false)
  assert.equal((await call('teams.taskCreate', payload)).status, 404)
})
