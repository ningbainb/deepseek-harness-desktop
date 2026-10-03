import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const appRequire = createRequire(resolve(appDir, 'package.json'))
const sharedRequire = createRequire(resolve(appDir, '../../shared/package.json'))
const packageDir = dirname(appRequire.resolve('@linxin666/dsh-pet/package.json'))
const localRequire = createRequire(resolve(appDir, '../../packages/dsh-pet/package.json'))
const { JSDOM } = localRequire('jsdom')
const ts = sharedRequire('typescript')
const client = await readFile(resolve(packageDir, 'lib/client.js'), 'utf8')
const flush = async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve() }
const pollStateRequests = requests => requests.filter(request => request.path === '/api/pet/state' && request.signal)

async function loadInstalledSettingsForm() {
  const source = await readFile(resolve(packageDir, 'src/client/settings-form.ts'), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: 'settings-form.ts',
  }).outputText
  const module = { exports: {} }
  const createSnapshotStore = initial => {
    let value = initial
    return { getSnapshot: () => value, set: next => { value = next }, subscribe: () => () => {} }
  }
  runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: id => {
      if (id === '@deepseek-ai/dsh-client-store') return { createSnapshotStore }
      throw new Error(`Unexpected settings-form dependency: ${id}`)
    },
  }, { filename: 'installed-settings-form.js' })
  return module.exports
}

function makeBatchedScope(initial, mutate) {
  let user = {}
  const base = { ...initial }
  return {
    getSnapshot: () => ({
      status: 'ready',
      writable: true,
      value: { ...base, ...user },
      base,
      user,
    }),
    subscribe: () => () => {},
    mutate: async writes => {
      await mutate?.(writes)
      for (const write of writes) {
        const field = write.path[0]
        if (write.op === 'set') user = { ...user, [field]: write.value }
        else {
          const next = { ...user }
          delete next[field]
          user = next
        }
      }
      return true
    },
    set: async () => assert.fail('batched scope must not use per-field set'),
    unset: async () => assert.fail('batched scope must not use per-field unset'),
  }
}

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'http://127.0.0.1/' })
  const { window } = dom
  Object.assign(window, { setTimeout, clearTimeout, setInterval, clearInterval })
  let visibility = 'visible', enabled = true, exported
  Object.defineProperty(window.document, 'visibilityState', { get: () => visibility })
  const requests = [], roots = [], disposers = [], subscriptions = new Set(), stores = []
  const snapshotStore = initial => {
    let value = initial
    return { getSnapshot: () => value, set: next => { value = next }, subscribe: () => () => {} }
  }
  const modules = {
    react: { createElement: (type, props) => ({ type, props }), forwardRef: fn => fn },
    'react-dom': { createPortal: () => null },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
    'react-dom/client': { createRoot: () => ({
      render: element => { roots.push(element.props); element.props.ensure() }, unmount() {},
    }) },
    '@deepseek-ai/dsh-client-store': {
      createSnapshotStore: snapshotStore,
      defineStore: definition => ({ create: () => {
        const state = definition.init()
        const store = { getSnapshot: () => state, actions: Object.fromEntries(Object.entries(definition.actions).map(([key, fn]) => [key, (...args) => fn(state, ...args)])) }
        stores.push(store)
        return store
      } }),
    },
  }
  window.__ModuleLoader__ = { load: ({ factory }) => { exported = factory(id => {
    assert.ok(modules[id], `Unexpected client external: ${id}`)
    return modules[id]
  }) } }
  const fetch = (path, options = {}) => new Promise((resolveRequest, reject) => {
    requests.push({ path, signal: options.signal, resolve: value => resolveRequest({ ok: true, json: async () => value }), reject })
  })
  runInNewContext(client, { window, document: window.document, console, fetch, AbortController,
    setTimeout, clearTimeout, setInterval, clearInterval, URL, navigator: window.navigator,
  }, { filename: 'installed-dsh-pet-client.js' })
  const registerDispose = callback => {
    const cleanup = callback()
    let disposed = false
    const dispose = () => { if (!disposed) { disposed = true; cleanup?.() } }
    disposers.push(dispose)
    return dispose
  }
  const scope = {
    getSnapshot: () => ({ status: 'ready', writable: true, value: { enabled }, base: {}, user: {} }),
    subscribe: callback => { subscriptions.add(callback); return () => subscriptions.delete(callback) },
    set: async () => {}, unset: async () => {},
  }
  const opened = []
  const ctx = {
    effect: registerDispose, get: () => undefined, settingsScope: { bind: () => scope },
    configForms: { get: () => scope, describe: () => ({ getSnapshot: () => ({ view: { namespaces: [] } }) }) },
    slots: { inject: (_name, callback) => registerDispose(callback), register: () => () => {} },
    locale: { register: () => () => {}, bind: () => value => value },
    sessions: { list: { getSnapshot: () => ({ byId: { 'existing-session': {} } }), subscribe: () => () => {} } },
    uiWorkspace: { openSession: id => opened.push(id) },
  }
  exported.apply(ctx)
  const dispose = () => { for (const cleanup of [...disposers].reverse()) cleanup() }
  t.after(() => { dispose(); dom.window.close() })
  return { requests, roots, stores, subscriptions, opened, dispose,
    setEnabled(value) { enabled = value; for (const callback of [...subscriptions]) callback() },
    setVisible(value) { visibility = value ? 'visible' : 'hidden'; window.document.dispatchEvent(new window.Event('visibilitychange')) },
  }
}

