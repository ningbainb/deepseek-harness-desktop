import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import { ensureDesktopProfile, resolveDshCliPath, resolveRuntimePackages } from '../src/profile.mjs'
import { DshRuntimeController } from '../src/runtime-controller.mjs'
import { DshRuntimeProvider } from '../src/runtime-provider.mjs'
import { createDesktopShutdownLifecycle } from '../src/electron-app.mjs'
import { createDesktopInstallPreparation } from '../src/install-preparation.mjs'
import { DesktopUpdateController } from '../src/updater.mjs'

const temporaryRoot = await mkdtemp(join(tmpdir(), 'dsh-runtime-provider-'))
const dshHome = join(temporaryRoot, 'dsh-home')
const repositoryRoot = resolve(import.meta.dirname, '..', '..', '..')
const runtimePackages = resolveRuntimePackages()
const ensureProfile = () => ensureDesktopProfile({ dshHome, packageRoots: runtimePackages })
const diagnostics = []
const startupTimings = []
const shutdownMs = []
let provider
let updateController

async function waitForStartupCompletion(count) {
  const deadline = performance.now() + 15_000
  while (startupTimings.filter(timing => timing.phase === 'ready').length < count) {
    if (performance.now() >= deadline) throw new Error('Runtime HTTP readiness preceded incomplete boot finalization')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

async function measuredStop() {
  const started = performance.now()
  await provider.stop()
  shutdownMs.push(Math.round(performance.now() - started))
}

try {
  await ensureProfile()
  const controller = new DshRuntimeController({
    cliPath: resolveDshCliPath(),
    cwd: repositoryRoot,
    dshHome,
    executable: process.execPath,
    logStore: {
      append: async (line) => {
        diagnostics.push(String(line))
        if (diagnostics.length > 200) diagnostics.shift()
        const timing = /^\[stdout\] \[runtime-startup\] (entry|environment|profile|patches|boot|ready)=(\d+)ms$/u.exec(String(line))
        if (timing) startupTimings.push({ phase: timing[1], durationMs: Number(timing[2]) })
      },
    },
    startupTimeoutMs: 180_000,
    shutdownTimeoutMs: 15_000,
    preferredPort: 0,
  })
  provider = new DshRuntimeProvider({
    controller,
    ensureProfile,
    dshHome,
    upstreamVersion: process.env.DSH_CANDIDATE_VERSION ?? '0.1.5-rc.1',
    desktopVersion: '3.4.0',
    runtimeIdentity: { packageName: '@deepseek-ai/dsh', cliRelativePath: 'lib/bin.js' },
  })
  const firstUrl = await provider.start()
  await waitForStartupCompletion(1)
  await measuredStop()
  const recoveredUrl = await provider.recover()
  await waitForStartupCompletion(2)
  // Exercise the shipped composition with a real Runtime and an installer
  // that fails before touching any host installation or operating-system key.
  let preparing = false
  let operationsQuiesced = false
  const lifecycle = createDesktopShutdownLifecycle({
    prepareStop: async () => { operationsQuiesced = true },
    saveState: async () => {},
    stopRuntime: measuredStop,
    resumeOperations: async () => { operationsQuiesced = false },
    startRuntime: () => provider.start(),
    disposeResources: async () => { throw new Error('reversible preparation must not dispose Desktop') },
  })
  const hooks = createDesktopInstallPreparation({
    lifecycle, isQuitRequested: () => false,
    setPreparing: value => { preparing = value },
  })
  const updater = new EventEmitter()
  let launchAttempts = 0
  updater.quitAndInstall = () => {
    launchAttempts += 1
    assert.equal(provider.status.state, 'stopped')
    assert.equal(preparing, true)
    assert.equal(operationsQuiesced, true)
    throw new Error('fixture installer launch failure')
  }
  updateController = new DesktopUpdateController({
    updater, enabled: true, currentVersion: '3.3.0', getWindow: () => undefined,
    ...hooks,
    setTimeoutFn: () => ({ unref() {} }), clearTimeoutFn: () => {},
    setIntervalFn: () => ({}), clearIntervalFn: () => {},
  })
  updateController.start()
  updater.emit('update-downloaded', { version: '3.4.0' })
  assert.equal(await updateController.install(), false)
  assert.equal(launchAttempts, 1)
  assert.equal(updateController.status.phase, 'error')
  assert.equal(updateController.status.message, 'fixture installer launch failure', 'installer fixture preconditions must not be swallowed as an expected error')
  assert.equal(preparing, false)
  assert.equal(operationsQuiesced, false)
  assert.equal(provider.status.state, 'ready')
  assert.equal(lifecycle.resourcesDisposed, false)
  const installFailureRecoveredUrl = provider.status.url
  assert.match(installFailureRecoveredUrl, /^http:\/\/127\.0\.0\.1:/u)
  console.log('verified actual Runtime stop and recovery after composed installer launch failure')
  await waitForStartupCompletion(3)
  await measuredStop()
  if (!firstUrl.startsWith('http://127.0.0.1:') || !recoveredUrl.startsWith('http://127.0.0.1:')) {
    throw new Error('runtime provider returned a non-loopback URL')
  }
  if (provider.status.state !== 'stopped') throw new Error('runtime provider did not stop after recover verification')
  assert.deepEqual(startupTimings.map(timing => timing.phase),
    Array.from({ length: 3 }, () => ['entry', 'environment', 'profile', 'patches', 'boot', 'ready']).flat(),
    'all three real Runtime starts must report fixed stages in order')
  if (process.platform === 'win32') {
    assert.equal(diagnostics.filter(line => line.includes('Runtime graceful shutdown acknowledged')).length, 3,
      'all three healthy Runtime stops must complete cleanup rather than use force fallback')
    assert.equal(shutdownMs.every(duration => duration < 5000), true,
      `healthy Runtime cleanup must not wait for the 15-second force deadline: ${JSON.stringify(shutdownMs)}`)
  }
  console.log(JSON.stringify({
    firstOrigin: new URL(firstUrl).origin,
    recoveredOrigin: new URL(recoveredUrl).origin,
    installFailureRecoveredOrigin: new URL(installFailureRecoveredUrl).origin,
    profileDir: provider.resolveProfilePaths().profileDir,
    shutdownMs,
    startupTimings,
    shutdownDiagnostics: diagnostics.filter(line => /event streams before Runtime disposal|Runtime graceful shutdown|Runtime stop completed|Runtime stop deadline/.test(line)),
  }))
} catch (error) {
  console.error(`Runtime provider diagnostics:\n${diagnostics.join('\n') || '(empty)'}`)
  throw error
} finally {
  updateController?.dispose()
  await provider?.stop()
  await rm(temporaryRoot, { recursive: true, force: true })
}
