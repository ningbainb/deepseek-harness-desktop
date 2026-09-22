import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const screenshotArgument = process.argv.find((argument) => argument.toLowerCase().endsWith('.png'))
const screenshot = screenshotArgument ? resolve(screenshotArgument) : undefined
const packagedExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const runtimeReadyTimeoutMs = 120_000
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-conversation-skills-e2e-'))
const dshHome = resolve(temporary, 'dsh-home')
const workspacePath = resolve(temporary, 'conversation-skills-workspace')
const skillName = 'desktop-conversation-check'
let electronApp
let page

async function rpc(runtimePage, method, payload) {
  const response = await runtimePage.evaluate(async ({ rpcMethod, rpcPayload, rpcId }) => {
    const endpoint = rpcMethod.replace('.', '/')
    const requestField = rpcMethod === 'session.list' ? '_request' : 'request'
    const result = await fetch(`/api/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId,
        method: endpoint,
        payload: { args: { [requestField]: rpcPayload } },
      }),
    })
    return { status: result.status, body: await result.json().catch(() => undefined) }
  }, { rpcMethod: method, rpcPayload: payload, rpcId: randomUUID() })
  assert.equal(response.status, 200, `${method}: HTTP ${response.status}`)
  assert.equal(response.body?.result?.ok, true, `${method}: ${JSON.stringify(response.body?.result)}`)
  return response.body.result.value
}

try {
  const skillRoot = resolve(dshHome, 'skills', skillName)
  await mkdir(skillRoot, { recursive: true })
  await mkdir(workspacePath, { recursive: true })
  await writeFile(resolve(skillRoot, 'SKILL.md'), `---\nname: ${skillName}\ndescription: Conversation skill menu release check\n---\n\n# Instructions\n`, 'utf8')
  const userData = resolve(temporary, 'user-data')
  await mkdir(userData, { recursive: true })
  await writeFile(resolve(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }), 'utf8')
  electronApp = await electron.launch({
    executablePath: packagedExecutable || electronPath,
    args: packagedExecutable ? [] : [resolve(appDir, 'src', 'main.mjs')],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_USER_DATA: userData,
      DSH_HOME: dshHome,
    },
  })
  page = await electronApp.firstWindow()
  try {
    await page.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: runtimeReadyTimeoutMs })
  } catch (error) {
    const runtimeLog = await readFile(resolve(temporary, 'user-data', 'logs', 'runtime.log'), 'utf8').catch(() => '')
    console.error(runtimeLog.slice(-4_000))
    throw error
  }
  await page.setViewportSize({ width: 1280, height: 800 })
  const continueButton = page.getByRole('button', { name: /^(?:继续|Continue)$/u })
  const dismissIntro = async (timeout) => {
    await continueButton.waitFor({ state: 'visible', timeout }).catch(() => {})
    if (!await continueButton.isVisible().catch(() => false)) return
    await continueButton.click({ force: true })
    await continueButton.waitFor({ state: 'hidden', timeout: 10_000 })
  }
  await dismissIntro(5_000)
  const workspace = await rpc(page, 'workspace.create', { path: workspacePath })
  const workspaceId = workspace?.workspace?.workspaceId ?? workspace?.workspaceId
  assert.equal(typeof workspaceId, 'string', JSON.stringify(workspace))
  const newSession = page.locator('button[aria-label*="中新建会话"], button[aria-label^="New session in"]').first()
  await newSession.waitFor({ state: 'attached', timeout: 20_000 })
  await newSession.dispatchEvent('click')
  await page.locator('[data-composer-card="true"] [role="textbox"][contenteditable]:not([contenteditable="false"])').waitFor({ state: 'visible' })
  const commandButton = page.getByRole('button', { name: /^(?:指令|命令|Commands|添加文件或调用指令|Add files or invoke commands|添加文件或运行命令|Add files or run commands)$/u })
  const skillsButton = page.getByRole('button', { name: '技能库' })
  await skillsButton.waitFor({ state: 'visible' })
  const starPrompt = page.locator('#dsh-desktop-star-prompt[data-open="true"]')
  await starPrompt.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {})
  if (await starPrompt.isVisible().catch(() => false)) {
    await starPrompt.getByRole('button', { name: '先继续使用', exact: true }).click({ force: true })
    await starPrompt.waitFor({ state: 'hidden' })
  }
  // The upstream first-run dialog can mount after workspace creation on a
  // slower runner. It must be gone before validating pointer interaction.
  await dismissIntro(2_000)
  const [commandBounds, skillsBounds] = await Promise.all([commandButton.boundingBox(), skillsButton.boundingBox()])
  assert.ok(commandBounds && skillsBounds)
  assert.ok(skillsBounds.x > commandBounds.x)
  assert.ok(Math.abs(skillsBounds.y - commandBounds.y) <= 1)
  assert.ok(Math.abs(skillsBounds.height - commandBounds.height) <= 1)

  await skillsButton.hover()
  await page.getByRole('tooltip', { name: '技能库' }).waitFor({ state: 'visible' })
  await skillsButton.click()
  assert.equal(await skillsButton.getAttribute('aria-expanded'), 'true')
  const menu = page.getByRole('dialog', { name: '技能库' })
  const listbox = page.getByRole('listbox', { name: '已安装技能' })
  await menu.waitFor({ state: 'visible' })
  await listbox.getByRole('option').first().waitFor({ state: 'visible', timeout: 20_000 })
  const [menuBounds, openSkillsBounds] = await Promise.all([menu.boundingBox(), skillsButton.boundingBox()])
  assert.ok(menuBounds && openSkillsBounds)
  assert.ok(menuBounds.height <= 321, JSON.stringify(menuBounds))
  assert.ok(menuBounds.y + menuBounds.height <= openSkillsBounds.y)

  const firstName = (await listbox.getByRole('option').first().locator('strong').textContent())?.trim()
  assert.ok(firstName)
  const search = page.getByRole('searchbox', { name: '搜索技能' })
  await search.fill(firstName)
  assert.ok(await listbox.getByRole('option').count() >= 1)
  await page.keyboard.press('Escape')
  assert.equal(await skillsButton.getAttribute('aria-expanded'), 'false')
  await menu.waitFor({ state: 'hidden' })

  await skillsButton.click()
  await search.fill('')
  const optionCount = await listbox.getByRole('option').count()
  assert.ok(optionCount >= 1)
  const keyboardSelection = optionCount > 1 ? 1 : 0
  await page.keyboard.press('ArrowDown')
  assert.equal(await listbox.getByRole('option').nth(keyboardSelection).getAttribute('aria-selected'), 'true')
  const selectedName = (await listbox.getByRole('option').nth(keyboardSelection).locator('strong').textContent())?.trim()
  assert.ok(selectedName)
  await page.keyboard.press('Enter')
  await menu.waitFor({ state: 'hidden' })
  const composerInput = page.locator('[data-composer-card="true"] textarea, [data-composer-card="true"] [role="textbox"][contenteditable]:not([contenteditable="false"])')
  await composerInput.waitFor({ state: 'visible' })
  assert.match(await composerInput.textContent().catch(async () => await composerInput.inputValue()), new RegExp(`使用 ${selectedName} 技能：`, 'u'))

  await skillsButton.click()
  await menu.waitFor({ state: 'visible' })
  const recentGrouping = await listbox.evaluate((root, recentName) => {
    const children = [...root.children]
    const recentLabel = children.findIndex((child) => child.textContent?.trim() === '最近使用')
    const allLabel = children.findIndex((child) => child.textContent?.trim() === '全部技能')
    const matchingOptions = children.filter((child) =>
      child.getAttribute('role') === 'option'
      && child.querySelector('strong')?.textContent?.trim() === recentName)
    return { recentLabel, allLabel, matchingOptions: matchingOptions.length }
  }, selectedName)
  assert.ok(recentGrouping.recentLabel >= 0, JSON.stringify(recentGrouping))
  assert.ok(recentGrouping.allLabel > recentGrouping.recentLabel, JSON.stringify(recentGrouping))
  assert.equal(recentGrouping.matchingOptions, 2, JSON.stringify(recentGrouping))
  if (screenshot) {
    await page.screenshot({ path: screenshot })
  }
  // Use the visible sidebar navigation rather than force-clicking the
  // welcome title behind the menu, which can hit a menu option instead.
  const skillManagementTrigger = page.getByRole('button', { name: /^(?:技能中心|Skill Center)$/u })
  await skillManagementTrigger.waitFor({ state: 'visible' })
  assert.equal(await skillManagementTrigger.getAttribute('data-dsh-desktop-management-entry'), 'skills')
  const dockWindowPromise = electronApp.waitForEvent('window', {
    predicate: candidate => candidate.url().includes('extensions.html'),
    timeout: 20_000,
  }).catch(() => electronApp.windows().find(candidate => candidate.url().includes('extensions.html')))
  await skillManagementTrigger.click()
  await menu.waitFor({ state: 'hidden' })
  const dockWindow = await dockWindowPromise
  assert.ok(dockWindow, 'Skill Center navigation must open Extension Dock')
  await dockWindow.locator('#skills-tab').waitFor({ state: 'visible' })
  await dockWindow.locator('#skills[role="tabpanel"]').waitFor({ state: 'visible' })
  assert.equal(await dockWindow.locator('#skills-tab').getAttribute('aria-selected'), 'true')
  console.log(`verified conversation Skills menu at ${page.url()}`)
} catch (error) {
  if (screenshot && page) await page.screenshot({ path: screenshot }).catch(() => {})
  const diagnostics = page ? await page.evaluate(() => ({
    url: location.href,
    buttons: [...document.querySelectorAll('button')].map((button) => ({
      label: button.getAttribute('aria-label'),
      title: button.getAttribute('title'),
      text: button.textContent?.trim().slice(0, 80),
    })).slice(0, 80),
    composers: document.querySelectorAll('[data-composer-card="true"]').length,
    composerButtons: [...document.querySelectorAll('[data-composer-card="true"] button')].map((button) => ({
      label: button.getAttribute('aria-label'),
      title: button.getAttribute('title'),
      text: button.textContent?.trim().slice(0, 80),
    })),
    composerTextareas: document.querySelectorAll('[data-composer-card="true"] textarea').length,
    composerFields: [...document.querySelectorAll('[data-composer-card="true"] [role="textbox"], [data-composer-card="true"] [contenteditable]')].map((field) => ({
      tag: field.tagName,
      role: field.getAttribute('role'),
      contenteditable: field.getAttribute('contenteditable'),
      ariaLabel: field.getAttribute('aria-label'),
      dataPlaceholder: field.getAttribute('data-placeholder'),
    })),
    skillController: Boolean(globalThis.__dshDesktopConversationSkillsV1),
  })).catch(() => undefined) : undefined
  if (diagnostics) console.error(`Conversation Skills evidence: ${JSON.stringify(diagnostics)}`)
  console.error((await readFile(resolve(temporary, 'user-data', 'logs', 'desktop.log'), 'utf8').catch(() => '')).slice(-8_000))
  throw error
} finally {
  await electronApp?.close()
  await rm(temporary, { recursive: true, force: true })
}
