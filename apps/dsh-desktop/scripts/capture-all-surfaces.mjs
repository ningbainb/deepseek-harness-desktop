import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import sharp from 'sharp'

import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputArgument = process.argv.find(argument => argument.startsWith('--output='))
const outputRoot = resolve(outputArgument?.slice('--output='.length) || resolve(appDir, 'artifacts', 'all-surfaces'))
const temporary = await mkdtemp(resolve(tmpdir(), 'dsh-all-surfaces-'))
const userData = resolve(temporary, 'user-data')
const dshHome = resolve(temporary, 'dsh-home')
const captures = []
let application

const delay = milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds))

async function nativeWindowId(page) {
  const handle = await application.browserWindow(page)
  return handle.evaluate(window => window.id)
}

async function setWindowContentSize(page, width, height) {
  const handle = await application.browserWindow(page)
  await handle.evaluate((window, size) => window.setContentSize(size.width, size.height), { width, height })
}

async function captureWindow(page, filename, label, { dockSetting } = {}) {
  const id = await nativeWindowId(page)
  let snapshot
  for (let attempt = 0; attempt < 20; attempt += 1) {
    snapshot = await application.evaluate(async ({ BrowserWindow, webContents }, request) => {
      const window = BrowserWindow.fromId(request.windowId)
      if (!window || window.isDestroyed()) throw new Error(`window ${request.windowId} is unavailable`)
      const image = await window.capturePage()
      let dock
      if (request.dockSetting) {
        for (const contents of webContents.getAllWebContents()) {
          if (contents.isDestroyed() || contents.id === window.webContents.id) continue
          const selected = await contents.executeJavaScript(
            'document.querySelector("[data-dsh-dock-settings]")?.getAttribute("data-dsh-dock-settings")',
            true,
          ).catch(() => undefined)
          if (selected !== request.dockSetting) continue
          const dockImage = await contents.capturePage()
          dock = dockImage.toPNG().toString('base64')
          break
        }
      }
      return { window: image.toPNG().toString('base64'), dock }
    }, { windowId: id, dockSetting })
    if (!dockSetting || snapshot.dock) break
    await delay(250)
  }
  if (dockSetting && !snapshot?.dock) {
    throw new Error(`Dock settings view ${dockSetting} was not captured after waiting for it to mount`)
  }
  const path = resolve(outputRoot, filename)
  const windowBuffer = Buffer.from(snapshot.window, 'base64')
  if (snapshot.dock) {
    const dockBuffer = Buffer.from(snapshot.dock, 'base64')
    const [windowMetadata, dockMetadata] = await Promise.all([
      sharp(windowBuffer).metadata(),
      sharp(dockBuffer).metadata(),
    ])
    const left = Math.max(0, (windowMetadata.width ?? 0) - (dockMetadata.width ?? 0))
    const top = Math.max(0, (windowMetadata.height ?? 0) - (dockMetadata.height ?? 0))
    await sharp(windowBuffer).composite([{ input: dockBuffer, left, top }]).png().toFile(path)
  } else {
    await writeFile(path, windowBuffer)
  }
  captures.push({ filename, label })
  console.log(`captured ${filename}: ${label}`)
}

async function dismissMainObstructions(page) {
  const continueButton = page.getByRole('button', { name: /^(?:继续|Continue)$/u })
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const action = continueButton.last()
    if (!await action.isVisible().catch(() => false)) break
    if (await action.isEnabled().catch(() => false)) {
      await action.click({ force: true, timeout: 2_000 }).catch(() => {})
    }
    await delay(250)
  }
  const starPrompt = page.locator('#dsh-desktop-star-prompt[data-open="true"]')
  if (await starPrompt.isVisible().catch(() => false)) {
    await starPrompt.getByRole('button', { name: '先继续使用', exact: true }).click({ force: true })
  }
}

async function createContactSheets() {
  const perSheet = 6
  const tileWidth = 360
  const tileHeight = 225
  const columns = 2
  for (let start = 0; start < captures.length; start += perSheet) {
    const group = captures.slice(start, start + perSheet)
    const rows = Math.ceil(group.length / columns)
    const composites = await Promise.all(group.map(async (entry, index) => ({
      input: await sharp(resolve(outputRoot, entry.filename))
        .resize(tileWidth, tileHeight, { fit: 'contain', background: '#e9edf3' })
        .png()
        .toBuffer(),
      left: (index % columns) * tileWidth,
      top: Math.floor(index / columns) * tileHeight,
    })))
    const sheet = `contact-sheet-${String(start / perSheet + 1).padStart(2, '0')}.png`
    await sharp({
      create: {
        width: tileWidth * columns,
        height: tileHeight * rows,
        channels: 4,
        background: '#e9edf3',
      },
    }).composite(composites).png().toFile(resolve(outputRoot, sheet))
  }
}

