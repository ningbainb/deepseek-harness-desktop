import assert from 'node:assert/strict'

export function assertNativeSettingsContained(state) {
  const tolerance = 1.5
  const diagnostic = JSON.stringify(state)
  assert.ok(state.box.x >= state.layer.x - tolerance, diagnostic)
  assert.ok(state.box.y >= state.layer.y - tolerance, diagnostic)
  assert.ok(state.box.right <= state.layer.right + tolerance, diagnostic)
  assert.ok(state.box.bottom <= state.layer.bottom + tolerance, diagnostic)
  if (state.expectedStacked) assert.ok(state.nav.bottom <= state.content.top + tolerance, diagnostic)
  else assert.ok(state.nav.right <= state.content.left + tolerance, diagnostic)
  for (const column of [state.nav, state.content]) {
    assert.ok(column.width > 0 && column.height > 0, diagnostic)
    assert.ok(column.left >= state.box.x - tolerance, diagnostic)
    assert.ok(column.top >= state.box.y - tolerance, diagnostic)
    assert.ok(column.right <= state.box.right + tolerance, diagnostic)
    assert.ok(column.bottom <= state.box.bottom + tolerance, diagnostic)
  }
  assert.ok(state.content.scrollWidth <= state.content.clientWidth + tolerance, diagnostic)
}
