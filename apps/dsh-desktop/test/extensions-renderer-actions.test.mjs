import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import { setImmediate as tick } from 'node:timers/promises'
import vm from 'node:vm'

import { assertNativeDockDestination } from '../src/dock-pages.mjs'
import { createExtensionOperationQueue } from '../src/ui/extension-operation-queue.mjs'
import { createCommunityMarketService } from '../src/extensions/community-market.mjs'
import * as marketViewHelpers from '../src/ui/community-market-view.mjs'

const { JSDOM } = createRequire(new URL('../../../packages/dsh-web-ui-settings/package.json', import.meta.url))('jsdom')
const source = await readFile(new URL('../src/ui/extensions.mjs', import.meta.url), 'utf8')
const html = await readFile(new URL('../src/ui/extensions.html', import.meta.url), 'utf8')

test('Creative Workshop renders an installable local pin during load and after network failure', async () => {
  const dom = new JSDOM(html, { url: 'https://desktop.invalid' })
  const document = dom.window.document
  const market = id => document.getElementById(`market-${id}`)
  const curated = createCommunityMarketService().listAvailable()
  const [trial] = curated.plugins
  const entries = Array.from({ length: 21 }, (_entry, index) => ({
    id: `other-${index}`, name: `other-${index}`, displayName: `Other ${index}`, category: 'notify',
  }))
  const remoteCatalog = {
    ...curated, source: 'community', updated: '2026-11-17',
    plugins: [trial, ...entries], count: 22,
  }
  const calls = []
  let pendingReject
  const pending = new Promise((_resolve, reject) => { pendingReject = reject })
  const context = vm.createContext({
    document, ...marketViewHelpers,
    window: { dshDesktop: { listCommunityMarket: async (force, source = 'community') => {
      calls.push([force, source])
      return source === 'available' ? curated : force ? remoteCatalog : pending
    } } },
    MARKET_PAGE_SIZE: 20, marketPage: 1, installedMarketReferences: new Set(), marketInstallPhases: new Map(),
    marketCatalog: undefined, marketView: undefined, marketRefreshPromise: undefined,
    escapeHtml: value => String(value), compactNumber: new Intl.NumberFormat('zh-CN'), extensionOperations: { busy: false },
  })
  try {
    vm.runInContext(section('const marketCount =', 'const toast ='), context)
    vm.runInContext(section('function marketDescription(', 'function renderLegacyPluginRestore('), context)
    vm.runInContext(section('function syncMarketPaginationState(', 'function normalizedErrorMessage('), context)
    const first = vm.runInContext('refreshMarket()', context)
    await tick()
    assert.deepEqual(calls, [[false, 'available'], [false, 'community']])
    assert.equal(market('total').textContent, '1')
    assert.equal(market('updated').textContent, '随本版提供')
    assert.match(market('bridge').textContent, /正在读取完整社区目录/u)
    assert.match(market('list').textContent, /@michengai\/dsh-im-connect@1\.0\.53/u)
    assert.equal(market('list').querySelector('[data-install-market-plugin]').dataset.installMarketPlugin, trial.id)

    pendingReject(new Error('community market catalog unavailable: timeout'))
    await first
    assert.match(market('bridge').textContent, /超时.*本版精选/u)
    assert.equal(market('reload').disabled, false)
    assert.equal(market('total').textContent, '1')

    await vm.runInContext('refreshMarket({ force: true })', context)
    assert.equal(market('total').textContent, '22')
    assert.equal(market('updated').textContent, '2026-11-17')
    assert.equal(market('pagination').hidden, false)
    market('query').value = '@michengai/dsh-im-connect@1.0.53'
    vm.runInContext('renderMarket()', context)
    assert.equal(market('list').children.length, 1)
    assert.equal(market('list').querySelector('[data-install-market-plugin]').dataset.installMarketPlugin, trial.id)
  } finally {
    dom.window.close()
  }
})

