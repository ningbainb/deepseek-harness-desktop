import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createContext, runInContext } from 'node:vm'
import { gunzipSync } from 'node:zlib'

// Execute the immutable community archive. Browser storage and React's hook
// boundary are controlled; preference setters and subscribers are vendor code.
const archive = readFileSync(new URL('../../../vendor/plugins-20261026/dsh-prompt-pilot-1.2.3.tgz', import.meta.url))
assert.equal(createHash('sha256').update(archive).digest('hex'), '9941974e4175a2854b54a09a6966bde1cd2c9557e407b70b2e66ba7274fb0d2a')
const tar = gunzipSync(archive)
const files = new Map()
for (let offset = 0; offset + 512 <= tar.length && tar[offset];) {
  const name = tar.subarray(offset, offset + 100).toString().replace(/\0.*$/s, '')
  const size = parseInt(tar.subarray(offset + 124, offset + 136).toString().replace(/\0.*$/s, '').trim(), 8) || 0
  files.set(name.replace(/^package\//, ''), tar.subarray(offset + 512, offset + 512 + size).toString())
  offset += 512 + Math.ceil(size / 512) * 512
}

// Strict unified-diff application in memory: no extraction, install or patching
// of node_modules. Every hunk must match the pinned archive at its stated line.
function patchedFiles() {
  const result = new Map(files)
  const patch = readFileSync(new URL('../../../patches/@local__dsh-prompt-pilot@1.2.3.patch', import.meta.url), 'utf8')
  let filename
  const lines = patch.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('+++ b/')) filename = lines[i].slice(6)
    const header = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/.exec(lines[i])
    if (!header) continue
    const before = [], after = []
    while (i + 1 < lines.length && /^[ +\-]/.test(lines[i + 1]) && !lines[i + 1].startsWith('--- ')) {
      const line = lines[++i]
      if (line[0] !== '+') before.push(line.slice(1))
      if (line[0] !== '-') after.push(line.slice(1))
    }
    assert.equal(before.length, Number(header[2]))
    assert.equal(after.length, Number(header[4]))
    const source = result.get(filename).split('\n')
    const start = Number(header[1]) - 1
    assert.deepEqual(source.slice(start, start + before.length), before, `patch context: ${filename}`)
    source.splice(start, before.length, ...after)
    result.set(filename, source.join('\n'))
  }
  return result
}

const key = 'dsh-prompt-pilot-v1'
const candidate = process.env.PROMPT_PILOT_TEST_ORIGINAL === '1' ? files : patchedFiles()
// Match the archive's build.mjs composition without writing generated files.
const rebuiltClient = candidate.get('client-source.js').replace("    const NS = 'prompt-pilot';",
  candidate.get('client-logic.js').replace(/^export /gm, '') + "\n    const NS = 'prompt-pilot';")

function storageHub() {
  const values = new Map(), documents = [], queued = []
  let writes = 0
  return {
    values,
    get writes() { return writes },
    flush() { for (const notify of queued.splice(0)) notify() },
    connect() {
      const listeners = new Set()
      let denied = false
      const storage = {
        getItem(name) { if (denied) throw Error('storage denied'); return values.get(name) ?? null },
        setItem(name, value) {
          if (denied) throw Error('storage denied')
          writes++
          const oldValue = values.get(name) ?? null
          values.set(name, value)
          for (const other of documents) if (other.storage !== storage) {
            queued.push(() => other.emit({ key: name, oldValue, newValue: value }))
          }
        },
      }
      const document = {
        storage, listeners,
        deny(value) { denied = value },
        emit(event) { for (const fn of [...listeners]) fn({ storageArea: storage, ...event }) },
      }
      documents.push(document)
      return document
    },
  }
}

