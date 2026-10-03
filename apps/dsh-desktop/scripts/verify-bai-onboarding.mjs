import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { closeIsolatedElectron } from './electron-cleanup-fixture.mjs'
import { dismissRuntimeOnboarding } from './dismiss-onboarding-fixture.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(join(tmpdir(), 'dsh-bai-onboarding-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const catalogPath = join(temporary, 'synthetic-bai-catalog.json')
const evidence = { temporary, firstRun: false, browserLinks: [], dialog: false, authorizationCompleted: false, realInferenceAttempted: false }
let application
let page
try {
  await Promise.all([mkdir(userData), mkdir(dshHome)])
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
  await writeFile(catalogPath, JSON.stringify({ body: { data: [{ id: 'bai-fixture-one', name: 'Bai Fixture One' }, { id: 'deepseek-flash', name: 'DeepSeek Flash' }] } }))
  await writeFile(join(dshHome, 'cordis.patch.yml'), JSON.stringify([
    { id: 'ui-settings-account', config: { step: 'done', completion: 'skipped' } },
    { insert: [{ id: 'isolated-bai-host-probe', name: pathToFileURL(join(import.meta.dirname, 'bai-host-probe.mjs')).href,
      config: { expectedHome: dshHome, catalogPath } }] },
  ]))
  await seedPrimaryRuntimePermissionForTest({ userData })
  const executable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
  application = await electron.launch({ executablePath: executable || electronPath,
    args: executable ? [] : [join(appDir, 'src/main.mjs')], cwd: appDir,
    env: { ...process.env, DSH_DESKTOP_USER_DATA: userData, DSH_HOME: dshHome, DSH_AGENTS_HOME: join(temporary, 'agents'),
      DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_VERIFY_UPDATER: '0', DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1' } })
  application.process().stderr?.on('data', chunk => process.stderr.write(chunk))
  await application.evaluate(async ({ shell }) => {
    globalThis.baiBrowserLinks = []
    shell.openExternal = async target => { globalThis.baiBrowserLinks.push(target) }
  })
  const deadline = Date.now() + 600_000
  while (Date.now() < deadline) {
    page = application.windows().find(candidate => /^dsh-runtime:\/\/app\//u.test(candidate.url()))
    if (page) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(page, 'isolated runtime becomes ready')
  page.on('pageerror', error => console.error(error.message))
  await page.locator('[data-dsh-relay-access-root]').waitFor({ state: 'attached', timeout: 120_000 })
  const status = await page.evaluate(async () => {
    const response = await fetch('/api/dsh-relay/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    if (!response.ok) throw new Error(`bai status HTTP ${response.status}`)
    return response.json()
  })
  assert.equal(status.configured, false, 'new user has no stored bai authorization')
  assert.equal(status.firstRun, true, `untouched SDK profile is recognized: ${JSON.stringify(status)}`)
  evidence.firstRun = true
  assert.deepEqual(await application.evaluate(() => globalThis.baiBrowserLinks), [], 'passive startup does not open the browser')
  await dismissRuntimeOnboarding(page)
  const entry = page.locator('button[data-dsh-relay-model-entry]').first()
  await entry.waitFor({ state: 'visible', timeout: 30_000 })
  await entry.filter({ hasText: /bai（登录后获取模型）|bai \(models after sign-in\)/u }).waitFor({ state: 'visible', timeout: 60_000 })
  assert.equal(await page.locator('[data-composer-card] [data-dsh-relay-connect]').count(), 0, 'chat has no independent bai promotion button')
  await entry.click()
  await page.getByRole('menuitem', { name: /^(模型|Model)/u }).waitFor({ state: 'visible', timeout: 30_000 })
  assert.equal(await page.locator('[role="menu"] [data-dsh-relay-connect]').count(), 0, 'chat chooser has no independent bai promotion entry')
  assert.deepEqual(await application.evaluate(() => globalThis.baiBrowserLinks), [], 'opening the chooser does not force bai login')
  assert.equal(await page.locator('[data-dsh-relay-access-root] [role="dialog"]').count(), 0)
  await entry.press('Escape')
  const editor = page.locator('[data-composer-card] textarea:not([disabled]), [data-composer-card] [data-composer-input][contenteditable="true"]:not([aria-disabled="true"])').first()
  await editor.fill('bai-default-without-session-selection')
  await editor.press('Enter')
  const dialog = page.locator('[role="dialog"]').filter({ has: page.locator('button').filter({ hasText: /充值|Top up/u }) })
  await dialog.waitFor({ state: 'visible', timeout: 30_000 })
  await dialog.getByText(/暂未登录|Not signed in/u).waitFor({ timeout: 30_000 })
  const browserDeadline = Date.now() + 30_000
  while (await application.evaluate(() => globalThis.baiBrowserLinks.length) === 0 && Date.now() < browserDeadline) {
    await page.waitForTimeout(100)
  }
  const links = await application.evaluate(() => globalThis.baiBrowserLinks)
  assert.equal(links.length, 1, 'one user interaction starts exactly one browser handoff')
  const url = new URL(links[0])
  assert.equal(url.origin, 'https://api.1521003.xyz')
  assert.equal(url.pathname, '/dsh-desktop-connect.html')
  const parameters = new URLSearchParams(url.hash.slice(1))
  assert.match(parameters.get('state'), /^[a-f0-9]{64}$/u)
  assert.ok(Number(parameters.get('port')) > 0)
  assert.equal(parameters.has('apiKey'), false)
  evidence.browserLinks.push({ origin: url.origin, pathname: url.pathname })
  evidence.dialog = true
  assert.equal(await editor.evaluate(element => 'value' in element ? element.value : element.textContent), 'bai-default-without-session-selection')
  evidence.defaultBai = { pendingCaption: true, chooserUnblocked: true, signInRequired: true, draftRetained: true }
  await page.screenshot({ path: join(temporary, 'bai-sign-in-guidance.png') })
  await dialog.getByRole('button', { name: /取消连接|Cancel connection/u }).click()
  await dialog.getByRole('button', { name: /充值|Top up/u }).click()
  const updated = await application.evaluate(() => globalThis.baiBrowserLinks)
  assert.equal(updated.length, 2)
  assert.equal(updated[1], 'https://api.1521003.xyz/wallet')
  evidence.browserLinks.push({ origin: 'https://api.1521003.xyz', pathname: '/wallet' })
  await dialog.getByRole('button', { name: /关闭|Close/u }).click()
  await editor.fill('bai-first-turn-fixture')
  await editor.press('Enter')
  await dialog.waitFor({ state: 'visible', timeout: 60_000 })
  await page.waitForFunction(() => document.querySelector('[data-dsh-relay-access-root] [role="dialog"]')?.textContent?.includes('暂未登录'), undefined, { timeout: 30_000 })
  await dialog.getByRole('button', { name: /取消连接|Cancel connection/u }).waitFor({ state: 'visible', timeout: 30_000 })
  const retainedDraft = await editor.evaluate(element => 'value' in element ? element.value : element.textContent)
  assert.equal(retainedDraft, 'bai-first-turn-fixture')
  assert.equal((await application.evaluate(() => globalThis.baiBrowserLinks)).length, 3)
  evidence.firstSend = { signInRequired: true, draftRetained: true }
  await dialog.getByRole('button', { name: /取消连接|Cancel connection/u }).click()
  await dialog.getByRole('button', { name: /关闭|Close/u }).click()
  const probe = async (operation, body = {}) => page.evaluate(async ({ operation, body }) => {
    const response = await fetch('/api/isolated-bai/' + operation, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: response.status, body: await response.json() }
  }, { operation, body })
  await page.route('**/api/dsh-relay/status', async route => {
    const result = await probe('status')
    await route.fulfill({ status: result.status, json: result.body })
  })
  const configured = await probe('configure', { apiKey: 'synthetic-bai-initial-key' })
  assert.equal(configured.status, 200, JSON.stringify(configured.body))
  assert.deepEqual((await probe('metrics')).body.default, { provider: 'project-relay', model: 'deepseek-flash' })
  await page.locator('button[data-dsh-relay-model-entry][data-dsh-relay-provider="project-relay"]').first().waitFor({ state: 'visible', timeout: 60_000 })
  assert.equal((await probe('status')).body.configured, true)
  await writeFile(catalogPath, JSON.stringify({ body: { data: [{ id: 'bai-fixture-one', name: 'Bai Fixture One Updated' }, { id: 'bai-fixture-two', name: 'Bai Fixture Two' }] } }))
  assert.equal((await probe('refresh')).status, 200)
  assert.equal((await probe('status')).body.modelCount, 2)
  await page.locator('button[data-dsh-relay-model-entry][data-dsh-relay-provider="project-relay"]').first().click()
  await page.getByRole('menuitem', { name: /^(模型|Model)/u }).click()
  await page.getByRole('menuitemradio', { name: /Bai Fixture Two/u }).waitFor({ state: 'visible', timeout: 60_000 })
  await page.getByRole('menuitemradio', { name: /Bai Fixture Two/u }).click()
  await page.getByRole('menuitemradio', { name: /Bai Fixture Two/u }).waitFor({ state: 'hidden', timeout: 60_000 })
  await page.locator('button[data-dsh-relay-model-entry][data-dsh-relay-provider="project-relay"]').filter({ hasText: 'Bai Fixture Two' }).waitFor({ state: 'visible', timeout: 60_000 })
  await writeFile(catalogPath, JSON.stringify({ status: 401, body: {} }))
  assert.equal((await probe('refresh')).status, 502)
  const failedRefresh = (await probe('status')).body
  assert.equal(failedRefresh.modelCount, 2)
  assert.equal(failedRefresh.credentialConfigured, true)
  assert.equal(failedRefresh.configured, false)
  assert.equal(failedRefresh.sync.error, 'relay-auth')
  await page.unroute('**/api/dsh-relay/status')
  await writeFile(catalogPath, JSON.stringify({ body: { data: [{ id: 'bai-fixture-one', name: 'Bai Fixture One Updated' }, { id: 'bai-fixture-two', name: 'Bai Fixture Two' }] } }))
  assert.equal((await probe('refresh')).status, 200, 'recover the model catalog before independently testing inference HTTP 401')
  assert.equal((await probe('status')).body.configured, true, 'catalog authentication recovered without removing the retained Key')
  await editor.fill('bai-runtime-invalid-key-fixture')
  await editor.press('Enter')
  await dialog.waitFor({ state: 'visible', timeout: 60_000 })
  await dialog.getByRole('button', { name: /取消连接|Cancel connection/u }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByText(/API 密钥无效|Invalid API key/u).first().waitFor({ state: 'visible', timeout: 30_000 })
  const rejectedCalls = (await probe('metrics')).body
  assert.equal(rejectedCalls.inferenceRequests, 2, 'the prompt and official first-prompt title both use locally simulated HTTP 401, no real provider traffic')
  assert.equal(rejectedCalls.inferenceCalls.filter(call => call.maxTokens === 64).length, 1, 'exactly one official title request')
  assert.equal(rejectedCalls.inferenceCalls.filter(call => call.maxTokens !== 64).length, 1, 'exactly one user prompt request')
  assert.equal((await probe('status')).body.credentialConfigured, true, 'a rejected Key is retained for recovery, not silently erased')
  await dialog.getByRole('button', { name: /取消连接|Cancel connection/u }).click()
  await dialog.getByRole('button', { name: /关闭|Close/u }).click()
  evidence.runtimeAuth = { mockedHttp401: true, loginOpened: true, credentialRetained: true }
  assert.equal((await probe('revoke')).status, 200, 'simulate logout through the official credential service, retaining the catalog')
  const signedOut = await page.evaluate(async () => (await fetch('/api/dsh-relay/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json())
  assert.equal(signedOut.configured, false)
  assert.equal(signedOut.credentialConfigured, false)
  assert.equal(signedOut.modelCount, 2)
  await editor.fill('bai-explicit-unauthorized-fixture')
  await editor.press('Enter')
  await dialog.waitFor({ state: 'visible', timeout: 60_000 })
  await dialog.getByRole('button', { name: /取消连接|Cancel connection/u }).waitFor({ state: 'visible', timeout: 30_000 })
  assert.equal(await editor.evaluate(element => 'value' in element ? element.value : element.textContent), 'bai-explicit-unauthorized-fixture')
  await dialog.getByRole('button', { name: /取消连接|Cancel connection/u }).click()
  await dialog.getByRole('button', { name: /关闭|Close/u }).click()
  evidence.explicitBai = { unauthorizedGuidance: true, draftRetained: true }
  evidence.syntheticCatalog = { configured: true, defaultVerified: true, refreshedCount: 2, retainedAfterUnauthorized: true,
    modelRequests: (await probe('metrics')).body.modelRequests }
  assert.equal((await probe('metrics')).body.inferenceRequests, 2, 'missing-key send adds no further inference attempts')
  await page.screenshot({ path: join(temporary, 'bai-synthetic-models.png') })
  await writeFile(join(temporary, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence, null, 2))
} catch (error) {
  if (page) {
    const probeMetrics = await page.evaluate(async () => (await fetch('/api/isolated-bai/metrics', { method: 'POST' })).json()).catch(() => undefined)
    console.error(JSON.stringify({ probeMetrics }))
    const profileShape = await page.evaluate(async () => {
      const result = await (await fetch('/api/dsh-web-ui-settings/describe', { method: 'POST' })).json()
      const descriptor = result.value?.namespaces?.find(entry => entry.ns === 'llm-pi-ai')
      return descriptor && {
        ns: descriptor.ns,
        providerFields: Object.entries(descriptor.value?.providers ?? {}).map(([id, provider]) => ({ id, fields: Object.keys(provider) })),
        baseProviderFields: Object.entries(descriptor.base?.providers ?? {}).map(([id, provider]) => ({ id, fields: Object.keys(provider) })),
        userProviderFields: Object.entries(descriptor.user?.providers ?? {}).map(([id, provider]) => ({ id, fields: Object.keys(provider) })),
        secrets: descriptor.secrets,
      }
    }).catch(() => undefined)
    console.error(JSON.stringify({ profileShape }))
  }
  if (page) await page.screenshot({ path: join(temporary, 'failure.png') }).catch(() => {})
  console.error(`bai onboarding evidence retained at ${temporary}`)
  throw error
} finally {
  await closeIsolatedElectron(application)
}
