import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { boot, composeEntries, prepareProfilePatches, recomposeProfile } from '@deepseek-ai/dsh-app-boot'
import { adaptDesktopClientHmrPatches } from '../src/runtime-client-hmr.mjs'

const composition = () => import('../src/runtime-profile-composition.mjs')
const rootUrl = 'file:///E:/isolated-profile/cordis.yml'
const official = '@deepseek-ai/dsh-client-hmr'
const desktop = '@linxin666/dsh-desktop-client-hmr'
const patchesFor = (pollIntervalMs, disabled = true) => [
  { insert: [{ id: 'client-hmr', name: official }] },
  { id: 'client-hmr', name: desktop, disabled, config: { pollIntervalMs } },
]

test('installed rc.2 ConfigEditor persists candidates and rollbacks before reconciling the Root Include', async () => {
  const require = createRequire(import.meta.url)
  const sdkRequire = createRequire(require.resolve('@deepseek-ai/dsh/package.json'))
  const source = await readFile(sdkRequire.resolve('@deepseek-ai/dsh-config-editor'), 'utf8')
  const validate = source.indexOf('resolveConfig(fiber.runtime, resolved)')
  const persist = source.indexOf('await writeFileAtomic(path, String(document)')
  const reconcile = source.indexOf('await reconcileProfilePatches(this.ownerContext.root, patches,')
  const restore = source.indexOf('await writeFileAtomic(path, before,', reconcile)
  const rollback = source.indexOf('await reconcileProfilePatches(this.ownerContext.root, beforePatches,', restore)
  assert.ok(validate >= 0 && validate < persist && persist < reconcile)
  assert.ok(reconcile < restore && restore < rollback)
  assert.match(source, /hmr\.runExclusive\(run\)/u)
})

test('the real Cordis waterfall replaces only root patches before continuing exactly once', async () => {
  const { installDesktopProfileComposition } = await composition()
  const ctx = new Context()
  const original = { path: rootUrl, patches: ['original'], initial: [], enableLogs: false, extra: { retained: true } }
  const entry = { options: { id: 'root', name: 'cordis:include', config: original },
    update: () => { assert.fail('the waterfall must not invoke entry.update') } }
  const order = []
  const source = patchesFor(750)
  const prepared = [{ insert: [{ id: 'prepared', disabled: true }] }]
  installDesktopProfileComposition(ctx, { rootUrl,
    compose: () => { order.push('compose'); return source },
    prepare: patches => { order.push('prepare'); assert.equal(patches, source); return prepared },
  })
  try {
    let continued = 0
    ctx.waterfall('loader/patch-context', entry, () => {
      continued++
      order.push('next')
      assert.equal(entry.options.config.patches, prepared)
    })
    assert.equal(continued, 1)
    assert.deepEqual(order, ['compose', 'prepare', 'next'])
    assert.deepEqual(entry.options, { id: 'root', name: 'cordis:include', config: { ...original, patches: prepared } })
    assert.equal(entry.options.config.extra, original.extra)
    assert.deepEqual(original.patches, ['original'])
  } finally { await ctx.fiber.dispose() }
})

test('non-root names and non-exact paths continue untouched and disposal removes the hook', async () => {
  const { installDesktopProfileComposition } = await composition()
  const ctx = new Context()
  const stop = installDesktopProfileComposition(ctx, { rootUrl,
    compose: () => { assert.fail('non-root entries must not compose') },
    prepare: () => { assert.fail('non-root entries must not prepare') },
  })
  try {
    for (const options of [
      { name: 'cordis:group', config: { path: rootUrl } },
      { name: 'cordis:include', config: { path: `${rootUrl}?other` } },
      { name: 'cordis:include', config: { path: rootUrl.replace('cordis.yml', 'nested.yml') } },
      { name: 'cordis:include' },
    ]) {
      const before = structuredClone(options)
      let continued = 0
      ctx.waterfall('loader/patch-context', { options }, () => { continued++ })
      assert.equal(continued, 1)
      assert.deepEqual(options, before)
    }
    stop()
    const entry = { options: { name: 'cordis:include', config: { path: rootUrl, patches: ['unchanged'] } } }
    let continued = 0
    ctx.waterfall('loader/patch-context', entry, () => { continued++ })
    assert.equal(continued, 1)
    assert.deepEqual(entry.options.config.patches, ['unchanged'])
  } finally { await ctx.fiber.dispose() }
})

