import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { createRuntimeInvocation } from '../src/runtime-controller.mjs'
import { startWindowsConsoleObserver } from '../scripts/windows-console-observer.mjs'

const require = createRequire(import.meta.url)

test('repeated official Windows Job children create no visible console under Electron', {
  skip: process.platform !== 'win32',
  timeout: 60_000,
}, async () => {
  const observer = await startWindowsConsoleObserver()
  let result
  let observation
  try {
    const invocation = createRuntimeInvocation({
      executable: require('electron'),
      cliPath: fileURLToPath(new URL('./fixtures/windows-background-runner.mjs', import.meta.url)),
    })
    result = spawnSync(invocation.executable, invocation.args, {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
      encoding: 'utf8',
      timeout: 55_000,
    })
  } finally { observation = await observer.stop() }
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stderr}\n${result.stdout}`)
  const match = /^DSH_CONSOLE_PROBE=(.+)$/mu.exec(result.stdout)
  assert.ok(match, result.stdout)
  const { runtimePid, runtimeConsole, results: probes } = JSON.parse(match[1])
  assert.equal(observation.dropped, 0)
  assert.deepEqual(observation.events.filter(event => event.ancestors.includes(runtimePid) || event.ancestors.includes(result.pid)), [], 'a short-lived background console was shown')
  assert.deepEqual(observation.events.filter(event => probes.some(probe => probe.console === event.window)), [], 'a delegated terminal window was shown for a background command')
  assert.ok(runtimeConsole.members > 0, 'runtime must attach to its hidden parent console')
  assert.equal(runtimeConsole.window, 0, 'test wrapper must own a windowless console')
  assert.equal(probes.length, 3)
  for (const probe of probes) {
    // Children of a windowless console can report no console membership.
    // The relevant invariant is no newly allocated window, not a positive HWND.
    assert.equal(probe.console, runtimeConsole.window, `child allocated a console window: ${JSON.stringify(probe)}`)
    assert.equal(probe.visible, false, `background console flashed: ${JSON.stringify(probe)}`)
  }
  assert.equal(new Set(probes.map(probe => probe.console)).size, 1, 'children must reuse one hidden console')
})

test('console observer detects the unadapted Electron runner positive control', { skip: process.platform !== 'win32', timeout: 60_000 }, async () => {
  const observer = await startWindowsConsoleObserver()
  let child
  let observation
  try {
    // Positive control reproduces the real pre-fix chain without the Desktop
    // preload. It intentionally creates short-lived consoles in isolation.
    child = spawnSync(require('electron'), [fileURLToPath(new URL('./fixtures/windows-background-runner.mjs', import.meta.url))], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true, timeout: 50_000, encoding: 'utf8',
    })
  } finally { observation = await observer.stop() }
  assert.equal(child.status, 0, child.stderr)
  const match = /^DSH_CONSOLE_PROBE=(.+)$/mu.exec(child.stdout)
  assert.ok(match, child.stdout)
  const probes = JSON.parse(match[1]).results
  assert.ok(probes.some(probe => probe.visible), 'positive control did not create a visible console')
  assert.equal(observation.dropped, 0)
  assert.ok(observation.events.some(event => event.ancestors.includes(child.pid) || probes.some(probe => probe.console === event.window)), `observer missed positive control: ${JSON.stringify({ observation, probes })}`)
})
