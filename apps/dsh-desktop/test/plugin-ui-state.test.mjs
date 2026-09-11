import assert from 'node:assert/strict'
import test from 'node:test'

import { createPluginUIState, createPluginUIStates } from '../src/extensions/plugin-ui-state.mjs'

function plugin(overrides = {}) {
  return {
    name: '@community/example',
    requested: '1.4.0',
    version: '1.4.0',
    displayName: 'Example',
    description: 'Adds one useful capability.',
    publisher: 'Community Author',
    permissions: ['读取当前项目文件'],
    enabled: true,
    builtIn: false,
    compatibility: { status: 'compatible', details: { requirements: { runtime: '^0.1.5' } } },
    ...overrides,
  }
}

test('healthy compatible plugins stay visually quiet', () => {
  const state = createPluginUIState(plugin())
  assert.equal(state.status, 'normal')
  assert.equal(state.statusLabel, '')
  assert.equal(state.health, 'healthy')
  assert.equal(state.advanced.runtimeRange, '^0.1.5')
})

test('disabled, update and isolated failure states are explicit', () => {
  assert.equal(createPluginUIState(plugin({ enabled: false })).statusLabel, '已停用')
  assert.equal(createPluginUIState(plugin({ updateAvailable: true, latestVersion: '1.5.0' })).statusLabel, '可更新')
  const failed = createPluginUIState(plugin(), { incident: { pluginName: '@community/example' } })
  assert.equal(failed.statusLabel, '需要处理')
  assert.equal(failed.attention, '插件未能正常启动')
})

test('an incompatible update keeps the installed version available', () => {
  const state = createPluginUIState(plugin({
    updateAvailable: true,
    latestVersion: '2.0.0',
    updateCompatibility: { status: 'incompatible' },
  }))
  assert.equal(state.version, '1.4.0')
  assert.equal(state.updateBlocked, true)
  assert.equal(state.statusLabel, '新版本暂不兼容')
  assert.match(state.attention, /当前版本仍可继续使用/u)
})

test('recovery incidents are joined in main-process UI state projection', () => {
  const [state] = createPluginUIStates([plugin()], {
    incidents: [{ pluginName: '@community/example', summary: 'failed' }],
  })
  assert.equal(state.health, 'failed')
  assert.equal(state.status, 'needs-attention')
})

test('resolved recovery history does not keep a plugin in failed state', () => {
  const [state] = createPluginUIStates([plugin()], {
    incidents: [{
      pluginName: '@community/example',
      summary: 'old failure',
      resolution: 'restored-by-user',
    }],
  })
  assert.equal(state.health, 'healthy')
  assert.equal(state.status, 'normal')
})