test('bundled release plugins expose their original configuration through the native capability catalog', () => {
  const dom = new JSDOM(html, { url: 'https://desktop.invalid' })
  const selected = []
  const context = vm.createContext({ document: dom.window.document, nativePluginGrid: dom.window.document.querySelector('#native-plugin-grid'),
    escapeHtml: value => String(value), activateTab: (...args) => selected.push(args),
  })
  vm.runInContext(section('const NATIVE_PLUGINS =', 'let currentNativeCategory'), context)
  const owners = ['@local/dsh-prompt-pilot', 'dsh-builtin-browser', '@linxin666/dsh-release-plugin-adapter']
  const markup = vm.runInContext('NATIVE_PLUGINS.map(item => nativePluginMarkup(item, { version: "fixture" })).join("")', context)
  dom.window.document.querySelector('#native-plugin-grid').innerHTML = markup
  vm.runInContext(section("nativePluginGrid?.addEventListener('click'", 'nativeSearch?.addEventListener'), context)
  for (const owner of owners) {
    const button = [...dom.window.document.querySelectorAll('[data-open-native-plugin-options]')].find(item => item.dataset.openNativePluginOptions === owner)
    assert.ok(button, `native settings entry for ${owner}`)
    button.click()
    assert.equal(selected.at(-1)[0].id, 'plugin-options-tab')
    assert.equal(selected.at(-1)[3], owner)
  }
  assert.equal(dom.window.document.querySelector('[data-id="pet"]') !== null, true, 'the existing companion remains listed')
  const p2 = dom.window.document.querySelector('[data-id="prompt-customizer"] [data-open-dock-setting="value-mode"]')
  assert.ok(p2, 'P2 configuration links to the existing model advanced page')
  p2.click()
  assert.equal(selected.at(-1)[0].id, 'value-mode-tab')
  assert.equal(selected.at(-1)[2], 'value-mode')
  assert.equal(dom.window.document.querySelector('[data-id="context-memory"] [data-open-dock-setting]'), null, 'M2 remains blocked')
  dom.window.close()
})

test('skill market entry confirms only user navigation and leaves local skills intact on cancel', async () => {
  const dom = new JSDOM(html, { url: 'https://desktop.invalid' })
  const selected = []
  const prompts = []
  let enabled = false
  let canceled = true
  const context = vm.createContext({
    document: dom.window.document, localStorage: dom.window.localStorage,
    tabs: [...dom.window.document.querySelectorAll('[data-tab]')], notify() {},
    window: { dshDesktop: {
      getSkillMarketStatus: async () => ({ enabled, revision: 'fixture-revision' }),
      activateSkillMarket: async revision => { prompts.push(revision); return { enabled: !canceled, canceled } },
      selectDockSetting: async value => selected.push(value),
    } },
  })
  vm.runInContext(section('let settingsRequest = 0', "document.querySelector('#dock-settings-retry').addEventListener"), context)
  await vm.runInContext("activateTab(document.getElementById('skill-market-tab'))", context)
  await tick()
  assert.deepEqual(prompts, [])
  assert.equal(dom.window.document.getElementById('skills').hidden, false)
  await vm.runInContext("activateTab(document.getElementById('skill-market-tab'), false, undefined, undefined, true)", context)
  assert.deepEqual(prompts, ['fixture-revision'])
  assert.equal(selected.includes('skill-market'), false)
  canceled = false
  await vm.runInContext("activateTab(document.getElementById('skill-market-tab'), false, undefined, undefined, true)", context)
  await tick()
  assert.equal(selected.at(-1), 'skill-market')
  assert.equal(dom.window.document.getElementById('skill-market-tab').getAttribute('aria-selected'), 'true')
  assert.equal(dom.window.document.getElementById('skills-local-tab').getAttribute('aria-selected'), 'false')
  enabled = true
  await vm.runInContext("activateTab(document.getElementById('skill-market-tab'))", context)
  assert.equal(prompts.length, 2)
  dom.window.close()
})

test('leaving skills while market status is loading cannot later reopen the market', async () => {
  const dom = new JSDOM(html, { url: 'https://desktop.invalid' })
  const selected = []
  let finish
  const context = vm.createContext({
    document: dom.window.document, localStorage: dom.window.localStorage,
    tabs: [...dom.window.document.querySelectorAll('[data-tab]')], notify() {},
    window: { dshDesktop: {
      getSkillMarketStatus: () => new Promise(resolve => { finish = resolve }),
      activateSkillMarket: () => assert.fail('abandoned navigation must not prompt'),
      selectDockSetting: async value => selected.push(value),
    } },
  })
  vm.runInContext(section('let settingsRequest = 0', "document.querySelector('#dock-settings-retry').addEventListener"), context)
  const opening = vm.runInContext("activateTab(document.getElementById('skill-market-tab'), false, undefined, undefined, true)", context)
  await vm.runInContext("activateTab(document.getElementById('plugins-tab'))", context)
  finish({ enabled: false, revision: 'fixture' })
  await opening
  await tick()
  assert.equal(selected.includes('skill-market'), false)
  assert.equal(dom.window.document.getElementById('plugins').hidden, false)
  dom.window.close()
})

