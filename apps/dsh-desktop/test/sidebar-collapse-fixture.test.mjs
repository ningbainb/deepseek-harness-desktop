import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectNativeSidebarCollapse, waitForNativeSidebarCollapsed } from '../scripts/panel-layout-fixture.mjs'

function fixture({ left = 1024, visibility = 'hidden', open = false, overlay = false, descendant = false } = {}) {
  const frameBounds = { left: 0, top: 32, right: 1024, bottom: 768 }
  const content = { getBoundingClientRect: () => ({ left: 600, top: 32, right: 1024, bottom: 768, width: 424, height: 736 }),
    style: { display: 'flex', visibility: 'visible' } }
  const surface = { getBoundingClientRect: () => ({ left, top: 32, right: left + 460, bottom: 768, width: 460, height: 736 }),
    style: { display: 'flex', visibility }, querySelectorAll: () => descendant ? [content] : [], contains: element => element === content }
  return { ownerDocument: { defaultView: { innerWidth: 1024, innerHeight: 768, getComputedStyle: element => element.style },
    elementsFromPoint: () => overlay ? [surface] : [] },
  closest: () => ({ getBoundingClientRect: () => frameBounds }), querySelectorAll: () => [surface],
  getAttribute: () => open ? null : 'true', hasAttribute: () => open }
}

test('rc2 collapse requires hidden content beyond the frame without pointer overlays', () => {
  const inspection = inspectNativeSidebarCollapse(fixture())
  assert.equal(inspection.collapsed, true)
  assert.equal(inspection.surfaces[0].beyondFrame, true)
  assert.equal(inspection.surfaces[0].visibility, 'hidden')
  assert.equal(inspection.interactiveOverlays, 0)
})

test('unallocated cached dock hosts cannot substitute for real translated dock content', () => {
  const panel = fixture()
  const surfaces = panel.querySelectorAll()
  const placeholder = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    style: { display: 'none', visibility: 'hidden' }, querySelectorAll: () => [], contains: () => false }
  panel.querySelectorAll = () => [placeholder, ...surfaces]
  assert.equal(inspectNativeSidebarCollapse(panel).collapsed, true)
  panel.querySelectorAll = () => [placeholder]
  assert.equal(inspectNativeSidebarCollapse(panel).collapsed, false)
})

for (const [name, options] of [
  ['aria-hidden alone', { left: 600, visibility: 'visible' }],
  ['untranslated content', { left: 600 }],
  ['visible content', { visibility: 'visible' }],
  ['pointer overlay', { overlay: true }],
  ['visible descendant overriding inherited visibility', { descendant: true }],
  ['an open panel', { open: true }],
]) {
  test(`collapse rejects ${name}`, () => assert.equal(inspectNativeSidebarCollapse(fixture(options)).collapsed, false))
}

test('legacy panels retain the original strict hidden-container wait and budget', async () => {
  const calls = []
  await waitForNativeSidebarCollapsed({ locator: () => ({ count: async () => 0 }), waitFor: async options => calls.push(options) })
  assert.deepEqual(calls, [{ state: 'hidden', timeout: 30_000 }])
})

test('rc2 panels cannot bypass content waits with a false aria-hidden claim', async () => {
  const calls = []
  const panel = { locator: () => ({ count: async () => 1, all: async () => [{ waitFor: async options => calls.push(options) }] }),
    evaluate: async inspect => inspect(fixture({ left: 600, visibility: 'visible' })) }
  await assert.rejects(waitForNativeSidebarCollapsed(panel), /must be hidden, beyond the frame and non-interactive/u)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].state, 'hidden')
  assert.ok(calls[0].timeout > 0 && calls[0].timeout <= 30_000)
})
