import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-discovery-surfaces-e2e-'))
const output = resolve(process.env.DSH_DESKTOP_E2E_SCREENSHOT ?? resolve(temporary, 'discovery-surfaces-preview.png'))
const packagedExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const marketInstallId = process.env.DSH_DESKTOP_E2E_MARKET_INSTALL_ID
if (marketInstallId !== undefined && !/^[A-Za-z0-9_-]{20}$/u.test(marketInstallId)) {
  throw new Error('DSH_DESKTOP_E2E_MARKET_INSTALL_ID must be one opaque 20-character market identifier')
}
const runtimeReadyTimeoutMs = Number(process.env.DSH_DESKTOP_E2E_TIMEOUT_MS)
  || (packagedExecutable || process.env.CI ? 120_000 : 90_000)
let electronApp
let page
let extensionWindow

async function diagnosticFiles(root) {
  const files = await readdir(root, { recursive: true }).catch(() => [])
  const diagnostics = []
  for (const relative of files) {
    if (/[\\/]node_modules[\\/]/u.test(relative) || diagnostics.length >= 50) continue
    const path = resolve(root, relative)
    const metadata = await stat(path).catch(() => undefined)
    if (!metadata?.isFile() || metadata.size > 256_000) continue
    if (!/\.(?:json|jsonl|log|txt)$/iu.test(relative)) continue
    const content = await readFile(path, 'utf8').catch(() => '')
    diagnostics.push({ relative, content: content.slice(-8_000) })
  }
  return diagnostics
}

async function dismissFirstRunSurfaces(page) {
  const starPrompt = page.locator('#dsh-desktop-star-prompt')
  const continueButton = page.getByRole('button', { name: /^(?:继续|Continue)$/u })
  const introDialog = page.getByRole('dialog').filter({ has: continueButton })

  for (let attempt = 0; attempt < 16; attempt += 1) {
    await page.waitForTimeout(250)
    if (await introDialog.isVisible().catch(() => false)) {
      await continueButton.last().click({ force: true })
      continue
    }
    if (await starPrompt.getAttribute('data-open').catch(() => null) === 'true') {
      await starPrompt.getByRole('button', { name: '先继续使用', exact: true }).click({ force: true })
      continue
    }
    if (attempt >= 7) break
  }

  assert.equal(await introDialog.isVisible().catch(() => false), false, 'intro dialog remained visible')
  assert.notEqual(await starPrompt.getAttribute('data-open').catch(() => null), 'true', 'Star prompt remained open')
}

