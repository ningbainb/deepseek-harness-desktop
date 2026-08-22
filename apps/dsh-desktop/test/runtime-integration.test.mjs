import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { chromium } from 'playwright'

import { BoundedLogStore } from '../src/log-store.mjs'
import {
  SECONDARY_WINDOW_PARTITION,
  beginDesktopStartup,
  createDesktopShutdownLifecycle,
  prepareDesktopRuntimeInputs,
  prepareDesktopRuntimeInputsWithBaselineRecovery,
  requestsUpdateShutdown,
  secondaryWindowWebPreferences,
  desktopDeepLinkFrom,
} from '../src/electron-app.mjs'
import {
  BUILTIN_SKIN_IDS,
  DESKTOP_PROFILE_BOOTSTRAP_ERROR,
  WEB_UI_SETTINGS_NAMESPACES,
  ensureDesktopProfile,
  resolveDshCliPath,
} from '../src/profile.mjs'
import { DesktopProfileBaselineQuarantine } from '../src/profile-baseline-quarantine.mjs'
import { DshRuntimeController } from '../src/runtime-controller.mjs'
import { parseUpdateShutdownRequest } from '../src/update-shutdown-receipt.mjs'

async function availableLoopbackPort(excludedPort) {
  for (;;) {
    const server = createServer()
    const port = await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        resolve(typeof address === 'object' && address !== null ? address.port : 0)
      })
    })
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    if (port !== 0 && port !== excludedPort) return port
  }
}

function legacySkinPatch(skinId) {
  return `# --- dsh-skin managed (auto-generated; do not edit) ---
- insert:
    - id: ui-skin-${skinId}
      name: '@linxin666/dsh-client-ui-skin-${skinId}'
# --- end dsh-skin managed ---
`
}

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

test('installer shutdown requests work through command line and single-instance data', () => {
  assert.equal(requestsUpdateShutdown(['desktop.exe']), false)
  assert.equal(requestsUpdateShutdown(['desktop.exe', '--shutdown-for-update']), true)
  assert.equal(requestsUpdateShutdown(['desktop.exe'], { shutdownForUpdate: true }), true)
  const token = 'a'.repeat(64)
  assert.deepEqual(
    parseUpdateShutdownRequest(['desktop.exe'], { shutdownForUpdate: true, shutdownToken: token }),
    { requested: true, token },
  )
})

test('desktop deep links accept only the configured bounded scheme', () => {
  assert.equal(desktopDeepLinkFrom(['desktop.exe', 'dsh://task/review-1']), 'dsh://task/review-1')
  assert.equal(desktopDeepLinkFrom(['desktop.exe', 'dsh://workspace/open?id=1']), undefined)
  assert.equal(desktopDeepLinkFrom(['desktop.exe', 'https://example.com']), undefined)
  assert.equal(desktopDeepLinkFrom(['desktop.exe', `dsh://${'a'.repeat(4_100)}`]), undefined)
})

test('independent desktop startup inputs begin concurrently', async () => {
  const started = []
  const resolvers = new Map()
  const operation = (name, value) => () => new Promise((resolve) => {
    started.push(name)
    resolvers.set(name, () => resolve(value))
  })

  const preparing = prepareDesktopRuntimeInputs({
    prepareProfile: operation('profile', { profileDir: 'profile' }),
    migrateSettings: operation('settings', { changed: false }),
    loadCredentials: operation('credentials', { appId: 'id', appSecret: 'secret' }),
    onCredentialError: async () => { throw new Error('unexpected credential error') },
  })
  await Promise.resolve()
  assert.deepEqual(started.toSorted(), ['credentials', 'profile', 'settings'])
  for (const resolve of resolvers.values()) resolve()
  assert.deepEqual(await preparing, {
    profile: { profileDir: 'profile' },
    credentials: { appId: 'id', appSecret: 'secret' },
  })
})

test('credential load failure does not block profile preparation', async () => {
  const failures = []
  const result = await prepareDesktopRuntimeInputs({
    prepareProfile: async () => ({ profileDir: 'profile' }),
    migrateSettings: async () => ({ changed: false }),
    loadCredentials: async () => { throw new Error('decrypt failed') },
    onCredentialError: async (error) => failures.push(error.message),
  })
  assert.deepEqual(result, { profile: { profileDir: 'profile' }, credentials: undefined })
  assert.deepEqual(failures, ['decrypt failed'])
})

