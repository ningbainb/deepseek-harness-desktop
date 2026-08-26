import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMUNITY_QQ_URL,
  GITHUB_DOWNLOADS_URL,
  GITHUB_FEEDBACK_URL,
  GITHUB_PROJECT_URL,
  PRIVACY_POLICY_URL,
} from '../src/community-links.mjs'
import { createCommunityQrImage } from '../src/community.mjs'
import { createApplicationMenuTemplate } from '../src/menu.mjs'
import { installEditContextMenu } from '../src/menu.mjs'

test('community and feedback destinations are fixed secure URLs', () => {
  assert.equal(COMMUNITY_QQ_URL, 'https://qm.qq.com/q/vehlNjaeye')
  assert.equal(GITHUB_DOWNLOADS_URL, 'https://github.com/ningbainb/deepseek-harness-desktop/releases/latest')
  assert.equal(GITHUB_FEEDBACK_URL, 'https://github.com/ningbainb/deepseek-harness-desktop/issues/new/choose')
  assert.equal(GITHUB_PROJECT_URL, 'https://github.com/ningbainb/deepseek-harness-desktop')
  assert.equal(PRIVACY_POLICY_URL, 'https://ningbainb.github.io/deepseek-harness-desktop/privacy.html')
})

test('community QR is generated from the fixed join destination', async () => {
  const image = await createCommunityQrImage()
  assert.match(image, /^data:image\/png;base64,/u)
  assert.ok(image.length > 500)
})

test('Tools and Help menus expose built-in terminal, Extension Dock, and community actions', () => {
  const calls = []
  const template = createApplicationMenuTemplate({
    app: { getVersion: () => '0.1.8' },
    shell: { openExternal: (url) => calls.push(['project', url]) },
    controller: { restart: () => calls.push(['restart']) },
    openCommunity: () => calls.push(['community']),
    openFeedback: () => calls.push(['feedback']),
    openExtensions: () => calls.push(['extensions']),
    openTerminal: () => calls.push(['terminal']),
    openLogs: () => calls.push(['logs']),
    openPrivacy: () => calls.push(['privacy']),
    exportDiagnostics: () => calls.push(['diagnostics']),
    openProject: () => calls.push(['project', GITHUB_PROJECT_URL]),
    checkForUpdates: (options) => calls.push(['updates', options]),
  })
  const tools = template.find((entry) => entry.label === '工具 / Tools')
  const extensions = tools.submenu.find((entry) => entry.label === '扩展坞 / Extension Dock')
  const terminal = tools.submenu.find((entry) => entry.label === '内置终端 / Built-in Terminal')
  const help = template.find((entry) => entry.label === '帮助 / Help')
  const community = help.submenu.find((entry) => entry.label === '加入社群 / Join QQ Group')
  const feedback = help.submenu.find((entry) => entry.label === '提建议 / Suggest an Idea')
  const project = help.submenu.find((entry) => entry.label === 'GitHub 项目')
  const privacy = help.submenu.find((entry) => entry.label === '隐私政策 / Privacy')
  const diagnostics = help.submenu.find((entry) => entry.label === '导出诊断日志 / Export Diagnostics')

  assert.equal(extensions.accelerator, 'CmdOrCtrl+Shift+X')
  assert.equal(terminal.accelerator, 'CmdOrCtrl+Alt+T')
  terminal.click()
  extensions.click()
  community.click()
  feedback.click()
  project.click()
  privacy.click()
  diagnostics.click()
  assert.deepEqual(calls, [
    ['terminal'],
    ['extensions'],
    ['community'],
    ['feedback'],
    ['project', GITHUB_PROJECT_URL],
    ['privacy'],
    ['diagnostics'],
  ])
})

