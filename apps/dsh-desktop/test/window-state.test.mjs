import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { attachWindowStatePersistence, normalizeWindowState } from '../src/window-state.mjs'

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
