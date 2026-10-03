import assert from 'node:assert/strict'
import test from 'node:test'

import { assertDockPlugin, assertDockSetting, DOCK_TAB_IDS, normalizeDockTab } from '../src/dock-pages.mjs'

test('plugin options navigation accepts only package identities on the fixed page', () => {
  assert.doesNotThrow(() => assertDockSetting('plugin-options'))
  for (const plugin of ['dsh-free-search', '@author/search']) assert.doesNotThrow(() => assertDockPlugin('plugin-options', plugin))
  assert.doesNotThrow(() => assertDockPlugin('memory', undefined))
  for (const plugin of [null, {}, '../search', 'https://example.com', 'search#entry', 'search?foo=1', 'search/client']) {
    assert.throws(() => assertDockPlugin('plugin-options', plugin), /invalid Dock plugin/u)
  }
  assert.throws(() => assertDockPlugin('memory', 'search'), /invalid Dock plugin/u)
})

test('dock open requests normalize to a known management tab', () => {
  for (const id of ['plugins', 'skills', 'market', 'presets', 'recovery', 'qqbot']) {
    assert.equal(normalizeDockTab(id), id)
  }
})

test('dock open requests trim and case-fold the tab value', () => {
  assert.equal(normalizeDockTab('  Plugins  '), 'plugins')
  assert.equal(normalizeDockTab('SKILLS'), 'skills')
})

test('unknown or malformed dock tabs fall back to undefined', () => {
  for (const value of ['', 'does-not-exist', 'dock-settings', 'models', 'value-mode', '../escape', 'plugins?x=1']) {
    assert.equal(normalizeDockTab(value), undefined, `unexpected tab accepted: ${value}`)
  }
  for (const value of [undefined, null, 0, {}, [], true]) {
    assert.equal(normalizeDockTab(value), undefined)
  }
})

test('dock tab allow-list is frozen and contains only non-settings panels', () => {
  assert.ok(Object.isFrozen(DOCK_TAB_IDS))
  // settings-driven panels are reached via a setting id, not a bare tab target
  assert.ok(!DOCK_TAB_IDS.includes('dock-settings'))
})
