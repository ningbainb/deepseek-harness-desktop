import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { _electron as electron } from 'playwright'

import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'

const appDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const appPath = resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE
  ?? join(appDir, 'dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe'))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-packaged-personalization-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
let app

async function dismissStartup(page) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await page.waitForTimeout(250)
    const starPrompt = page.locator('#dsh-desktop-star-prompt')
    if (await starPrompt.getAttribute('data-open').catch(() => null) === 'true') {
      await starPrompt.getByRole('button', { name: '先继续使用', exact: true }).click({ force: true })
      continue
    }
    const dialogs = page.getByRole('dialog')
    const count = await dialogs.count().catch(() => 0)
    let clicked = false
    for (let position = count - 1; position >= 0; position -= 1) {
      const dialog = dialogs.nth(position)
      if (!await dialog.isVisible().catch(() => false)) continue
      const text = await dialog.textContent().catch(() => '')
      if (!/内测声明|插件、技能和桌面核心功能在这里/u.test(text || '')) continue
      const button = dialog.getByRole('button', { name: /^(继续|Continue)$/u }).last()
      if (await button.count().catch(() => 0) > 0) {
        await button.click({ force: true })
        clicked = true
        break
      }
    }
    if (clicked) continue
    if (attempt >= 7) break
  }
}

async function launch() {
  await seedPrimaryRuntimePermissionForTest({ userData })
  const instance = await electron.launch({
    executablePath: appPath,
    args: ['--force-renderer-accessibility'],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_USER_DATA: userData,
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_VERIFY_UPDATER: '0',
      DSH_HOME: dshHome,
      DSH_AGENTS_HOME: join(userData, 'agents'),
    },
  })
  const page = await instance.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(`pageerror:${error.message}`))
  page.on('console', message => {
    if (message.type() !== 'error') return
    if (/style-src 'self'/u.test(message.text())) return
    errors.push(`console:${message.text()}`)
  })
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:/u, { timeout: 120_000 })
  await page.waitForSelector('#dsh-desktop-window-chrome', { timeout: 120_000 })
  await dismissStartup(page)
  return { instance, page, errors }
}

async function openSettings(page) {
  await page.getByRole('button', { name: '设置', exact: true }).click({ force: true })
  const settings = page.locator('[role="dialog"].dsh-desktop-settings-window:visible').last()
  await settings.waitFor({ state: 'visible', timeout: 30_000 })
  await settings.getByText('Web UI 插件', { exact: true }).click()
  const prompt = page.locator('[data-personal-prompt-card="true"]')
  const memory = page.locator('[data-memory-card="true"]')
  await prompt.waitFor({ state: 'visible', timeout: 30_000 })
  await memory.waitFor({ state: 'visible', timeout: 30_000 })
  return { settings, prompt, memory }
}

async function closeSettings(settings) {
  await settings.getByRole('button', { name: '关闭', exact: true }).last().evaluate(button => button.click())
  await settings.waitFor({ state: 'hidden', timeout: 30_000 })
}

