import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from './apps/dsh-desktop/node_modules/electron/index.js'
import { _electron as electron } from 'playwright'
import { seedPrimaryRuntimePermissionForTest } from './apps/dsh-desktop/scripts/primary-runtime-permission-fixture.mjs'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)))
const appDir = resolve(root, 'apps', 'dsh-desktop')
const temporary = await mkdtemp(join(tmpdir(), 'dsh-3-3-source-drag-drop-'))
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

async function visibleTextarea(page) {
  const textareas = page.locator('textarea')
  const visible = []
  for (let index = 0; index < await textareas.count(); index += 1) if (await textareas.nth(index).isVisible().catch(() => false)) visible.push(index)
  return textareas.nth(visible.at(-1))
}

async function dispatch(page, kind) {
  return page.evaluate(async (mode) => {
    const makeDrop = (files) => {
      const transfer = new DataTransfer()
      for (const file of files) transfer.items.add(file)
      const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer })
      const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer })
      document.dispatchEvent(dragOver)
      document.dispatchEvent(drop)
      return { types: [...transfer.types], dragOverPrevented: dragOver.defaultPrevented, dropPrevented: drop.defaultPrevented }
    }
    if (mode === 'internal') {
      const transfer = new DataTransfer()
      transfer.setData('application/x-dsh-file', 'docs/release.md')
      const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer })
      document.dispatchEvent(drop)
      return { types: [...transfer.types], dropPrevented: drop.defaultPrevented }
    }
    if (mode === 'document') return makeDrop([new File(['# release smoke\nready'], 'release-smoke.md', { type: 'text/markdown' })])
    if (mode === 'mixed') return makeDrop([
      new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0, 0, 0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 156, 99, 100, 0, 0, 0, 6, 0, 3, 87, 216, 121, 159, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])], 'diagram.png', { type: 'image/png' }),
      new File(['mixed document'], 'mixed.txt', { type: 'text/plain' }),
    ])
    if (mode === 'large') {
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
      return { sourceBytes: blob?.size ?? 0, ...makeDrop([new File([blob], 'large-photo.jpg', { type: 'image/jpeg' })]) }
    }
    if (mode === 'paste') {
      const canvas = document.createElement('canvas')
      canvas.width = 1200
      canvas.height = 800
      const context = canvas.getContext('2d')
      context.fillStyle = '#3578e5'
      context.fillRect(0, 0, canvas.width, canvas.height)
      const blob = await new Promise((resolveBlob) => canvas.toBlob(resolveBlob, 'image/png'))
      const transfer = new DataTransfer()
      transfer.items.add(new File([blob], 'pasted-image.png', { type: 'image/png' }))
      const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer })
      document.dispatchEvent(event)
      return { types: [...transfer.types], pastePrevented: event.defaultPrevented }
    }
    throw new Error(`unknown dispatch mode: ${mode}`)
  }, kind)
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
  const composer = await visibleTextarea(page)
  await composer.fill('drop target: ')
  await page.getByRole('button', { name: '发送消息', exact: true }).click({ force: true })
  await page.waitForTimeout(10_000)
  const internal = await dispatch(page, 'internal')
  await page.waitForTimeout(500)
  const afterInternal = await (await visibleTextarea(page)).inputValue()
  const documentDrop = await dispatch(page, 'document')
  await page.waitForFunction(() => [...document.querySelectorAll('textarea')].some((node) => node.offsetWidth > 0 && node.value.includes('release-smoke.md')), undefined, { timeout: 10_000 })
  const afterDocument = await (await visibleTextarea(page)).inputValue()
  const mixed = await dispatch(page, 'mixed')
  await page.waitForTimeout(1_500)
  const beforeLargeImages = await page.locator('img').count()
  const large = await dispatch(page, 'large')
  await page.waitForTimeout(2_500)
  const largeState = await page.evaluate(async (before) => {
    const images = [...document.querySelectorAll('img')].filter((node) => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0)
    const target = images.at(-1)
    let bytes = 0
    if (target?.src.startsWith('blob:')) bytes = (await fetch(target.src).then((response) => response.blob())).size
    return { before, count: images.length, last: target ? { alt: target.alt, naturalWidth: target.naturalWidth, naturalHeight: target.naturalHeight, bytes } : null }
  }, beforeLargeImages)
  const beforePasteImages = await page.locator('img').count()
  const paste = await dispatch(page, 'paste')
  await page.waitForTimeout(1_500)
  const pasteImageCount = await page.locator('img').count()
  console.log(JSON.stringify({ internal, afterInternal, documentDrop, afterDocument, mixed, large, largeState, paste, beforePasteImages, pasteImageCount, errors }, null, 2))
  await page.screenshot({ path: join(root, 'output', 'playwright', 'run-20260905', 'source-drag-drop.png'), animations: 'disabled', timeout: 60_000 })
} finally {
  await app?.close()
  await rm(temporary, { recursive: true, force: true })
}