test('runtime boot begins while the startup shell is still loading', async () => {
  const started = []
  let finishShell
  let finishRuntime
  const { shellPromise, runtimePromise } = beginDesktopStartup({
    loadShell: () => new Promise((resolve) => {
      started.push('shell')
      finishShell = resolve
    }),
    startRuntime: () => new Promise((resolve) => {
      started.push('runtime')
      finishRuntime = resolve
    }),
  })

  await Promise.resolve()
  assert.deepEqual(started, ['shell', 'runtime'])
  finishShell()
  await shellPromise
  finishRuntime('http://127.0.0.1:43125/')
  assert.equal(await runtimePromise, 'http://127.0.0.1:43125/')

  const held = beginDesktopStartup({
    loadShell: async () => started.push('held-shell'),
    startRuntime: async () => started.push('unexpected-runtime'),
    holdRuntime: true,
  })
  await held.shellPromise
  assert.equal(held.runtimePromise, undefined)
  assert.equal(started.includes('unexpected-runtime'), false)
})

test('secondary windows use an isolated non-persistent Electron session', () => {
  const preferences = secondaryWindowWebPreferences({ preload: 'desktop-preload.cjs' })
  assert.equal(SECONDARY_WINDOW_PARTITION.startsWith('persist:'), false)
  assert.deepEqual(preferences, {
    preload: 'desktop-preload.cjs',
    partition: SECONDARY_WINDOW_PARTITION,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    spellcheck: false,
  })
  assert.equal('preload' in secondaryWindowWebPreferences(), false)
})

test('update preparation stops the runtime without disposing the desktop surface', async () => {
  const calls = []
  const lifecycle = createDesktopShutdownLifecycle({
    saveState: async () => calls.push('save'),
    stopRuntime: async () => calls.push('stop'),
    startRuntime: async () => calls.push('start'),
    disposeResources: async () => calls.push('dispose'),
  })

  await Promise.all([lifecycle.stop(), lifecycle.stop()])
  assert.deepEqual(calls, ['save', 'stop'])
  assert.equal(lifecycle.runtimeStopped, true)
  assert.equal(lifecycle.operationsQuiesced, true)
  assert.equal(lifecycle.resourcesDisposed, false)

  assert.equal(await lifecycle.recover(), true)
  assert.deepEqual(calls, ['save', 'stop', 'start'])
  assert.equal(lifecycle.runtimeStopped, false)
  assert.equal(lifecycle.operationsQuiesced, false)

  await lifecycle.shutdown()
  assert.deepEqual(calls, ['save', 'stop', 'start', 'save', 'stop', 'dispose'])
  assert.equal(lifecycle.operationsQuiesced, true)
  assert.equal(lifecycle.resourcesDisposed, true)
})

test('desktop shutdown quiesces mutations before stopping and resumes them for recovery', async () => {
  const calls = []
  const lifecycle = createDesktopShutdownLifecycle({
    prepareStop: async () => calls.push('quiesce'),
    saveState: async () => calls.push('save'),
    stopRuntime: async () => calls.push('stop'),
    resumeOperations: async () => calls.push('resume'),
    startRuntime: async () => calls.push('start'),
    disposeResources: async () => calls.push('dispose'),
  })

  await lifecycle.stop()
  assert.deepEqual(calls, ['quiesce', 'save', 'stop'])
  assert.equal(lifecycle.operationsQuiesced, true)
  assert.equal(await lifecycle.recover(), true)
  assert.deepEqual(calls, ['quiesce', 'save', 'stop', 'resume', 'start'])
  assert.equal(lifecycle.operationsQuiesced, false)
})

test('a disposed desktop lifecycle cannot restart after an update error', async () => {
  let starts = 0
  const lifecycle = createDesktopShutdownLifecycle({
    saveState: async () => {},
    stopRuntime: async () => {},
    startRuntime: async () => { starts += 1 },
    disposeResources: async () => {},
  })
  await lifecycle.shutdown()
  assert.equal(await lifecycle.recover(), false)
  assert.equal(starts, 0)
})