test('restoring an unavailable market falls back to local skills without prompting or losing navigation', async () => {
  const dom = new JSDOM(html, { url: 'https://desktop.invalid' })
  const notices = []
  const context = vm.createContext({
    document: dom.window.document, localStorage: dom.window.localStorage,
    tabs: [...dom.window.document.querySelectorAll('[data-tab]')], notify: message => notices.push(message),
    window: { dshDesktop: {
      getSkillMarketStatus: async () => ({ enabled: true, available: false }),
      activateSkillMarket: () => assert.fail('restoring navigation cannot activate'),
      selectDockSetting: async () => {},
    } },
  })
  vm.runInContext(section('let settingsRequest = 0', "document.querySelector('#dock-settings-retry').addEventListener"), context)
  await vm.runInContext("activateTab(document.getElementById('skill-market-tab'))", context)
  await tick()
  assert.equal(dom.window.document.getElementById('skills-tab').getAttribute('aria-selected'), 'true')
  assert.equal(dom.window.document.getElementById('import-skill').closest('[hidden]'), null)
  assert.match(notices[0], /诊断与恢复/u)
  dom.window.close()
})

test('installed plugin detail keeps the Runtime-owned configuration bridge', async () => {
  const preload = await readFile(new URL('../src/preload-extension.cjs', import.meta.url), 'utf8')
  assert.match(source, /插件自带设置/u)
  assert.match(source, /data-open-plugin-settings/u)
  assert.match(source, /window\.dshDesktop\.openPluginSettings/u)
  assert.match(preload, /extensions:plugin-settings-open/u)
})

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
    window: { dshDesktop: { copyText: async value => { copied.push(value) } } },
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
    window: { dshDesktop: { copyText: async () => { throw failure } } },
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


