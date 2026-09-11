import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { networkTiming, profileSource, profileComboSource, profileComboPosition, profileUrlShape, profileUrlAliases, rpcOutcome } from './history-performance-diagnostics.mjs'
import { resolveRuntimePackages } from '../src/profile.mjs'
import { installHistoryFlowLayoutControl } from './history-flow-layout-control.mjs'

// Explicit private input only: never commit a user history as a public fixture.
// No model submission, raw error, conversation text, title, or screenshot output.
assert.ok(process.argv[2], 'provide an explicit legacy session.jsonl.zstd input')
const input = resolve(process.argv[2])
const output = process.argv[3] ? resolve(process.argv[3]) : undefined
const navigateHistory = process.argv.includes('--navigate-history')
const profileNavigation = process.argv.includes('--profile-navigation')
const profileHostReads = process.argv.includes('--profile-host-reads')
const withoutLayoutAddons = process.argv.includes('--without-layout-addons')
const withoutLayoutSettings = process.argv.includes('--without-layout-settings')
const blockFlowControl = process.argv.includes('--block-flow-control')
const containFlowControl = process.argv.includes('--contain-flow-control')
const noScrollAnchorControl = process.argv.includes('--no-scroll-anchor-control')
const settleTurnControl = process.argv.includes('--settle-turn-control')
assert.ok(!withoutLayoutSettings || withoutLayoutAddons, 'settings control requires the layout-addon control')
// Diagnostic control only: no product manifest or installed profile is changed.
const layoutAddons = [
  { id: 'ui-web-ui-compat', name: '@linxin666/dsh-web-ui-all' },
  { id: 'ui-dsh-aionui-panel', name: '@linxin666/dsh-client-ui-aionui-panel' },
  { id: 'particle-theme', name: '@linxin666/dsh-particle-theme' },
  { id: 'pet', name: '@linxin666/dsh-pet' },
]
if (withoutLayoutSettings) layoutAddons.push({ id: 'ui-web-ui-settings', name: '@linxin666/dsh-client-ui-web-ui-settings' })
const hostProbeEpoch = Date.now()
const profileSources = profileNavigation ? [...resolveRuntimePackages()].map(([label, root]) => ({
  label, markers: [label, root.replaceAll('\\', '/')],
})).sort((left, right) => right.label.length - left.label.length) : []
const source = await readFile(input)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const sourceHash = hash(source)
const decoded = zstdDecompressSync(source, { info: true, maxOutputLength: 65536 })
const header = JSON.parse(decoded.buffer.toString('utf8'))
assert.equal(header.version, 0, 'this verifier requires a v0 history')
const consumed = decoded.engine.bytesWritten
assert.ok(consumed > 0 && consumed < source.length)
assert.equal(source.readUInt32LE(consumed), 0xfd2fb528, 'body must begin on a separate complete Zstd frame')
const parent = await realpath(tmpdir())
const temporary = await realpath(await mkdtemp(join(parent, 'dsh-large-history-ui-')))
const within = relative(parent, temporary)
assert.ok(within && !within.startsWith('..') && !isAbsolute(within))
const appDir = resolve(import.meta.dirname, '..')
const packagedExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
  ? await realpath(resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE)) : undefined
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const workspacePath = join(temporary, 'history-workspace')
const require = createRequire(await realpath(join(appDir, 'node_modules/@deepseek-ai/dsh-base/package.json')))
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')))
const { default: Backend } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-session-persistence-jsonl')))
const report = { complete: false, sourceBytes: source.length, runs: [] }
report.applicationTarget = packagedExecutable === undefined ? 'source' : 'packaged-executable'
if (packagedExecutable !== undefined) {
  report.applicationArchiveSha256 = hash(await readFile(join(dirname(packagedExecutable), 'resources', 'app.asar')))
}
report.control = withoutLayoutSettings ? 'without-layout-addons-and-settings' : withoutLayoutAddons ? 'without-four-layout-addons' : 'full-desktop'
report.blockFlowControl = blockFlowControl
report.containFlowControl = containFlowControl
report.noScrollAnchorControl = noScrollAnchorControl
report.settleTurnControl = settleTurnControl
let app
let stage = 'seed'
let pageErrors = 0
let activePage
let renderedTailHash
let activeNavigationTurn
let profiler
let profileForAttribution
const requestStarts = new WeakMap()
const navigationRequests = new Map()
const navigationPages = []
const navigationPageRequests = []
const navigationAttachments = []
const navigationAttachmentRequests = []
async function readProfileCombos(profile) {
  const combos = new Map()
  // Read only the isolated Host's published static combo maps, after CPU
  // sampling stops. Their sourcesContent remains in memory and is not output.
  const webManifest = JSON.parse(await readFile(join(appDir, 'node_modules/@deepseek-ai/dsh-web-app/package.json'), 'utf8'))
  const labels = new Set([...profileSources.map(source => source.label), ...Object.keys(webManifest.dependencies ?? {})])
  const used = new Set(profile.nodes.map(node => node.callFrame.url))
  const origin = new URL(activePage.url()).origin
  const batches = await activePage.evaluate(() => (window.__DSH_BOOT__?.batches ?? []).slice(0, 32)
    .map(batch => ({ url: batch.url, entries: batch.entries })))
  const artifactUrls = batches.filter(batch => typeof batch.url === 'string' && batch.url.length <= 4096)
    .map(batch => new URL(batch.url, origin).href)
  for (const batch of batches) {
    if (typeof batch.url !== 'string' || batch.url.length > 4096 || !Array.isArray(batch.entries) || batch.entries.length > 256) continue
    const url = new URL(batch.url, origin)
    if (url.origin !== origin || url.pathname !== '/plugins/' || !url.search.startsWith('??')) continue
    const aliases = profileUrlAliases(used, url.href, artifactUrls)
    if (!aliases.length) continue
    const mapUrl = url.href.replaceAll('/client.js', '/client.js.map')
    let response
    try {
      response = await activePage.request.get(mapUrl, { timeout: 10000, maxRedirects: 0 })
      if (!response.ok()) continue
      const map = await response.json()
      if (map?.version !== 3 || !Array.isArray(map.sections) || map.sections.length !== batch.entries.length) continue
      const sections = map.sections.map((section, index) => ({ line: section?.offset?.line, column: section?.offset?.column,
        label: labels.has(batch.entries[index]) ? batch.entries[index] : '(unattributed)' }))
      if (!sections.every((section, index) => Number.isSafeInteger(section.line) && section.line >= 0
        && Number.isSafeInteger(section.column) && section.column >= 0 && (index === 0
          || section.line > sections[index - 1].line
          || (section.line === sections[index - 1].line && section.column > sections[index - 1].column)))) continue
      for (const alias of aliases) combos.set(alias, sections)
    } catch { /* Missing diagnostic maps never change the navigation result. */ }
    finally { await response?.dispose() }
  }
  return combos
}
async function finalizeProfileSources() {
  const profile = profileForAttribution
  profileForAttribution = undefined
  if (!profile || !report.navigationProfile) return
  const combos = await readProfileCombos(profile)
  const frames = new Map(profile.nodes.map(node => [node.id, node.callFrame]))
  const sources = new Map(), functions = new Map(), unmapped = new Map(), positions = new Map()
  for (let index = 0; index < (profile.samples?.length ?? 0); index++) {
    const frame = frames.get(profile.samples[index])
    const rawName = frame?.functionName || '(anonymous)'
    const name = /^[\w$<> .:[\]()-]{1,100}$/u.test(rawName) ? rawName : '(anonymous)'
    const source = profileComboSource(frame, combos) ?? profileSource(frame?.url, profileSources)
    const duration = profile.timeDeltas?.[index] ?? 0
    const position = profileComboPosition(frame, combos)
    if (position && position.label !== '(unattributed)') {
      const key = JSON.stringify(position)
      positions.set(key, (positions.get(key) ?? 0) + duration)
    }
    if (source === '(unattributed)') {
      const shape = JSON.stringify(profileUrlShape(frame?.url))
      unmapped.set(shape, (unmapped.get(shape) ?? 0) + duration)
    }
    sources.set(source, (sources.get(source) ?? 0) + duration)
    const key = `${source}: ${name}`
    functions.set(key, (functions.get(key) ?? 0) + duration)
  }
  const top = (values, limit) => [...values].sort((a, b) => b[1] - a[1]).slice(0, limit)
    .map(([name, us]) => ({ name, ms: Math.round(us / 1000) }))
  Object.assign(report.navigationProfile, { mappedComboCount: combos.size,
    sourceSelfTime: top(sources, 100), sourceFunctions: top(functions, 30),
    generatedHotspots: top(positions, 30).map(({ name, ms }) => ({ ...JSON.parse(name), ms })),
    unmappedUrlShapes: top(unmapped, 20).map(({ name, ms }) => ({ ...JSON.parse(name), ms })) })
}
async function finishProfiler() {
  if (!profiler) return
  const session = profiler
  profiler = undefined
  try {
    const { profile } = await session.send('Profiler.stop')
    profileForAttribution = profile
    const nodes = new Map(profile.nodes.map(node => [node.id, node]))
    const parents = new Map()
    for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id)
    const totals = new Map()
    const sourceTotals = new Map()
    const sourceFunctions = new Map()
    const callers = new Map()
    const safeName = raw => /^[\w$<> .:[\]()-]{1,100}$/u.test(raw || '') ? raw : '(anonymous)'
    let sampledUs = 0
    for (let index = 0; index < (profile.samples?.length ?? 0); index++) {
      const frame = nodes.get(profile.samples[index])?.callFrame
      const raw = frame?.functionName || '(anonymous)'
      const name = safeName(raw)
      const duration = profile.timeDeltas?.[index] ?? 0
      sampledUs += duration
      totals.set(name, (totals.get(name) ?? 0) + duration)
      const ownerSource = profileSource(frame?.url, profileSources)
      sourceTotals.set(ownerSource, (sourceTotals.get(ownerSource) ?? 0) + duration)
      const sourceFunction = `${ownerSource}: ${name}`
      sourceFunctions.set(sourceFunction, (sourceFunctions.get(sourceFunction) ?? 0) + duration)
      if (['querySelectorAll', 'querySelector', 'getClientRects', 'getBoundingClientRect', 'isVisibleControl', 'elementsFromPoint'].includes(name)) {
        const parent = nodes.get(parents.get(profile.samples[index]))
        const grandparent = nodes.get(parents.get(parent?.id))
        const owner = `${name} <- ${safeName(parent?.callFrame.functionName)} <- ${safeName(grandparent?.callFrame.functionName)}`
        callers.set(owner, (callers.get(owner) ?? 0) + duration)
      }
    }
    report.navigationProfile = { sampledMs: Math.round(sampledUs / 1000),
      selfTime: [...totals].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([name, us]) => ({ name, ms: Math.round(us / 1000) })),
      sourceSelfTime: [...sourceTotals].sort((a, b) => b[1] - a[1]).map(([name, us]) => ({ name, ms: Math.round(us / 1000) })),
      sourceFunctions: [...sourceFunctions].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([name, us]) => ({ name, ms: Math.round(us / 1000) })),
      domCallers: [...callers].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([name, us]) => ({ name, ms: Math.round(us / 1000) })),
      requests: [...navigationRequests].map(([operation, value]) => ({ operation, ...value })),
      pages: navigationPages, attachments: navigationAttachments }
  } finally { await session.detach().catch(() => {}) }
}
const stamp = () => performance.now()
async function rpc(page, method, request) {
  const result = await page.evaluate(async ({ method, request, id }) => {
    const endpoint = method.replace('.', '/')
    const response = await fetch(`/api/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: id, method: endpoint,
        payload: { args: { [method === 'session.list' ? '_request' : 'request']: request } } }) })
    return { status: response.status, body: await response.json() }
  }, { method, request, id: randomUUID() })
  assert.equal(result.status, 200, 'local RPC HTTP failure')
  assert.equal(result.body?.result?.ok, true, 'local RPC application failure')
  return result.body.result.value
}
async function launch() {
  await seedPrimaryRuntimePermissionForTest({ userData })
  const start = stamp()
  app = await electron.launch({ executablePath: packagedExecutable ?? electronPath,
    args: packagedExecutable === undefined ? [join(appDir, 'src/main.mjs')] : [], cwd: appDir,
    env: { ...process.env, DSH_DESKTOP_USER_DATA: userData, DSH_HOME: dshHome,
      DSH_HISTORY_HOST_PROBE: profileHostReads ? '1' : '',
      DSH_AGENTS_HOME: join(userData, 'agents'), DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1', DSH_DESKTOP_VERIFY_UPDATER: '0' } })
  await app.context().route('**/*', route => {
    const url = new URL(route.request().url())
    return ['http:', 'https:'].includes(url.protocol) && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ? route.abort() : route.continue()
  })
  await useChineseFixtureLocale(app)
  stage = 'first-window'
  const page = await app.firstWindow()
  activePage = page
  page.on('pageerror', () => { pageErrors++ })
  page.on('request', request => {
    if (!profiler) return
    const path = new URL(request.url()).pathname
    const match = path.match(/^\/api\/([a-z-]+)\/([a-zA-Z-]+)$/u)
    if (match) {
      const operation = `${match[1]}/${match[2]}`
      let progress
      if (operation === 'session/page' && navigationPages.length < 64) {
        // Request metadata only: never record the addressed session or response body.
        try {
          const args = request.postDataJSON()?.payload?.args
          const params = args?.request ?? args?._request
          progress = { beforeSeq: Number.isSafeInteger(params?.beforeSeq) ? params.beforeSeq : null,
            maxMessages: Number.isSafeInteger(params?.maxMessages) ? params.maxMessages : null, completed: false }
          navigationPages.push(progress)
          navigationPageRequests.push({ request, progress })
        } catch { /* A non-JSON request contributes timing only. */ }
      }
      if (operation === 'session/attachment' && navigationAttachments.length < 128) {
        progress = { completed: false }
        navigationAttachments.push(progress)
        navigationAttachmentRequests.push({ request, progress })
      }
      requestStarts.set(request, { operation, time: stamp(), progress })
    }
  })
  page.on('requestfinished', request => {
    const started = requestStarts.get(request)
    if (!started) return
    if (started.progress) {
      started.progress.completed = true
      Object.assign(started.progress, networkTiming(request.timing()))
    }
    const previous = navigationRequests.get(started.operation) ?? { count: 0, totalMs: 0, maxMs: 0 }
    const elapsed = Math.round(stamp() - started.time)
    navigationRequests.set(started.operation, { count: previous.count + 1, totalMs: previous.totalMs + elapsed,
      maxMs: Math.max(previous.maxMs, elapsed) })
  })
  page.setDefaultTimeout(10000)
  stage = 'runtime-url'
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 120000 })
  stage = 'window-chrome'
  await page.locator('#dsh-desktop-window-chrome').waitFor({ timeout: 120000 })
  if (blockFlowControl) await page.addStyleTag({ content: '[data-conversation-scroll] [data-chat-flow] { display: flow-root !important; }' })
  if (containFlowControl) await page.addStyleTag({ content: '[data-conversation-scroll] [data-chat-flow] > [data-chat-flow-kind]:not([hidden]):not(:empty) { content-visibility: auto; contain-intrinsic-block-size: auto 80px; }' })
  if (noScrollAnchorControl) await page.addStyleTag({ content: '[data-conversation-scroll] { overflow-anchor: none; }' })
  if (settleTurnControl) await page.evaluate(installHistoryFlowLayoutControl)
  for (let attempt = 0; attempt < 12; attempt++) {
    const intro = page.getByRole('dialog').filter({ hasText: /内测声明|插件、技能和桌面核心功能在这里/u })
    const proceed = intro.getByRole('button', { name: /^(继续|Continue)$/u }).last()
    const star = page.locator('#dsh-desktop-star-prompt[data-open="true"]').getByRole('button', { name: '先继续使用', exact: true })
    if (await proceed.isVisible().catch(() => false)) {
      stage = 'dismiss-intro'; await proceed.click()
      stage = 'wait-intro-hidden'; await intro.waitFor({ state: 'hidden' })
    } else if (await star.isVisible().catch(() => false)) {
      stage = 'dismiss-star'; await star.click()
      stage = 'wait-star-hidden'; await page.locator('#dsh-desktop-star-prompt').waitFor({ state: 'hidden' })
    }
    await page.waitForTimeout(250)
  }
  return { page, startupMs: Math.round(stamp() - start) }
}
try {
  await mkdir(workspacePath, { recursive: true })
  const isolatedHeader = { ...header, cwd: workspacePath }
  const ctx = new Context()
  let legacy
  try {
    await ctx.plugin(Backend, { root: join(dshHome, 'sessions'), compression: 'zstd' })
    legacy = join(dirname(ctx.sessionPersistence.locate(isolatedHeader).path), 'session.jsonl.zstd')
    await mkdir(dirname(legacy), { recursive: true })
  } finally { await ctx.fiber.dispose() }
  // Replace only the header's cwd; retain every compressed body byte exactly.
  const copy = Buffer.concat([zstdCompressSync(Buffer.from(JSON.stringify(isolatedHeader) + '\n')), source.subarray(consumed)])
  await writeFile(legacy, copy, { flag: 'wx' })
  const copyHash = hash(copy)
  if (profileHostReads || withoutLayoutAddons) {
    // This patch lives only in the validated disposable Home; the main
    // Desktop profile and SDK source files are never edited.
    const patch = profileHostReads ? [{ insert: [{ id: 'isolated-history-host-probe',
      name: pathToFileURL(join(import.meta.dirname, 'history-host-probe.mjs')).href,
      config: { expectedHome: dshHome, epochMs: hostProbeEpoch } }] }] : []
    if (withoutLayoutAddons) patch.push(...layoutAddons.map(({ id, name }) => ({ id, name, disabled: true })))
    await writeFile(join(dshHome, 'cordis.patch.yml'), JSON.stringify(patch), { flag: 'wx' })
  }
  for (let run = 0; run < 2; run++) {
    stage = `launch-${run + 1}`
    const { page, startupMs } = await launch()
    if (withoutLayoutAddons) {
      stage = 'verify-layout-control'
      const entries = await page.evaluate(() => (window.__DSH_BOOT__?.batches ?? []).flatMap(batch => batch.entries ?? []))
      assert.ok(entries.includes('@deepseek-ai/dsh-client-ui-chat'), 'native chat must remain active in the control')
      report.excludedLayoutAddons = layoutAddons.map(({ name }) => ({ name, absent: !entries.includes(name) }))
      assert.ok(report.excludedLayoutAddons.every(item => item.absent), 'all selected layout addons must actually be absent')
      if (withoutLayoutSettings) {
        report.particleClientAbsent = await page.evaluate(() => window.__dshParticleThemeClientInstalled !== true
          && document.querySelector('canvas[data-dsh-particle-theme]') === null)
        assert.equal(report.particleClientAbsent, true, 'the settings compatibility installer must also be inactive')
      }
    }
    if (run === 0) await rpc(page, 'workspace.create', { path: workspacePath })
    stage = `list-${run + 1}`
    const listStart = stamp()
    const list = await rpc(page, 'session.list', {})
    report.listDiagnostic = { count: list.items?.length, keys: Object.keys(list),
      sessionKeys: list.items?.[0] ? Object.keys(list.items[0]) : [],
      workspaceMatches: list.items?.filter(item => item.cwd === workspacePath).length }
    const summary = list.items.find(item => (item.id ?? item.sessionId) === header.id)
    stage = `locate-listed-history-${run + 1}`
    assert.ok(summary, 'legacy history must remain listed')
    const listMs = Math.round(stamp() - listStart)
    const group = page.getByRole('treeitem').filter({ hasText: 'history-workspace' }).first()
    stage = `expand-workspace-${run + 1}`
    await group.waitFor()
    if (await group.getAttribute('aria-expanded') === 'false') await group.click()
    const title = summary.displayTitle || summary.title || summary.projections?.values?.title
    // Cold legacy summaries may not yet have a projected title. The UI uses
    // the workspace label until observation has hydrated that projection.
    const row = title ? page.getByRole('treeitem').filter({ hasText: title }).last()
      : page.locator('[role="treeitem"][aria-selected="false"]').filter({ hasText: 'history-workspace' }).first()
    stage = `open-${run + 1}`
    await page.evaluate(() => {
      window.historyUIProbe = { tasks: 0, maxTaskMs: 0 }
      new PerformanceObserver(list => { for (const task of list.getEntries()) {
        window.historyUIProbe.tasks++; window.historyUIProbe.maxTaskMs = Math.max(window.historyUIProbe.maxTaskMs, task.duration)
      } }).observe({ type: 'longtask', buffered: false })
    })
    const initiallyRenderedUsers = await page.locator('[data-chat-flow-kind="user"]').count()
    const openStart = stamp()
    stage = `click-history-${run + 1}`
    // A restart can restore the selected history before the test reaches the
    // tree. Do not search for an unselected row in that case; the tail hash
    // below verifies that the automatically restored content is this history.
    if (initiallyRenderedUsers === 0) await row.click()
    stage = `wait-history-${run + 1}`
    await page.waitForTimeout(500)
    const loadingFeedback = await page.evaluate(() => ({
      progressCount: document.querySelectorAll('[role="progressbar"], [role="status"], [aria-busy="true"]').length,
      hasLoadingText: /载入历史|正在加载|正在恢复|加载历史|Loading|Restoring/u.test(document.querySelector('[data-pane="conversation"]')?.textContent || ''),
      usersAfterHalfSecond: document.querySelectorAll('[data-chat-flow-kind="user"]').length,
    }))
    await page.locator('[data-chat-flow-kind="user"]').first().waitFor({ timeout: 120000 })
    const firstMessageMs = Math.round(stamp() - openStart)
    stage = `interact-${run + 1}`
    const settingsStart = stamp()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.locator('[role="dialog"].dsh-desktop-settings-window:visible').waitFor()
    const settingsMs = Math.round(stamp() - settingsStart)
    await page.keyboard.press('Escape')
    const tail = await page.locator('[data-chat-flow-kind="user"]').evaluateAll(nodes => nodes.slice(-5).map(node => node.textContent))
    const tailHash = hash(JSON.stringify(tail))
    if (run === 0) renderedTailHash = tailHash
    else assert.equal(tailHash, renderedTailHash, 'restored visible recent user messages must remain identical')
    const metrics = await page.evaluate(() => ({ renderedUsers: document.querySelectorAll('[data-chat-flow-kind="user"]').length,
      renderedFlows: document.querySelectorAll('[data-chat-flow-kind]').length, domNodes: document.querySelectorAll('*').length,
      heapBytes: performance.memory?.usedJSHeapSize, ...window.historyUIProbe }))
    const memory = await app.evaluate(({ app }) => app.getAppMetrics().reduce((sum, item) => sum + item.memory.workingSetSize * 1024, 0))
    report.runs.push({ startupMs, listMs, initiallyRenderedUsers, firstMessageMs, settingsMs, loadingFeedback,
      ...metrics, electronWorkingSetBytes: memory })
    if (navigateHistory && run === 0) {
      stage = 'load-earlier'
      const earliestTurn = () => page.locator('[data-chat-turn]').evaluateAll(nodes => Math.min(...nodes.map(node => Number(node.getAttribute('data-chat-turn'))).filter(turn => Number.isSafeInteger(turn) && turn > 0)))
      const before = await earliestTurn()
      assert.ok(Number.isFinite(before) && before > 1, 'large history starts with an incomplete recent window')
      const earlier = page.getByRole('button', { name: '加载更早', exact: true })
      const earlierStart = stamp()
      await earlier.click()
      await page.waitForFunction(previous => [...document.querySelectorAll('[data-chat-turn]')]
        .some(node => Number(node.getAttribute('data-chat-turn')) > 0 && Number(node.getAttribute('data-chat-turn')) < previous), before, { timeout: 60000, polling: 100 })
      const loadEarlierMs = Math.round(stamp() - earlierStart)
      const after = await earliestTurn()
      report.navigation = { beforeEarliestTurn: before, afterEarliestTurn: after, loadEarlierMs, jumps: [] }
      await (await app.browserWindow(page)).evaluate(window => window.setSize(1700, 820))
      const rail = page.getByRole('navigation', { name: '轮次导航', exact: true })
      await rail.waitFor()
      const turns = await rail.getByRole('button').evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('aria-label')?.match(/第 (\d+) 轮/u)?.[1])).filter(Number.isFinite))
      assert.ok(turns.length > 2, 'real history must expose all native turn targets')
      const selected = [...new Set([turns[0], turns[Math.floor(turns.length / 2)], turns.at(-1)])]
      report.navigation.totalTurns = turns.length
      const jumps = report.navigation.jumps
      if (profileNavigation) {
        profiler = await app.context().newCDPSession(page)
        await profiler.send('Profiler.enable')
        await profiler.send('Profiler.start')
      }
      for (const turn of selected) {
        activeNavigationTurn = turn
        stage = `navigate-history-${turn === turns[0] ? 'first' : turn === turns.at(-1) ? 'last' : 'middle'}`
        const button = rail.getByRole('button', { name: new RegExp(`^(?:加载并)?跳转到第 ${turn} 轮$`, 'u') })
        const jumpStart = stamp()
        if (profileHostReads && report.hostNavigationStartMs === undefined) report.hostNavigationStartMs = Date.now() - hostProbeEpoch
        await button.focus()
        await button.press('Enter')
        await page.waitForFunction(target => {
          const nav = document.querySelector('nav[aria-label="轮次导航"] button[aria-current="true"]')
          const row = document.querySelector(`[data-chat-turn="${target}"]:not([hidden])`)
          const scroll = document.querySelector('[data-conversation-scroll]')
          if (!row || !scroll || !nav?.getAttribute('aria-label')?.includes(`第 ${target} 轮`)) return false
          const a = row.getBoundingClientRect(), b = scroll.getBoundingClientRect()
          return a.height > 0 && a.bottom > b.top && a.top < b.bottom
        }, turn, { timeout: 60000, polling: 100 })
        jumps.push({ turn, durationMs: Math.round(stamp() - jumpStart) })
        assert.equal(await page.locator('[data-dsh-turn-navigator]').count(), 0, 'native navigation must not have a duplicate desktop rail')
      }
      activeNavigationTurn = undefined
      await finishProfiler()
      await finalizeProfileSources().catch(() => { report.sourceAttributionUnavailable = true })
      report.navigation = { beforeEarliestTurn: before, afterEarliestTurn: after, loadEarlierMs, totalTurns: turns.length, jumps,
        domNodesAfter: await page.locator('*').count() }
    }
    stage = `close-${run + 1}`
    await app.close()
    if (profileHostReads && run === 0) {
      try { report.hostReads = JSON.parse(await readFile(join(dshHome, 'history-host-probe.json'), 'utf8')) }
      catch { report.hostReadsUnavailable = true }
    }
    app = undefined
    activePage = undefined
    console.log(JSON.stringify({ stage: 'history-ui-run-complete', run: run + 1, ...report.runs.at(-1) }))
  }
  const files = await readdir(dirname(legacy))
  const backup = files.find(name => name.startsWith('session.jsonl.zstd.desktop-v0-permission-preset-backup'))
  assert.ok(backup, 'original isolated legacy backup must exist')
  assert.equal(hash(await readFile(join(dirname(legacy), backup))), copyHash)
  assert.equal(hash(await readFile(input)), sourceHash)
  report.originalPreserved = true
  report.isolatedBackupPreserved = true
  report.visibleTailIdenticalAfterRestart = true
  report.pageErrors = pageErrors
  assert.equal(pageErrors, 0, 'renderer errors require investigation')
  report.complete = true
} catch (error) {
  await finishProfiler().catch(() => { report.profilerFailed = true })
  const logs = Array.isArray(error?.log) ? error.log.filter(value => typeof value === 'string') : []
  report.failure = { stage, name: error?.name ?? 'Error', actionSignals: {
    intercepted: logs.some(value => /intercepts pointer events/u.test(value)),
    notVisible: logs.some(value => /not visible/u.test(value)),
    notStable: logs.some(value => /not stable/u.test(value)),
    detached: logs.some(value => /detached|not attached/u.test(value)),
  } }
  report.failureUI = await activePage?.evaluate(target => ({
    users: document.querySelectorAll('[data-chat-flow-kind="user"]').length,
    earliestRenderedTurn: (() => {
      let first = Infinity
      for (const row of document.querySelectorAll('[data-chat-turn]')) {
        const turn = Number(row.getAttribute('data-chat-turn'))
        if (Number.isSafeInteger(turn) && turn > 0) first = Math.min(first, turn)
      }
      return Number.isFinite(first) ? first : null
    })(),
    rows: document.querySelectorAll('[role="treeitem"]').length,
    selectedRows: document.querySelectorAll('[role="treeitem"][aria-selected="true"]').length,
    dialogs: document.querySelectorAll('[role="dialog"]').length,
    dialogVisibility: [...document.querySelectorAll('[role="dialog"]')].map(row => ({
      visible: row.getBoundingClientRect().width > 0 && row.getBoundingClientRect().height > 0,
      hidden: row.getAttribute('aria-hidden'), className: row.className,
    })),
    startupButtons: [...document.querySelectorAll('button')].filter(button => /^(继续|Continue|先继续使用)$/u.test(button.textContent?.trim() || '')).map(button => {
      const rect = button.getBoundingClientRect()
      const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return { width: rect.width, height: rect.height, targetContainsTop: top !== null && button.contains(top),
        topTag: top?.tagName, topClass: top?.className, topRole: top?.getAttribute('role') }
    }),
    navigationTarget: target,
    nativeCurrentTurn: Number(document.querySelector('nav[aria-label="轮次导航"] button[aria-current="true"]')?.getAttribute('aria-label')?.match(/第 (\d+) 轮/u)?.[1]),
    targetRows: target === undefined ? [] : [...document.querySelectorAll(`[data-chat-turn="${target}"]`)].slice(0, 8).map(row => ({
      kind: row.getAttribute('data-chat-flow-kind'), hidden: row.hasAttribute('hidden'),
      display: getComputedStyle(row).display, rectangle: row.getBoundingClientRect().toJSON(),
    })),
    scrolls: [...document.querySelectorAll('[data-conversation-scroll]')].map(row => ({ scrollTop: row.scrollTop,
      scrollHeight: row.scrollHeight, clientHeight: row.clientHeight, rectangle: row.getBoundingClientRect().toJSON() })),
  }), activeNavigationTurn).catch(() => undefined)
  process.exitCode = 1
} finally {
  // Source-map I/O must follow the failure DOM snapshot, not delay it.
  await finalizeProfileSources().catch(() => { report.sourceAttributionUnavailable = true })
  // Inspect only the final completed page/attachment outcomes, after timing and the DOM
  // failure snapshot. Do not retain or print the returned history payload.
  const outcomes = [...navigationPageRequests.filter(item => item.progress.completed).slice(-3),
    ...navigationAttachmentRequests.filter(item => item.progress.completed).slice(-4)]
  for (const { request, progress } of outcomes) {
    try {
      const response = await request.response()
      const body = await response?.json()
      progress.httpStatus = response?.status()
      Object.assign(progress, rpcOutcome(body))
    } catch { progress.outcomeUnavailable = true }
  }
  await app?.close().catch(() => {})
  if (profileHostReads && report.hostReads === undefined) {
    try { report.hostReads = JSON.parse(await readFile(join(dshHome, 'history-host-probe.json'), 'utf8')) }
    catch { report.hostReadsUnavailable = true }
  }
  assert.equal(hash(await readFile(input)), sourceHash, 'private input must remain unchanged')
  report.originalPreserved = true
  await rm(temporary, { recursive: true, force: true })
  if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify(report))
}
