import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(appDir, 'discovery-surfaces-preview.png')
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-discovery-surfaces-e2e-'))
const packagedExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const runtimeReadyTimeoutMs = Number(process.env.DSH_DESKTOP_E2E_TIMEOUT_MS)
  || (packagedExecutable || process.env.CI ? 120_000 : 90_000)
let electronApp
let page

async function diagnosticFiles(root) {
  const files = await readdir(root, { recursive: true }).catch(() => [])
  const diagnostics = []
  for (const relative of files) {
    if (/[\\/]node_modules[\\/]/u.test(relative) || diagnostics.length >= 50) continue
    const path = resolve(root, relative)
    const metadata = await stat(path).catch(() => undefined)
    if (!metadata?.isFile() || metadata.size > 256_000) continue
    if (!/\.(?:json|jsonl|log|txt)$/iu.test(relative)) continue
    diagnostics.push({ relative, content: await readFile(path, 'utf8').catch(() => '') })
  }
  return diagnostics
}

async function dismissFirstRunSurfaces(page) {
  const starPrompt = page.locator('#dsh-desktop-star-prompt[data-open="true"]')
  if (await starPrompt.isVisible().catch(() => false)) {
    await starPrompt.getByRole('button', { name: '先继续使用', exact: true }).click()
    await starPrompt.waitFor({ state: 'hidden' })
  }
  const continueButton = page.getByRole('button', { name: /^(?:继续|Continue)$/u })
  const introDialog = page.getByRole('dialog').filter({ has: continueButton })
  if (await introDialog.isVisible().catch(() => false)) {
    await introDialog.getByRole('button', { name: /^(?:继续|Continue)$/u }).click()
    await introDialog.waitFor({ state: 'hidden' })
  }
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

  const selectWorkspace = page.getByRole('button', { name: /选择工作区|Select workspace/iu }).first()
  await selectWorkspace.click()
  const directoryDialog = page.getByRole('dialog').filter({ hasText: /选择工作区目录|Select Workspace Directory/iu })
  await directoryDialog.waitFor({ state: 'visible' })
  await directoryDialog.getByRole('button', { name: /编辑路径|Edit path/iu }).click()
  const pathInput = directoryDialog.getByRole('textbox', { name: /编辑路径|Edit path/iu })
  await pathInput.fill(appDir)
  await pathInput.press('Enter')
  const openDirectory = directoryDialog.getByRole('button', { name: /^(?:打开|Open)$/u })
  await openDirectory.waitFor({ state: 'visible' })
  await openDirectory.click()
  await directoryDialog.waitFor({ state: 'hidden' })

  const modelTrigger = page.getByText('DeepSeek-V4-Flash', { exact: true }).locator('xpath=ancestor::button[1]')
  await modelTrigger.waitFor({ state: 'visible' })
  await modelTrigger.click()
  const modelMenu = page.getByRole('menu', { name: /模型与推理等级|Model and reasoning effort/u })
  await modelMenu.waitFor({ state: 'visible' })
  await modelMenu.getByRole('menuitemradio').first().waitFor({ state: 'visible' })

  const groups = await modelMenu.getByRole('group').evaluateAll((elements) => elements.map((element) => ({
    name: element.getAttribute('aria-labelledby')
      ? document.getElementById(element.getAttribute('aria-labelledby'))?.textContent?.trim()
      : undefined,
    models: Array.from(element.querySelectorAll('[role="menuitemradio"]')).map(model => model.textContent?.trim()),
  })))
  const codex = groups.find(group => /codex/iu.test(group.name ?? ''))
  assert.ok(codex, `OpenAI Codex provider is absent from the model selector: ${JSON.stringify(groups)}`)
  assert.ok(codex.models.length > 0, `OpenAI Codex has no selectable models: ${JSON.stringify(codex)}`)
  await page.screenshot({ path: output })

  await page.keyboard.press('Escape')
  const dockTrigger = page.getByRole('button', { name: /打开拓展坞|Open Extension Dock/u })
  const extensionWindowPromise = electronApp.waitForEvent('window', {
    predicate: candidate => candidate.url().includes('extensions.html'),
    timeout: 10_000,
  }).catch(() => electronApp.windows().find(candidate => candidate.url().includes('extensions.html')))
  await dockTrigger.click()
  const extensionWindow = await extensionWindowPromise
  assert.ok(extensionWindow, 'one-click Extension Dock entry did not open extensions.html')

  console.log(JSON.stringify({
    nudgeGeometry,
    codexProvider: codex.name,
    codexModels: codex.models,
    screenshot: output,
  }))
} catch (error) {
  console.error(JSON.stringify({
    failure: error instanceof Error ? error.message : String(error),
    pageUrl: page?.url(),
    pageText: await page?.locator('body').innerText().catch(() => undefined),
    userData: await diagnosticFiles(resolve(temporary, 'user-data')),
    dshHome: await diagnosticFiles(resolve(temporary, 'dsh-home')),
  }))
  throw error
} finally {
  await electronApp?.close()
  if (process.env.DSH_DESKTOP_KEEP_E2E === '1') console.error(`preserved E2E state: ${temporary}`)
  else await rm(temporary, { recursive: true, force: true })
}