test('five Dock groups retain every old destination and place settings navigation outside runtime overlay bounds', async () => {
  const dom = new JSDOM(html, { url: 'https://desktop.invalid' })
  const document = dom.window.document
  const selected = []
  const native = []
  const context = vm.createContext({ document, localStorage: dom.window.localStorage,
    tabs: [...document.querySelectorAll('[data-tab]')], notify() {},
    window: { dshDesktop: { selectDockSetting: async value => selected.push(value),
      openNativePage: async value => { native.push(value); return true } } },
  })
  vm.runInContext(section('let settingsRequest = 0', "document.querySelector('#dock-settings-retry').addEventListener"), context)
  const roots = [...document.querySelectorAll('.settings-sidebar > nav:not([data-tab-group]) > button')]
  assert.deepEqual(roots.map(button => button.querySelector('.tab-title').textContent), ['插件', '技能', '外观', '桌面设置', '更多工具'])
  for (const [id, setting, group] of [
    ['control-center', 'control-center', 'more-tools'], ['models', null, 'desktop-settings'], ['models-page', 'models', 'desktop-settings'],
    ['value-mode', 'value-mode', 'desktop-settings'], ['personal-prompt', 'personal-prompt', 'desktop-settings'],
    ['describe-image', 'describe-image', 'desktop-settings'], ['usage', 'usage', 'desktop-settings'],
    ['sessions', 'sessions', 'desktop-settings'], ['plugins-hub', null, 'plugins'],
    ['plugin-options', 'plugin-options', 'plugins'], ['skills', null, 'skills'],
    ['qqbot', null, 'more-tools'], ['appearance', 'appearance', 'appearance'],
    ['particle-theme', 'particle-theme', 'appearance'], ['backup', null, 'desktop-settings'],
    ['recovery', null, 'desktop-settings'], ['agent-team', 'agent-team', 'more-tools'], ['shared-browser', 'shared-browser', 'more-tools'],
    ['win-control', 'win-control', 'more-tools'], ['fast-ops', 'fast-ops', 'more-tools'], ['im-hub', 'im-hub', 'more-tools'],
  ]) {
    await vm.runInContext(`activateTab(document.getElementById('${id}-tab'))`, context)
    await tick()
    assert.equal(selected.at(-1), setting, `${id} must reach the original setting`)
    const entry = document.getElementById(`${id}-tab`)
    assert.equal(entry.closest('[hidden]'), null, `${id} navigation remains visible`)
    assert.ok(entry.closest('.settings-sidebar'), `${id} must be outside the runtime view`)
    assert.ok(roots.find(button => button.dataset.group === group).classList.contains('active'), `${id} selects its primary group`)
  }
  const embeddedCalls = selected.length
  await vm.runInContext("activateTab(document.getElementById('models-page-tab'), false, undefined, undefined, true)", context)
  await vm.runInContext("activateTab(document.getElementById('market-tab'), false, undefined, undefined, true)", context)
  vm.runInContext(section('function nativeIconSvg(', 'let currentNativeCategory'), context)
  context.escapeHtml = value => String(value)
  const grid = document.createElement('div')
  document.body.append(grid)
  context.nativePluginGrid = grid
  vm.runInContext(section("nativePluginGrid?.addEventListener('click'", "nativeSearch?.addEventListener('input'"), context)
  for (const id of ['data-location', 'agent-inbox', 'llm-antigravity']) {
    assert.doesNotThrow(() => assertNativeDockDestination(id))
    context.item = { id, packageName: id, features: [] }
    grid.innerHTML = vm.runInContext('nativePluginMarkup(item)', context)
    const action = grid.querySelector('button[data-open-dock-setting]')
    assert.equal(action?.textContent, '打开设置')
    assert.equal(action.dataset.openDockSetting, id)
    action.click()
    await tick()
  }
  assert.deepEqual(native, ['models', 'workshop', 'data-location', 'agent-inbox', 'llm-antigravity'])
  assert.equal(selected.length, embeddedCalls, 'Successful native shortcuts do not mount duplicate embedded settings')
  dom.window.close()
})

test('optional context and advanced prompt capabilities disclose scope and pending compatibility', () => {
  assert.match(source, /packageName: 'dsh-context'/u)
  assert.match(source, /0\.87\.1/u)
  assert.match(source, /packageName: 'dsh-context-memory'/u)
  assert.match(source, /1\.2\.0，默认关闭/u)
  assert.match(source, /本轮暂停新启用/u)
  assert.match(source, /项目经验可能进入另一用户的模型输入/u)
  assert.match(source, /已有配置和记忆文件保留/u)
  assert.match(source, /从项目会话提取经验候选并保留历史/u)
  assert.match(source, /遗忘不同于 M1 的删除/u)
  assert.match(source, /旧 Cordis peer，联合模型输入与隔离验收仍待完成/u)
  assert.match(source, /packageName: 'dsh-prompt-customizer'/u)
  assert.match(source, /2\.2\.0，默认关闭/u)
  assert.match(source, /不改变普通回复偏好/u)
})


test('legacy shortcut and settings-open requests select their new containing groups', async () => {
  const dom = new JSDOM(html, { url: 'https://desktop.invalid' })
  const document = dom.window.document
  const selected = []
  let navigate
  const context = vm.createContext({ document, localStorage: dom.window.localStorage,
    tabs: [...document.querySelectorAll('[data-tab]')], notify() {},
    window: { dshDesktop: {
      selectDockSetting: async value => selected.push(value),
      onExtensionNavigate: callback => { navigate = callback; return () => {} },
    } },
  })
  vm.runInContext(section('let settingsRequest = 0', "document.querySelector('#dock-settings-retry').addEventListener"), context)
  vm.runInContext(section('for (const tab of tabs)', 'const searchEntries ='), context)
  vm.runInContext(section('const searchEntries =', "nativePluginGrid?.addEventListener('click'"), context)
  vm.runInContext(section('const removeNavigationListener =', 'const removePresetPreviewListener ='), context)
  for (const [setting, root] of [['value-mode', 'models'], ['control-center', 'control-center'], ['models', 'models'], ['usage', 'models'], ['plugin-options', 'plugins-hub']]) {
    const previousCalls = selected.length
    navigate({ setting })
    await tick()
    assert.equal(selected.length, previousCalls + 1, `${setting} opens exactly once`)
    assert.equal(selected.at(-1), setting)
    assert.equal(document.getElementById(`${root}-tab`).getAttribute('aria-selected'), 'true')
    assert.equal(document.querySelector(`[data-setting="${setting}"]`).closest('[hidden]'), null)
  }
  dom.window.close()
})

