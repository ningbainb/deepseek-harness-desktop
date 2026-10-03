import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { createRuntimeInvocation } from '../src/runtime-controller.mjs'
import { startWindowsConsoleObserver } from '../scripts/windows-console-observer.mjs'

const require = createRequire(import.meta.url)

async function createConsoleProbeAssemblyPath(context) {
  const parent = await realpath(tmpdir())
  const temporary = await mkdtemp(join(parent, 'dsh-console-probe-'))
  const within = relative(parent, temporary)
  assert.ok(within && !within.startsWith('..') && !isAbsolute(within))
  context.after(() => rm(temporary, { recursive: true, force: true }))
  return join(temporary, 'console-probe.dll')
}

test('repeated official Windows Job children create no visible console under Electron', {
  skip: process.platform !== 'win32',
  timeout: 60_000,
}, async context => {
  const probeAssemblyPath = await createConsoleProbeAssemblyPath(context)
  const observer = await startWindowsConsoleObserver({ probeAssemblyPath })
  let result
  let observation
  let invocation
  try {
    const electronExecutable = process.env.DSH_DESKTOP_E2E_EXECUTABLE || require('electron')
    invocation = createRuntimeInvocation({
      executable: electronExecutable,
      cliPath: fileURLToPath(new URL('./fixtures/windows-background-runner.mjs', import.meta.url)),
    })
    result = spawnSync(invocation.executable, invocation.args, {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_CONSOLE_PROBE_ASSEMBLY: probeAssemblyPath },
      windowsHide: true,
      encoding: 'utf8',
      timeout: 85_000,
    })
  } finally { observation = await observer.stop() }
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stderr}\n${result.stdout}`)
  if (process.env.DSH_DESKTOP_E2E_EXECUTABLE) {
    assert.equal(invocation.args.some((argument) => argument === process.env.DSH_DESKTOP_E2E_EXECUTABLE), false)
  }
  const match = /^DSH_CONSOLE_PROBE=(.+)$/mu.exec(result.stdout)
  assert.ok(match, result.stdout)
  const { runtimePid, runtimeConsole, visiblePositiveControl, probeAssemblyUsed, results: probes } = JSON.parse(match[1])
  assert.equal(probeAssemblyUsed, true)
  assert.equal(visiblePositiveControl, false)
  assert.equal(observation.dropped, 0)
  assert.deepEqual(observation.events.filter(event => event.ancestors.includes(runtimePid) || event.ancestors.includes(result.pid)), [], 'a short-lived background console was shown')
  assert.deepEqual(observation.events.filter(event => probes.some(probe => probe.console === event.window)), [], 'a delegated terminal window was shown for a background command')
  assert.ok(runtimeConsole.members > 0, 'runtime must attach to its hidden parent console')
  assert.equal(runtimeConsole.window, 0, 'test wrapper must own a windowless console')
  assert.equal(probes.length, 3)
  for (const probe of probes) {
    assert.equal(probe.probeAssemblyUsed, true, 'the actual Job child must reuse the compiled probe assembly')
    assert.equal(probe.probeAssemblyPath, probeAssemblyPath)
    // Children of a windowless console can report no console membership.
    // The relevant invariant is no newly allocated window, not a positive HWND.
    assert.equal(probe.console, runtimeConsole.window, `child allocated a console window: ${JSON.stringify(probe)}`)
    assert.equal(probe.visible, false, `background console flashed: ${JSON.stringify(probe)}`)
  }
  assert.equal(new Set(probes.map(probe => probe.console)).size, 1, 'children must reuse one hidden console')
})

test('console observer detects explicitly visible official Job children under unadapted Electron', { skip: process.platform !== 'win32', timeout: 60_000 }, async context => {
  const probeAssemblyPath = await createConsoleProbeAssemblyPath(context)
  const observer = await startWindowsConsoleObserver({ probeAssemblyPath })
  let child
  let observation
  try {
    child = spawnSync(require('electron'), [fileURLToPath(new URL('./fixtures/windows-background-runner.mjs', import.meta.url)), '--visible-positive-control'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_CONSOLE_PROBE_ASSEMBLY: probeAssemblyPath },
      windowsHide: true, timeout: 50_000, encoding: 'utf8',
    })
  } finally { observation = await observer.stop() }
  assert.equal(child.status, 0, child.stderr)
  const match = /^DSH_CONSOLE_PROBE=(.+)$/mu.exec(child.stdout)
  assert.ok(match, child.stdout)
  const { runtimeConsole, visiblePositiveControl, probeAssemblyUsed, results: probes } = JSON.parse(match[1])
  assert.equal(probeAssemblyUsed, true)
  assert.equal(visiblePositiveControl, true)
  assert.equal(runtimeConsole.window, 0)
  assert.equal(probes.length, 3)
  assert.equal(new Set(probes.map(probe => probe.console)).size, 3)
  assert.ok(probes.every(probe => probe.console !== 0 && probe.visible))
  assert.ok(probes.some(probe => probe.visible), `positive control did not create a visible console: ${JSON.stringify({ probes, observation })}`)
  assert.equal(observation.dropped, 0)
  assert.ok(observation.events.some(event => event.ancestors.includes(child.pid) || probes.some(probe => probe.console === event.window)), `observer missed positive control: ${JSON.stringify({ observation, probes })}`)
  for (const probe of probes) {
    assert.equal(probe.probeAssemblyUsed, true, 'the actual Job child must reuse the compiled probe assembly')
    assert.equal(probe.probeAssemblyPath, probeAssemblyPath)
    assert.ok(observation.events.some(event => event.window === probe.console), `observer missed visible console ${probe.console}: ${JSON.stringify(observation)}`)
  }
})
