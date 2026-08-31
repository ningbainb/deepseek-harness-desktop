import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  normalizeSettingsWindowBounds,
  normalizeStoredSettingsWindowBounds,
  SettingsWindowStateStore,
} from '../src/settings-window-state.mjs'

test('settings bounds enforce minimum size and stay inside the safe viewport', () => {
  assert.deepEqual(
    normalizeSettingsWindowBounds(
      { x: -50, y: 900, width: 240, height: 120 },
      { width: 1280, height: 792 },
    ),
    { x: 12, y: 420, width: 520, height: 360 },
  )
})

test('an off-screen but numerically valid bounds is pulled back on read', () => {
  // x=15000 passes the stored-bounds range check (0..16384) yet sits far
  // outside any display. The settings overlay calls applyBounds() on every
  // read and on every resize, and that path re-normalizes against the live
  // viewport, so a stranded panel is always recovered. These two assertions
  // pin the split: the store accepts the value, the viewport clamps it.
  assert.deepEqual(
    normalizeStoredSettingsWindowBounds({ x: 15_000, y: 15_000, width: 800, height: 620 }),
    { x: 15_000, y: 15_000, width: 800, height: 620 },
  )
  assert.deepEqual(
    normalizeSettingsWindowBounds(
      { x: 15_000, y: 15_000, width: 800, height: 620 },
      { width: 1280, height: 792 },
    ),
    { x: 468, y: 160, width: 800, height: 620 },
  )
})

test('settings bounds reclamp persisted geometry for a smaller viewport', () => {
  assert.deepEqual(
    normalizeSettingsWindowBounds(
      { x: 700, y: 400, width: 900, height: 700 },
      { width: 720, height: 508 },
    ),
    { x: 12, y: 12, width: 696, height: 484 },
  )
})

test('stored settings bounds reject non-finite and out-of-range renderer values', () => {
  assert.deepEqual(
    normalizeStoredSettingsWindowBounds({ x: 20, y: 30, width: 800, height: 620 }),
    { x: 20, y: 30, width: 800, height: 620 },
  )
  for (const value of [
    undefined,
    { x: -1, y: 0, width: 800, height: 620 },
    { x: 0, y: 0, width: Number.NaN, height: 620 },
    { x: 0, y: 0, width: 20_000, height: 620 },
  ]) {
    assert.throws(() => normalizeStoredSettingsWindowBounds(value), /settings window bounds/u)
  }
})

test('settings state store survives missing/corrupt state and atomically persists validated bounds', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-settings-state-'))
  const path = join(directory, 'settings-window-state.json')
  const store = new SettingsWindowStateStore(path)
  try {
    assert.equal(await store.load(), undefined)
    await writeFile(path, '{not-json', 'utf8')
    assert.equal(await store.load(), undefined)
    await store.save({ x: 44, y: 55, width: 760, height: 580 })
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), {
      x: 44,
      y: 55,
      width: 760,
      height: 580,
    })
    assert.deepEqual(await store.load(), { x: 44, y: 55, width: 760, height: 580 })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