test('App menu exposes all persisted close choices and makes background automation an explicit opt-in', async () => {
  const changes = []
  const template = createApplicationMenuTemplate({
    app: { getVersion: () => '2.7.0' },
    shell: { openExternal: () => {} },
    controller: { restart: () => {} },
    openCommunity: () => {},
    openFeedback: () => {},
    openExtensions: () => {},
    openLogs: () => {},
    checkForUpdates: () => {},
    getCloseBehavior: () => 'ask',
    setCloseBehavior: async (value) => { changes.push(value) },
  })
  const app = template.find((entry) => entry.label === '应用 / App')
  const closeBehavior = app.submenu.find((entry) => entry.label === '关闭行为 / Close behavior')
  const ask = closeBehavior.submenu.find((entry) => entry.label.includes('Ask every time'))
  const background = closeBehavior.submenu.find((entry) => entry.label.includes('enable background automation'))
  assert.equal(ask.type, 'radio')
  assert.equal(ask.checked, true)
  assert.equal(background.type, 'radio')
  assert.equal(background.checked, false)
  background.click()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(changes, ['minimize-to-tray'])
})

test('Edit menu and native context menu expose paste without renderer clipboard access', () => {
  const template = createApplicationMenuTemplate({
    app: { getVersion: () => '2.4.0' },
    shell: { openExternal: () => {} },
    controller: { restart: () => {} },
    openCommunity: () => {},
    openFeedback: () => {},
    openExtensions: () => {},
    openLogs: () => {},
    checkForUpdates: () => {},
  })
  const edit = template.find((entry) => entry.label === '编辑 / Edit')
  const paste = edit.submenu.find((entry) => entry.role === 'paste')
  assert.equal(paste?.label, '粘贴 / Paste')
  assert.equal(paste?.accelerator, 'CmdOrCtrl+V')

  const listeners = new Map()
  const removed = []
  let contextTemplate
  let popupCount = 0
  let pasteCount = 0
  const webContents = {
    on: (name, callback) => { listeners.set(name, callback) },
    removeListener: (name, callback) => { removed.push([name, callback]) },
    paste: () => { pasteCount += 1 },
  }
  const dispose = installEditContextMenu({
    webContents,
    Menu: {
      buildFromTemplate: (entries) => {
        contextTemplate = entries
        return { popup: () => { popupCount += 1 } }
      },
    },
  })
  listeners.get('context-menu')({}, { editFlags: { canCopy: true }, selectionText: 'selected' })
  assert.equal(contextTemplate.find((entry) => entry.role === 'paste')?.enabled, undefined)
  assert.equal(contextTemplate.find((entry) => entry.role === 'copy')?.enabled, true)
  assert.equal(popupCount, 1)
  let prevented = 0
  listeners.get('before-input-event')({ preventDefault: () => { prevented += 1 } }, {
    type: 'keyDown', key: 'V', control: true, shift: true,
  })
  assert.equal(pasteCount, 1)
  assert.equal(prevented, 1)
  dispose()
  assert.deepEqual(removed, [
    ['context-menu', listeners.get('context-menu')],
    ['before-input-event', listeners.get('before-input-event')],
  ])
})

test('menu actions report rejected operations without returning a rejected promise', async () => {
  const errors = []
  const template = createApplicationMenuTemplate({
    app: { getVersion: () => '0.1.8' },
    shell: { openExternal: async () => { throw new Error('project failed') } },
    controller: { restart: async () => { throw new Error('restart failed') } },
    openCommunity: () => {},
    openFeedback: () => {},
    openExtensions: () => {},
    openLogs: () => {},
    checkForUpdates: async () => { throw new Error('update failed') },
    onActionError: (error) => errors.push(error.message),
  })
  const runtime = template.find((entry) => entry.label === '运行时 / Runtime')
  const help = template.find((entry) => entry.label === '帮助 / Help')

  assert.equal(runtime.submenu[0].click(), undefined)
  assert.equal(help.submenu[0].click(), undefined)
  assert.equal(help.submenu.find((entry) => entry.label === 'GitHub 项目').click(), undefined)
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(errors.toSorted(), ['project failed', 'restart failed', 'update failed'])
})