async function writeGallery() {
  const rows = captures.map((entry, index) => `
    <figure>
      <a href="${entry.filename}"><img src="${entry.filename}" alt="${entry.label}"></a>
      <figcaption>${String(index + 1).padStart(2, '0')} ${entry.label}</figcaption>
    </figure>`).join('')
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DeepSeek Harness Desktop 界面巡检</title><style>
body{margin:0;padding:32px;background:#eef1f5;color:#172033;font:14px/1.5 "Segoe UI","Microsoft YaHei",sans-serif}
h1{margin:0 0 8px;font-size:24px}p{margin:0 0 24px;color:#5f6b7d}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:20px}
figure{margin:0;padding:12px;border:1px solid #d9dee8;border-radius:14px;background:#fff;box-shadow:0 8px 24px rgba(31,43,65,.06)}
img{display:block;width:100%;aspect-ratio:16/10;object-fit:contain;background:#f7f8fa;border-radius:8px}figcaption{padding:10px 2px 2px;font-weight:600}
</style></head><body><h1>DeepSeek Harness Desktop 界面巡检</h1><p>${captures.length} 个主要用户界面，使用隔离测试 Profile 采集。</p><main class="grid">${rows}</main></body></html>`
  await writeFile(resolve(outputRoot, 'index.html'), html, 'utf8')
  await writeFile(resolve(outputRoot, 'manifest.json'), `${JSON.stringify(captures, null, 2)}\n`, 'utf8')
}

try {
  await mkdir(outputRoot, { recursive: true })
  await seedPrimaryRuntimePermissionForTest({ userData })
  application = await electron.launch({
    executablePath: electronPath,
    args: [resolve(appDir, 'src', 'main.mjs')],
    cwd: appDir,
    env: {
      ...process.env,
      DSH_DESKTOP_DISABLE_UPDATES: '1',
      DSH_DESKTOP_USER_DATA: userData,
      DSH_HOME: dshHome,
    },
  })

  const mainPage = await application.firstWindow()
  await mainPage.waitForURL(/^dsh-runtime:\/\/app\//u, { timeout: 120_000 })
  await mainPage.locator('#dsh-desktop-window-chrome').waitFor({ state: 'visible', timeout: 30_000 })
  await dismissMainObstructions(mainPage)
  await setWindowContentSize(mainPage, 1440, 900)
  await delay(700)
  await captureWindow(mainPage, '01-main-conversation.png', '主界面与会话侧边栏')

  const settingsButton = mainPage.getByRole('button', { name: /设置|Settings/iu }).first()
  if (await settingsButton.isVisible().catch(() => false)) {
    await settingsButton.click({ force: true })
    await mainPage.locator('[role="dialog"].dsh-desktop-settings-window:visible').waitFor({ state: 'visible', timeout: 10_000 })
    await captureWindow(mainPage, '02-main-settings.png', '主界面设置窗口')
    await mainPage.keyboard.press('Escape')
  }

  await mainPage.evaluate(() => window.dshDesktop.checkForUpdates())
  await mainPage.locator('#dsh-desktop-update-surface:not([hidden])').waitFor({ state: 'visible', timeout: 10_000 })
  await delay(350)
  await captureWindow(mainPage, '03-update-panel.png', '桌面版更新面板')
  await mainPage.getByRole('button', { name: '关闭更新窗口' }).click()
  await mainPage.locator('#dsh-desktop-update-surface').waitFor({ state: 'hidden', timeout: 10_000 })

  await mainPage.evaluate(() => window.dshDesktop.openExtensionDock())
  const extensionPage = application.windows().find(page => page.url().includes('extensions.html'))
  if (!extensionPage) throw new Error('Extension Dock window did not open')
  await setWindowContentSize(extensionPage, 1280, 800)
  await extensionPage.reload({ waitUntil: 'domcontentloaded' })
  await extensionPage.waitForFunction(
    () => document.body.dataset.busy !== 'true' && (document.querySelector('#plugin-list')?.children.length ?? 0) > 0,
    undefined,
    { timeout: 90_000 },
  )

  const settingPages = [
    ['control-center-tab', '04-control-center.png', '智能操控'],
    ['models-tab', '05-models.png', '模型与能力'],
    ['value-mode-tab', '06-model-collaboration.png', '模型协作'],
    ['personal-prompt-tab', '07-personal-preferences.png', '个人偏好'],
    ['describe-image-tab', '08-image-understanding.png', '图像理解'],
    ['usage-tab', '09-usage.png', '用量与余额'],
    ['sessions-tab', '10-sessions.png', '会话管理'],
  ]
  for (const [id, filename, label] of settingPages) {
    await extensionPage.locator(`#${id}`).click()
    await extensionPage.locator(`#${id}[aria-selected="true"]`).waitFor({ state: 'attached', timeout: 30_000 })
    await delay(900)
    await captureWindow(extensionPage, filename, `拓展坞 - ${label}`, {
      dockSetting: await extensionPage.locator(`#${id}`).getAttribute('data-setting'),
    })
  }

  await extensionPage.locator('#plugins-hub-tab').click()
  await extensionPage.locator('#plugins-tab').click()
  await delay(500)
  await captureWindow(extensionPage, '11-plugins-installed.png', '拓展坞 - 已安装插件')
  await extensionPage.locator('#market-tab').click()
  await delay(900)
  await captureWindow(extensionPage, '12-plugin-workshop.png', '拓展坞 - 创意工坊')
  await extensionPage.locator('#plugin-settings-tab').click()
  await delay(400)
  await captureWindow(extensionPage, '13-plugin-settings.png', '拓展坞 - 插件设置')

  await extensionPage.locator('#skills-tab').click()
  await delay(400)
  await captureWindow(extensionPage, '14-skills.png', '拓展坞 - 技能中心')
  await extensionPage.locator('#qqbot-tab').click()
  await delay(400)
  await captureWindow(extensionPage, '15-qqbot.png', '拓展坞 - QQ 机器人')

  for (const [id, filename, label] of [
    ['appearance-tab', '16-appearance.png', '皮肤与壁纸'],
    ['particle-theme-tab', '17-motion.png', '外观与动效'],
  ]) {
    await extensionPage.locator(`#${id}`).click()
    await extensionPage.locator(`#${id}[aria-selected="true"]`).waitFor({ state: 'attached', timeout: 30_000 })
    await delay(900)
    await captureWindow(extensionPage, filename, `拓展坞 - ${label}`, {
      dockSetting: await extensionPage.locator(`#${id}`).getAttribute('data-setting'),
    })
  }

  await extensionPage.locator('#backup-tab').click()
  for (const [id, filename, label] of [
    ['presets-tab', '18-presets.png', '环境预设'],
    ['conversation-tab', '19-conversation-import-entry.png', '对话导入'],
    ['migration-tab', '20-migration.png', '旧配置迁移'],
  ]) {
    await extensionPage.locator(`#${id}`).click()
    await delay(350)
    await captureWindow(extensionPage, filename, `拓展坞 - ${label}`)
  }
  await extensionPage.locator('#recovery-tab').click()
  await delay(400)
  await captureWindow(extensionPage, '21-recovery.png', '拓展坞 - 诊断与恢复')

  await mainPage.evaluate(() => window.dshDesktop.helpAction('community'))
  const communityDeadline = Date.now() + 15_000
  let communityPage
  while (Date.now() < communityDeadline && !communityPage) {
    communityPage = application.windows().find(page => page.url().includes('community.html'))
    if (!communityPage) await delay(100)
  }
  if (!communityPage) throw new Error('community window did not open')
  await communityPage.locator('#community-qr[src^="data:image/png;base64,"]').waitFor({ state: 'visible', timeout: 10_000 })
  await captureWindow(communityPage, '22-community.png', '加入社群与问题反馈')

  await mainPage.evaluate(() => window.dshDesktop.openConversationImport())
  const handoffDeadline = Date.now() + 15_000
  let handoffPage
  while (Date.now() < handoffDeadline && !handoffPage) {
    handoffPage = application.windows().find(page => page.url().includes('handoff.html'))
    if (!handoffPage) await delay(100)
  }
  if (!handoffPage) throw new Error('conversation import window did not open')
  await handoffPage.waitForLoadState('domcontentloaded')
  await captureWindow(handoffPage, '23-conversation-import.png', '外部对话导入')

  await writeGallery()
  await createContactSheets()
  console.log(`captured ${captures.length} surfaces in ${outputRoot}`)
} finally {
  await application?.close().catch(() => {})
  await rm(temporary, { recursive: true, force: true })
}
