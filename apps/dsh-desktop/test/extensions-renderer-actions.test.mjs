import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import { setImmediate as tick } from 'node:timers/promises'
import vm from 'node:vm'

import { createExtensionOperationQueue } from '../src/ui/extension-operation-queue.mjs'

const { JSDOM } = createRequire(new URL('../../../packages/dsh-web-ui-settings/package.json', import.meta.url))('jsdom')
const source = await readFile(new URL('../src/ui/extensions.mjs', import.meta.url), 'utf8')
const html = await readFile(new URL('../src/ui/extensions.html', import.meta.url), 'utf8')

// Run the production handlers with controlled IPC responses. Keeping their
// actual code here catches renderer errors that markup assertions cannot.
function section(start, end) {
  const begin = source.indexOf(start)
  const finish = source.indexOf(end, begin)
  assert.ok(begin >= 0 && finish > begin, `renderer section is available: ${start}`)
  return source.slice(begin, finish)
}

const copyHandler = section(
  "  const copyDiagnosticsButton = event.target.closest('[data-copy-plugin-diagnostics]')",
  "  const updateButton = event.target.closest('[data-update-plugin]')",
)
const updateHandler = section(
  "  const updateButton = event.target.closest('[data-update-plugin]')",
  "  const button = event.target.closest('[data-remove-plugin]')",
)

function runHandler(handler, context) {
  return vm.runInContext(`(async () => {${handler}})()`, context)
}

test('plugin diagnostics copies the selected cached plugin without leaking unrelated fields', async () => {
  const copied = []
  const messages = []
  const context = vm.createContext({
    event: { target: { closest: () => ({ dataset: { copyPluginDiagnostics: 'example' } }) } },
    cachedPlugins: [
      { name: 'other', version: '9.0.0' },
      { name: 'example', version: '1.0.0', status: 'needs-attention', compatibility: { status: 'unknown' }, advanced: { runtimeRange: '^1.0.0' }, attention: '启动失败', privatePath: 'not-for-copying' },
    ],
    navigator: { clipboard: { writeText: async value => { copied.push(value) } } },
    notify: message => messages.push(message),
    showPluginFailure: async () => assert.fail('copy should not fail'),
  })
  await runHandler(copyHandler, context)
  assert.deepEqual(JSON.parse(copied[0]), {
    plugin: 'example', version: '1.0.0', status: 'needs-attention',
    compatibility: 'unknown', runtimeRange: '^1.0.0', attention: '启动失败',
  })
  assert.deepEqual(messages, ['诊断信息已复制'])
})

test('plugin diagnostics reports clipboard failures and tolerates a removed selection', async () => {
  const errors = []
  const failure = new Error('clipboard unavailable')
  const context = vm.createContext({
    event: { target: { closest: () => ({ dataset: { copyPluginDiagnostics: 'example' } }) } },
    cachedPlugins: [{ name: 'example' }],
    navigator: { clipboard: { writeText: async () => { throw failure } } },
    notify: () => assert.fail('failed copies must not announce success'),
    showPluginFailure: async (error, label) => { errors.push([error, label]) },
  })
  await runHandler(copyHandler, context)
  assert.deepEqual(errors, [[failure, '复制诊断信息失败']])
  context.cachedPlugins = []
  await runHandler(copyHandler, context)
  assert.equal(errors.length, 1)
})

test('manual plugin update releases the queue before joining concurrent automatic updates', { timeout: 2000 }, async () => {
  let resolveCheck, resolveManual
  let batchCalls = 0
  const events = []
  const busy = []
  const queue = createExtensionOperationQueue({ onBusyChange: value => busy.push(value) })
  const pendingCheck = new Promise(resolve => { resolveCheck = resolve })
  const pendingManual = new Promise(resolve => { resolveManual = resolve })
  const context = vm.createContext({
    extensionOperations: queue,
    pluginUpdatePromise: undefined,
    checkPluginUpdatesButton: {},
    pluginUpdateState: {},
    pluginSettings: { autoUpdate: true },
    renderPlugins() {}, notify() {}, refresh: async () => {},
    showPluginFailure: async () => assert.fail('updates should complete'),
    event: { target: { closest: () => ({ dataset: { updatePlugin: 'example', updateCompatibility: 'compatible' } }) } },
    window: { dshDesktop: {
      checkPluginUpdates: () => pendingCheck,
      updatePlugin: async () => { events.push('manual:start'); await pendingManual; events.push('manual:end'); return { name: 'example' } },
      installPluginBatch: async () => { batchCalls++; events.push('automatic'); return {} },
    } },
  })
  vm.runInContext(section('async function updatePluginBatch(', "pluginSearch.addEventListener('input'"), context)
  const check = vm.runInContext('checkPluginUpdates()', context)
  const manual = runHandler(updateHandler, context)
  await tick()
  resolveCheck([{ name: 'example', latestVersion: '2.0.0', updateAvailable: true, updateCompatibility: { status: 'compatible' } }])
  await tick()
  assert.equal(batchCalls, 0, 'automatic changes wait for the active manual operation')
  resolveManual()
  await Promise.all([check, manual])
  assert.equal(batchCalls, 1)
  assert.deepEqual(events, ['manual:start', 'manual:end', 'automatic'])
  assert.deepEqual(busy, [true, false])
  assert.equal(queue.busy, false)
  assert.equal(context.pluginUpdatePromise, undefined)
  assert.equal(context.checkPluginUpdatesButton.disabled, false)
})

