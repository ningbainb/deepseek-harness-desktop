import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import Loader, { EntryTree } from '@deepseek-ai/cordis-plugin-loader'

const require = createRequire(import.meta.url)
const sidebar = dirname(require.resolve('dsh-better-sidebar/package.json'))
const bundle = readFileSync(join(sidebar, 'cordis.patch.yml'), 'utf8')
const expression = bundle.match(/disabled: !!js "([^\r\n]+)"/u)?.[1]
assert.ok(expression, 'Exercise the installed community bundle expression')
const standalone = () => ({ id: 'better-sidebar', name: 'dsh-better-sidebar', disabled: { __jsExpr: expression } })

async function fixture(run) {
  const ctx = new Context()
  const applications = []
  const modules = new Map([['dsh-better-sidebar', { apply(ctx) { applications.push(ctx.fiber.entry.id) } }]])
  try {
    await ctx.plugin(Loader)
    // Only module transport is in memory; entry identity, expressions, disabled
    // state, fiber activation and nested tree qualification are the real SDK.
    ctx.loader.internal = { version: 'client', import: async name => {
      assert.ok(modules.has(name), `Unexpected fixture module ${name}`)
      return modules.get(name)
    } }
    await run({ ctx, applications, modules })
  } finally {
    await ctx.fiber.dispose()
  }
}

test('the actual SDK Loader retains options.id and the original guard activates a standalone sidebar', async () => {
  await fixture(async ({ ctx, applications }) => {
    await ctx.loader.create(standalone())
    await ctx.loader.await()
    const entry = ctx.loader.resolve('better-sidebar')
    assert.equal(entry.id, 'better-sidebar')
    assert.equal(entry.options.id, 'better-sidebar')
    assert.equal(entry.disabled, false)
    assert.equal(entry.fiber.state, 2)
    assert.deepEqual(applications, ['better-sidebar'])
  })
})

test('a qualified nested tree retains the local options.id and excludes its own sidebar mount', async () => {
  await fixture(async ({ ctx, applications, modules }) => {
    modules.set('fixture:nested', { async apply(child) {
      class MemoryTree extends EntryTree { write() {} }
      const tree = new MemoryTree(child)
      await tree.create(standalone())
    } })
    await ctx.loader.create({ id: 'desktop-root', name: 'fixture:nested' })
    await ctx.loader.await()
    const entry = [...ctx.loader.entries()].find(entry => entry.options.name === 'dsh-better-sidebar')
    assert.equal(entry.id, 'desktop-root:better-sidebar')
    assert.equal(entry.options.id, 'better-sidebar')
    assert.equal(entry.disabled, false)
    assert.equal(entry.fiber.state, 2)
    assert.deepEqual(applications, ['desktop-root:better-sidebar'])
  })
})

test('an enabled aggregate mount makes the standalone bundle back off without a second application', async () => {
  await fixture(async ({ ctx, applications }) => {
    await ctx.loader.create({ id: 'web-ui-better-sidebar', name: 'dsh-better-sidebar' })
    await ctx.loader.create(standalone())
    await ctx.loader.await()
    const entry = ctx.loader.resolve('better-sidebar')
    assert.equal(entry.disabled, true)
    assert.equal(entry.fiber, undefined)
    assert.deepEqual(applications, ['web-ui-better-sidebar'])
  })
})

test('a disabled aggregate row does not suppress the standalone sidebar', async () => {
  await fixture(async ({ ctx, applications }) => {
    await ctx.loader.create({ id: 'web-ui-better-sidebar', name: 'dsh-better-sidebar', disabled: true })
    await ctx.loader.create(standalone())
    await ctx.loader.await()
    assert.equal(ctx.loader.resolve('better-sidebar').disabled, false)
    assert.equal(ctx.loader.resolve('better-sidebar').fiber.state, 2)
    assert.deepEqual(applications, ['better-sidebar'])
  })
})