test('a failed runtime stop leaves shutdown retryable and never claims success', async () => {
  let attempts = 0
  const logs = []
  const lifecycle = createDesktopShutdownLifecycle({
    saveState: async () => {},
    stopRuntime: async () => {
      attempts += 1
      if (attempts === 1) throw new Error('runtime process is still locked')
    },
    startRuntime: async () => {},
    disposeResources: async () => {},
    log: async (message) => logs.push(message),
  })

  await assert.rejects(lifecycle.shutdown(), /still locked/u)
  assert.equal(lifecycle.runtimeStopped, false)
  assert.equal(lifecycle.resourcesDisposed, false)
  assert.deepEqual(logs, ['runtime process is still locked'])

  await lifecycle.shutdown()
  assert.equal(attempts, 2)
  assert.equal(lifecycle.runtimeStopped, true)
  assert.equal(lifecycle.resourcesDisposed, true)
})

test('recovery does not start a replacement runtime when the old runtime cannot stop', async () => {
  let starts = 0
  const lifecycle = createDesktopShutdownLifecycle({
    saveState: async () => {},
    stopRuntime: async () => { throw new Error('stop failed') },
    startRuntime: async () => { starts += 1 },
    disposeResources: async () => {},
  })

  assert.equal(await lifecycle.recover(), false)
  assert.equal(lifecycle.runtimeStopped, false)
  assert.equal(starts, 0)
})