for (const stage of ['compose', 'prepare']) {
  test(`${stage} errors fail closed without changing root config or continuing`, async () => {
    const { installDesktopProfileComposition } = await composition()
    const ctx = new Context()
    const original = { path: rootUrl, patches: ['original'], enableLogs: false }
    const entry = { options: { name: 'cordis:include', config: original } }
    const failure = new Error(`${stage} failed`)
    installDesktopProfileComposition(ctx, { rootUrl,
      compose: () => { if (stage === 'compose') throw failure; return [] },
      prepare: () => { throw failure },
    })
    try {
      let continued = 0
      assert.throws(() => ctx.waterfall('loader/patch-context', entry, () => { continued++ }), error => error === failure)
      assert.equal(continued, 0)
      assert.equal(entry.options.config, original)
    } finally { await ctx.fiber.dispose() }
  })
}

for (const stage of ['compose', 'prepare']) {
  for (const invalid of [undefined, {}, Promise.resolve([])]) {
    test(`${stage} must return a synchronous array, not ${invalid === undefined ? 'undefined' : invalid.constructor.name}`, async () => {
      const { installDesktopProfileComposition } = await composition()
      const ctx = new Context()
      const original = { path: rootUrl, patches: [] }
      const entry = { options: { name: 'cordis:include', config: original } }
      installDesktopProfileComposition(ctx, { rootUrl,
        compose: () => stage === 'compose' ? invalid : [],
        prepare: () => invalid,
      })
      try {
        assert.throws(() => ctx.waterfall('loader/patch-context', entry, () => { assert.fail('invalid patches cannot continue') }), TypeError)
        assert.equal(entry.options.config, original)
      } finally { await ctx.fiber.dispose() }
    })
  }
}

test('a real SDK Root Include uses transaction patches at boot and fresh caller inputs on every recomposition', async () => {
  const { installDesktopProfileComposition } = await composition()
  const directory = await mkdtemp(join(tmpdir(), 'dsh-profile-composition-'))
  const configPath = join(directory, 'cordis.yml')
  const url = pathToFileURL(configPath).href
  const parentUrl = pathToFileURL(directory).href + '/'
  await writeFile(configPath, '[]\n')
  const transaction = patchesFor(750)
  let committed = false
  let live = patchesFor(1250)
  let calls = 0
  let ctx
  const compose = () => {
    calls++
    return adaptDesktopClientHmrPatches(committed ? live : transaction, { enabled: true })
  }
  try {
    ctx = await boot('profile-composition-test', configPath, [{ insert: [{ id: 'client-hmr', name: official, disabled: true }] }], host => {
      installDesktopProfileComposition(host, { rootUrl: url, compose,
        prepare: patches => prepareProfilePatches(host, patches, parentUrl, 'profile-composition-test'),
      })
    })
    const current = () => [...ctx.loader.entries()].filter(entry => entry.options.id === 'client-hmr')
    assert.equal(current().length, 1)
    assert.deepEqual(current()[0].options, { id: 'client-hmr', name: desktop, disabled: true, config: { pollIntervalMs: 750 } })
    assert.equal(calls, 1)
    const root = [...ctx.loader.entries()].find(entry => entry.options.name === 'cordis:include' && entry.options.config.path === url)
    const rootConfig = { ...root.options.config }
    committed = true
    for (const pollIntervalMs of [1250, 2000]) {
      live = patchesFor(pollIntervalMs)
      const raw = [{ insert: [{ id: 'client-hmr', name: official, disabled: true }] }]
      await recomposeProfile(ctx, raw, 'profile-composition-test')
      assert.equal(current().length, 1)
      assert.equal(current()[0].options.name, desktop)
      assert.equal(current()[0].options.disabled, true)
      assert.deepEqual(current()[0].options.config, { pollIntervalMs })
      const { patches, ...rest } = root.options.config
      const { patches: previous, ...expected } = rootConfig
      assert.deepEqual(rest, expected)
      assert.equal(composeEntries(patches)[0].name, desktop)
    }
    assert.equal(calls, 3)
    assert.equal(await readFile(configPath, 'utf8'), '[]\n')
  } finally {
    await ctx?.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})
