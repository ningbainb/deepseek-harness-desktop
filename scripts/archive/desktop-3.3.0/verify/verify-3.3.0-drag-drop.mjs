import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'
import { seedPrimaryRuntimePermissionForTest } from './apps/dsh-desktop/scripts/primary-runtime-permission-fixture.mjs'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)))
const appDir = resolve(root, 'apps', 'dsh-desktop')
const executablePath = resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE ?? join(appDir, 'dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe'))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-3-3-drag-drop-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const workspace = join(temporary, 'workspace')
let app

async function getPage() {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const page = app.windows().find((candidate) => /^http:\/\/127\.0\.0\.1:/u.test(candidate.url()))
    if (page) return page
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error('runtime window did not appear')
}

async function dismissStartup(page) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await page.waitForTimeout(250)
    const star = page.locator('#dsh-desktop-star-prompt')
    if (await star.getAttribute('data-open').catch(() => null) === 'true') { await star.getByRole('button', { name: '先继续使用', exact: true }).click({ force: true }); continue }
    const dialogs = page.getByRole('dialog')
    let handled = false
    for (let i = await dialogs.count().catch(() => 0) - 1; i >= 0; i -= 1) {
      const dialog = dialogs.nth(i)
      if (!await dialog.isVisible().catch(() => false)) continue
      if (!/内测声明|插件、技能和桌面核心功能在这里/u.test(await dialog.textContent().catch(() => ''))) continue
      const button = dialog.getByRole('button', { name: /^(继续|Continue)$/u }).last()
      if (await button.count().catch(() => 0) > 0) { await button.click({ force: true }); handled = true; break }
    }
    if (!handled && attempt >= 8) return
  }
}

async function chooseWorkspace(page) {
  await page.getByRole('button', { name: '选择工作区', exact: true }).click({ force: true })
  const picker = page.getByRole('dialog').filter({ hasText: /编辑路径|新建文件夹|打开/u }).last()
  await picker.waitFor({ state: 'visible', timeout: 30_000 })
  await picker.getByRole('button', { name: /编辑路径|Edit path/iu }).click()
  const pathInput = picker.locator('input').first()
  await pathInput.fill(workspace)
  await pathInput.press('Enter')
  await picker.getByRole('button', { name: '打开', exact: true }).click()
  await picker.waitFor({ state: 'hidden', timeout: 30_000 })
  await dismissStartup(page)
}

function visibleTextarea(page) {
  return page.locator('textarea').filter({ visible: true }).last()
}

async function dispatchInternalFileDrop(page, path) {
  return page.evaluate((value) => {
    const transfer = new DataTransfer()
    transfer.setData('application/x-dsh-file', value)
    const dragEnter = new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer })
    const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer })
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer })
    document.dispatchEvent(dragEnter)
    document.dispatchEvent(dragOver)
    document.dispatchEvent(drop)
    return { dragEnterPrevented: dragEnter.defaultPrevented, dragOverPrevented: dragOver.defaultPrevented, dropPrevented: drop.defaultPrevented }
  }, path)
}

async function dispatchOsDrop(page) {
  return page.evaluate(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['# release smoke\\nready'], 'release-smoke.md', { type: 'text/markdown' }))
    const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer })
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer })
    document.dispatchEvent(dragOver)
    document.dispatchEvent(drop)
    return { types: [...transfer.types], dragOverPrevented: dragOver.defaultPrevented, dropPrevented: drop.defaultPrevented }
  })
}

async function dispatchMixedImageDrop(page) {
  return page.evaluate(() => {
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0, 0, 0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 156, 99, 100, 0, 0, 0, 6, 0, 3, 87, 216, 121, 159, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])
    const transfer = new DataTransfer()
    transfer.items.add(new File([png], 'diagram.png', { type: 'image/png' }))
    transfer.items.add(new File(['mixed document'], 'mixed.txt', { type: 'text/plain' }))
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer })
    document.dispatchEvent(drop)
    return { types: [...transfer.types], dropPrevented: drop.defaultPrevented }
  })
}

await mkdir(workspace, { recursive: true })
await seedPrimaryRuntimePermissionForTest({ userData })
try {
  app = await electron.launch({ executablePath, args: ['--force-renderer-accessibility'], cwd: appDir, env: { ...process.env, DSH_DESKTOP_USER_DATA: userData, DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_VERIFY_UPDATER: '0', DSH_HOME: dshHome, DSH_AGENTS_HOME: join(userData, 'agents') } })
  const page = await getPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error' && !/style-src 'self'/u.test(message.text())) errors.push(`console:${message.text()}`) })
  await page.waitForSelector('#dsh-desktop-window-chrome', { timeout: 120_000 })
  await page.waitForSelector('style[data-plugin="@linxin666/dsh-client-ui-mode-switcher"]', { state: 'attached', timeout: 120_000 })
  await dismissStartup(page)
  await chooseWorkspace(page)
  const composer = visibleTextarea(page)
  await composer.fill('drop target: ')
  await page.getByRole('button', { name: '发送消息', exact: true }).click({ force: true })
  await page.waitForTimeout(10_000)
  await page.locator('[data-testid="aionui-drag-inlay"]').waitFor({ state: 'attached', timeout: 30_000 })
  const internal = await dispatchInternalFileDrop(page, 'docs/release.md')
  await page.waitForTimeout(700)
  const afterInternal = await visibleTextarea(page).inputValue()
  const documentDrop = await dispatchOsDrop(page)
  await page.waitForFunction(() => [...document.querySelectorAll('textarea')].some((node) => node.offsetWidth > 0 && node.value.includes('release-smoke.md')), undefined, { timeout: 10_000 })
  const afterDocument = await visibleTextarea(page).inputValue()
  const mixed = await dispatchMixedImageDrop(page)
  await page.waitForTimeout(1_500)
  const attachmentState = await page.evaluate(() => ({
    textareas: [...document.querySelectorAll('textarea')].filter((node) => node.offsetWidth > 0).map((node) => node.value),
    images: [...document.querySelectorAll('img')].map((node) => ({ alt: node.alt, srcPrefix: node.src.slice(0, 80), width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })).filter((item) => item.width > 0 && item.height > 0),
    dragInlayCount: document.querySelectorAll('[data-testid="aionui-drag-inlay"]').length,
  }))
  await page.screenshot({ path: join(root, 'output', 'playwright', 'desktop-drag-drop-after-mixed.png'), animations: 'disabled', timeout: 60_000 })
  console.log(JSON.stringify({ internal, afterInternal, documentDrop, afterDocument, mixed, attachmentState, errors }, null, 2))
} finally {
  await app?.close()
  await rm(temporary, { recursive: true, force: true })
}
