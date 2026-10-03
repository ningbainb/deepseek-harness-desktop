import assert from 'node:assert/strict'
import { test } from 'node:test'
import { visualViewportExtentForDomRect } from '../scripts/viewport-coordinate-fixture.mjs'

test('fractional Chromium visual viewport division is represented through the DOMRect inverse-scale multiplication', () => {
  assert.equal(visualViewportExtentForDomRect(823.3333129882812, 1.5), 823.3333740234375)
  assert.equal(visualViewportExtentForDomRect(547.3333129882812, 1.5), 547.3333740234375)
  for (const scale of [1, 1.25, 1.5, 2]) {
    assert.equal(visualViewportExtentForDomRect(800, scale), 800)
    assert.equal(visualViewportExtentForDomRect(600, scale), 600)
  }
})

test('the exact DOMRect comparison rejects even one representable coordinate step without pixel tolerance', () => {
  const expected = visualViewportExtentForDomRect(823.3333129882812, 1.5)
  const buffer = new ArrayBuffer(4)
  const view = new DataView(buffer)
  view.setFloat32(0, expected)
  const bits = view.getUint32(0)
  for (const direction of [-1, 1]) {
    view.setUint32(0, bits + direction)
    const adjacent = view.getFloat32(0)
    assert.notEqual(adjacent, expected)
    assert.throws(() => assert.equal(adjacent, expected), assert.AssertionError)
  }
})

test('invalid viewport coordinates fail rather than defaulting to an acceptable extent', () => {
  for (const [extent, scale] of [[NaN, 1], [Infinity, 1], [-1, 1], [100, 0], [100, NaN], [100, Infinity]]) {
    assert.throws(() => visualViewportExtentForDomRect(extent, scale), TypeError)
  }
})
