import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'

import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagedExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
const runtimeReadyTimeoutMs = packagedExecutable || process.env.CI ? 120_000 : 60_000
const screenshotArgument = process.argv.find((argument) => argument.toLowerCase().endsWith('.png'))
const screenshot = screenshotArgument ? resolve(screenshotArgument) : undefined
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-skill-discovery-e2e-'))
const userData = resolve(temporary, 'user-data')
const dshHome = resolve(temporary, 'dsh-home')
const skillName = 'desktop-shared-root-check'
let electronApp

try {
  await seedPrimaryRuntimePermissionForTest({ userData })
  const skillRoot = resolve(dshHome, 'skills', skillName)
  await mkdir(skillRoot, { recursive: true })
  await writeFile(
    resolve(skillRoot, 'SKILL.md'),
    `---\nname: ${skillName}\ndescription: Desktop canonical skill root check\n---\n\n# Instructions\n`,
    'utf8',
  )

  electronApp = await electron.launch({
    executablePath: packagedExecutable || electronPath,
    args: packagedExecutable ? [] : [resolve(appDir, 'src', 'main.mjs')],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_VERIFY_UPDATER: '0',
      DSH_DESKTOP_USER_DATA: userData,
      DSH_HOME: dshHome,
      DSH_AGENTS_HOME: resolve(temporary, 'agents-home'),
    },
  })
  const page = await electronApp.firstWindow()
  try {
    await page.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: runtimeReadyTimeoutMs })
  } catch (error) {
    console.error((await readFile(resolve(userData, 'logs', 'runtime.log'), 'utf8').catch(() => '')).slice(-8_000))
    throw error
  }

  const inventory = await page.evaluate(() => window.dshDesktop.listSkills())
  const desktopSkill = inventory.skills.find((skill) => skill.name === skillName)
  assert.ok(desktopSkill, 'Extension Dock/Desktop inventory did not discover the canonical user skill')
  assert.equal(desktopSkill.source, 'user-dsh')

  const entry = page.getByRole('button').filter({ has: page.locator('[data-dsh-panel-entry="skill-explorer"]') })
  try {
    await entry.waitFor({ state: 'visible', timeout: 20_000 })
  } catch (error) {
    console.error(`Skill Center entry missing. Loaded plugins: ${JSON.stringify(await page.evaluate(() =>
      [...document.querySelectorAll('style[data-plugin]')].map((element) => element.dataset.plugin)))}`)
    throw error
  }
  const intro = page.getByRole('button', { name: /^(?:继续|Continue)$/u })
  await intro.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {})
  if (await intro.isVisible()) {
    await intro.click()
    await intro.waitFor({ state: 'hidden' })
  }
  const starPrompt = page.locator('#dsh-desktop-star-prompt[data-open="true"]')
  await starPrompt.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {})
  if (await starPrompt.isVisible()) {
    await starPrompt.getByRole('button', { name: '先继续使用', exact: true }).click()
    await starPrompt.waitFor({ state: 'hidden' })
  }
  await entry.click()
  const center = page.locator('[data-dsh-skill-explorer-view]')
  await center.getByRole('heading', { name: /^(技能中心|Skill Center)$/iu }).waitFor({ state: 'visible' })
  const row = center.locator('[data-dsh-part="skill-row"]').filter({ hasText: skillName })
  await row.waitFor({ state: 'visible', timeout: 20_000 })
  assert.match(await row.textContent() ?? '', /Desktop canonical skill root check/u)
  assert.match(await row.textContent() ?? '', /dsh-home[\\/]skills[\\/]desktop-shared-root-check/iu)

  const apiPayload = await page.evaluate(async () => {
    const response = await fetch('/api/dsh-skill-explorer/list')
    return { status: response.status, body: await response.json() }
  })
  assert.equal(apiPayload.status, 200)
  assert.equal(apiPayload.body.groups.some((group) =>
    group.key === 'user-dsh' && group.skills.some((skill) => skill.name === skillName)), true)

  if (screenshot) await page.screenshot({ path: screenshot })
  console.log(`verified shared Desktop and Skill Center root at ${dshHome}`)
} finally {
  await electronApp?.close()
  await rm(temporary, { recursive: true, force: true })
}