try {
  electronApp = await electron.launch({
    executablePath: packagedExecutable || electronPath,
    args: packagedExecutable ? [] : [resolve(appDir, 'src', 'main.mjs')],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_USER_DATA: resolve(temporary, 'user-data'),
      DSH_HOME: resolve(temporary, 'dsh-home'),
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_VERIFY_UPDATER: '0',
    },
  })
  page = await electronApp.firstWindow()
  page.on('pageerror', error => console.error(`renderer error: ${error.message}`))
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: runtimeReadyTimeoutMs })
  await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-web-ui-settings"]', {
    state: 'attached',
    timeout: runtimeReadyTimeoutMs,
  })
  await page.waitForSelector('style[data-plugin="@deepseek-ai/dsh-client-ui-model-selection"]', {
    state: 'attached',
    timeout: runtimeReadyTimeoutMs,
  })
  await dismissFirstRunSurfaces(page)

  const chatGptAuth = await page.evaluate(async () => {
    const response = await fetch('/api/dsh-chatgpt-auth/state', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    return { status: response.status, result: await response.json() }
  })
  assert.equal(chatGptAuth.status, 200, JSON.stringify(chatGptAuth))
  assert.equal(chatGptAuth.result?.ok, true, JSON.stringify(chatGptAuth))
  assert.equal(chatGptAuth.result?.value?.available, true, JSON.stringify(chatGptAuth))
  assert.equal(chatGptAuth.result?.value?.writable, true, JSON.stringify(chatGptAuth))
  assert.ok(
    chatGptAuth.result?.value?.methods?.some(method => method.id === 'oauth'),
    `ChatGPT OAuth is absent from the authorization bridge: ${JSON.stringify(chatGptAuth)}`,
  )

  const nudge = page.getByText(/插件、技能和桌面核心功能在这里|Plugins, skills, and core Desktop features are here/u)
  await nudge.waitFor({ state: 'visible' })
  const nudgeGeometry = await nudge.locator('..').evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return {
      parentIsBody: element.parentElement === document.body,
      left: bounds.left,
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    }
  })
  assert.equal(nudgeGeometry.parentIsBody, true, JSON.stringify(nudgeGeometry))
  assert.ok(nudgeGeometry.left >= 0 && nudgeGeometry.top >= 0, JSON.stringify(nudgeGeometry))
  assert.ok(
    nudgeGeometry.right <= nudgeGeometry.viewportWidth && nudgeGeometry.bottom <= nudgeGeometry.viewportHeight,
    JSON.stringify(nudgeGeometry),
  )

  const workspacePath = resolve(temporary, 'discovery-workspace')
  await mkdir(workspacePath)
  await electronApp.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async (_parent, options) => {
      if (!options?.properties?.includes('openDirectory')) throw new Error('expected a directory-only native picker')
      return { canceled: false, filePaths: [path] }
    }
  }, workspacePath)
  const selectWorkspace = page.getByRole('button', { name: /选择工作区|Choose workspace/iu }).first()
  await selectWorkspace.click()
  const directoryDialog = page.getByRole('dialog', { name: /^(选择工作区|Choose workspace)$/iu })
  await directoryDialog.waitFor({ state: 'visible' })
  await directoryDialog.getByRole('button', { name: /点击选择项目文件夹|Choose a project folder/iu }).click()
  await page.waitForFunction(() => document.querySelector('[data-dsh-project-dialog] input')?.value === 'discovery-workspace')
  await directoryDialog.getByRole('button', { name: /^(创建项目|Create project)$/iu }).click()
  await directoryDialog.waitFor({ state: 'hidden' })

  const modelTrigger = page.locator('[data-slot="conversation.input.model"] button').first()
  await modelTrigger.waitFor({ state: 'visible' })
  await modelTrigger.click()
  const modelMenu = page.getByRole('menu', { name: /模型选择器|Model selector/u })
  await modelMenu.waitFor({ state: 'visible' })
  await modelMenu.getByRole('menuitem', { name: /^(模型|Models)/u }).click()
  await modelMenu.getByRole('menuitemradio').first().waitFor({ state: 'visible' })

  const groups = await modelMenu.locator('section').evaluateAll((elements) => elements.map((element) => ({
    name: element.getAttribute('aria-label') || element.querySelector('[class*="providerTitle"]')?.textContent?.trim(),
    models: Array.from(element.querySelectorAll('[role="menuitemradio"]')).map(model => model.textContent?.trim()),
  })))
  const codex = groups.find(group => /codex/iu.test(group.name ?? ''))
  assert.ok(codex, `OpenAI Codex provider is absent from the model selector: ${JSON.stringify(groups)}`)
  assert.ok(codex.models.length > 0, `OpenAI Codex has no selectable models: ${JSON.stringify(codex)}`)
  await page.screenshot({ path: output })

  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  const dockTrigger = page.getByRole('button', { name: /打开拓展坞|Open Extension Dock/u })
  const extensionWindowPromise = electronApp.waitForEvent('window', {
    predicate: candidate => candidate.url().includes('extensions.html'),
    timeout: 10_000,
  }).catch(() => electronApp.windows().find(candidate => candidate.url().includes('extensions.html')))
  await dockTrigger.click()
  extensionWindow = await extensionWindowPromise
  assert.ok(extensionWindow, 'one-click Extension Dock entry did not open extensions.html')

  let installedMarketPlugin
  if (marketInstallId !== undefined) {
    await extensionWindow.locator('#market-tab').click()
    const marketPlugin = await extensionWindow.evaluate(async (id) => {
      const catalog = await window.dshDesktop.listCommunityMarket()
      return catalog.plugins.find((plugin) => plugin.id === id)
    }, marketInstallId)
    assert.ok(marketPlugin, `market plugin ${marketInstallId} is absent from the live catalog`)
    await extensionWindow.locator('#market-query').fill(marketPlugin.name)
    const installButton = extensionWindow.locator(`[data-install-market-plugin="${marketInstallId}"]`)
    await installButton.waitFor({ state: 'visible' })
    const mainNavigations = []
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) mainNavigations.push(frame.url())
    })
    await installButton.click()
    const activationMessage = extensionWindow.locator('#activation-message')
    await activationMessage.filter({ hasText: /已安装并通过启动检查/u }).waitFor({
      state: 'visible',
      timeout: runtimeReadyTimeoutMs,
    })
    assert.ok(page.url().startsWith('http://127.0.0.1:'), `market install left the main Runtime surface: ${page.url()}`)
    assert.equal(
      mainNavigations.some(url => url.startsWith('file:')),
      false,
      `market install flashed the startup surface: ${JSON.stringify(mainNavigations)}`,
    )
    installedMarketPlugin = marketPlugin.name
  }

  console.log(JSON.stringify({
    nudgeGeometry,
    codexProvider: codex.name,
    codexModels: codex.models,
    chatGptAuth: {
      available: chatGptAuth.result.value.available,
      writable: chatGptAuth.result.value.writable,
      methods: chatGptAuth.result.value.methods.map(method => method.id),
    },
    installedMarketPlugin,
    screenshot: output,
  }))
} catch (error) {
  console.error(JSON.stringify({
    failure: error instanceof Error ? error.message : String(error),
    pageUrl: page?.url(),
    pageText: await page?.locator('body').innerText().catch(() => undefined),
    extensionText: await extensionWindow?.locator('body').innerText().catch(() => undefined),
    userData: await diagnosticFiles(resolve(temporary, 'user-data')),
    dshHome: await diagnosticFiles(resolve(temporary, 'dsh-home')),
  }))
  throw error
} finally {
  await electronApp?.close()
  if (process.env.DSH_DESKTOP_KEEP_E2E === '1') console.error(`preserved E2E state: ${temporary}`)
  else await rm(temporary, { recursive: true, force: true })
}
