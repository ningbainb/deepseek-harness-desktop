import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hostFixture, modelText, occurrences, load } from './fixtures/context-suite-host.mjs'

test('actual rc.3 Agent model input contains M1/P1/context once, in stable order, with project and principal isolation', async t => {
  const fixture = await hostFixture(t)
  const { ctx, projectA, projectB, service, create, request } = fixture
  assert.equal(ctx.tools.schemas().filter(tool => tool.name === 'memory').length, 1)
  assert.equal(ctx.tools.schemas().some(tool => tool.name === 'memory_recall'), false)
  const a = await create('suite-local-a', projectA)
  const sessionContext = service.contextFor(ctx.userScope.desktopScope(), { sessionId: a.id })
  assert.ok(sessionContext)
  await service.save(sessionContext, { scope: 'workspace', workspaceId: 'suite-project-a', content: 'SUITE_M1_PROJECT_A fixture convention', pinned: true })
  const first = modelText(await request(a))
  for (const marker of ['SUITE_CONTEXT_PREFIX {{literal}}', 'SUITE_CONTEXT_SUFFIX', 'SUITE_M1_GLOBAL', 'SUITE_M1_PROJECT_A', 'SUITE_P1_PROJECT_A', 'SUITE_NATIVE_PREFIX', 'SUITE_NATIVE_SUFFIX']) {
    assert.equal(occurrences(first, marker), 1, `${marker}: exactly one model-facing contribution\n${first}`)
  }
  assert.equal(first.includes('SUITE_P1_GLOBAL'), false)
  const order = ['SUITE_CONTEXT_PREFIX', 'SUITE_NATIVE_PREFIX', 'SUITE_M1_GLOBAL', 'SUITE_P1_PROJECT_A', 'SUITE_NATIVE_SUFFIX', 'SUITE_CONTEXT_SUFFIX']
  for (let index = 1; index < order.length; index++) assert.ok(first.indexOf(order[index - 1]) < first.indexOf(order[index]), `${order[index - 1]} precedes ${order[index]}`)
  const second = modelText(await request(a))
  for (const marker of ['SUITE_CONTEXT_PREFIX', 'SUITE_CONTEXT_SUFFIX', 'SUITE_M1_GLOBAL', 'SUITE_M1_PROJECT_A', 'SUITE_P1_PROJECT_A']) assert.equal(occurrences(second, marker), 1, `${marker}: no duplicate after continuation`)
  const b = await create('suite-local-b', projectB)
  const otherProject = modelText(await request(b))
  for (const marker of ['SUITE_M1_PROJECT_A', 'SUITE_P1_PROJECT_A']) assert.equal(otherProject.includes(marker), false)
  for (const marker of ['SUITE_M1_GLOBAL', 'SUITE_P1_GLOBAL']) assert.equal(occurrences(otherProject, marker), 1)
  const remote = await ctx.userScope.bindDevice('suite-paired-device')
  await ctx.userScope.grantWorkspace(remote.principalId, 'suite-project-a')
  const scope = { principalId: remote.principalId, deviceId: remote.deviceId, source: 'remote' }
  const remoteAgent = await create('suite-remote-a', projectA, scope)
  const otherUser = modelText(await request(remoteAgent, scope))
  for (const marker of ['SUITE_M1_GLOBAL', 'SUITE_M1_PROJECT_A', 'SUITE_P1_GLOBAL', 'SUITE_P1_PROJECT_A']) assert.equal(otherUser.includes(marker), false, `${marker}: local contribution must not reach a paired user`)
})

test('authenticated P2 save/preview/restore preserves the joint prompt exactly once in actual rc.3 model input', async t => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./fixtures/context-prompt-customizer-probe.mjs', import.meta.url))], {
    encoding: 'utf8', timeout: 30_000, windowsHide: true,
  })
  const root = /^CONTEXT_PROBE_ROOT=(.+)$/mu.exec(result.stdout ?? '')?.[1].trim()
  if (root !== undefined) t.after(async () => {
    const actual = await realpath(root)
    assert.equal(dirname(actual), await realpath(tmpdir()), 'probe cleanup stays in the configured fixture temp directory')
    assert.ok(basename(actual).startsWith('dsh-context-suite-'))
    await rm(actual, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const text = /^CONTEXT_P2_PROBE=(.+)$/mu.exec(result.stdout)?.[1]
  assert.ok(text, 'authenticated probe must return its results')
  const report = JSON.parse(text)
  assert.equal(report.state, 2)
  for (const operation of ['backup', 'save', 'preview', 'restore']) assert.equal(report[operation], 200, operation)
  assert.equal(report.previewIncludesP2, true)
  assert.equal(report.restoredWithoutP2, true)
  for (const [source, count] of Object.entries(report.counts)) assert.equal(count, 1, `${source}: exactly one actual model contribution`)
  for (let index = 1; index < report.order.length; index++) assert.ok(report.order[index - 1] < report.order[index], `joint model input preserves contribution order: ${JSON.stringify(report)}`)
})

test('M2 1.2.0 isolated compatibility probe records its cross-principal gap and the Desktop gate refuses activation', async t => {
  const { ctx, projectA, create, request } = await hostFixture(t)
  // Deliberate programmatic SDK probe in disposable data, not permission to
  // mount this package in a user profile or bypass loader version policy.
  await ctx.plugin(await load('dsh-context-memory'))
  ctx.contextMemory.remember({ text: 'SUITE_M2_PROJECT fixture convention', kind: 'fact', scope: 'project' })
  const local = await create('suite-local-a', projectA)
  assert.equal(modelText(await request(local)).includes('SUITE_M2_PROJECT'), true)
  const names = ctx.tools.schemas().map(tool => tool.name)
  assert.equal(new Set(names).size, names.length, 'M1 and M2 tools must not duplicate names')
  const paired = await ctx.userScope.bindDevice('suite-m2-probe-device')
  await ctx.userScope.grantWorkspace(paired.principalId, 'suite-project-a')
  const scope = { principalId: paired.principalId, deviceId: paired.deviceId, source: 'remote' }
  const foreign = await create('suite-remote-a', projectA, scope)
  const isolated = !modelText(await request(foreign, scope)).includes('SUITE_M2_PROJECT')
  assert.equal(isolated, false, 'pinned 1.2.0 probe must reproduce the gap until reviewed replacement or adapter passes')
  const safety = await import('../src/runtime-optional-context-safety.mjs')
  assert.throws(() => safety.assertOptionalContextPluginActivation('dsh-context-memory'), error => error.code === safety.CONTEXT_MEMORY_ISOLATION_BLOCK)
  const intent = [{ insert: [{ id: 'dsh-context-memory', name: 'dsh-context-memory', disabled: false }] }]
  assert.equal(safety.adaptRuntimeOptionalContextSafety(intent, { onBlocked() {} })[0].insert[0].disabled, true)
  assert.equal(intent[0].insert[0].disabled, false, 'saved prior intent remains untouched')
  t.diagnostic('M2 1.2.0 compatibility: blocked; project memory reached a paired principal in the SDK probe. Desktop activation is refused.')
})
