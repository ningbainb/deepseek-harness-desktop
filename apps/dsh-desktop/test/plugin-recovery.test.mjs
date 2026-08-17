import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { PluginManager } from '../src/extensions/plugins.mjs'
import { DesktopPluginRecovery, PluginRecoveryStore, classifyPluginFailure } from '../src/plugin-recovery.mjs'
import { BUILTIN_BUNDLES } from '../src/profile.mjs'

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

test('2.2 preserves a user-requested safe mode for one-click recovery', async () => {
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
    })

    await recovery.initialize()
    const state = await recovery.getState()
    assert.equal(state.safeMode, true)
    assert.deepEqual(state.disabledPlugins, [packageName])

    assert.deepEqual(await recovery.restoreDisabledAndRestart(), { restored: [packageName] })
    const restoredState = await recovery.getState()
    const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    assert.equal(stops, 1)
    assert.equal(starts, 1)
    assert.equal(restoredState.safeMode, false)
    assert.deepEqual(restoredState.disabledPlugins, [])
    assert.equal(restoredState.currentIncident.resolution, 'restored-by-user')
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
        controller.status = { state: 'crashed', error: 'another startup failure' }
        controller.emit('status', controller.status)
        throw new Error('another startup failure')
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