function mount(source, page) {
  const entries = new Map(), cleanups = [], subscriptions = [], effects = [], timers = new Map()
  let plugin, changes = 0, timerId = 0, pendingSignal
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useSyncExternalStore(subscribe, snapshot) {
      subscriptions.push(subscribe(() => { changes++ }))
      return snapshot()
    },
    useState: value => [value, () => {}],
    useRef: value => ({ current: value }),
    useEffect: (run, dependencies) => { effects.push({ run, dependencies }) },
  }
  const window = {
    localStorage: page.storage,
    location: { reload() { throw Error('must not reload') } },
    addEventListener(type, fn) { assert.equal(type, 'storage'); page.listeners.add(fn) },
    removeEventListener(type, fn) { assert.equal(type, 'storage'); page.listeners.delete(fn) },
    __ModuleLoader__: { load({ id, factory }) { assert.equal(id, '@local/dsh-prompt-pilot'); plugin = factory(() => React) } },
  }
  const context = createContext({
    window, localStorage: page.storage, AbortController, URL,
    document: { baseURI: 'http://localhost/' },
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id },
    clearTimeout(id) { timers.delete(id) },
    fetch(_url, options) { pendingSignal = options.signal; return new Promise(() => {}) },
  })
  runInContext(source, context)
  assert.deepEqual(Object.keys(plugin).sort(), ['apply', 'inject'])
  const ctx = {
    effect(fn) { const cleanup = fn(); if (cleanup) cleanups.push(cleanup) },
    locale: { register: () => () => {}, bind: () => name => name, getSnapshot: () => ({ active: 'en' }), subscribe: () => () => {} },
    slots: { inject: (_name, fn) => fn(), register: (options, component) => { entries.set(options.id, component); return () => {} } },
  }
  plugin.apply(ctx)
  function controls() {
    const flatten = node => node && typeof node === 'object'
      ? [node, ...(node.children ?? []).flat(Infinity).flatMap(flatten)] : []
    return flatten(entries.get('prompt-pilot')()).filter(node => node.type === 'input' || node.type === 'select')
  }
  return {
    controls, timers,
    get changes() { return changes },
    get pendingSignal() { return pendingSignal },
    preference() { const [enabled, route, budget] = controls(); return { enabled: enabled.props.checked, route: route.props.value, budget: budget.props.value } },
    set(index, value) { controls()[index].props.onChange({ target: index === 0 ? { checked: value } : { value } }) },
    predictionEffect(draft = '') {
      effects.length = 0
      const props = {
        sessionId: 'existing-session',
        useInput: select => select({ draft, phase: 'plain', attachmentIds: [] }),
        useSession: select => select({ running: false, blank: false }),
        useProjection: (name, select) => select(name === 'promptPilotContext' ? { completedSeq: 1 } : { next: { provider: 'p', model: 'm' } }),
        useSessionStatus: select => select(new Map()),
        inputActions: { captureInsertion() { throw Error('must not change draft') }, insertText() { throw Error('must not change draft') } },
      }
      const entry = entries.get('prompt-pilot-inline')(props)
      entry.type(entry.props)
      return effects[0]
    },
    dispose() { for (const fn of subscriptions.splice(0)) fn(); for (const fn of cleanups.splice(0).reverse()) fn() },
    reapply() { plugin.apply(ctx) },
  }
}

test('unpatched archive reproduces stale main-document preferences', () => {
  const hub = storageHub(), main = mount(files.get('client.js'), hub.connect()), dock = mount(files.get('client.js'), hub.connect())
  dock.set(0, false); hub.flush()
  assert.equal(dock.preference().enabled, false)
  assert.equal(main.preference().enabled, true)
  main.dispose(); dock.dispose()
})

for (const entry of ['client-source.js', 'client.js', 'client-inline.js']) {
  test(`${entry}: predicts by default without overwriting a saved disable, model or budget on remount`, () => {
    const source = entry === 'client-source.js' ? rebuiltClient : candidate.get(entry)
    const hub = storageHub(), initial = mount(source, hub.connect())
    assert.deepEqual(initial.preference(), { enabled: true, route: '', budget: 'eco' })
    assert.equal(hub.writes, 0, 'reading defaults must not create a saved preference')
    initial.set(0, false)
    initial.set(1, '{"provider":"saved","model":"saved-model"}')
    initial.set(2, 'balanced')
    const saved = hub.values.get(key), writes = hub.writes
    initial.dispose()
    const reopened = mount(source, hub.connect())
    assert.deepEqual(reopened.preference(), { enabled: false, route: '{"provider":"saved","model":"saved-model"}', budget: 'balanced' })
    assert.equal(hub.values.get(key), saved)
    assert.equal(hub.writes, writes, 'mounting a new document must preserve an explicit disable')
    reopened.dispose()
  })

  test(`${entry}: propagates enabled, model and budget in both directions without echo writes`, () => {
    const source = entry === 'client-source.js' ? rebuiltClient : candidate.get(entry)
    const hub = storageHub(), main = mount(source, hub.connect()), dock = mount(source, hub.connect())
    main.preference()
    const before = main.changes
    dock.set(0, false); dock.set(1, '{"provider":"custom","model":"small"}'); dock.set(2, 'balanced'); hub.flush()
    assert.deepEqual(main.preference(), { enabled: false, route: '{"provider":"custom","model":"small"}', budget: 'balanced' })
    assert.ok(main.changes > before, 'notify existing useSyncExternalStore consumers')
    assert.equal(hub.writes, 3, 'receiving a storage event must not write it back')
    main.set(0, true); hub.flush()
    assert.equal(dock.preference().enabled, true)
    assert.equal(hub.writes, 4)
    main.dispose(); dock.dispose()
  })
}