async function savePrompt(prompt) {
  await prompt.getByRole('button', { name: '新建 Profile', exact: true }).click()
  await prompt.locator('input[placeholder="例如：简洁代码审查"]').fill('Packaged Prompt')
  await prompt.locator('textarea[placeholder="写下你希望模型长期遵循的工作偏好…"]').fill('Prefer concise Chinese explanations.')
  const enabled = prompt.locator('input[type="checkbox"]').first()
  if (!await enabled.isChecked()) await enabled.click()
  await prompt.getByRole('button', { name: '保存', exact: true }).last().click()
  await prompt.getByText('Packaged Prompt', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  await prompt.getByText('已保存', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  const preview = prompt.locator('pre').last()
  await preview.waitFor({ state: 'visible', timeout: 15_000 })
  return {
    profileListed: true,
    enabled: await enabled.isChecked(),
    previewWrapped: /<user_preferences>[\s\S]*Prefer concise Chinese explanations\.[\s\S]*<\/user_preferences>/u.test(await preview.textContent() || ''),
  }
}

async function saveMemory(memory) {
  const enabled = memory.locator('input[type="checkbox"]').first()
  const savedSection = memory.locator('section').first()
  if (!await enabled.isChecked()) await enabled.click()
  await memory.getByRole('button', { name: '新建', exact: true }).click()
  await memory.locator('textarea[placeholder="只保存你愿意长期保留的事实或偏好…"]').fill('Packaged memory survives restart.')
  await memory.getByRole('button', { name: '保存', exact: true }).click()
  await memory.getByRole('listitem').filter({ hasText: 'Packaged memory survives restart.' }).waitFor({ state: 'visible', timeout: 15_000 })
  await savedSection.getByText('1 条', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  return { enabled: await enabled.isChecked(), itemVisible: true, countOne: true }
}

async function findFiles(directory) {
  const result = []
  let entries
  try { entries = await readdir(directory, { withFileTypes: true }) } catch { return result }
  for (const entry of entries) {
    const filename = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await findFiles(filename))
    else if (entry.name === 'memories.json') result.push(filename)
  }
  return result
}

try {
  const first = await launch()
  app = first.instance
  const firstSettings = await openSettings(first.page)
  const promptPass = await savePrompt(firstSettings.prompt)
  const memoryPass = await saveMemory(firstSettings.memory)
  await closeSettings(firstSettings.settings)
  await app.close()
  app = undefined

  const second = await launch()
  app = second.instance
  const secondSettings = await openSettings(second.page)
  const promptEnabled = secondSettings.prompt.locator('input[type="checkbox"]').first()
  const promptContent = secondSettings.prompt.locator('textarea[placeholder="写下你希望模型长期遵循的工作偏好…"]')
  const memoryContent = secondSettings.memory.getByRole('listitem').filter({ hasText: 'Packaged memory survives restart.' })
  assert.equal(await secondSettings.prompt.getByRole('listitem').filter({ hasText: 'Packaged Prompt' }).count(), 1)
  assert.equal(await promptEnabled.isChecked(), true)
  assert.equal(await promptContent.inputValue(), 'Prefer concise Chinese explanations.')
  assert.equal(await memoryContent.count(), 1)
  const savedMemorySection = secondSettings.memory.locator('section').first()
  assert.equal(await savedMemorySection.getByText('1 条', { exact: true }).count(), 1)
  const restartPass = { promptRestored: true, memoryRestored: true, memoryEnabled: await secondSettings.memory.locator('input[type="checkbox"]').first().isChecked() }
  await secondSettings.memory.getByRole('button', { name: '清空全部', exact: true }).click()
  await savedMemorySection.getByText('0 条', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  await savedMemorySection.getByText('还没有记忆。', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  const clearPass = { countZero: true, empty: true }
  await closeSettings(secondSettings.settings)
  await app.close()
  app = undefined

  const memoryFiles = await findFiles(join(dshHome, 'memory'))
  assert.equal(memoryFiles.length, 1, JSON.stringify(memoryFiles))
  await writeFile(memoryFiles[0], '{"version":1,"items":[', 'utf8')

  const third = await launch()
  app = third.instance
  const thirdSettings = await openSettings(third.page)
  const thirdSavedSection = thirdSettings.memory.locator('section').first()
  await thirdSavedSection.getByText('0 条', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  await thirdSavedSection.getByText('还没有记忆。', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  const corruptPass = { startupAvailable: true, memoryDegradedToEmpty: true, cardVisible: true }
  const expectedCorruptErrors = third.errors.filter(error => /Failed to load resource: the server responded with a status of 503 \(Service Unavailable\)/u.test(error))
  const unexpectedThirdErrors = third.errors.filter(error => !/Failed to load resource: the server responded with a status of 503 \(Service Unavailable\)/u.test(error))
  assert.deepEqual(unexpectedThirdErrors, [], JSON.stringify(third.errors))
  assert.deepEqual(second.errors, [], JSON.stringify(second.errors))
  assert.deepEqual(first.errors, [], JSON.stringify(first.errors))
  console.log(JSON.stringify({ prompt: promptPass, memory: memoryPass, restart: restartPass, clear: clearPass, corrupt: { ...corruptPass, expectedUnavailableResponses: expectedCorruptErrors.length }, pageErrorCount: first.errors.length + second.errors.length + unexpectedThirdErrors.length }, null, 2))
} finally {
  await app?.close()
  await rm(temporary, { recursive: true, force: true })
}