test('feature search hides every navigation and restores only the primary plus selected secondary groups', async () => {
  const dom = new JSDOM(html, { url: 'https://desktop.invalid' })
  const { document } = dom.window
  const context = vm.createContext({ document, localStorage: dom.window.localStorage,
    tabs: [...document.querySelectorAll('[data-tab]')], notify() {},
    dockSearch: document.querySelector('#dock-search'), searchResults: document.querySelector('#dock-search-results'),
    window: { dshDesktop: { selectDockSetting: async () => {} } },
  })
  vm.runInContext(section('let settingsRequest = 0', "document.querySelector('#dock-settings-retry').addEventListener"), context)
  await vm.runInContext("activateTab(document.getElementById('models-tab'))", context)
  vm.runInContext(section('const searchEntries =', "nativePluginGrid?.addEventListener('click'"), context)
  const search = document.querySelector('#dock-search')
  for (const query of ['nbfast', 'fastops', 'fast-ops', 'Fast Ops']) {
    search.value = query
    search.dispatchEvent(new dom.window.Event('input'))
    const results = [...document.querySelectorAll('#dock-search-results button')]
    assert.ok(results.some(result => result.textContent.includes('nbfast')), `${query} must find nbfast`)
  }
  search.value = '记忆'
  search.dispatchEvent(new dom.window.Event('input'))
  assert.equal([...document.querySelectorAll('.settings-sidebar > nav')].filter(nav => !nav.hidden).length, 0)
  search.value = ''
  search.dispatchEvent(new dom.window.Event('input'))
  const visible = [...document.querySelectorAll('.settings-sidebar > nav')].filter(nav => !nav.hidden)
  assert.equal(visible.length, 3, 'one primary and both Desktop settings secondary groups return')
  assert.equal(visible.filter(nav => nav.dataset.tabGroup).every(nav => nav.dataset.tabGroup === 'desktop-settings'), true)
  search.value = '外观与动效'
  search.dispatchEvent(new dom.window.Event('input'))
  document.querySelector('#dock-search-results button').click()
  await tick()
  const after = [...document.querySelectorAll('.settings-sidebar > nav')].filter(nav => !nav.hidden)
  assert.equal(after.length, 2)
  assert.equal(after.find(nav => nav.dataset.tabGroup)?.dataset.tabGroup, 'appearance')
  assert.equal(document.querySelector('#particle-theme-tab').getAttribute('aria-selected'), 'true')
  dom.window.close()
})

test('Dock search shows category paths and opens exact settings and tools with the keyboard', async () => {
  const dom = new JSDOM(html, { url: 'https://desktop.invalid' })
  const { document } = dom.window
  const settings = [], tools = []
  const context = vm.createContext({ document, localStorage: dom.window.localStorage,
    tabs: [...document.querySelectorAll('[data-tab]')], notify() {},
    window: { dshDesktop: { selectDockSetting: async setting => settings.push(setting), openDesktopTool: async tool => tools.push(tool) } },
  })
  vm.runInContext(section('let settingsRequest = 0', 'const searchEntries ='), context)
  vm.runInContext(section('const searchEntries =', "nativePluginGrid?.addEventListener('click'"), context)
  const input = document.querySelector('#dock-search')
  const results = document.querySelector('#dock-search-results')
  const search = value => { input.value = value; input.dispatchEvent(new dom.window.Event('input')) }
  const press = (element, key) => element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  await vm.runInContext("activateTab(document.getElementById('skills-tab'))", context)
  search('成本 模型')
  const settingsResult = results.querySelector('button')
  assert.match(document.getElementById(settingsResult.getAttribute('aria-labelledby')).textContent, /模型高级/u)
  assert.equal(document.getElementById(settingsResult.getAttribute('aria-describedby')).textContent, '桌面设置')
  press(input, 'Enter')
  await tick()
  assert.equal(settings.at(-1), 'value-mode')
  assert.equal(document.activeElement.id, 'value-mode-tab')

  search('任务 看板')
  press(input, 'ArrowDown')
  const toolResult = document.activeElement
  assert.match(toolResult.textContent, /任务看板.*更多工具/u)
  press(toolResult, 'ArrowUp')
  assert.equal(document.activeElement, input)
  press(input, 'Enter')
  await tick()
  assert.deepEqual(tools, ['task-board'])

  search('zzz没有匹配项')
  assert.match(document.querySelector('#dock-search-status').textContent, /没有匹配/u)
  press(input, 'Escape')
  assert.equal(input.value, '')
  assert.equal(results.hidden, true)
  assert.equal(input.getAttribute('aria-controls'), results.id)
  dom.window.close()
})