test('failed manual updates report the error and release the queue without checking updates', async () => {
  const queue = createExtensionOperationQueue()
  const failure = new Error('update failed')
  const errors = []
  let refreshed = 0
  const context = vm.createContext({
    extensionOperations: queue,
    event: { target: { closest: () => ({ dataset: { updatePlugin: 'example', updateCompatibility: 'compatible' } }) } },
    window: { dshDesktop: { updatePlugin: async () => { throw failure } } },
    refresh: async () => { refreshed++ },
    showPluginFailure: async (error, label) => errors.push([error, label]),
    checkPluginUpdates: () => assert.fail('failed updates must not announce a new update check'),
  })
  await runHandler(updateHandler, context)
  assert.deepEqual(errors, [[failure, '插件更新失败']])
  assert.equal(refreshed, 1)
  assert.equal(queue.busy, false)
})

function repairFixture(t, { api, choose }) {
  const dom = new JSDOM(html)
  t.after(() => dom.window.close())
  const { document } = dom.window
  const button = document.querySelector('#reset-profile-env')
  const busy = []
  const queue = createExtensionOperationQueue({ onBusyChange: value => {
    busy.push(value)
    for (const control of document.querySelectorAll('[data-mutation-control]')) control.disabled = value
  } })
  let repair
  button.addEventListener = (event, listener) => { if (event === 'click') repair = listener }
  const messages = []
  const context = vm.createContext({
    document, window: { dshDesktop: api }, extensionOperations: queue,
    showPluginDialog: options => choose(options, button),
    normalizedErrorMessage: error => error.message,
    formatFileSize: String,
    notify: message => messages.push(message),
    refresh: async () => {},
  })
  vm.runInContext(section("document.querySelector('#reset-profile-env')?.addEventListener('click'", "checkPluginUpdatesButton.addEventListener('click'"), context)
  return { repair, queue, button, document, busy, messages }
}

test('repair retry rechecks the environment and succeeds while its mutation button stays disabled', async t => {
  let previews = 0, resets = 0
  const fixture = repairFixture(t, {
    api: {
      previewProfileReset: async () => {
        if (++previews === 1) throw new Error('disk probe failed')
        return { timestamp: 42, currentProfileBytes: 10, requiredFreeBytes: 20 }
      },
      resetProfile: async ({ timestamp }) => { assert.equal(timestamp, 42); resets++ },
    },
    choose: async (options, button) => {
      assert.equal(button.disabled, true)
      return options.returnValue ? 'confirm' : true
    },
  })
  await fixture.repair()
  assert.equal(previews, 2)
  assert.equal(resets, 1)
  assert.deepEqual(fixture.messages, ['插件环境已修复'])
  assert.deepEqual(fixture.busy, [true, false])
  assert.equal(fixture.button.disabled, false)
})

test('repair retry still requests confirmation and can be canceled before a second mutation', async t => {
  let previews = 0, resets = 0, confirmations = 0
  const fixture = repairFixture(t, {
    api: {
      previewProfileReset: async () => ({ timestamp: ++previews }),
      resetProfile: async () => { resets++; throw new Error('repair failed') },
    },
    choose: async options => options.returnValue ? 'confirm' : ++confirmations === 1,
  })
  await fixture.repair()
  assert.equal(previews, 2)
  assert.equal(resets, 1)
  assert.equal(confirmations, 2)
  assert.deepEqual(fixture.messages, [])
  assert.equal(fixture.queue.busy, false)
})

test('repair failure keeps the export-diagnostics action available after the failed operation', async t => {
  const events = []
  const fixture = repairFixture(t, {
    api: { previewProfileReset: async () => { events.push('preview'); throw new Error('probe failed') } },
    choose: async () => 'cancel',
  })
  let exportOperation
  fixture.document.querySelector('#export-diagnostics').addEventListener('click', () => {
    exportOperation = fixture.queue.run(async () => { events.push('export') })
  })
  await fixture.repair()
  await exportOperation
  assert.deepEqual(events, ['preview', 'export'])
  assert.equal(fixture.queue.busy, false)
})
