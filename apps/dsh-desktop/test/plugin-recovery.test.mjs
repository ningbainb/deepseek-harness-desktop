import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { PLUGIN_PACKAGE_MANIFEST_READ_ERROR, PluginManager } from '../src/extensions/plugins.mjs'
import {
  DesktopPluginRecovery,
  PluginRecoveryStore,
  classifyPluginFailure,
  isCrashpadUnattributedProcessFailure,
  recoverProfileAfterPluginInspectionFailure,
  isPluginPackageInspectionFailure,
  shouldAutomaticallyEnterSafeMode,
} from '../src/plugin-recovery.mjs'
import { DesktopProfileBaselineQuarantine } from '../src/profile-baseline-quarantine.mjs'
import { BUILTIN_BUNDLES, ensureDesktopProfile } from '../src/profile.mjs'

test('diagnostic-only recovery observes no Runtime events and cannot auto-disable a plugin', async () => {
  const controller = new EventEmitter()
  controller.status = { state: 'starting' }
  const store = new EventEmitter()
  store.getState = async () => ({ safeMode: false, disabledPlugins: [] })
  const recovery = new DesktopPluginRecovery({
    controller,
    pluginManager: {},
    store,
    ensureProfile: async () => {},
    automatic: false,
  })

  await recovery.initialize()
  assert.equal(controller.listenerCount('line'), 0)
  assert.equal(controller.listenerCount('status'), 0)
  controller.emit('status', { state: 'crashed', error: 'private plugin startup error' })
  assert.deepEqual(await recovery.getState(), {
    safeMode: false,
    disabledPlugins: [],
    baselineQuarantineAvailable: false,
    busy: false,
    recoveryStage: 0,
  })
  await recovery.dispose()
})