test('retry after opening memory from Dock search preserves the exact setting', async () => {
  const dom = new JSDOM(html, { url: 'https://desktop.invalid' })
  const { document } = dom.window
  const selected = []
  const context = vm.createContext({ document, localStorage: dom.window.localStorage,
    tabs: [...document.querySelectorAll('[data-tab]')], notify() {},
    window: { dshDesktop: { selectDockSetting: async setting => {
      selected.push(setting)
      if (selected.length === 1) throw new Error('fixture unavailable')
    } } },
  })
  vm.runInContext(section('let settingsRequest = 0', 'const searchEntries ='), context)
  vm.runInContext(section('const searchEntries =', "nativePluginGrid?.addEventListener('click'"), context)
  const input = document.querySelector('#dock-search')
  input.value = '记忆'
  input.dispatchEvent(new dom.window.Event('input'))
  document.querySelector('#dock-search-results button').click()
  await tick()
  const retry = document.querySelector('#dock-settings-retry')
  assert.equal(retry.hidden, false)
  retry.click()
  await tick()
  assert.deepEqual(selected, ['memory', 'memory'])
  assert.equal(retry.hidden, true)
  dom.window.close()
})


test('More tools opens task board and SSH through the fixed Desktop bridge and reports failures', async () => {
  const dom = new JSDOM(html, { url: 'https://desktop.invalid' }), calls = [], messages = []
  const context = vm.createContext({ document: dom.window.document,
    window: { dshDesktop: { openDesktopTool: async tool => { calls.push(tool); if (tool === 'ssh') throw new Error('fixture unavailable') } } },
    notify: (...args) => messages.push(args),
  })
  const board = dom.window.document.querySelector('#task-board-tool'), ssh = dom.window.document.querySelector('#ssh-tool')
  assert.ok(board && ssh)
  assert.equal(board.closest('nav').dataset.tabGroup, 'more-tools')
  assert.equal(ssh.closest('nav').dataset.tabGroup, 'more-tools')
  vm.runInContext(section("for (const entry of document.querySelectorAll('[data-desktop-tool]'))", 'for (const tab of tabs)'), context)
  board.click(); await tick(); ssh.click(); await tick()
  assert.deepEqual(calls, ['task-board', 'ssh'])
  assert.equal(messages.at(-1)[1], true)
  assert.equal(ssh.disabled, false, 'failed navigation remains retryable')
  dom.window.close()
})

test('activateTab marks body while dock-settings WebContentsView is active so toast remains visible', async () => {
  const dom = new JSDOM(html, { url: 'https://desktop.invalid' })
  const { document } = dom.window
  const context = vm.createContext({
    document,
    localStorage: dom.window.localStorage,
    tabs: [...document.querySelectorAll('[data-tab]')],
    notify() {},
    window: { dshDesktop: { selectDockSetting: async () => {} } },
  })
  vm.runInContext(section('let settingsRequest = 0', 'const searchEntries ='), context)
  await vm.runInContext("activateTab(document.getElementById('agent-team-tab'))", context)
  await tick()
  assert.equal(document.body.dataset.dockSettingsViewVisible, 'true')
  await vm.runInContext("activateTab(document.getElementById('plugins-tab'))", context)
  await tick()
  assert.equal(document.body.dataset.dockSettingsViewVisible, undefined)
  dom.window.close()
})
