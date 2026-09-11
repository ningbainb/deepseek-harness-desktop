import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import electronPath from 'electron'

const exec = promisify(execFile)
const home = await mkdtemp(join(tmpdir(), 'dsh-window-state-dpi-'))
const results = []
async function launch(scale, action) {
  const env = { ...process.env, DSH_DPI_FIXTURE_HOME: home, DSH_DPI_FIXTURE_ACTION: action ?? '' }
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
  const reloaded = await launch(1)
  assert.deepEqual(reloaded.input, resized.saved)
  assert.deepEqual(reloaded.saved, resized.saved)
  assert.deepEqual(reloaded.bounds, resized.normal, 'returning to 100% must restore the actual user-selected rectangle')
  console.log(JSON.stringify({ factoryGeometryRegression: true, results }, null, 2))
} catch (error) {
  console.error('DPI geometry regression evidence', JSON.stringify(results))
  throw error
} finally {
  await rm(home, { recursive: true, force: true })
}