test('initial unreadable profile inputs retry once from a private Desktop baseline', async () => {
  for (const fixture of [
    { name: 'manifest', file: 'package.json', content: '{ invalid profile manifest\n' },
    { name: 'manifest-null', file: 'package.json', content: 'null\n' },
    { name: 'links', file: '.dsh-desktop-links.json', content: '{ invalid desktop links\n' },
    {
      name: 'patch',
      file: 'cordis.patch.yml',
      content: '# --- dsh-desktop managed (auto-generated; do not edit) ---\n- id: broken\n',
    },
  ]) {
    const root = await mkdtemp(join(tmpdir(), `dsh-desktop-bootstrap-${fixture.name}-`))
    const profileDir = join(root, 'profiles', 'desktop')
    try {
      await mkdir(profileDir, { recursive: true })
      if (!['manifest', 'manifest-null'].includes(fixture.name)) {
        await writeFile(join(profileDir, 'package.json'), JSON.stringify({
          name: 'dsh-profile-desktop',
          private: true,
          dependencies: {},
          dsh: { profile: { bundles: [] } },
        }))
      }
      await writeFile(join(profileDir, fixture.file), fixture.content)
      const quarantine = new DesktopProfileBaselineQuarantine({
        dshHome: root,
        profileDir,
        stateDir: join(root, 'recovery'),
      })
      let notifications = 0
      const prepared = await prepareDesktopRuntimeInputsWithBaselineRecovery({
        baselineQuarantine: quarantine,
        prepareProfile: () => ensureDesktopProfile({ dshHome: root, packageRoots: new Map() }),
        migrateSettings: async () => {},
        loadCredentials: async () => undefined,
        onBaselineRecovery: async () => { notifications += 1 },
      })
      assert.equal(prepared.baselineRecovered, true)
      assert.equal(prepared.profile.profileDir, profileDir)
      assert.equal(notifications, 1)
      assert.deepEqual(await quarantine.getState(), { available: true })
      const repaired = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
      assert.equal(repaired.name, 'dsh-profile-desktop')
      assert.equal(await quarantine.restore(), true)
      assert.equal(await readFile(join(profileDir, fixture.file), 'utf8'), fixture.content)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
})

test('an already-active baseline is reconciled before the first profile preparation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-bootstrap-active-marker-'))
  const profileDir = join(root, 'profiles', 'desktop')
  const opaquePatch = '- id: opaque-user-loader\n  name: @user/unregistered\n'
  try {
    await mkdir(profileDir, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: [] } },
    }))
    await writeFile(join(profileDir, 'cordis.patch.yml'), opaquePatch)
    const quarantine = new DesktopProfileBaselineQuarantine({
      dshHome: root,
      profileDir,
      stateDir: join(root, 'recovery'),
    })
    await quarantine.quarantine()
    // Simulate the crash window after active.json but before all loader bytes
    // were replaced.  This patch is valid YAML, so the old ordering would
    // merge it during ensureDesktopProfile instead of quarantining it first.
    await writeFile(join(profileDir, 'cordis.patch.yml'), opaquePatch)
    let firstProfilePatch
    let recoveryNotifications = 0
    const prepared = await prepareDesktopRuntimeInputsWithBaselineRecovery({
      baselineQuarantine: quarantine,
      prepareProfile: async () => {
        firstProfilePatch = await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8')
        return { profileDir }
      },
      migrateSettings: async () => {},
      loadCredentials: async () => undefined,
      onBaselineRecovery: async () => { recoveryNotifications += 1 },
    })

    assert.equal(firstProfilePatch, '')
    assert.equal(prepared.baselineRecovered, true)
    assert.equal(recoveryNotifications, 1)
    assert.equal(await quarantine.hasUntrustedActivation(), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('baseline bootstrap helper leaves normal failures alone and restores after a failed retry', async () => {
  let inactiveActivationChecks = 0
  let inactiveQuarantines = 0
  const normal = await prepareDesktopRuntimeInputsWithBaselineRecovery({
    baselineQuarantine: {
      getState: async () => ({ available: false }),
      hasUntrustedActivation: async () => { inactiveActivationChecks += 1; return true },
      quarantine: async () => { inactiveQuarantines += 1; return { available: true } },
      restore: async () => true,
    },
    prepareProfile: async () => ({ profileDir: 'normal-profile' }),
    migrateSettings: async () => {},
    loadCredentials: async () => undefined,
  })
  assert.deepEqual(normal, {
    profile: { profileDir: 'normal-profile' },
    credentials: undefined,
    baselineRecovered: false,
  })
  assert.equal(inactiveActivationChecks, 0)
  assert.equal(inactiveQuarantines, 0)

  let quarantines = 0
  let restores = 0
  const quarantine = {
    quarantine: async () => {
      quarantines += 1
      return { changed: true, available: true }
    },
    restore: async () => { restores += 1; return true },
  }
  await assert.rejects(
    prepareDesktopRuntimeInputsWithBaselineRecovery({
      baselineQuarantine: quarantine,
      prepareProfile: async () => { throw new Error('permission denied') },
      migrateSettings: async () => {},
      loadCredentials: async () => undefined,
    }),
    /permission denied/u,
  )
  assert.equal(quarantines, 0)
  assert.equal(restores, 0)

  let attempts = 0
  await assert.rejects(
    prepareDesktopRuntimeInputsWithBaselineRecovery({
      baselineQuarantine: quarantine,
      prepareProfile: async () => {
        attempts += 1
        if (attempts === 1) {
          const error = new Error('invalid desktop profile')
          error.code = DESKTOP_PROFILE_BOOTSTRAP_ERROR
          throw error
        }
        throw new Error('baseline retry failed')
      },
      migrateSettings: async () => {},
      loadCredentials: async () => undefined,
    }),
    /baseline retry failed/u,
  )
  assert.equal(quarantines, 1)
  assert.equal(restores, 1)
})

test('a broken unmanaged profile node_modules tree is isolated, rebuilt, and restored by the bootstrap baseline', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-bootstrap-node-modules-'))
  const profileDir = join(root, 'profiles', 'desktop')
  const packageName = '@deepseek-ai/dsh-base'
  const sourceDir = join(root, 'runtime-source', '@deepseek-ai', 'dsh-base')
  const targetDir = join(profileDir, 'node_modules', '@deepseek-ai', 'dsh-base')
  const originalPackage = Buffer.from(`${JSON.stringify({
    name: packageName,
    version: '0.0.0-user-tree',
    opaque: 'preserve this exact user dependency tree',
  }, null, 2)}\n`)
  try {
    await mkdir(sourceDir, { recursive: true })
    await mkdir(targetDir, { recursive: true })
    await writeFile(join(sourceDir, 'package.json'), JSON.stringify({ name: packageName, version: '1.0.0' }))
    await writeFile(join(targetDir, 'package.json'), originalPackage)
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: [] } },
    }))
    const quarantine = new DesktopProfileBaselineQuarantine({
      dshHome: root,
      profileDir,
      stateDir: join(root, 'recovery'),
    })
    let attempts = 0
    const prepared = await prepareDesktopRuntimeInputsWithBaselineRecovery({
      baselineQuarantine: quarantine,
      prepareProfile: async () => {
        attempts += 1
        return ensureDesktopProfile({
          dshHome: root,
          packageRoots: new Map([[packageName, sourceDir]]),
        })
      },
      migrateSettings: async () => {},
      loadCredentials: async () => undefined,
    })

    assert.equal(attempts, 2)
    assert.equal(prepared.baselineRecovered, true)
    assert.equal((await quarantine.getState()).available, true)
    assert.deepEqual(
      JSON.parse(await readFile(join(targetDir, 'package.json'), 'utf8')),
      { name: packageName, version: '1.0.0' },
    )

    assert.equal(await quarantine.restore(), true)
    assert.deepEqual(await readFile(join(targetDir, 'package.json')), originalPackage)
    assert.deepEqual(await quarantine.getState(), { available: false })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a malformed managed profile package manifest uses the same reversible bootstrap baseline', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-bootstrap-broken-node-manifest-'))
  const profileDir = join(root, 'profiles', 'desktop')
  const packageName = '@deepseek-ai/dsh-base'
  const sourceDir = join(root, 'runtime-source', '@deepseek-ai', 'dsh-base')
  const targetDir = join(profileDir, 'node_modules', '@deepseek-ai', 'dsh-base')
  const originalPackage = Buffer.from('{ malformed user package metadata\n')
  try {
    await mkdir(sourceDir, { recursive: true })
    await mkdir(targetDir, { recursive: true })
    await writeFile(join(sourceDir, 'package.json'), JSON.stringify({ name: packageName, version: '1.0.0' }))
    await writeFile(join(targetDir, 'package.json'), originalPackage)
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: [] } },
    }))
    const quarantine = new DesktopProfileBaselineQuarantine({
      dshHome: root,
      profileDir,
      stateDir: join(root, 'recovery'),
    })
    let attempts = 0
    const prepared = await prepareDesktopRuntimeInputsWithBaselineRecovery({
      baselineQuarantine: quarantine,
      prepareProfile: async () => {
        attempts += 1
        return ensureDesktopProfile({
          dshHome: root,
          packageRoots: new Map([[packageName, sourceDir]]),
        })
      },
      migrateSettings: async () => {},
      loadCredentials: async () => undefined,
    })

    assert.equal(attempts, 2)
    assert.equal(prepared.baselineRecovered, true)
    assert.deepEqual(
      JSON.parse(await readFile(join(targetDir, 'package.json'), 'utf8')),
      { name: packageName, version: '1.0.0' },
    )
    assert.equal(await quarantine.restore(), true)
    assert.deepEqual(await readFile(join(targetDir, 'package.json')), originalPackage)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('legacy v1 skin selections migrate before the official runtime resolves its boot graph', { timeout: 150_000 }, async () => {
  for (const { skinId, expectedActive } of [
    { skinId: 'xp', expectedActive: 'xp' },
    { skinId: 'qq98', expectedActive: null },
  ]) {
    const root = await mkdtemp(join(tmpdir(), `dsh-desktop-legacy-skin-${skinId}-`))
    const logs = new BoundedLogStore({ directory: join(root, 'logs') })
    let controller
    try {
      const profileDir = join(root, 'profiles', 'desktop')
      await mkdir(profileDir, { recursive: true })
      await writeFile(join(profileDir, 'cordis.patch.yml'), legacySkinPatch(skinId), 'utf8')

      await ensureDesktopProfile({ dshHome: root })

      const migratedPatch = await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8')
      assert.doesNotMatch(migratedPatch, /dsh-skin managed/u)
      assert.doesNotMatch(migratedPatch, new RegExp(`dsh-client-ui-skin-${skinId}`, 'u'))

      const activeState = await readJsonIfPresent(join(root, 'skin-center-active.json'))
      if (expectedActive === null) {
        assert.notEqual(activeState?.active, skinId)
        const retired = await readJsonIfPresent(join(profileDir, '.dsh-desktop-retired-skin.json'))
        assert.equal(retired?.skinId, skinId)
      } else {
        assert.deepEqual(activeState, { active: expectedActive })
        assert.equal(
          await readJsonIfPresent(join(profileDir, '.dsh-desktop-retired-skin.json')),
          undefined,
        )
      }

      controller = new DshRuntimeController({
        cliPath: resolveDshCliPath(),
        cwd: process.cwd(),
        dshHome: root,
        logStore: logs,
        startupTimeoutMs: 45_000,
      })
      const url = await controller.start()
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
      assert.equal(response.ok, true)
      assert.match(await response.text(), /__DSH_BOOT__/)

      const activeResponse = await fetch(new URL('/api/skin-center/v2/active', url), {
        signal: AbortSignal.timeout(5_000),
      })
      assert.equal(activeResponse.ok, true)
      const activePayload = await activeResponse.json()
      assert.equal(activePayload.ok, true)
      assert.equal(activePayload.active, expectedActive)
      assert.equal(controller.status.state, 'ready')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(
        `${skinId} legacy skin migration failed: ${message}\nRecent runtime log:\n${await logs.tail(80)}`,
        { cause: error },
      )
    } finally {
      await controller?.stop()
      await rm(root, { recursive: true, force: true })
    }
  }
})

