import assert from 'node:assert/strict'
import test from 'node:test'

import {
  compatibilityDialogPresentation,
  filterInstalledPlugins,
  pluginCardPresentation,
  pluginEmptyPresentation,
  pluginEnvironmentRepairPresentation,
  pluginInstallPresentation,
} from '../src/ui/plugin-management-view.mjs'

const installed = [
  { name: '@desktop/builtin', builtIn: true, displayName: 'Built in' },
  { name: '@community/alpha', builtIn: false, displayName: 'Alpha', description: 'Writes notes', publisher: 'Lin' },
  { name: '@community/beta', builtIn: false, displayName: 'Beta', description: 'Reads files', publisher: 'Ning' },
]

test('normal installed card is quiet and exceptional states remain visible', () => {
  assert.deepEqual(pluginCardPresentation({ status: 'normal', statusLabel: '' }), { label: '', tone: 'quiet' })
  assert.deepEqual(pluginCardPresentation({ status: 'update-available', statusLabel: '可更新' }), { label: '可更新', tone: 'quiet' })
  assert.deepEqual(pluginCardPresentation({ status: 'needs-attention', statusLabel: '需要处理' }), { label: '需要处理', tone: 'danger' })
})

test('installing state stays compact and switches to plain language after delay', () => {
  assert.equal(pluginInstallPresentation('installing').button, '正在安装…')
  assert.equal(pluginInstallPresentation('preparing').message, '正在准备插件…')
  assert.equal(pluginInstallPresentation('finishing').message, '正在完成安装…')
  assert.equal(pluginInstallPresentation('failed').message, '插件安装失败')
})

test('unknown and incompatible dialogs use user-facing admission language', () => {
  const unknown = compatibilityDialogPresentation('unknown')
  assert.equal(unknown.title, '无法确认兼容性')
  assert.equal(unknown.confirmLabel, '仍然安装')
  assert.equal(unknown.cancelHidden, false)
  const incompatible = compatibilityDialogPresentation('incompatible')
  assert.equal(incompatible.title, '此插件暂不兼容')
  assert.equal(incompatible.cancelHidden, true)
})

test('full access warning is brief and requires an explicit action', () => {
  const warning = compatibilityDialogPresentation('full-access')
  assert.equal(warning.title, '安装高级插件？')
  assert.match(warning.description, /只安装你信任的插件/u)
  assert.equal(warning.confirmLabel, '继续安装')
})

test('environment repair promises preservation without dependency jargon', () => {
  const hidden = pluginEnvironmentRepairPresentation({ safeMode: false, incidents: [] })
  assert.equal(hidden.visible, false)
  const visible = pluginEnvironmentRepairPresentation({ safeMode: true, incidents: [] })
  assert.equal(visible.visible, true)
  assert.equal(visible.title, '插件环境需要修复')
  assert.match(visible.description, /不会删除聊天、设置或个人数据/u)
  assert.doesNotMatch(visible.description, /node_modules|lockfile|pnpm/u)
})

test('resolved recovery history does not keep the repair alert visible', () => {
  const resolved = pluginEnvironmentRepairPresentation({
    safeMode: false,
    disabledPlugins: [],
    currentIncident: { resolution: 'restored-by-user' },
    incidents: [{ resolution: 'restored-by-user' }],
  })
  assert.equal(resolved.visible, false)

  const unresolved = pluginEnvironmentRepairPresentation({
    safeMode: false,
    disabledPlugins: [],
    currentIncident: { summary: 'failed' },
  })
  assert.equal(unresolved.visible, true)
})

test('empty and search states support discovery plus instant name description and publisher filtering', () => {
  assert.deepEqual(filterInstalledPlugins(installed).map((item) => item.name), ['@community/alpha', '@community/beta'])
  assert.deepEqual(filterInstalledPlugins(installed, 'reads').map((item) => item.name), ['@community/beta'])
  assert.deepEqual(filterInstalledPlugins(installed, 'lin').map((item) => item.name), ['@community/alpha'])
  assert.equal(pluginEmptyPresentation({ installedCount: 0 }).action, '发现插件')
  assert.equal(pluginEmptyPresentation({ installedCount: 2, query: 'missing' }).title, '没有匹配的插件')
})
