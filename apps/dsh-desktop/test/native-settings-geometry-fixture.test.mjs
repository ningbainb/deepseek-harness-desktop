import assert from 'node:assert/strict'
import test from 'node:test'
import { assertNativeSettingsContained } from '../scripts/native-settings-geometry-fixture.mjs'

function geometry(stacked) {
  return {
    expectedStacked: stacked,
    layer: { x: 0, y: 32, right: 759, bottom: 600 },
    box: { x: 12, y: 44, right: 747, bottom: 588 },
    nav: stacked
      ? { left: 12, top: 98, right: 200, bottom: 148, width: 188, height: 50 }
      : { left: 12, top: 98, right: 200, bottom: 588, width: 188, height: 490 },
    content: { left: stacked ? 12 : 200, top: stacked ? 148 : 98, right: 747, bottom: 588,
      width: stacked ? 735 : 547, height: stacked ? 440 : 490, clientWidth: 547, scrollWidth: 547 },
  }
}

for (const stacked of [false, true]) {
  test(`settings geometry requires the authoritative ${stacked ? 'stacked' : 'side by side'} topology`, () => {
    assert.doesNotThrow(() => assertNativeSettingsContained(geometry(stacked)))
    const wrongOrientation = geometry(!stacked)
    wrongOrientation.expectedStacked = stacked
    assert.throws(() => assertNativeSettingsContained(wrongOrientation))
    const overlapping = geometry(stacked)
    if (stacked) overlapping.content.top = overlapping.nav.bottom - 10
    else overlapping.content.left = overlapping.nav.right - 10
    assert.throws(() => assertNativeSettingsContained(overlapping))
  })

  test(`settings geometry preserves every bound and content overflow gate (stacked: ${stacked})`, () => {
    for (const target of ['nav', 'content']) {
      for (const [property, value] of [['left', -10], ['top', -10], ['right', 800], ['bottom', 700], ['width', 0], ['height', 0]]) {
        const invalid = geometry(stacked)
        invalid[target][property] = value
        assert.throws(() => assertNativeSettingsContained(invalid), `${target}.${property}`)
      }
    }
    for (const [property, value] of [['x', -10], ['y', -10], ['right', 800], ['bottom', 700]]) {
      const invalid = geometry(stacked)
      invalid.box[property] = value
      assert.throws(() => assertNativeSettingsContained(invalid), `box.${property}`)
    }
    const overflow = geometry(stacked)
    overflow.content.scrollWidth = overflow.content.clientWidth + 10
    assert.throws(() => assertNativeSettingsContained(overflow))
  })
}
