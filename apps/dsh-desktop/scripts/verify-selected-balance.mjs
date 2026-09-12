import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'
import { useChineseFixtureLocale } from './dock-settings-fixture.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'

const appDir = fileURLToPath(new URL('..', import.meta.url))
const packagedExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE?.trim()
const temporary = await mkdtemp(join(tmpdir(), 'dsh-selected-balance-'))
const dshHome = join(temporary, 'home')
const userData = join(temporary, 'user-data')
const workspace = join(temporary, 'workspace')
const requests = []
const server = createServer((req, res) => {
  const native = req.url.startsWith('/official/')
  const authorized = req.headers.authorization === 'Bearer ' + (native ? 'official-fixture-key' : 'relay-fixture-key')
  requests.push({ path: req.url, authorized, method: req.method })
  res.setHeader('content-type', 'application/json')
  if (!authorized) { res.writeHead(401); res.end('{}'); return }
  if (req.url === '/official/user/balance') res.end(JSON.stringify({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '11.25', granted_balance: '1.25', topped_up_balance: '10.00' }] }))
  else if (req.url === '/relay/v1/usage') res.end(JSON.stringify({ mode: 'unrestricted', isValid: true, remaining: 7.5, balance: 7.5, unit: 'USD' }))
  else { res.writeHead(404); res.end('{}') }
})
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
const baseURL = 'http://127.0.0.1:' + server.address().port
let app
try {
  await Promise.all([mkdir(dshHome), mkdir(userData), mkdir(workspace)])
  // Synthetic credentials and a loopback-only provider: no real account or paid calls.
  await writeFile(join(dshHome, 'settings.yaml'), JSON.stringify({
    'llm-deepseek': { baseURL: baseURL + '/official', apiKeyEnv: 'BALANCE_OFFICIAL_TEST_KEY' },
    'llm-pi-ai': { providers: { 'balance-relay': { baseURL: baseURL + '/relay/v1', apiKeyEnv: 'BALANCE_RELAY_TEST_KEY', api: 'openai-completions', displayName: 'Balance Test Relay', models: [{ id: 'balance-test-model', name: 'Balance Test Model' }] } } },
  }))
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
  await seedPrimaryRuntimePermissionForTest({ userData })
  app = await electron.launch({ executablePath: packagedExecutable || electronPath, args: packagedExecutable ? [] : [join(appDir, 'src/main.mjs')], cwd: appDir,
    env: { ...process.env, DSH_HOME: dshHome, DSH_DESKTOP_USER_DATA: userData, DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1', BALANCE_OFFICIAL_TEST_KEY: 'official-fixture-key', BALANCE_RELAY_TEST_KEY: 'relay-fixture-key' } })
  await useChineseFixtureLocale(app)
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 120_000 })
  for (let index = 0; index < 12; index++) {
    const intro = page.getByRole('dialog').filter({ hasText: /内测声明|插件、技能和桌面核心功能在这里/u })
    const proceed = intro.getByRole('button', { name: /^(继续|Continue)$/u }).last()
    if (await proceed.isVisible().catch(() => false) && await proceed.isEnabled().catch(() => false)) {
      await proceed.click({ timeout: 1_000 }).catch(async error => {
        if (await proceed.isVisible().catch(() => false)) throw error
      })
    }
    await page.waitForTimeout(250)
  }
  const query = (selection) => page.evaluate(async selection => {
    const response = await fetch('/api/live-stats/balance?' + new URLSearchParams({ ...selection, force: '1' }))
    return response.json()
  }, selection)
  assert.equal((await query({ provider: 'deepseek-official', model: 'deepseek-v4-flash' })).totalBalance, '11.25')
  assert.equal((await query({ provider: 'balance-relay', model: 'balance-test-model' })).totalBalance, '7.5')
  await app.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] })
  }, workspace)
  await page.getByRole('button', { name: '选择工作区', exact: true }).click()
  const picker = page.getByRole('dialog', { name: '选择工作区', exact: true })
  await picker.getByRole('button', { name: /点击选择项目文件夹/u }).click()
  await picker.getByRole('textbox').fill('Balance fixture')
  await picker.getByRole('button', { name: /^(创建项目|打开已有项目)$/u }).click()
  await picker.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '新建会话', exact: true }).last().click()
  const amount = page.locator('[data-dsh-balance-amount]')
  const chooseModel = async name => {
    await page.locator('[data-slot="conversation.input.model"] button').first().click()
    const menu = page.getByRole('menu', { name: '模型选择器', exact: true })
    await menu.getByRole('menuitem', { name: /^模型/u }).click()
    await menu.getByRole('menuitemradio', { name }).first().click()
    await menu.waitFor({ state: 'hidden' })
  }
  await page.waitForFunction(() => document.querySelector('[data-dsh-balance-amount]')?.textContent === '11.25 CNY')
  await chooseModel(/DeepSeek-V4-Flash/u)
  await page.waitForFunction(() => document.querySelector('[data-dsh-balance-amount]')?.textContent === '11.25 CNY')
  await chooseModel(/Balance Test Model/u)
  await page.waitForFunction(() => document.querySelector('[data-dsh-balance-amount]')?.textContent === '7.5 USD')
  assert.match(await page.locator('[data-dsh-balance-entry]').getAttribute('title'), /balance-relay/u)
  await chooseModel(/DeepSeek-V4-Flash/u)
  await page.waitForFunction(() => document.querySelector('[data-dsh-balance-amount]')?.textContent === '11.25 CNY')
  assert.ok(requests.length > 0)
  assert.ok(requests.every(request => request.authorized && request.method === 'GET' && !/completions|responses/.test(request.path)))
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: true, mode: packagedExecutable ? 'packaged-electron' : 'development-electron', requests, displayed: await amount.textContent(), paidRequests: 0 }))
} catch (error) {
  console.error('balance UI', await app?.firstWindow().then(page => page.evaluate(() => ({
    amount: document.querySelector('[data-dsh-balance-amount]')?.textContent,
    title: document.querySelector('[data-dsh-balance-entry]')?.getAttribute('title'),
    model: document.querySelector('[data-slot="conversation.input.model"]')?.textContent,
  }))).catch(() => undefined))
  console.error('fixture requests', JSON.stringify(requests))
  const log = await readFile(join(userData, 'logs/runtime.log'), 'utf8').catch(() => '')
  console.error(log.split('\n').filter(line => /startup|error|Error|failed/.test(line)).slice(-20).join('\n'))
  throw error
} finally {
  await app?.close()
  await new Promise(resolveClose => server.close(resolveClose))
  await rm(temporary, { recursive: true, force: true })
}