test('the source rebuild preserves the shipped and legacy patched clients', () => {
  assert.equal(rebuiltClient, candidate.get('client.js'))
  assert.equal(rebuiltClient, candidate.get('client-inline.js'))
})

test('ignores unrelated storage, identical values and malformed or denied reads', () => {
  const hub = storageHub(), page = hub.connect(), main = mount(candidate.get('client.js'), page)
  main.set(0, false)
  const before = main.changes
  hub.values.set(key, '{"enabled":true}')
  page.emit({ key: 'unrelated' }); page.emit({ key, storageArea: {} })
  hub.values.set(key, '{"enabled":false}')
  page.emit({ key })
  hub.values.set(key, '{bad json'); page.emit({ key })
  page.deny(true); page.emit({ key }); page.deny(false)
  assert.equal(main.preference().enabled, false)
  assert.equal(main.changes, before)
  main.dispose()
})

test('reads current storage instead of reverting a newer local choice with a queued event', () => {
  const hub = storageHub(), main = mount(candidate.get('client.js'), hub.connect()), dock = mount(candidate.get('client.js'), hub.connect())
  dock.set(2, 'balanced')
  main.set(0, false)
  hub.flush()
  assert.deepEqual(main.preference(), { enabled: false, route: '', budget: 'eco' })
  assert.equal(dock.preference().enabled, false)
  main.dispose(); dock.dispose()
})

test('removeItem and clear restore vendor defaults and notify consumers', () => {
  for (const eventKey of [key, null]) {
    const hub = storageHub(), page = hub.connect(), main = mount(candidate.get('client.js'), page)
    main.set(0, false); main.set(2, 'balanced')
    hub.values.delete(key); page.emit({ key: eventKey, newValue: null })
    assert.deepEqual(main.preference(), { enabled: true, route: '', budget: 'eco' })
    main.dispose()
  }
})

test('unload removes storage listeners and reapply installs exactly one listener', () => {
  const hub = storageHub(), page = hub.connect(), main = mount(candidate.get('client.js'), page)
  assert.equal(page.listeners.size, 1)
  main.dispose(); assert.equal(page.listeners.size, 0)
  main.reapply(); assert.equal(page.listeners.size, 1)
  main.dispose(); assert.equal(page.listeners.size, 0)
})

test('a remote disable reaches the real prediction effect without reload or draft writes', () => {
  const hub = storageHub(), main = mount(candidate.get('client.js'), hub.connect()), dock = mount(candidate.get('client.js'), hub.connect())
  const active = main.predictionEffect()
  const cancel = active.run()
  assert.equal(main.timers.size, 1)
  const pending = main.timers.values().next().value()
  assert.equal(main.pendingSignal.aborted, false)
  dock.set(0, false); hub.flush()
  const disabled = main.predictionEffect('keep this draft')
  assert.notDeepEqual(disabled.dependencies, active.dependencies)
  // React performs this cleanup when the subscribed preference dependencies
  // change. Execute the original effect cleanup at that boundary explicitly.
  cancel()
  assert.equal(main.pendingSignal.aborted, true)
  assert.equal(main.timers.size, 0)
  assert.equal(disabled.run(), undefined)
  void pending
  main.dispose(); dock.dispose()
})
