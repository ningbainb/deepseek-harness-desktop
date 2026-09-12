import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { attachWindowStatePersistence, loadWindowState, loadWindowStateForRestore, normalizeWindowState } from '../src/window-state.mjs'

const displays = [
  { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
  { bounds: { x: 1920, y: 0, width: 1280, height: 1024 }, workArea: { x: 1920, y: 0, width: 1280, height: 984 } },
]

test('window state preserves visible geometry and clamps size', () => {
  assert.deepEqual(
    normalizeWindowState({ x: 2000, y: 30, width: 300, height: 200, maximized: true }, displays),
    { x: 2000, y: 30, width: 720, height: 540, maximized: true },
  )
})

test('window state recenters geometry that is outside every display', () => {
  assert.deepEqual(
    normalizeWindowState({ x: -9000, y: 9000, width: 1200, height: 800 }, displays),
    { x: 360, y: 120, width: 1200, height: 800, maximized: false },
  )
})

test('window state save is a no-op after the Electron window is destroyed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-window-state-'))
  const statePath = join(root, 'window-state.json')
  const window = new EventEmitter()
  window.isDestroyed = () => true
  window.getNormalBounds = () => { throw new Error('destroyed window was accessed') }
  window.isMaximized = () => { throw new Error('destroyed window was accessed') }
  try {
    const save = attachWindowStatePersistence(window, statePath)
    await save()
    await assert.rejects(readFile(statePath, 'utf8'), (error) => error?.code === 'ENOENT')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('window close persists the final geometry before BrowserWindow destruction', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-window-state-close-'))
  const statePath = join(root, 'window-state.json')
  const window = new EventEmitter()
  let destroyed = false
  let bounds = { x: 80, y: 60, width: 960, height: 700 }
  window.isDestroyed = () => destroyed
  window.getNormalBounds = () => ({ ...bounds })
  window.isMaximized = () => false
  try {
    const save = attachWindowStatePersistence(window, statePath)
    window.emit('resize')
    bounds = { x: 120, y: 90, width: 720, height: 540 }
    window.emit('close')
    destroyed = true
    window.emit('closed')

    await save()
    assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), {
      x: 120,
      y: 90,
      width: 720,
      height: 540,
      maximized: false,
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('restored logical bounds do not accumulate native constructor DPI rounding on save', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-window-state-rounding-'))
  const statePath = join(root, 'window-state.json')
  const window = new EventEmitter()
  const intended = { x: 80, y: 60, width: 1280, height: 820 }
  let bounds = { x: 82, y: 60, width: 1286, height: 824 }
  let maximized = false
  window.isDestroyed = () => false
  window.getNormalBounds = () => ({ ...bounds })
  window.isMaximized = () => maximized
  try {
    const save = attachWindowStatePersistence(window, statePath, { restoredBounds: intended })
    await save()
    assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), { ...intended, maximized: false })
    // A cancelled gesture has not changed native geometry and must not
    // accidentally turn the constructor rounding into a user preference.
    window.emit('will-resize')
    window.emit('will-move')
    await save()
    assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), { ...intended, maximized: false })
    maximized = true
    window.emit('maximize')
    await save()
    assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), { ...intended, maximized: true })
    maximized = false
    window.emit('unmaximize')
    await save()
    assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), { ...intended, maximized: false })
    // A real resize adopts the user's new dimensions, including a later
    // deliberate return to the native dimensions seen at construction.
    window.emit('will-resize')
    bounds = { ...bounds, width: 1000, height: 700 }
    await save()
    assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), { ...intended, width: 1000, height: 700, maximized: false })
    bounds = { ...bounds, width: 1286, height: 824 }
    await save()
    assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), { ...intended, width: 1286, height: 824, maximized: false })
    window.emit('will-move')
    bounds = { ...bounds, x: 200, y: 180 }
    await save()
    assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), { ...bounds, maximized: false })
  } finally {
    window.emit('closed')
    await rm(root, { recursive: true, force: true })
  }
})

test('programmatic geometry changes replace only changed restored coordinates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-window-state-programmatic-'))
  const statePath = join(root, 'window-state.json')
  const window = new EventEmitter()
  let bounds = { x: 82, y: 60, width: 1286, height: 824 }
  window.isDestroyed = () => false
  window.getNormalBounds = () => ({ ...bounds })
  window.isMaximized = () => false
  try {
    const save = attachWindowStatePersistence(window, statePath,
      { restoredBounds: { x: 80, y: 60, width: 1280, height: 820 } })
    bounds = { ...bounds, x: 240, width: 1100 }
    await save()
    assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')),
      { x: 240, y: 60, width: 1100, height: 820, maximized: false })
  } finally {
    window.emit('closed')
    await rm(root, { recursive: true, force: true })
  }
})

