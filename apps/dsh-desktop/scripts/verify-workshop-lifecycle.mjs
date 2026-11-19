import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { closeIsolatedElectron } from './electron-cleanup-fixture.mjs'
import { dismissRuntimeOnboarding } from './dismiss-onboarding-fixture.mjs'
import { useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'
import { DESKTOP_COMMUNITY_INDEX_URL } from '../src/dock-pages.mjs'

const appDir = resolve(import.meta.dirname, '..')
const executable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice('--output='.length)
assert.equal(process.platform, 'win32')
assert.match(tmpdir(), /^d:[\\/]/iu, 'Dot-source scripts/use-build-env.ps1 before verifying Workshop')
assert.ok(output && isAbsolute(output), '--output requires an absolute evidence path')
const fixture = await mkdtemp(join(tmpdir(), 'dsh-workshop-lifecycle-'))
const home = join(fixture, 'home')
const userData = join(fixture, 'user-data')
const profile = join(home, 'profiles', 'desktop')
const target = '@michengai/dsh-im-connect'
const version = '1.0.44'
const exact = `${target}@${version}`
const customSource = 'https://example.invalid/custom-plugin-index.json'
const evidence = { platform: process.platform, executable: executable ?? 'source', fixture, target: exact, steps: [], passed: false }
const timeout = 180_000
let app
let main

async function step(name, run) {
  const started = performance.now()
  console.log(`Workshop: ${name}`)
  const row = { name, passed: false }
  evidence.steps.push(row)
  try {
    await run()
    row.passed = true
  } finally {
    row.durationMs = Math.round(performance.now() - started)
  }
}

async function waitUntil(predicate, failure, fallback) {
  const deadline = Date.now() + timeout
  do {
    if (await predicate()) return
    if (fallback && await fallback()) break
    await delay(250)
  } while (Date.now() < deadline)
  const phase = main?.locator('[data-install-phase]').last()
  const detail = await phase?.innerText({ timeout: 500 }).catch(() => '')
  assert.fail([failure, detail].filter(Boolean).join('\n'))
}

async function manifest() {
  return JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'))
}

async function assertInstalled(enabled) {
  await waitUntil(async () => {
    const packageJson = await manifest().catch(error => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    const installed = await readFile(join(profile, 'node_modules', target, 'package.json'), 'utf8').then(JSON.parse).catch(() => undefined)
    return typeof packageJson?.dependencies?.[target] === 'string' && installed?.version === version
      && (packageJson.dsh?.profile?.bundles?.includes(target) ?? false) === enabled
  }, `Plugin did not become installed with enabled=${enabled}`,
  () => main.locator('[data-install-phase="failed"], [data-install-phase="unconfirmed"]').first().isVisible())
}

async function startup() {
  app = await electron.launch({ executablePath: executable || electronPath, args: executable ? [] : [join(appDir, 'src/main.mjs')],
    cwd: appDir, env: { ...process.env, DSH_HOME: home, DSH_AGENTS_HOME: join(fixture, 'agents'),
      DSH_DESKTOP_USER_DATA: userData, DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1', DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_VERIFY_UPDATER: '0' } })
  await useChineseFixtureLocale(app)
  main = await app.firstWindow()
  await main.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout })
  await dismissRuntimeOnboarding(main)
  await main.locator('[data-composer-card] [data-composer-input]').first().waitFor({ timeout })
}

async function plugins() {
  const page = main.locator('[data-plugin-panel]')
  if (!await page.isVisible()) {
    const sidebar = main.locator('[data-pane="sidebar"]')
    const nav = sidebar.getByRole('button', { name: '插件', exact: true })
    if (!await nav.isVisible()) await sidebar.getByRole('button', { name: /展开工具/u }).click()
    await nav.click()
    await page.waitFor({ timeout })
  }
  return page
}

async function runtimeRequest(method, args, mutate = false) {
  return main.evaluate(async ({ method, args, rpcId, mutate }) => {
    const transport = mutate ? window.__DSH_TRANSPORT__ : window
    const response = await transport.fetch(`/api/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method, payload: { args } }),
    })
    return (await response.json()).result
  }, { method, args, rpcId: randomUUID(), mutate })
}

try {
  await Promise.all([mkdir(profile, { recursive: true }), mkdir(userData), mkdir(join(output, '..'), { recursive: true })])
  await writeFile(join(profile, 'cordis.patch.yml'), `- id: plugin-market\n  config:\n    indexes: [${customSource}]\n    fetchTimeoutMs: 200\n`)
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
  await seedPrimaryRuntimePermissionForTest({ userData })
  await startup()

  await step('install through official Discover', async () => {
    await main.getByRole('button', { name: /打开拓展坞|Open Extension Dock/u }).click()
    let dock
    await waitUntil(() => Boolean(dock = app.windows().find(window => window.url().includes('/extensions.html'))), 'The Extension Dock did not open')
    await dock.locator('#plugins-home [data-open-dock-tab="market-tab"]').click()
    const trial = main.locator('[data-plugin-panel] li').filter({ hasText: 'IM 助理（飞书试用）' })
    await trial.waitFor({ timeout })
    const sources = await runtimeRequest('pluginMarket/listIndexes', {})
    assert.equal(sources.ok, true)
    assert.deepEqual(sources.value.map(source => source.url), [customSource, DESKTOP_COMMUNITY_INDEX_URL])
    await trial.getByRole('button', { name: /^安装.*IM 助理/u }).click({ timeout })
    const confirmation = main.getByRole('dialog').filter({ hasText: 'IM 助理（飞书试用）' })
    await confirmation.getByText(version, { exact: true }).waitFor({ timeout })
    await confirmation.getByRole('button', { name: '安装', exact: true }).click()
    await assertInstalled(false)
    const notice = main.locator('[data-dsh-native-plugin-result="applied"]').filter({ hasText: target })
    const done = main.locator('[data-install-phase="done"]').last()
    await notice.or(done).first().waitFor({ timeout: 45_000 })
    if (await done.isVisible()) await main.keyboard.press('Escape')
  })

  await step('enable in Installed plugins', async () => {
    const page = await plugins()
    await page.locator('[role="tab"][id$="-installed"]').click()
    const toggle = page.locator(`[data-plugin-package="${target}"]`).getByRole('switch')
    await toggle.click({ timeout })
    await assertInstalled(true)
    await waitUntil(async () => (await toggle.getAttribute('aria-checked').catch(() => null)) === 'true', 'Enabled state did not appear in the plugin list')
  })

  await step('restart the application and verify the plugin is mounted', async () => {
    await closeIsolatedElectron(app)
    app = undefined
    await startup()
    await assertInstalled(true)
    const result = await runtimeRequest('pluginManager/listPlugins', {})
    assert.equal(result.ok, true)
    assert.ok(result.value.some(row => row.enabled && (row.name === target || row.moduleName === target
      || row.entryId?.includes(target) || row.packageName === target)), 'Runtime did not report an enabled entry for the installed bundle')
  })

  await step('reject an unavailable exact version without changing the installed profile', async () => {
    const before = await Promise.all(['package.json', 'pnpm-lock.yaml', 'cordis.patch.yml'].map(file => readFile(join(profile, file), 'utf8')))
    const result = await runtimeRequest('pluginManager/installBundle', { spec: `${target}@9999.0.0`, options: { enabled: false } }, true)
    assert.equal(result.ok, true)
    assert.equal(result.value.application, 'failed')
    assert.deepEqual(await Promise.all(['package.json', 'pnpm-lock.yaml', 'cordis.patch.yml'].map(file => readFile(join(profile, file), 'utf8'))), before)
    assert.equal((await runtimeRequest('session/list', { _request: {} })).ok, true)
    await assertInstalled(true)
  })

  await step('uninstall from the official package detail', async () => {
    const page = await plugins()
    const row = page.locator(`[data-plugin-package="${target}"]`)
    await row.getByRole('button', { name: /IM|michengai/u }).first().click({ timeout })
    await page.locator(`[data-plugin-detail="${target}"]`).getByRole('button', { name: /^卸载/u }).click()
    await main.getByRole('dialog').getByRole('button', { name: /卸载/u }).click()
    await waitUntil(async () => !Object.hasOwn((await manifest()).dependencies ?? {}, target), 'Plugin dependency remains after removal')
    await main.locator('[data-dsh-native-plugin-result="applied"]').filter({ hasText: target }).waitFor({ timeout: 45_000 })
    await row.waitFor({ state: 'hidden', timeout })
    assert.equal((await runtimeRequest('session/list', { _request: {} })).ok, true)
  })
  evidence.passed = true
} catch (error) {
  evidence.failure = error.message
  throw error
} finally {
  if (app) await closeIsolatedElectron(app)
  await writeFile(output, JSON.stringify(evidence, null, 2) + '\n')
  console.log(`Workshop lifecycle evidence: ${output}`)
}
