import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import electronPath from 'electron'

const exec = promisify(execFile)
const home = await mkdtemp(join(tmpdir(), 'dsh-window-state-dpi-'))
const results = []
async function launch(scale, action, displays) {
  const env = { ...process.env, DSH_DPI_FIXTURE_HOME: home, DSH_DPI_FIXTURE_ACTION: action ?? '',
    DSH_DPI_FIXTURE_DISPLAYS: displays ? JSON.stringify(displays) : '' }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.DSH_DPI_FIXTURE_SOURCE
  if (process.env.DSH_DESKTOP_E2E_EXECUTABLE) {
    env.DSH_DPI_FIXTURE_SOURCE = join(dirname(resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE)), 'resources', 'app.asar', 'src')
  }
  const { stdout } = await exec(electronPath,
    [join(import.meta.dirname, 'window-state-dpi-fixture.mjs'), `--force-device-scale-factor=${scale}`],
    { env, windowsHide: true, timeout: 30_000 })
  const line = stdout.split(/\r?\n/).find(line => line.startsWith('DPI_RESULT='))
  assert.ok(line, stdout)
  const result = JSON.parse(line.slice(11))
  results.push(result)
  assert.ok(Math.abs(result.scale - scale) < 0.01, JSON.stringify(result))
  return result
}

try {
  let first
  const observedByScale = new Map()
  for (const scale of [1, 1.25, 1.5, 1.25, 1, 1.25, 1.5, 1]) {
    const result = await launch(scale)
    first ??= result.saved
    assert.deepEqual(result.saved, first, 'automatic DPI restoration must not rewrite logical geometry')
    if (observedByScale.has(scale)) {
      assert.deepEqual(result.bounds, observedByScale.get(scale), 'actual native bounds must not grow across same-DPI relaunches')
    } else observedByScale.set(scale, result.bounds)
  }
  const maximized = await launch(1.25, 'maximize')
  assert.equal(maximized.maximized, true)
  assert.deepEqual(maximized.saved, { ...first, maximized: true })
  const restored = await launch(1.25, 'restore')
  assert.equal(restored.input.maximized, true)
  assert.equal(restored.maximized, false)
  assert.deepEqual(restored.saved, first, 'maximize/restore must retain normal logical bounds')
  const resized = await launch(1.25, 'resize')
  assert.notEqual(resized.saved.width, first.width)
  assert.deepEqual(resized.saved, { ...resized.normal, maximized: false }, 'explicit resize must persist actual new geometry')
  const smallDisplay = [{
    bounds: { x: 0, y: 0, width: 1024, height: 768 },
    workArea: { x: 0, y: 0, width: 1024, height: 720 },
  }]
  const reloaded = await launch(1, undefined, smallDisplay)
  const visibleReload = { x: 0, y: 0, width: 1024, height: 720, maximized: false }
  assert.deepEqual(reloaded.input, visibleReload, 'launch bounds must fit the current work area')
  assert.deepEqual(reloaded.saved, resized.saved, 'visible launch clamping must retain the user-selected logical rectangle')
  assert.deepEqual(reloaded.bounds, { x: 0, y: 0, width: 1024, height: 720 }, 'native 100% bounds must match the visible launch rectangle')

  // DSH-350-DPI-01: the saved rectangle fits at 100% but its x coordinate
  // must be clamped from 1920 to 1706 in the smaller logical work area.
  // Keep this independent of the CI host's physical monitor arrangement.
  first = { x: 1920, y: 145, width: 1280, height: 820, maximized: false }
  await writeFile(join(home, 'window-state.json'), JSON.stringify(first))
  const topology = scale => [{
    bounds: { x: 0, y: 0, width: scale === 1.5 ? 2986 : 3200, height: 1440 },
    workArea: { x: 0, y: 0, width: scale === 1.5 ? 2986 : 3200, height: 1400 },
  }]
  observedByScale.clear()
  for (const scale of [1, 1.25, 1.5, 1.25, 1, 1.5, 1]) {
    const result = await launch(scale, undefined, topology(scale))
    assert.equal(result.input.x, scale === 1.5 ? 1706 : 1920, 'restored window must fit the current work area')
    assert.deepEqual(result.saved, first, 'automatic DPI restoration must not rewrite logical geometry')
    if (observedByScale.has(scale)) {
      assert.deepEqual(result.bounds, observedByScale.get(scale), 'actual native bounds must not grow across same-DPI relaunches')
    } else observedByScale.set(scale, result.bounds)
  }
  const clampedMaximized = await launch(1.5, 'maximize', topology(1.5))
  assert.equal(clampedMaximized.maximized, true)
  assert.deepEqual(clampedMaximized.saved, { ...first, maximized: true })
  const clampedRestored = await launch(1.5, 'restore', topology(1.5))
  assert.equal(clampedRestored.input.maximized, true)
  assert.equal(clampedRestored.maximized, false)
  assert.deepEqual(clampedRestored.saved, first, 'maximize/restore must retain normal logical bounds')
  const clampedResized = await launch(1.5, 'resize', topology(1.5))
  assert.notEqual(clampedResized.saved.x, first.x)
  assert.deepEqual(clampedResized.saved, { ...clampedResized.normal, maximized: false }, 'explicit resize must persist actual new geometry')
  const topologyReloaded = await launch(1, undefined, topology(1))
  assert.deepEqual(topologyReloaded.input, clampedResized.saved)
  assert.deepEqual(topologyReloaded.saved, clampedResized.saved)
  assert.deepEqual(topologyReloaded.bounds, clampedResized.normal)
  console.log(JSON.stringify({ factoryGeometryRegression: true, results }, null, 2))
} catch (error) {
  console.error('DPI geometry regression evidence', JSON.stringify(results))
  throw error
} finally {
  await rm(home, { recursive: true, force: true })
}
