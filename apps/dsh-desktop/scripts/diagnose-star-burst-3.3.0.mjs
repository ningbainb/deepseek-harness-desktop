import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'

const appDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-star-burst-diagnostic-'))
let electronApp
try {
  electronApp = await electron.launch({ executablePath: electronPath, args: [resolve(appDir, 'src', 'main.mjs')], cwd: appDir, env: { ...process.env, DSH_DESKTOP_HOLD_STARTUP: '1', DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_STARTUP_PREVIEW_STATE: 'starting', DSH_DESKTOP_STAR_PROMPT_PREVIEW: '1', DSH_DESKTOP_USER_DATA: resolve(temporary, 'user-data'), DSH_HOME: resolve(temporary, 'dsh-home') } })
  const page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  const prompt = page.locator('#dsh-desktop-star-prompt[data-open="true"]')
  await prompt.waitFor({ state: 'visible', timeout: 60_000 })
  const before = await page.locator('.dsh-star-particle').count()
  await page.getByRole('button', { name: '去 GitHub 点个 Star' }).click()
  const states = []
  for (const delay of [0, 20, 80, 160, 300, 400, 800]) {
    if (delay) await page.waitForTimeout(delay)
    states.push(await page.locator('.dsh-star-particle').first().evaluate((element) => { const style = getComputedStyle(element); const bounds = element.getBoundingClientRect(); return { animationName: style.animationName, animationDuration: style.animationDuration, opacity: style.opacity, bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, html: element.outerHTML.slice(0, 300) } }).catch(() => null))
    if (delay === 0) await page.screenshot({ path: resolve(appDir, '..', '..', 'output', 'playwright', 'run-20260905', 'source-star-burst-immediate.png') })
  }
  console.log(JSON.stringify({ before, after: await page.locator('.dsh-star-particle').count(), states, bodyText: (await page.locator('body').innerText()).slice(-1000) }, null, 2))
} finally { await electronApp?.close().catch(() => {}); await rm(temporary, { recursive: true, force: true }).catch(() => {}) }