test('DPI viewport clamping preserves logical bounds through maximize, restore, and an explicit move or resize', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-window-state-dpi-clamp-'))
  const statePath = join(root, 'window-state.json')
  const window = new EventEmitter()
  t.after(async () => {
    window.emit('closed')
    await rm(root, { recursive: true, force: true })
  })
  const original = { x: 1920, y: 145, width: 1280, height: 820, maximized: false }
  const reducedDisplays = [{
    bounds: { x: 0, y: 0, width: 2986, height: 1440 },
    workArea: { x: 0, y: 0, width: 2986, height: 1400 },
  }]
  await writeFile(statePath, JSON.stringify(original))
  const { state, restoredBounds } = await loadWindowStateForRestore(statePath, reducedDisplays)
  assert.deepEqual(state, { ...original, x: 1706 })
  assert.deepEqual(restoredBounds, original)
  assert.deepEqual(await loadWindowState(statePath, reducedDisplays), state)

  let bounds = { x: state.x, y: state.y, width: 1284, height: 824 }
  let maximized = false
  window.isDestroyed = () => false
  window.getNormalBounds = () => ({ ...bounds })
  window.isMaximized = () => maximized
  const save = attachWindowStatePersistence(window, statePath, { restoredBounds })
  await save()
  assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), original)
  maximized = true
  window.emit('maximize')
  await save()
  assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), { ...original, maximized: true })
  maximized = false
  window.emit('unmaximize')
  await save()
  assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), original)

  const expandedDisplays = [{
    bounds: { x: 0, y: 0, width: 3840, height: 1440 },
    workArea: { x: 0, y: 0, width: 3840, height: 1400 },
  }]
  assert.deepEqual(await loadWindowState(statePath, expandedDisplays), original)
  bounds = { ...bounds, x: 100, width: 1100 }
  window.emit('move')
  window.emit('resize')
  await save()
  const changed = { ...original, x: 100, width: 1100 }
  assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), changed)
  assert.deepEqual(await loadWindowState(statePath, expandedDisplays), changed)
})

test('temporary size clamping and a missing display do not replace the saved normal rectangle', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-window-state-display-clamp-'))
  const statePath = join(root, 'window-state.json')
  const window = new EventEmitter()
  t.after(async () => {
    window.emit('closed')
    await rm(root, { recursive: true, force: true })
  })
  const original = { x: 9000, y: 9000, width: 2800, height: 1800, maximized: true }
  await writeFile(statePath, JSON.stringify(original))
  const { state, restoredBounds } = await loadWindowStateForRestore(statePath, displays.slice(0, 1))
  assert.deepEqual(state, { x: 0, y: 0, width: 1920, height: 1040, maximized: true })
  assert.deepEqual(restoredBounds, original)
  window.isDestroyed = () => false
  window.getNormalBounds = () => ({ x: state.x, y: state.y, width: state.width, height: state.height })
  window.isMaximized = () => true
  await attachWindowStatePersistence(window, statePath, { restoredBounds })()
  assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), original)
  const returnedDisplays = [{
    bounds: { x: 8000, y: 8000, width: 5000, height: 4000 },
    workArea: { x: 8000, y: 8000, width: 5000, height: 3960 },
  }]
  assert.deepEqual(await loadWindowState(statePath, returnedDisplays), original)
})

test('restore metadata rounds valid logical values and retains malformed-state and minimum-size recovery', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-window-state-restore-input-'))
  const statePath = join(root, 'window-state.json')
  t.after(() => rm(root, { recursive: true, force: true }))
  const rounded = { x: -2500, y: 71, width: 1100, height: 701, maximized: true }
  await writeFile(statePath, JSON.stringify({ x: -2500.2, y: 70.6, width: 1100.4, height: 700.6, maximized: true }))
  const restored = await loadWindowStateForRestore(statePath, displays)
  assert.deepEqual(restored.restoredBounds, rounded)
  assert.deepEqual(restored.state, normalizeWindowState(rounded, displays))

  const invalid = { x: '1920', y: null, width: 719, height: 539, maximized: 'true' }
  await writeFile(statePath, JSON.stringify(invalid))
  const normalized = normalizeWindowState(invalid, displays)
  assert.deepEqual(await loadWindowStateForRestore(statePath, displays), { state: normalized, restoredBounds: normalized })
  assert.deepEqual(await loadWindowState(statePath, displays), normalized)
  for (const content of ['{invalid JSON', 'null']) {
    await writeFile(statePath, content)
    const fallback = normalizeWindowState({}, displays)
    assert.deepEqual(await loadWindowStateForRestore(statePath, displays), { state: fallback, restoredBounds: fallback })
    assert.deepEqual(await loadWindowState(statePath, displays), fallback)
  }
})
