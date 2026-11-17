import assert from 'node:assert/strict'
import test from 'node:test'
import { adaptDesktopBrowserComponentPatches } from '../src/runtime-browser-component-patches.mjs'

test('browser component adapter retains vendor client, configuration and explicit disabled state', () => {
  const input = [{ insert: [
    { id: 'dsh-builtin-browser', name: 'dsh-builtin-browser' },
    { id: 'browser-electron', name: 'dsh-builtin-browser/browser-electron', disabled: true, config: { viewHost: { __jsExpr: "ctx.get('electronViewHost')" }, httpOnly: true } },
  ] }, { id: 'other', name: 'third-party' }]
  const original = structuredClone(input)
  const next = adaptDesktopBrowserComponentPatches(input)
  assert.equal(next[0].insert[0], input[0].insert[0])
  assert.equal(next[0].insert[1].name, new URL('../src/runtime-browser-component.mjs', import.meta.url).href)
  assert.equal(next[0].insert[1].disabled, true)
  assert.deepEqual(next[0].insert[1].config, input[0].insert[1].config)
  assert.deepEqual(input, original)
  assert.deepEqual(adaptDesktopBrowserComponentPatches(next), next)
  assert.equal(next[1], input[1])
})