test('official DSH host serves the complete desktop profile', { timeout: 150_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-runtime-'))
  const logs = new BoundedLogStore({ directory: join(root, 'logs') })
  let controller
  let browser
  try {
    await ensureDesktopProfile({ dshHome: root })
    controller = new DshRuntimeController({
      cliPath: resolveDshCliPath(),
      cwd: process.cwd(),
      dshHome: root,
      logStore: logs,
      startupTimeoutMs: 45_000,
    })
    let url = await controller.start()
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    assert.equal(response.ok, true)
    assert.match(await response.text(), /__DSH_BOOT__/)

    const settingsResponse = await fetch(new URL('/api/settings.describe', url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'desktop-runtime-settings',
        method: 'settings.describe',
        payload: {},
      }),
      signal: AbortSignal.timeout(5_000),
    })
    const settings = await settingsResponse.json()
    assert.equal(settings.result.ok, true)
    const namespaces = new Set(settings.result.value.namespaces.map((entry) => entry.ns))
    for (const namespace of WEB_UI_SETTINGS_NAMESPACES) {
      assert.equal(namespaces.has(namespace), true, `settings namespace ${namespace} is hidden`)
    }

    const particleSettingsResponse = await fetch(new URL('/api/dsh-web-ui-settings/describe', url), {
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
    })
    assert.equal(particleSettingsResponse.ok, true, 'particle settings bridge was not served')
    const particleSettings = await particleSettingsResponse.json()
    assert.equal(particleSettings.ok, true)
    const particleNamespace = particleSettings.value.namespaces.find(entry => entry.ns === 'particle-theme')
    assert.equal(
      particleNamespace?.value?.enabled,
      true,
      `particle-theme is not exposed through the settings bridge: ${JSON.stringify(particleSettings)}`,
    )
    const particleDisableResponse = await fetch(new URL('/api/dsh-web-ui-settings/mutate', url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ns: 'particle-theme',
        ops: [{ op: 'set', path: ['enabled'], value: false }],
        expectedRevision: particleNamespace.revision,
      }),
      signal: AbortSignal.timeout(5_000),
    })
    assert.equal(particleDisableResponse.ok, true)
    const particleDisabled = await particleDisableResponse.json()
    assert.equal(particleDisabled.ok, true)
    assert.equal(particleDisabled.value.value.enabled, false, 'particle-theme toggle did not persist')
    const particleEnableResponse = await fetch(new URL('/api/dsh-web-ui-settings/mutate', url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ns: 'particle-theme',
        ops: [{ op: 'set', path: ['enabled'], value: true }],
        expectedRevision: particleDisabled.value.revision,
      }),
      signal: AbortSignal.timeout(5_000),
    })
    assert.equal(particleEnableResponse.ok, true)
    const particleEnabled = await particleEnableResponse.json()
    assert.equal(particleEnabled.ok, true)
    assert.equal(particleEnabled.value.value.enabled, true, 'particle-theme toggle did not restore')

    const taskBoardUrl = new URL('/api/dsh-task-board/tasks', url)
    const taskBoardInitial = await fetch(taskBoardUrl, { signal: AbortSignal.timeout(5_000) })
    const initialLedgerText = await taskBoardInitial.text()
    assert.equal(taskBoardInitial.ok, true, `Task Board HostStore was not served: ${taskBoardInitial.status} ${initialLedgerText}`)
    const initialLedger = JSON.parse(initialLedgerText)
    assert.equal(initialLedger.schemaVersion, 2)
    assert.equal(initialLedger.revision, 0)
    assert.equal(typeof initialLedger.updatedAt, 'number')
    assert.deepEqual(initialLedger.tasks, [])
    const savedTask = {
      id: 'desktop-runtime-task',
      title: 'Runtime HostStore verification',
      description: '',
      prompt: 'verify',
      status: 'todo',
      createdAt: 1,
      updatedAt: 1,
      executions: [],
    }
    const taskBoardWrite = await fetch(taskBoardUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tasks: [savedTask] }),
      signal: AbortSignal.timeout(5_000),
    })
    assert.equal(taskBoardWrite.ok, true, 'Task Board HostStore write failed')
    const writtenLedger = await taskBoardWrite.json()
    assert.equal(writtenLedger.revision, 1)
    assert.deepEqual(writtenLedger.tasks, [savedTask])
    const persistedTaskBoard = JSON.parse(await readFile(
      join(root, 'profiles', 'desktop', 'state', 'task-board', 'tasks-v2.json'),
      'utf8',
    ))
    assert.equal(persistedTaskBoard.schemaVersion, 2)
    assert.deepEqual(persistedTaskBoard.tasks, [savedTask])

    const originalPort = Number(new URL(url).port)
    const replacementPort = await availableLoopbackPort(originalPort)
    await controller.stop()
    controller = new DshRuntimeController({
      cliPath: resolveDshCliPath(),
      cwd: process.cwd(),
      dshHome: root,
      logStore: logs,
      preferredPort: replacementPort,
      startupTimeoutMs: 45_000,
    })
    url = await controller.start()
    assert.equal(Number(new URL(url).port), replacementPort)
    assert.notEqual(replacementPort, originalPort)
    const restartedTaskBoard = await fetch(new URL('/api/dsh-task-board/tasks', url), {
      signal: AbortSignal.timeout(5_000),
    })
    assert.equal(restartedTaskBoard.ok, true, 'Task Board HostStore was not restored after a port-changing restart')
    assert.deepEqual((await restartedTaskBoard.json()).tasks, [savedTask])

    const unicodeWorkspacePath = join(root, '模拟 D 盘', '中文名字d')
    await mkdir(unicodeWorkspacePath, { recursive: true })
    const callRuntime = async (method, payload) => {
      const apiResponse = await fetch(new URL(`/api/${method}`, url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: `desktop-runtime-${method}`,
          method,
          payload,
        }),
        signal: AbortSignal.timeout(10_000),
      })
      assert.equal(apiResponse.ok, true, `${method} returned HTTP ${apiResponse.status}`)
      return apiResponse.json()
    }
    const workspaceCreated = await callRuntime('workspace.create', { path: unicodeWorkspacePath })
    assert.equal(workspaceCreated.result.ok, true, JSON.stringify(workspaceCreated.result))
    const workspaceId = workspaceCreated.result.value.workspace.workspaceId
    assert.equal(typeof workspaceId, 'string')
    const sessionCreated = await callRuntime('session.create', { workspaceId })
    assert.equal(sessionCreated.result.ok, true, JSON.stringify(sessionCreated.result))
    assert.equal(controller.status.state, 'ready', 'Unicode workspace creation crashed the runtime')

    for (const path of ['/api/pet/state', '/pet/whale/pet.json', '/pet/whale/spritesheet.webp']) {
      const asset = await fetch(new URL(path, url), { signal: AbortSignal.timeout(5_000) })
      assert.equal(asset.ok, true, `${path} was not served`)
    }
    const petsResponse = await fetch(new URL('/api/pet/pets', url), { signal: AbortSignal.timeout(5_000) })
    assert.equal(petsResponse.ok, true, 'pet registry was not served')
    const pets = await petsResponse.json()
    const whaleGirl = pets.find((pet) => pet.id === 'whale-girl')
    assert.equal(whaleGirl?.displayName, '鲸鱼娘（原版）')
    for (const path of [whaleGirl.manifestUrl, whaleGirl.atlasUrl]) {
      const asset = await fetch(new URL(path, url), { signal: AbortSignal.timeout(5_000) })
      assert.equal(asset.ok, true, `${path} was not served`)
    }
    const skinCatalogResponse = await fetch(new URL('/api/skin-center/v2/catalog', url), {
      signal: AbortSignal.timeout(5_000),
    })
    assert.equal(skinCatalogResponse.ok, true, 'Skin Center v2 catalog was not served')
    const skinCatalog = await skinCatalogResponse.json()
    assert.equal(skinCatalog.ok, true)
    const catalogSkinIds = skinCatalog.skins.map((entry) => entry.manifest.id).toSorted()
    assert.deepEqual(catalogSkinIds, BUILTIN_SKIN_IDS)
    for (const entry of skinCatalog.skins) {
      assert.equal(entry.origin, 'builtin')
      assert.equal(entry.manifest.skinManifestVersion, 2)
      assert.equal(typeof entry.manifest.contributes?.stylesheet, 'string')
    }
    const initialSkinStateResponse = await fetch(new URL('/api/skin-center/v2/active', url), {
      signal: AbortSignal.timeout(5_000),
    })
    assert.equal(initialSkinStateResponse.ok, true)
    assert.deepEqual(await initialSkinStateResponse.json(), { ok: true, active: null })
    for (const skinId of BUILTIN_SKIN_IDS) {
      const stylesheet = await fetch(new URL(`/api/skin-center/v2/skins/${skinId}/stylesheet`, url), {
        signal: AbortSignal.timeout(5_000),
      })
      assert.equal(stylesheet.ok, true, `${skinId} Skin Center stylesheet was not served`)
    }
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ locale: 'en-US' })
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    const continueButton = page.getByRole('button', { name: /^(?:继续|Continue)$/u })
    try {
      await continueButton.waitFor({ state: 'visible', timeout: 5_000 })
      await continueButton.click()
    } catch {
      // Existing profiles may already have completed onboarding.
    }
    await page.locator('[data-pet-dock]').waitFor({ state: 'attached', timeout: 10_000 })
    await page.locator('style[data-plugin-css="reasoning-slider"]').waitFor({ state: 'attached', timeout: 10_000 })
    await page.getByRole('button', { name: /^(?:鲸鱼娘（原版）|whale girl)$/u }).waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator('button').filter({ hasText: /^(?:设置|Settings)$/u }).first().evaluate((button) => button.click())
    assert.equal(
      await page.getByRole('button', { name: /^(?:插件市场|Plugin Market)$/u }).count(),
      0,
      'retired Runtime market entry must not remain mounted',
    )

    const applySkin = await fetch(new URL('/api/skin-center/v2/active', url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: 'xp' }),
      signal: AbortSignal.timeout(5_000),
    })
    assert.equal(applySkin.ok, true)
    assert.deepEqual(await applySkin.json(), { ok: true, active: 'xp' })
    assert.deepEqual(
      JSON.parse(await readFile(join(root, 'skin-center-active.json'), 'utf8')),
      { active: 'xp' },
    )
    const selectedSkinStateResponse = await fetch(new URL('/api/skin-center/v2/active', url), {
      signal: AbortSignal.timeout(5_000),
    })
    assert.deepEqual(await selectedSkinStateResponse.json(), { ok: true, active: 'xp' })
    const selectedSkinPage = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    assert.equal(selectedSkinPage.ok, true)
    const selectedSkinHtml = await selectedSkinPage.text()
    assert.match(selectedSkinHtml, /<html[^>]*\sdata-dsh-skin="xp"/u)
    assert.match(
      selectedSkinHtml,
      /\/api\/skin-center\/v2\/skins\/xp\/stylesheet/u,
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('html[data-dsh-skin="xp"]').waitFor({ state: 'attached', timeout: 10_000 })
    assert.equal(await page.locator('html').getAttribute('data-dsh-skin'), 'xp')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${message}\nRecent runtime log:\n${await logs.tail(80)}`, { cause: error })
  } finally {
    await browser?.close()
    await controller?.stop()
    await rm(root, { recursive: true, force: true })
  }
})
