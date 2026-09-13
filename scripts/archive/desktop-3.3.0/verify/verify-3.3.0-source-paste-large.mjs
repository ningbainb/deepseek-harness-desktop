import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from './apps/dsh-desktop/node_modules/electron/index.js'
import { _electron as electron } from 'playwright'
import { seedPrimaryRuntimePermissionForTest } from './apps/dsh-desktop/scripts/primary-runtime-permission-fixture.mjs'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)))
const appDir = resolve(root, 'apps', 'dsh-desktop')
const output = resolve(root, 'output', 'playwright', 'run-20260905', 'source-paste-large.png')
const temporary = await mkdtemp(join(tmpdir(), 'dsh-3-3-source-paste-large-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const workspace = join(temporary, 'workspace')
let app

await mkdir(workspace, { recursive: true })
await seedPrimaryRuntimePermissionForTest({ userData })

async function getPage() {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const page = app.windows().find((candidate) => /^http:\/\/127\.0\.0\.1:/u.test(candidate.url()))
    if (page) return page
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error('runtime window did not appear')
}

async function dismiss(page) {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const star = page.locator('#dsh-desktop-star-prompt[data-open="true"]')
    if (await star.count().catch(() => 0) > 0 && await star.isVisible().catch(() => false)) { await star.getByRole('button', { name: '先继续使用', exact: true }).click({ force: true }); continue }
    const dialogs = page.getByRole('dialog')
    let handled = false
    for (let index = await dialogs.count().catch(() => 0) - 1; index >= 0; index -= 1) {
      const dialog = dialogs.nth(index)
      if (!await dialog.isVisible().catch(() => false)) continue
      if (!/内测声明|插件、技能和桌面核心功能在这里/u.test(await dialog.textContent().catch(() => ''))) continue
      const button = dialog.getByRole('button', { name: /^(继续|Continue)$/u }).last()
      if (await button.count().catch(() => 0) > 0) { await button.click({ force: true }); handled = true; break }
    }
    if (!handled) return
    await page.waitForTimeout(250)
  }
}

async function chooseWorkspace(page) {
  await page.getByRole('button', { name: '选择工作区', exact: true }).click({ force: true })
  const picker = page.getByRole('dialog').filter({ hasText: /编辑路径|新建文件夹|打开/u }).last()
  await picker.waitFor({ state: 'visible', timeout: 30_000 })
  await picker.getByRole('button', { name: /编辑路径|Edit path/iu }).click()
  const input = picker.locator('input').first()
  await input.fill(workspace)
  await input.press('Enter')
  await picker.getByRole('button', { name: '打开', exact: true }).click({ force: true })
  await picker.waitFor({ state: 'hidden', timeout: 30_000 })
  await page.waitForTimeout(4_000)
}

try {
  app = await electron.launch({
    executablePath: electronPath,
    args: [resolve(appDir, 'src', 'main.mjs'), '--force-renderer-accessibility'],
    cwd: appDir,
    env: { ...process.env, DSH_DESKTOP_USER_DATA: userData, DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_VERIFY_UPDATER: '0', DSH_HOME: dshHome, DSH_AGENTS_HOME: join(userData, 'agents') },
  })
  const page = await getPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error' && !/style-src 'self'/u.test(message.text())) errors.push(`console:${message.text()}`) })
  await page.waitForSelector('#dsh-desktop-window-chrome', { timeout: 120_000 })
  await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-mode-switcher"]', { state: 'attached', timeout: 120_000 })
  await dismiss(page)
  await chooseWorkspace(page)
  const textareas = page.locator('textarea')
  const visible = []
  for (let index = 0; index < await textareas.count(); index += 1) if (await textareas.nth(index).isVisible().catch(() => false)) visible.push(index)
  const composer = textareas.nth(visible.at(-1))
  await composer.focus()
  const before = await page.locator('img').count()
  const paste = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 3000
    canvas.height = 2000
    const context = canvas.getContext('2d')
    const image = context.createImageData(canvas.width, canvas.height)
    for (let index = 0; index < image.data.length; index += 4) {
      image.data[index] = (index * 17) & 255
      image.data[index + 1] = (index * 31) & 255
      image.data[index + 2] = (index * 47) & 255
      image.data[index + 3] = 255
    }
    context.putImageData(image, 0, 0)
    const blob = await new Promise((resolveBlob) => canvas.toBlob(resolveBlob, 'image/jpeg', 0.95))
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], 'pasted-large.jpg', { type: 'image/jpeg' }))
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer })
    document.activeElement?.dispatchEvent(event)
    return { sourceBytes: blob?.size ?? 0, types: [...transfer.types], defaultPrevented: event.defaultPrevented }
  })
  await page.waitForTimeout(3_000)
  const state = await page.evaluate(async (previous) => {
    const images = [...document.querySelectorAll('img')].filter((node) => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0)
    const target = images.at(-1)
    let bytes = 0
    if (target?.src.startsWith('blob:')) bytes = (await fetch(target.src).then((response) => response.blob())).size
    return { previous, count: images.length, target: target ? { alt: target.alt, naturalWidth: target.naturalWidth, naturalHeight: target.naturalHeight, bytes } : null }
  }, before)
  await page.screenshot({ path: output, animations: 'disabled', timeout: 60_000 })
  console.log(JSON.stringify({ paste, state, errors }, null, 2))
} finally {
  await app?.close()
  await rm(temporary, { recursive: true, force: true })
}