test('installed multi-pet client retains registry retries and latest-response protection', async () => {
  assert.equal(JSON.parse(await readFile(resolve(packageDir, 'package.json'), 'utf8')).version, '0.4.4')
  const source = await readFile(resolve(packageDir, 'src/client/index.ts'), 'utf8')
  assert.match(source, /new PetPollRequest\(signal => petApi\.pets\(signal\)/u)
  assert.match(source, /new PetPollRequest\(signal => petApi\.state\(currentSessionId\(\), signal\)/u)
  assert.match(source, /document\.visibilityState === 'visible'[\s\S]*setInterval\(pollNow, POLL_MS\)/u)
  assert.match(client, /registryRead\.cancel\(\)[\s\S]*stateRead\.cancel\(\)/u)
})

test('installed pet settings form confirms atomic mutation and always settles saving state', async () => {
  const source = await readFile(resolve(packageDir, 'src/client/settings-form.ts'), 'utf8')
  const runtime = await readFile(resolve(packageDir, 'lib/client.js'), 'utf8')
  assert.match(source, /accepted = await this\.scope\.mutate\(ops\)/u)
  assert.match(source, /const landed = accepted && failedReason === undefined && valid\.every\(item => item\.judge\(\)\)/u)
  assert.match(source, /this\.saving = false\s*this\.failed = !landed/u)
  assert.match(runtime, /accepted = await this\.scope\.mutate\(ops\)/u)
  assert.match(runtime, /this\.saving = false;\s*this\.failed = !landed;/u)
})

test('installed pet settings form saves display, size, and position through one accepted mutation', async () => {
  const { CardForm, booleanField, numberField } = await loadInstalledSettingsForm()
  const mutations = []
  const scope = makeBatchedScope({ visible: false, size: 96, right: 12 }, writes => { mutations.push(writes) })
  const form = new CardForm(scope, [
    booleanField('visible'),
    numberField('size', { integer: true, min: 32 }),
    numberField('right', { integer: true, min: 0 }),
  ])
  form.actions().edit('visible', 'true')
  form.actions().edit('size', '160')
  form.actions().edit('right', '672')

  await form.save()

  assert.equal(mutations.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(mutations[0])), [
    { path: ['visible'], op: 'set', value: true },
    { path: ['size'], op: 'set', value: 160 },
    { path: ['right'], op: 'set', value: 672 },
  ])
  assert.deepEqual(JSON.parse(JSON.stringify(form.shell())), {
    available: true, exposed: true, writable: true, dirty: false,
    invalid: false, saving: false, failed: false,
  })
  assert.equal(form.field('size').text, '160')
  assert.equal(form.field('right').text, '672')
})

test('installed pet settings form retains drafts after failure and exits saving before retry', async () => {
  const { CardForm, numberField } = await loadInstalledSettingsForm()
  let attempts = 0
  const scope = makeBatchedScope({ size: 96 }, async () => {
    attempts += 1
    if (attempts === 1) throw new Error('fixture write rejected')
  })
  const form = new CardForm(scope, [numberField('size', { integer: true, min: 32 })])
  form.actions().edit('size', '160')

  await form.save()
  const failed = JSON.parse(JSON.stringify(form.shell()))
  assert.deepEqual({ ...failed, failedReason: undefined }, {
    available: true, exposed: true, writable: true, dirty: true,
    invalid: false, saving: false, failed: true, failedReason: undefined,
  })
  assert.match(failed.failedReason, /fixture write rejected/u)
  assert.equal(form.field('size').text, '160')

  await form.save()
  assert.equal(attempts, 2)
  assert.deepEqual(JSON.parse(JSON.stringify(form.shell())), {
    available: true, exposed: true, writable: true, dirty: false,
    invalid: false, saving: false, failed: false,
  })
  assert.equal(form.field('size').text, '160')
})

test('installed bundle bounds state and registry reads while preserving multi-pet features', async t => {
  const state = setup(t)
  t.mock.timers.tick(0); await flush()
  for (let tick = 0; tick < 3; tick += 1) { t.mock.timers.tick(2000); await flush() }
  const reads = pollStateRequests(state.requests)
  assert.equal(reads.length, 1, 'Slow state fetch must not accumulate every two seconds')
  assert.equal(state.requests.filter(request => request.path === '/api/pet/pets').length, 2, 'One sprite registry read and one settings registry read, each without overlap')
  assert.ok(reads[0].signal && !reads[0].signal.aborted)
  const snapshot = { name: 'multi-pet fixture', petId: 'fixture-pet' }
  reads[0].resolve(snapshot)
  for (const request of state.requests.filter(request => request.path === '/api/pet/pets')) request.resolve([{ id: 'fixture-pet', displayName: 'Fixture pet' }])
  await flush()
  assert.equal(state.stores[0].getSnapshot().snapshot.name, 'multi-pet fixture')
  assert.equal(state.stores[0].getSnapshot().pets[0].id, 'fixture-pet')
  assert.equal(typeof state.roots[0].openSession, 'function', 'Keep session bubble navigation')
  state.roots[0].openSession('missing-session')
  state.roots[0].openSession('existing-session')
  assert.deepEqual(state.opened, ['existing-session'])
})

test('installed bundle aborts timed-out reads and disables cleanly before later responses arrive', async t => {
  const state = setup(t)
  t.mock.timers.tick(0); await flush()
  const first = pollStateRequests(state.requests)[0]
  t.mock.timers.tick(8000); await flush()
  assert.equal(first.signal.aborted, true)
  assert.equal(state.stores[0].getSnapshot().state, 'error')
  t.mock.timers.tick(2000); await flush()
  const next = pollStateRequests(state.requests).at(-1)
  assert.notEqual(first, next)
  state.setEnabled(false)
  assert.equal(next.signal.aborted, true)
  next.resolve({ name: 'late' }); first.resolve({ name: 'older' }); await flush()
  assert.equal(state.stores[0].getSnapshot().snapshot, null)
  const count = pollStateRequests(state.requests).length
  t.mock.timers.tick(10000); await flush()
  assert.equal(pollStateRequests(state.requests).length, count)
  state.setEnabled(true); await flush()
  assert.equal(state.roots.length, 2)
  assert.equal(pollStateRequests(state.requests).length, count + 1)
})

test('hidden pages cancel reads and plugin disposal cancels settings retries and subscriptions', async t => {
  const state = setup(t)
  t.mock.timers.tick(0); await flush()
  const first = pollStateRequests(state.requests)[0]
  state.setVisible(false)
  assert.equal(first.signal.aborted, true)
  t.mock.timers.tick(6000); await flush()
  assert.equal(pollStateRequests(state.requests).length, 1)
  state.setVisible(true); await flush()
  assert.equal(pollStateRequests(state.requests).length, 2)
  state.dispose()
  const count = state.requests.length
  for (const request of state.requests) { if (request.signal) assert.equal(request.signal.aborted, true); request.reject(new Error('late transport error')) }
  await flush(); t.mock.timers.tick(30000); await flush()
  assert.equal(state.requests.length, count)
  assert.equal(state.subscriptions.size, 0)
})

test('an interaction refresh in the installed bundle replaces a pending older snapshot', async t => {
  const state = setup(t)
  t.mock.timers.tick(0); await flush()
  const old = pollStateRequests(state.requests)[0]
  state.roots[0].hide(); await flush()
  state.requests.find(request => request.path === '/api/pet/set-visible').resolve({ ok: true })
  await flush()
  assert.equal(pollStateRequests(state.requests).length, 1)
  old.resolve({ name: 'stale visible pet' }); await flush()
  assert.equal(state.stores[0].getSnapshot().snapshot, null)
  const next = pollStateRequests(state.requests).at(-1)
  assert.notEqual(next, old)
  next.resolve({ name: 'latest hidden pet', display: { visible: false } }); await flush()
  assert.equal(state.stores[0].getSnapshot().snapshot.display.visible, false)
})

test('disposal during startup prevents deferred settings and initial display reads', async t => {
  const state = setup(t)
  state.dispose()
  t.mock.timers.tick(30000); await flush()
  assert.equal(state.requests.length, 0)
  assert.equal(state.subscriptions.size, 0)
})