test('Electron startup leaves baseline quarantine and compatibility mutation out of the load path', async () => {
  const source = await readFile(new URL('../src/electron-app.mjs', import.meta.url), 'utf8')
  const bootstrap = source.slice(source.indexOf('export async function startElectronApp'))

  assert.doesNotMatch(bootstrap, /new DesktopProfileBaselineQuarantine\(/u)
  assert.doesNotMatch(bootstrap, /recoverProfileAfterPluginInspectionFailure\(/u)
  assert.doesNotMatch(bootstrap, /pluginManager\.reconcileCompatibility\(/u)
  assert.match(bootstrap, /pluginManager\.inspectCompatibility\(/u)
  assert.match(bootstrap, /automatic: false/u)
})

test('plugin failure classifier identifies a missing dependency through a Unicode Windows path', () => {
  const result = classifyPluginFailure([
    "Cannot find package 'schemastery'",
    'imported from D:\\工作区\\桌面配置\\node_modules\\@nonamelego\\dsh-catppuccin\\lib\\index.js',
  ].join('\n'), {
    activePlugins: ['@nonamelego/dsh-catppuccin'],
    protectedPlugins: BUILTIN_BUNDLES,
  })

  assert.equal(result.identified, true)
  assert.equal(result.pluginName, '@nonamelego/dsh-catppuccin')
  assert.equal(result.reasonCode, 'missing-dependency')
  assert.match(result.summary, /schemastery/u)
})

test('plugin failure classifier reports conflicts and never isolates protected built-ins', () => {
  const conflict = classifyPluginFailure(
    "Failed to load plugin 'dsh-vision-router': vision_crop already registered by x6",
    { activePlugins: ['dsh-vision-router', 'x6'] },
  )
  assert.equal(conflict.pluginName, 'dsh-vision-router')
  assert.equal(conflict.reasonCode, 'capability-conflict')
  assert.match(conflict.summary, /vision_crop/u)

  const protectedFailure = classifyPluginFailure(
    'failed to import loader entry shell (@deepseek-ai/dsh-shell)',
    {
      activePlugins: ['@deepseek-ai/dsh-shell'],
      protectedPlugins: ['@deepseek-ai/dsh-shell'],
    },
  )
  assert.equal(protectedFailure.identified, false)
})

test('plugin failure classifier ignores incidental plugin names in host or port failures', () => {
  const result = classifyPluginFailure([
    "plugin '@community/example' initialized successfully",
    'runtime startup failed: listen EADDRINUSE 127.0.0.1:43125',
  ].join('\n'), {
    activePlugins: ['@community/example'],
  })

  assert.equal(result.identified, false)
  assert.equal(result.reasonCode, 'unknown')

  const explicitBeforeHost = classifyPluginFailure([
    "failed to load plugin '@community/example'",
    'runtime startup failed: listen EADDRINUSE 127.0.0.1:43125',
  ].join('\n'), {
    activePlugins: ['@community/example'],
  })
  assert.equal(explicitBeforeHost.identified, false)
})

test('unknown plugin startup recovery excludes port and Windows launcher failures', () => {
  const candidatePlugins = ['@community/opaque']
  assert.equal(shouldAutomaticallyEnterSafeMode(
    'DSH runtime did not become ready within 120000ms',
    { candidatePlugins },
  ), true)
  assert.equal(shouldAutomaticallyEnterSafeMode(
    'runtime startup failed: listen EADDRINUSE 127.0.0.1:43125',
    { candidatePlugins },
  ), false)
  assert.equal(shouldAutomaticallyEnterSafeMode(
    'runtime exited unexpectedly with Windows code 0xFFFFFFFF (signed -1)',
    { candidatePlugins },
  ), false)
  assert.equal(shouldAutomaticallyEnterSafeMode(
    'runtime exited unexpectedly with code=-1',
    { candidatePlugins },
  ), false)
  assert.equal(shouldAutomaticallyEnterSafeMode(
    'PowerShell -WindowStyle Hidden exited before readiness',
    { candidatePlugins },
  ), false)
  assert.equal(isCrashpadUnattributedProcessFailure(
    '[0819/092634.721:ERROR:third_party\\crashpad\\client\\crashpad_client_win.cc:867] not connected',
  ), true)
  assert.equal(shouldAutomaticallyEnterSafeMode(
    'Crashpad client not connected\nruntime exited unexpectedly with Windows code 0xFFFF7003 (signed -36861)',
    { candidatePlugins },
  ), true)
  assert.equal(isCrashpadUnattributedProcessFailure(
    'Crashpad client not connected\nruntime startup failed: listen EADDRINUSE 127.0.0.1:43125',
  ), false)
  assert.equal(shouldAutomaticallyEnterSafeMode(
    'Crashpad client not connected\nError: spawn git.exe ENOENT',
    { candidatePlugins },
  ), false)
  assert.equal(shouldAutomaticallyEnterSafeMode(
    'plugin startup failed: Error: spawn optional-helper.exe ENOENT',
    { candidatePlugins },
  ), true)
  assert.equal(shouldAutomaticallyEnterSafeMode(
    'DSH runtime did not become ready within 120000ms',
    { candidatePlugins: [] },
  ), false)
})

test('private baseline quarantine preserves opaque profile and home loader bytes without parsing them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-private-baseline-quarantine-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const stateDir = join(root, 'recovery')
  const profilePatch = Buffer.from('# opaque profile loader\n- insert: [broken\n', 'utf8')
  const homePatch = Buffer.from('# opaque home loader\n- name: @external/unregistered\n  config: [\xff', 'binary')
  const originalManifest = Buffer.from('{ this is not valid JSON\n', 'utf8')
  const originalLinks = Buffer.from('{ this is not valid JSON either\n', 'utf8')
  try {
    await mkdir(profileDir, { recursive: true })
    await writeFile(join(profileDir, 'cordis.patch.yml'), profilePatch)
    await writeFile(join(dshHome, 'cordis.patch.yml'), homePatch)
    await writeFile(join(profileDir, 'package.json'), originalManifest)
    await writeFile(join(profileDir, '.dsh-desktop-links.json'), originalLinks)
    const quarantine = new DesktopProfileBaselineQuarantine({ dshHome, profileDir, stateDir })

    assert.equal(await quarantine.hasUntrustedActivation(), true)
    assert.deepEqual(await quarantine.getState(), { available: false })
    assert.deepEqual(await quarantine.quarantine(), { changed: true, available: true })
    assert.deepEqual(await quarantine.getState(), { available: true })
    const baselineManifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.deepEqual(baselineManifest.dependencies, {})
    assert.deepEqual(baselineManifest.dsh.profile.bundles, BUILTIN_BUNDLES)
    assert.equal(await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8'), '')
    assert.equal(await readFile(join(dshHome, 'cordis.patch.yml'), 'utf8'), '[]\n')
    assert.equal(await readFile(join(profileDir, '.dsh-desktop-links.json'), 'utf8'), '{}\n')

    const archiveRoot = join(stateDir, 'private-baseline-quarantine', 'snapshots')
    const [snapshotId] = await readdir(archiveRoot)
    assert.deepEqual(await readFile(join(archiveRoot, snapshotId, 'profile-patch.bin')), profilePatch)
    assert.deepEqual(await readFile(join(archiveRoot, snapshotId, 'home-patch.bin')), homePatch)
    assert.deepEqual(await readFile(join(archiveRoot, snapshotId, 'profile-manifest.bin')), originalManifest)
    assert.deepEqual(await readFile(join(archiveRoot, snapshotId, 'profile-links.bin')), originalLinks)

    assert.equal(await quarantine.restore(), true)
    assert.deepEqual(await quarantine.getState(), { available: false })
    assert.deepEqual(await readFile(join(profileDir, 'cordis.patch.yml')), profilePatch)
    assert.deepEqual(await readFile(join(dshHome, 'cordis.patch.yml')), homePatch)
    assert.deepEqual(await readFile(join(profileDir, 'package.json')), originalManifest)
    assert.deepEqual(await readFile(join(profileDir, '.dsh-desktop-links.json')), originalLinks)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('private baseline quarantine never trusts a spoofed Desktop marker label', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-private-baseline-spoofed-marker-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  try {
    await mkdir(profileDir, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
    }))
    await writeFile(join(profileDir, 'cordis.patch.yml'), [
      '# --- dsh-desktop attacker-owned ---',
      '- id: opaque-loader',
      '  name: @user/unregistered',
      '# --- end dsh-desktop attacker-owned ---',
      '',
    ].join('\n'))
    const quarantine = new DesktopProfileBaselineQuarantine({
      dshHome,
      profileDir,
      stateDir: join(root, 'recovery'),
    })

    assert.equal(await quarantine.hasUntrustedActivation(), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a freshly ensured Desktop profile has no opaque activation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-private-baseline-default-profile-'))
  const profileDir = join(root, 'profiles', 'desktop')
  try {
    await ensureDesktopProfile({ dshHome: root, packageRoots: new Map() })
    const quarantine = new DesktopProfileBaselineQuarantine({
      dshHome: root,
      profileDir,
      stateDir: join(root, 'recovery'),
    })

    assert.equal(await quarantine.hasUntrustedActivation(), false)
    assert.equal(await quarantine.hasUserActivation(), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('private baseline distinguishes valid external activation from Desktop-managed profile links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-private-baseline-user-activation-'))
  const profileDir = join(root, 'profiles', 'desktop')
  const externalBundle = '@community/crashpad-opaque'
  try {
    await mkdir(profileDir, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: {
        '@linxin666/dsh-client-ui-git-graph': 'link:C:/Desktop/git-graph',
      },
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
    }))
    const quarantine = new DesktopProfileBaselineQuarantine({
      dshHome: root,
      profileDir,
      stateDir: join(root, 'recovery'),
    })

    assert.equal(await quarantine.hasUntrustedActivation(), false)
    assert.equal(await quarantine.hasUserActivation(), false)

    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: { [externalBundle]: '1.0.0' },
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES, externalBundle] } },
    }))
    assert.equal(await quarantine.hasUntrustedActivation(), false)
    assert.equal(await quarantine.hasUserActivation(), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('opaque user loader startup failure reaches readiness through a reversible Desktop baseline', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-recovery-opaque-loader-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const stateDir = join(root, 'recovery')
  try {
    await mkdir(profileDir, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
    }))
    await writeFile(join(profileDir, 'cordis.patch.yml'), '- insert: [opaque user loader\n')
    await writeFile(join(dshHome, 'cordis.patch.yml'), '- name: @external/unregistered\n')
    const baselineQuarantine = new DesktopProfileBaselineQuarantine({ dshHome, profileDir, stateDir })
    const controller = new EventEmitter()
    controller.status = { state: 'starting' }
    controller.stop = async () => {
      controller.status = { state: 'stopped' }
      controller.emit('status', controller.status)
    }
    let starts = 0
    controller.start = async () => {
      starts += 1
      controller.status = { state: 'starting' }
      controller.emit('status', controller.status)
      controller.status = { state: 'ready', url: 'http://127.0.0.1:14567/' }
      controller.emit('status', controller.status)
      return controller.status.url
    }
    const pluginManager = {
      inventory: async () => { throw new Error('dependency tree is not recognizable') },
      recoveryCandidates: async () => [],
      enterSafeMode: async () => { throw new Error('safe mode must not require a manifest candidate') },
    }
    const store = new PluginRecoveryStore({ profileDir, stateDir, builtInBundles: BUILTIN_BUNDLES })
    let ensured = 0
    const recovery = new DesktopPluginRecovery({
      controller,
      pluginManager,
      store,
      ensureProfile: async () => { ensured += 1 },
      builtInBundles: BUILTIN_BUNDLES,
      baselineQuarantine,
      schedule: () => ({ unref() {} }),
      cancelSchedule: () => {},
    })
    await recovery.initialize()
    controller.status = { state: 'crashed', error: 'DSH runtime did not become ready within 120000ms' }
    controller.emit('status', controller.status)

    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (controller.status.state === 'ready') break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    const state = await recovery.getState()
    assert.equal(starts, 1)
    assert.equal(ensured, 1)
    assert.equal(controller.status.state, 'ready')
    assert.equal(state.safeMode, true)
    assert.equal(state.baselineQuarantineAvailable, true)
    assert.equal(state.currentIncident.reasonCode, 'untrusted-profile-loader')
    assert.deepEqual(state.disabledPlugins, [])
    assert.equal(await baselineQuarantine.restore(), true)
    await recovery.dispose()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('an interrupted active baseline is reapplied before retrying, after the runtime is stopped', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-recovery-active-baseline-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const stateDir = join(root, 'recovery')
  const opaquePatch = '- insert: [opaque user loader\n'
  try {
    await mkdir(profileDir, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
    }))
    await writeFile(join(profileDir, 'cordis.patch.yml'), opaquePatch)
    const privateBaseline = new DesktopProfileBaselineQuarantine({ dshHome, profileDir, stateDir })
    const events = []
    const baselineQuarantine = {
      getState: () => privateBaseline.getState(),
      hasUntrustedActivation: () => privateBaseline.hasUntrustedActivation(),
      quarantine: async () => {
        events.push('quarantine')
        return privateBaseline.quarantine()
      },
      restore: () => privateBaseline.restore(),
    }
    const controller = new EventEmitter()
    controller.status = { state: 'starting' }
    controller.stop = async () => {
      events.push('stop')
      controller.status = { state: 'stopped' }
      controller.emit('status', controller.status)
    }
    controller.start = async () => {
      events.push('start')
      controller.status = { state: 'starting' }
      controller.emit('status', controller.status)
      controller.status = { state: 'ready', url: 'http://127.0.0.1:14569/' }
      controller.emit('status', controller.status)
      return controller.status.url
    }
    const store = new PluginRecoveryStore({ profileDir, stateDir, builtInBundles: BUILTIN_BUNDLES })
    const recovery = new DesktopPluginRecovery({
      controller,
      pluginManager: {
        inventory: async () => { throw new Error('dependency tree is not recognizable') },
        recoveryCandidates: async () => [],
        enterSafeMode: async () => { throw new Error('safe mode must not run without candidates') },
      },
      store,
      ensureProfile: async () => { events.push('ensure') },
      builtInBundles: BUILTIN_BUNDLES,
      baselineQuarantine,
      schedule: () => ({ unref() {} }),
      cancelSchedule: () => {},
    })
    await recovery.initialize()

    // Simulate a process interruption after active.json was committed and
    // before the profile patch was replaced.  The next crash must reconcile
    // this existing archive instead of returning early because it is active.
    await privateBaseline.quarantine()
    await writeFile(join(profileDir, 'cordis.patch.yml'), opaquePatch)
    events.splice(0)
    controller.status = { state: 'crashed', error: 'DSH runtime did not become ready within 120000ms' }
    controller.emit('status', controller.status)
    for (let attempt = 0; attempt < 100 && controller.status.state !== 'ready'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }

    assert.equal(controller.status.state, 'ready')
    assert.deepEqual(events, ['stop', 'quarantine', 'ensure', 'start'])
    assert.equal(await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8'), '')
    assert.equal((await recovery.getState()).baselineQuarantineAvailable, true)
    await recovery.dispose()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a persisted baseline marker remains visible and safe after a later process restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-recovery-persisted-baseline-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const stateDir = join(root, 'recovery')
  try {
    await mkdir(profileDir, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
    }))
    await writeFile(join(profileDir, 'cordis.patch.yml'), '- name: @user/unregistered\n')
    const baselineQuarantine = new DesktopProfileBaselineQuarantine({ dshHome, profileDir, stateDir })
    await baselineQuarantine.quarantine()

    const controller = new EventEmitter()
    controller.status = { state: 'stopped' }
    controller.stop = async () => {}
    controller.start = async () => {}
    const store = new PluginRecoveryStore({ profileDir, stateDir, builtInBundles: BUILTIN_BUNDLES })
    const recovery = new DesktopPluginRecovery({
      controller,
      pluginManager: {
        inventory: async () => [],
        recoveryCandidates: async () => [],
        enterSafeMode: async () => { throw new Error('unexpected safe mode') },
      },
      store,
      ensureProfile: async () => { throw new Error('a fully applied baseline should not be regenerated here') },
      builtInBundles: BUILTIN_BUNDLES,
      baselineQuarantine,
    })
    await recovery.initialize()

    const state = await recovery.getState()
    assert.equal(state.safeMode, true)
    assert.equal(state.baselineQuarantineAvailable, true)
    assert.equal(state.currentIncident.reasonCode, 'untrusted-profile-loader')
    assert.equal(state.currentIncident.resolution, 'baseline-quarantine-active')
    await recovery.dispose()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('opaque baseline fallback never quarantines host startup failures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-recovery-opaque-host-'))
  try {
    const controller = new EventEmitter()
    controller.status = { state: 'starting' }
    controller.stop = async () => {}
    controller.start = async () => {}
    let quarantines = 0
    const baselineQuarantine = {
      getState: async () => ({ available: false }),
      hasUntrustedActivation: async () => true,
      quarantine: async () => { quarantines += 1; return { changed: true, available: true } },
      restore: async () => true,
    }
    const store = new PluginRecoveryStore({ profileDir: join(root, 'profile'), stateDir: join(root, 'recovery') })
    const recovery = new DesktopPluginRecovery({
      controller,
      pluginManager: {
        inventory: async () => { throw new Error('unrecognized tree') },
        recoveryCandidates: async () => [],
        enterSafeMode: async () => { throw new Error('must not enter safe mode') },
      },
      store,
      ensureProfile: async () => {},
      baselineQuarantine,
    })
    await recovery.initialize()
    controller.status = { state: 'crashed', error: 'listen EADDRINUSE 127.0.0.1:43125' }
    controller.emit('status', controller.status)
    for (let attempt = 0; attempt < 30; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5))
    assert.equal(quarantines, 0)
    assert.equal((await recovery.getState()).baselineQuarantineAvailable, false)
    await recovery.dispose()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a remaining opaque patch loader falls back to the baseline after manifest safe mode retries once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-recovery-safe-mode-to-baseline-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const stateDir = join(root, 'recovery')
  const packageName = '@community/recognized-manifest'
  try {
    await mkdir(profileDir, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: { [packageName]: '1.0.0' },
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES, packageName] } },
    }))
    await writeFile(join(profileDir, 'cordis.patch.yml'), '- insert: [unregistered patch loader\n')
    const baselineQuarantine = new DesktopProfileBaselineQuarantine({ dshHome, profileDir, stateDir })
    const controller = new EventEmitter()
    controller.status = { state: 'starting' }
    controller.stop = async () => {
      controller.status = { state: 'stopped' }
      controller.emit('status', controller.status)
    }
    let starts = 0
    controller.start = async () => {
      starts += 1
      controller.status = { state: 'starting' }
      controller.emit('status', controller.status)
      if (starts === 1) {
        queueMicrotask(() => {
          controller.status = { state: 'crashed', error: 'DSH runtime did not become ready within 120000ms' }
          controller.emit('status', controller.status)
        })
        return undefined
      }
      controller.status = { state: 'ready', url: 'http://127.0.0.1:14568/' }
      controller.emit('status', controller.status)
      return controller.status.url
    }
    let safeModeCalls = 0
    const pluginManager = {
      inventory: async () => [{ name: packageName, builtIn: false }],
      recoveryCandidates: async () => [packageName],
      enterSafeMode: async () => {
        safeModeCalls += 1
        return {
          result: {
            changed: true,
            disabled: [packageName],
            disabledDependencies: { [packageName]: '1.0.0' },
          },
          commit: () => true,
          rollback: async () => true,
        }
      },
    }
    const store = new PluginRecoveryStore({ profileDir, stateDir, builtInBundles: BUILTIN_BUNDLES })
    const recovery = new DesktopPluginRecovery({
      controller,
      pluginManager,
      store,
      ensureProfile: async () => {},
      builtInBundles: BUILTIN_BUNDLES,
      baselineQuarantine,
      schedule: () => ({ unref() {} }),
      cancelSchedule: () => {},
    })
    await recovery.initialize()
    controller.status = { state: 'crashed', error: 'DSH runtime did not become ready within 120000ms' }
    controller.emit('status', controller.status)
    for (let attempt = 0; attempt < 160; attempt += 1) {
      if (controller.status.state === 'ready') break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    const state = await recovery.getState()
    assert.equal(safeModeCalls, 1)
    assert.equal(starts, 2)
    assert.equal(controller.status.state, 'ready')
    assert.equal(state.baselineQuarantineAvailable, true)
    assert.equal(state.currentIncident.reasonCode, 'untrusted-profile-loader')
    await recovery.dispose()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('package inspection recovery quarantines user dependencies without reading their broken manifests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-recovery-inspection-'))
  const profileDir = join(root, 'profile')
  const stateDir = join(root, 'recovery')
  const packageName = '@community/broken-manifest'
  try {
    const packageRoot = join(profileDir, 'node_modules', ...packageName.split('/'))
    await mkdir(packageRoot, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), `${JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: { [packageName]: '1.0.0' },
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES, packageName] } },
    }, null, 2)}\n`)
    await writeFile(join(packageRoot, 'package.json'), '{ broken')
    const store = new PluginRecoveryStore({ profileDir, stateDir, builtInBundles: BUILTIN_BUNDLES })
    const manager = new PluginManager({
      profileDir,
      pnpmCli: 'pnpm.mjs',
      runner: async () => {},
      beforeMutation: (event) => store.captureSnapshot({ kind: 'before-mutation', label: event.type }),
    })

    const recovered = await recoverProfileAfterPluginInspectionFailure({
      pluginManager: manager,
      store,
      ensureProfile: async () => {},
      error: Object.assign(new Error('invalid package manifest while checking compatibility'), {
        code: PLUGIN_PACKAGE_MANIFEST_READ_ERROR,
      }),
    })
    const state = await store.getState()
    const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.equal(recovered.recovered, true)
    assert.deepEqual(recovered.disabledPlugins, [packageName])
    assert.equal(state.safeMode, true)
    assert.equal(state.currentIncident.reasonCode, 'plugin-inspection-failed')
    assert.deepEqual(state.currentIncident.candidatePlugins, [packageName])
    assert.equal(manifest.dependencies[packageName], undefined)
    assert.equal(manifest.dsh.profile.bundles.includes(packageName), false)
    assert.equal(await readFile(join(packageRoot, 'package.json'), 'utf8'), '{ broken')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('generic compatibility provider failures preserve every user plugin', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-recovery-provider-'))
  const profileDir = join(root, 'profile')
  const packageName = '@community/healthy'
  try {
    await mkdir(profileDir, { recursive: true })
    const packageRoot = join(profileDir, 'node_modules', ...packageName.split('/'))
    await mkdir(packageRoot, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), `${JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: { [packageName]: '1.0.0' },
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES, packageName] } },
    }, null, 2)}\n`)
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
      name: packageName,
      version: '1.0.0',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    const store = new PluginRecoveryStore({ profileDir, stateDir: join(root, 'recovery') })
    const manager = new PluginManager({
      profileDir,
      pnpmCli: 'pnpm.mjs',
      hostCompatibility: () => { throw new Error('runtime compatibility provider metadata is unavailable') },
    })
    let providerError
    try {
      await manager.reconcileCompatibility()
    } catch (error) {
      providerError = error
    }
    assert.match(providerError?.message ?? '', /provider metadata is unavailable/u)
    assert.equal(isPluginPackageInspectionFailure(providerError), false)
    let safeModeCalls = 0
    manager.enterSafeMode = async () => {
      safeModeCalls += 1
      throw new Error('must not enter safe mode for a host compatibility failure')
    }
    const result = await recoverProfileAfterPluginInspectionFailure({
      pluginManager: manager,
      store,
      ensureProfile: async () => {},
      error: providerError,
    })
    assert.equal(result.recovered, false)
    assert.equal(safeModeCalls, 0)
    const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.equal(manifest.dependencies[packageName], '1.0.0')
    assert.equal(manifest.dsh.profile.bundles.includes(packageName), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('unattributed timeout uses lightweight profile candidates when normal inventory is unavailable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-recovery-unattributed-timeout-'))
  const packageName = '@community/opaque'
  try {
    const controller = new EventEmitter()
    controller.status = { state: 'starting' }
    controller.stop = async () => {
      controller.status = { state: 'stopped' }
      controller.emit('status', controller.status)
    }
    let starts = 0
    controller.start = async () => {
      starts += 1
      controller.status = { state: 'starting' }
      controller.emit('status', controller.status)
      controller.status = { state: 'ready', url: 'http://127.0.0.1:1234/' }
      controller.emit('status', controller.status)
      return controller.status.url
    }
    let safeModeCalls = 0
    const pluginManager = {
      inventory: async () => { throw new Error('broken third-party package.json') },
      recoveryCandidates: async () => [packageName],
      enterSafeMode: async () => {
        safeModeCalls += 1
        return {
          result: {
            changed: true,
            disabled: [packageName],
            disabledDependencies: { [packageName]: '1.0.0' },
          },
          commit: () => true,
          rollback: async () => true,
        }
      },
    }
    const profileDir = join(root, 'profile')
    await mkdir(profileDir, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({ dependencies: {} }))
    const store = new PluginRecoveryStore({
      profileDir,
      stateDir: join(root, 'recovery'),
      builtInBundles: BUILTIN_BUNDLES,
    })
    const recovery = new DesktopPluginRecovery({
      controller,
      pluginManager,
      store,
      ensureProfile: async () => {},
      builtInBundles: BUILTIN_BUNDLES,
      schedule: () => ({ unref() {} }),
      cancelSchedule: () => {},
    })
    await recovery.initialize()
    controller.status = { state: 'crashed', error: 'DSH runtime did not become ready within 120000ms' }
    controller.emit('status', controller.status)

    for (let attempt = 0; attempt < 100; attempt += 1) {
      if ((await recovery.getState()).safeMode) break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    const state = await recovery.getState()
    assert.equal(safeModeCalls, 1)
    assert.equal(starts, 1)
    assert.equal(state.safeMode, true)
    assert.equal(state.currentIncident.reasonCode, 'unattributed-plugin-startup')
    assert.deepEqual(state.currentIncident.candidatePlugins, [packageName])
    assert.deepEqual(state.disabledPlugins, [packageName])
    await recovery.dispose()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('an unattributed Crashpad handler disconnect enters safe mode from a valid profile when inventory inspection fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-recovery-crashpad-safe-mode-'))
  const profileDir = join(root, 'profile')
  const packageName = '@community/crashpad-opaque'
  try {
    await mkdir(profileDir, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), `${JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: { [packageName]: '1.0.0' },
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES, packageName] } },
    }, null, 2)}\n`)
    const controller = new EventEmitter()
    controller.status = { state: 'starting' }
    controller.stop = async () => {
      controller.status = { state: 'stopped' }
      controller.emit('status', controller.status)
    }
    let starts = 0
    controller.start = async () => {
      starts += 1
      controller.status = { state: 'starting' }
      controller.emit('status', controller.status)
      controller.status = { state: 'ready', url: 'http://127.0.0.1:16544/' }
      controller.emit('status', controller.status)
      return controller.status.url
    }
    const manager = new PluginManager({
      profileDir,
      pnpmCli: 'pnpm.mjs',
      runner: async () => {},
      beforeMutation: async () => {},
    })
    manager.inventory = async () => { throw new Error('dependency tree is not recognizable') }
    const store = new PluginRecoveryStore({
      profileDir,
      stateDir: join(root, 'recovery'),
      builtInBundles: BUILTIN_BUNDLES,
    })
    const recovery = new DesktopPluginRecovery({
      controller,
      pluginManager: manager,
      store,
      ensureProfile: async () => {},
      builtInBundles: BUILTIN_BUNDLES,
      schedule: () => ({ unref() {} }),
      cancelSchedule: () => {},
    })
    await recovery.initialize()
    controller.emit('line', {
      stream: 'stderr',
      line: '[0819/092634.721:ERROR:third_party\\crashpad\\client\\crashpad_client_win.cc:867] not connected',
    })
    controller.status = {
      state: 'crashed',
      error: 'runtime exited unexpectedly with Windows code 0xFFFF7003 (signed -36861)',
    }
    controller.emit('status', controller.status)

    for (let attempt = 0; attempt < 100 && controller.status.state !== 'ready'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    const state = await recovery.getState()
    const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.equal(starts, 1)
    assert.equal(controller.status.state, 'ready')
    assert.equal(state.safeMode, true)
    assert.equal(state.currentIncident.reasonCode, 'unattributed-process-crash')
    assert.deepEqual(state.currentIncident.candidatePlugins, [packageName])
    assert.deepEqual(state.disabledPlugins, [packageName])
    assert.equal(manifest.dependencies[packageName], undefined)
    assert.equal(manifest.dsh.profile.bundles.includes(packageName), false)
    await recovery.dispose()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('an unattributed Crashpad handler disconnect falls back to a reversible baseline when valid user candidates cannot be read', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-recovery-crashpad-baseline-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const stateDir = join(root, 'recovery')
  const packageName = '@community/unreadable-tree'
  try {
    await mkdir(profileDir, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), `${JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: { [packageName]: '1.0.0' },
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES, packageName] } },
    }, null, 2)}\n`)
    const baselineQuarantine = new DesktopProfileBaselineQuarantine({ dshHome, profileDir, stateDir })
    assert.equal(await baselineQuarantine.hasUntrustedActivation(), false)
    assert.equal(await baselineQuarantine.hasUserActivation(), true)

    const controller = new EventEmitter()
    controller.status = { state: 'starting' }
    controller.stop = async () => {
      controller.status = { state: 'stopped' }
      controller.emit('status', controller.status)
    }
    let starts = 0
    controller.start = async () => {
      starts += 1
      controller.status = { state: 'starting' }
      controller.emit('status', controller.status)
      controller.status = { state: 'ready', url: 'http://127.0.0.1:16545/' }
      controller.emit('status', controller.status)
      return controller.status.url
    }
    const store = new PluginRecoveryStore({ profileDir, stateDir, builtInBundles: BUILTIN_BUNDLES })
    const recovery = new DesktopPluginRecovery({
      controller,
      pluginManager: {
        inventory: async () => { throw new Error('dependency tree is not recognizable') },
        recoveryCandidates: async () => [],
        enterSafeMode: async () => { throw new Error('safe mode must not require an unreadable candidate') },
      },
      store,
      ensureProfile: async () => {},
      builtInBundles: BUILTIN_BUNDLES,
      baselineQuarantine,
      schedule: () => ({ unref() {} }),
      cancelSchedule: () => {},
    })
    await recovery.initialize()
    controller.status = {
      state: 'crashed',
      error: '[crashpad] not connected\nruntime exited unexpectedly with Windows code 0xFFFF7003 (signed -36861)',
    }
    controller.emit('status', controller.status)

    for (let attempt = 0; attempt < 100 && controller.status.state !== 'ready'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    const state = await recovery.getState()
    const baselineManifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.equal(starts, 1)
    assert.equal(controller.status.state, 'ready')
    assert.equal(state.safeMode, true)
    assert.equal(state.baselineQuarantineAvailable, true)
    assert.equal(state.currentIncident.reasonCode, 'unattributed-process-crash')
    assert.deepEqual(state.disabledPlugins, [])
    assert.equal(baselineManifest.dependencies[packageName], undefined)
    assert.equal(await baselineQuarantine.restore(), true)
    const restoredManifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.equal(restoredManifest.dependencies[packageName], '1.0.0')
    assert.equal(restoredManifest.dsh.profile.bundles.includes(packageName), true)
    await recovery.dispose()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('unknown host failures preserve community plugins instead of entering automatic safe mode', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-recovery-unattributed-'))
  try {
    const controller = new EventEmitter()
    controller.status = { state: 'starting' }
    controller.stop = async () => {}
    controller.start = async () => {}
    let safeModeCalls = 0
    const pluginManager = {
      inventory: async () => [{ name: '@community/example', builtIn: false }],
      enterSafeMode: async () => {
        safeModeCalls += 1
        throw new Error('safe mode must not run for an unattributed host failure')
      },
    }
    const store = new PluginRecoveryStore({
      profileDir: join(root, 'profile'),
      stateDir: join(root, 'recovery'),
      builtInBundles: BUILTIN_BUNDLES,
    })
    const recovery = new DesktopPluginRecovery({
      controller,
      pluginManager,
      store,
      ensureProfile: async () => {},
      builtInBundles: BUILTIN_BUNDLES,
    })
    await recovery.initialize()
    controller.emit('line', {
      stream: 'stdout',
      line: "plugin '@community/example' initialized successfully",
    })
    controller.status = { state: 'crashed', error: 'listen EADDRINUSE 127.0.0.1:43125' }
    controller.emit('status', controller.status)

    let state
    for (let attempt = 0; attempt < 100; attempt += 1) {
      state = await recovery.getState()
      if (state.currentIncident) break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    assert.equal(safeModeCalls, 0)
    assert.equal(state.safeMode, false)
    assert.equal(state.currentIncident.pluginName, undefined)
    assert.deepEqual(state.disabledPlugins, [])
    await recovery.dispose()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a Git executable host failure wins over a nearby Crashpad marker and never isolates valid user activation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-recovery-git-host-'))
  try {
    const controller = new EventEmitter()
    controller.status = { state: 'starting' }
    controller.stop = async () => {}
    controller.start = async () => {}
    let safeModeCalls = 0
    let quarantines = 0
    const baselineQuarantine = {
      getState: async () => ({ available: false }),
      hasUntrustedActivation: async () => false,
      hasUserActivation: async () => true,
      quarantine: async () => {
        quarantines += 1
        return { changed: true, available: true }
      },
      restore: async () => true,
    }
    const store = new PluginRecoveryStore({
      profileDir: join(root, 'profile'),
      stateDir: join(root, 'recovery'),
      builtInBundles: BUILTIN_BUNDLES,
    })
    const recovery = new DesktopPluginRecovery({
      controller,
      pluginManager: {
        inventory: async () => [{ name: '@community/example', builtIn: false }],
        recoveryCandidates: async () => ['@community/example'],
        enterSafeMode: async () => {
          safeModeCalls += 1
          throw new Error('safe mode must not run for a Git host failure')
        },
      },
      store,
      ensureProfile: async () => {},
      builtInBundles: BUILTIN_BUNDLES,
      baselineQuarantine,
    })
    await recovery.initialize()
    controller.status = {
      state: 'crashed',
      error: '[crashpad] not connected\ndsh: fatal load failure: Error: spawn git.exe ENOENT',
    }
    controller.emit('status', controller.status)

    for (let attempt = 0; attempt < 30; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5))
    const state = await recovery.getState()
    assert.equal(safeModeCalls, 0)
    assert.equal(quarantines, 0)
    assert.equal(state.safeMode, false)
    assert.equal(state.baselineQuarantineAvailable, false)
    await recovery.dispose()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('2.2 repairs the legacy unknown-timeout safe mode without touching plugin files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-recovery-legacy-timeout-'))
  const profileDir = join(root, 'profile')
  const stateDir = join(root, 'recovery')
  const packageName = '@community/taffy-pet'
  try {
    const packageRoot = join(profileDir, 'node_modules', ...packageName.split('/'))
    await mkdir(packageRoot, { recursive: true })
    await mkdir(stateDir, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), `${JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: {},
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
    }, null, 2)}\n`)
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
      name: packageName,
      version: '1.0.0',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    await writeFile(join(stateDir, 'state.json'), `${JSON.stringify({
      version: 1,
      safeMode: true,
      snapshots: [],
      incidents: [{
        id: 'legacy-timeout',
        createdAt: '2026-08-17T00:00:00.000Z',
        identified: false,
        reasonCode: 'unknown',
        summary: '未能可靠定位故障插件',
        technicalDetails: '[taffy-pet] host loaded\nruntime 120s 未就绪',
        resolution: 'safe-mode-auto',
      }],
      disabledDependencies: { [packageName]: '1.0.0' },
      currentIncidentId: 'legacy-timeout',
    }, null, 2)}\n`)
    const store = new PluginRecoveryStore({ profileDir, stateDir, builtInBundles: BUILTIN_BUNDLES })
    const pluginManager = new PluginManager({
      profileDir,
      pnpmCli: 'pnpm.mjs',
      runner: async () => {},
      beforeMutation: async () => {},
    })
    const controller = new EventEmitter()
    controller.status = { state: 'stopped' }
    controller.stop = async () => {}
    controller.start = async () => {}
    const recovery = new DesktopPluginRecovery({
      controller,
      pluginManager,
      store,
      ensureProfile: async () => {},
      builtInBundles: BUILTIN_BUNDLES,
    })

    await recovery.initialize()

    const state = await recovery.getState()
    const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.equal(state.safeMode, false)
    assert.deepEqual(state.disabledPlugins, [])
    assert.equal(state.currentIncident.resolution, 'legacy-false-positive-repaired')
    assert.equal(manifest.dependencies[packageName], '1.0.0')
    assert.equal(manifest.dsh.profile.bundles.includes(packageName), true)
    assert.equal(JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')).name, packageName)
    await recovery.dispose()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('direct startup restores plugins left disabled by an older release without a Runtime cycle', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-recovery-user-safe-mode-'))
  const profileDir = join(root, 'profile')
  const stateDir = join(root, 'recovery')
  const packageName = '@community/example'
  try {
    await mkdir(profileDir, { recursive: true })
    await mkdir(stateDir, { recursive: true })
    const packageRoot = join(profileDir, 'node_modules', ...packageName.split('/'))
    await mkdir(packageRoot, { recursive: true })
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
      name: packageName,
      version: '1.0.0',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    await writeFile(join(profileDir, 'package.json'), `${JSON.stringify({
      name: 'dsh-profile-desktop',
      dependencies: {},
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES] } },
    }, null, 2)}\n`)
    await writeFile(join(stateDir, 'state.json'), `${JSON.stringify({
      version: 1,
      safeMode: true,
      snapshots: [],
      incidents: [{
        id: 'user-safe-mode',
        createdAt: '2026-08-17T00:00:00.000Z',
        identified: false,
        reasonCode: 'unknown',
        summary: '用户请求安全模式',
        technicalDetails: 'manual recovery',
        resolution: 'safe-mode',
      }],
      disabledDependencies: { [packageName]: '1.0.0' },
      currentIncidentId: 'user-safe-mode',
    }, null, 2)}\n`)
    const store = new PluginRecoveryStore({ profileDir, stateDir, builtInBundles: BUILTIN_BUNDLES })
    const controller = new EventEmitter()
    controller.status = { state: 'stopped' }
    let stops = 0
    let starts = 0
    controller.stop = async () => { stops += 1 }
    controller.start = async () => { starts += 1 }
    const pluginManager = new PluginManager({
      profileDir,
      pnpmCli: 'pnpm.mjs',
      runner: async () => {},
      beforeMutation: async () => {},
    })
    const recovery = new DesktopPluginRecovery({
      controller,
      pluginManager,
      store,
      ensureProfile: async () => {},
      builtInBundles: BUILTIN_BUNDLES,
      automatic: false,
    })

    await recovery.initialize()
    const state = await recovery.getState()
    assert.equal(state.safeMode, true)
    assert.deepEqual(state.disabledPlugins, [packageName])

    assert.deepEqual(await recovery.restoreForDirectStartup(), {
      restored: [packageName],
      changed: true,
    })
    const restoredState = await recovery.getState()
    const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.equal(stops, 0)
    assert.equal(starts, 0)
    assert.equal(restoredState.safeMode, false)
    assert.deepEqual(restoredState.disabledPlugins, [])
    assert.equal(restoredState.currentIncident.resolution, 'restored-by-direct-start')
    assert.equal(manifest.dependencies[packageName], '1.0.0')
    assert.equal(manifest.dsh.profile.bundles.includes(packageName), true)
    await recovery.dispose()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('plugin recovery store deduplicates snapshots and retains only the latest three', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-recovery-'))
  const profileDir = join(root, 'profile')
  const stateDir = join(root, 'recovery')
  const manifestPath = join(profileDir, 'package.json')
  try {
    await mkdir(profileDir, { recursive: true })
    const store = new PluginRecoveryStore({
      profileDir,
      stateDir,
      builtInBundles: BUILTIN_BUNDLES,
      now: (() => {
        let minute = 0
        return () => new Date(`2026-08-17T00:${String(minute++).padStart(2, '0')}:00.000Z`)
      })(),
    })
    const writeProfile = async (version) => writeFile(manifestPath, `${JSON.stringify({
      name: 'dsh-profile-desktop',
      dependencies: { '@community/example': version },
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES, '@community/example'] } },
    }, null, 2)}\n`)

    await writeProfile('1.0.0')
    const first = await store.captureSnapshot({ kind: 'last-known-good' })
    const duplicate = await store.captureSnapshot({ kind: 'before-mutation' })
    assert.equal(duplicate.id, first.id)
    for (const version of ['2.0.0', '3.0.0', '4.0.0']) {
      await writeProfile(version)
      await store.captureSnapshot({ kind: 'before-mutation', label: version })
    }

    const state = await store.getState()
    assert.equal(state.snapshots.length, 3)
    assert.deepEqual(state.snapshots.map((item) => item.label), ['4.0.0', '3.0.0', '2.0.0'])
    await assert.rejects(readFile(join(stateDir, 'snapshots', first.id, 'package.json'), 'utf8'), /ENOENT/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('plugin recovery store preserves incidents and snapshot contents across restarts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-recovery-state-'))
  const profileDir = join(root, 'profile')
  const stateDir = join(root, 'recovery')
  try {
    await mkdir(profileDir, { recursive: true })
    const manifest = {
      name: 'dsh-profile-desktop',
      dependencies: { '@community/example': '1.0.0' },
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES, '@community/example'] } },
    }
    await writeFile(join(profileDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    await writeFile(join(profileDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    const store = new PluginRecoveryStore({ profileDir, stateDir, builtInBundles: BUILTIN_BUNDLES })
    const snapshot = await store.captureSnapshot({ kind: 'last-known-good', label: '可用配置' })
    const incident = await store.recordIncident({
      identified: true,
      pluginName: '@community/example',
      reasonCode: 'missing-dependency',
      summary: '缺少依赖',
      technicalDetails: 'Cannot find package',
    })
    await store.setSafeMode(true)

    const reopened = new PluginRecoveryStore({ profileDir, stateDir, builtInBundles: BUILTIN_BUNDLES })
    const state = await reopened.getState()
    assert.equal(state.safeMode, true)
    assert.equal(state.currentIncident.id, incident.id)
    assert.equal(state.currentIncident.pluginName, '@community/example')
    assert.deepEqual(await reopened.readSnapshot(snapshot.id), {
      manifest: `${JSON.stringify(manifest, null, 2)}\n`,
      lock: 'lockfileVersion: 9\n',
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a host failure after one isolated plugin does not disable the remaining plugins', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-recovery-second-host-failure-'))
  const profileDir = join(root, 'profile')
  const firstPlugin = '@community/first'
  const secondPlugin = '@community/second'
  try {
    const controller = new EventEmitter()
    controller.status = { state: 'starting' }
    controller.stop = async () => {
      controller.status = { state: 'stopped' }
      controller.emit('status', controller.status)
    }
    let starts = 0
    controller.start = async () => {
      starts += 1
      controller.status = { state: 'starting' }
      controller.emit('status', controller.status)
      queueMicrotask(() => {
        controller.status = { state: 'crashed', error: 'listen EADDRINUSE 127.0.0.1:43125' }
        controller.emit('status', controller.status)
      })
    }
    const disabled = []
    let safeModeCalls = 0
    const pluginManager = {
      inventory: async () => [
        { name: firstPlugin, builtIn: false },
        { name: secondPlugin, builtIn: false },
      ],
      recoveryCandidates: async () => [firstPlugin, secondPlugin],
      setEnabled: async (name, enabled) => {
        assert.equal(enabled, false)
        return {
          result: { dependencySpec: '1.0.0' },
          commit: () => disabled.push(name),
          rollback: async () => {},
        }
      },
      enterSafeMode: async () => {
        safeModeCalls += 1
        return {
          result: { changed: true, disabled: [secondPlugin], disabledDependencies: { [secondPlugin]: '1.0.0' } },
          commit: () => {},
          rollback: async () => {},
        }
      },
    }
    const store = new PluginRecoveryStore({ profileDir, stateDir: join(root, 'recovery'), builtInBundles: BUILTIN_BUNDLES })
    const recovery = new DesktopPluginRecovery({
      controller,
      pluginManager,
      store,
      ensureProfile: async () => {},
      builtInBundles: BUILTIN_BUNDLES,
      schedule: () => ({ unref() {} }),
      cancelSchedule: () => {},
    })
    await recovery.initialize()
    controller.emit('line', {
      stream: 'stderr',
      line: `failed to load plugin '${firstPlugin}'`,
    })
    controller.status = { state: 'crashed', error: `failed to load plugin '${firstPlugin}'` }
    controller.emit('status', controller.status)
    for (let attempt = 0; attempt < 100 && starts === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    for (let attempt = 0; attempt < 100 && safeModeCalls === 0 && controller.status.state !== 'crashed'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    // Let the queued second crash run after the original isolated retry.
    await new Promise((resolve) => setTimeout(resolve, 20))

    assert.equal(starts, 1)
    assert.deepEqual(disabled, [firstPlugin])
    assert.equal(safeModeCalls, 0)
    assert.equal((await recovery.getState()).safeMode, false)
    await recovery.dispose()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('desktop plugin recovery isolates once and enters safe mode after the next failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-recovery-flow-'))
  const profileDir = join(root, 'profile')
  const packageName = '@community/broken'
  try {
    const packageRoot = join(profileDir, 'node_modules', ...packageName.split('/'))
    await mkdir(packageRoot, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), `${JSON.stringify({
      name: 'dsh-profile-desktop',
      dependencies: { [packageName]: '1.0.0' },
      dsh: { profile: { bundles: [...BUILTIN_BUNDLES, packageName] } },
    }, null, 2)}\n`)
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
      name: packageName,
      version: '1.0.0',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    const store = new PluginRecoveryStore({
      profileDir,
      stateDir: join(root, 'recovery'),
      builtInBundles: BUILTIN_BUNDLES,
    })
    const pluginManager = new PluginManager({
      profileDir,
      pnpmCli: 'pnpm.mjs',
      runner: async () => {},
      beforeMutation: (event) => store.captureSnapshot({ kind: 'before-mutation', label: event.type }),
    })
    const controller = new EventEmitter()
    controller.status = { state: 'starting' }
    controller.stop = async () => {
      controller.status = { state: 'stopped' }
      controller.emit('status', controller.status)
    }
    let starts = 0
    controller.start = async () => {
      starts += 1
      controller.status = { state: 'starting' }
      controller.emit('status', controller.status)
      if (starts === 1) {
        controller.status = { state: 'crashed', error: 'failed to load plugin bootstrap after the isolated retry' }
        controller.emit('status', controller.status)
        throw new Error('failed to load plugin bootstrap after the isolated retry')
      }
      controller.status = { state: 'ready', url: 'http://127.0.0.1:1234/' }
      controller.emit('status', controller.status)
      return controller.status.url
    }
    const recovery = new DesktopPluginRecovery({
      controller,
      pluginManager,
      store,
      ensureProfile: async () => {},
      builtInBundles: BUILTIN_BUNDLES,
      schedule: () => ({ unref() {} }),
      cancelSchedule: () => {},
    })
    await recovery.initialize()
    controller.emit('line', {
      stream: 'stderr',
      line: `failed to import loader entry broken (${packageName})`,
    })
    controller.status = { state: 'crashed', error: 'runtime exited before readiness' }
    controller.emit('status', controller.status)

    for (let attempt = 0; attempt < 100; attempt += 1) {
      if ((await recovery.getState()).safeMode) break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    const state = await recovery.getState()
    const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.equal(starts, 2)
    assert.equal(state.safeMode, true)
    assert.equal(state.currentIncident.pluginName, packageName)
    assert.equal(state.currentIncident.resolution, 'auto-disabled')
    assert.deepEqual(manifest.dsh.profile.bundles, BUILTIN_BUNDLES)
    assert.equal(manifest.dependencies[packageName], undefined)
    assert.equal(state.disabledPlugins.includes(packageName), true)
    assert.equal(JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')).name, packageName)
    await recovery.dispose()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
