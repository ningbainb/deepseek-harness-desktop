import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { observeHost } from '../scripts/sidebar-ledger-diagnostic-fixture.mjs'

async function withLoader(importModule, run) {
  const ctx = new Context()
  try {
    await ctx.plugin(Loader)
    ctx.loader.internal = { version: 'client', import: importModule }
    await ctx.loader.create({ id: 'better-sidebar', name: 'dsh-better-sidebar' })
    await ctx.loader.await()
    await run(ctx)
  } finally { await ctx.fiber.dispose() }
}

test('Host observation reports a real pending dependency without activating the target', async () => {
  let applications = 0
  await withLoader(async () => ({ inject: ['missingFixtureService'], apply() { applications++ } }), async ctx => {
    const before = ctx.loader.resolve('better-sidebar').fiber
    const report = await observeHost(ctx)
    const target = report.entries.find(entry => entry.name === 'dsh-better-sidebar')
    assert.equal(report.targetPresent, true)
    assert.equal(target.optionsId, 'better-sidebar')
    assert.equal(target.disabled, false)
    assert.equal(target.imported, true)
    assert.deepEqual(target.moduleInject, ['missingFixtureService'])
    assert.equal(target.fiber.stateName, 'PENDING')
    assert.equal(target.fiber.dependencies.missingFixtureService, false)
    assert.equal(ctx.loader.resolve('better-sidebar').fiber, before)
    assert.equal(applications, 0)
  })
})

test('Host observation retains a real import failure with the entry present and no fiber', async () => {
  await withLoader(async () => { throw new Error('dsh-better-sidebar fixture import rejected') }, async ctx => {
    const target = (await observeHost(ctx)).entries.find(entry => entry.name === 'dsh-better-sidebar')
    assert.equal(target.imported, false)
    assert.equal(target.fiber, null)
    assert.ok(target.importErrors.some(error => error.text.includes('fixture import rejected')))
  })
})

test('Host observation reads a settled startup error without retrying or replacing the fiber', async () => {
  let applications = 0
  await withLoader(async () => ({ apply() { applications++; throw new Error('fixture startup rejected') } }), async ctx => {
    const before = ctx.loader.resolve('better-sidebar').fiber
    const target = (await observeHost(ctx)).entries.find(entry => entry.name === 'dsh-better-sidebar')
    assert.equal(target.fiber.stateName, 'FAILED')
    assert.match(target.fiber.settledFiberError, /fixture startup rejected/u)
    assert.equal(ctx.loader.resolve('better-sidebar').fiber, before)
    assert.equal(applications, 1)
  })
})
