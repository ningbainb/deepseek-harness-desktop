import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ensureDesktopProfile } from '../src/profile.mjs'
import { createRuntimeMutationCoordinator } from '../src/runtime-mutation-coordinator.mjs'
import { EventEmitter } from 'node:events'
import { registerExtensionIpc } from '../src/extension-ipc.mjs'
import { DESKTOP_ERROR_CODES } from '../src/desktop-contract.mjs'

async function fixture(body, { unhealthy = false, patch = '', health, onStop, onStart, setup } = {}) {
  const { createPromptCustomizerFeature } = await import('../src/prompt-customizer-feature.mjs')
  const home = await mkdtemp(join(tmpdir(), 'dsh-p2-feature-'))
  const profileDir = join(home, 'profiles', 'desktop')
  const manifestPath = join(profileDir, 'package.json')
  const databasePath = join(home, 'prompt-customizer', 'prompt-customizer.db')
  const events = []
  try {
    await ensureDesktopProfile({ dshHome: home })
    if (patch) await writeFile(join(home, 'cordis.patch.yml'), patch)
    await setup?.({ home, profileDir, manifestPath, patchPath: join(profileDir, 'cordis.patch.yml') })
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.maintainerField = { retained: true }
    manifest.dsh.profile.desktopOptionalPlugins['unrelated-plugin'] = true
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    const original = await readFile(manifestPath)
    await mkdir(join(home, 'prompt-customizer'), { recursive: true })
    await writeFile(databasePath, 'existing-private-prompt-database-fixture')
    const paths = { home, profileDir, manifestPath, patchPath: join(profileDir, 'cordis.patch.yml') }
    const controller = { stop: async () => { events.push('stop'); await onStop?.(paths) }, start: async () => { events.push('start'); await onStart?.(paths) } }
    const coordinator = createRuntimeMutationCoordinator({ controller, ensureProfile: () => ensureDesktopProfile({ dshHome: home }) })
    const feature = createPromptCustomizerFeature({ dshHome: home, runMutation: plan => coordinator.run(plan),
      stopRuntime: () => controller.stop(), verifyHealth: async enabled => { events.push('health'); if (unhealthy) throw new Error('P2 unavailable'); await health?.(enabled) } })
    await body({ feature, home, profileDir, manifestPath, original, manifest, events, databasePath })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}

test('P2 explicit enable persists only its opt-in flag and disable retains private SQLite data', async () => fixture(async ({ feature, home, manifestPath, manifest, databasePath }) => {
  assert.equal((await feature.status()).enabled, false)
  assert.equal((await feature.setEnabled(true)).enabled, true)
  const enabled = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.equal(enabled.dsh.profile.desktopOptionalPlugins['dsh-prompt-customizer'], true)
  assert.equal(enabled.dsh.profile.desktopOptionalPlugins['unrelated-plugin'], true)
  assert.deepEqual(enabled.dependencies, manifest.dependencies)
  assert.deepEqual(enabled.dsh.profile.bundles, manifest.dsh.profile.bundles)
  assert.deepEqual(enabled.maintainerField, { retained: true })
  assert.equal((await feature.setEnabled(false)).enabled, false)
  assert.equal(await readFile(databasePath, 'utf8'), 'existing-private-prompt-database-fixture')
  assert.equal((await feature.status()).enabled, false)
  assert.ok((await readdir(join(home, 'profiles', 'desktop', '.desktop-prompt-customizer-backups', 'v1'))).length >= 2)
}))

test('P2 unhealthy activation restores original profile, retains versioned backup and never reports enabled', async () => fixture(async ({ feature, profileDir, manifestPath, original, events, databasePath }) => {
  await assert.rejects(feature.setEnabled(true), /P2 unavailable/u)
  assert.deepEqual(await readFile(manifestPath), original)
  assert.equal((await feature.status()).enabled, false)
  const root = join(profileDir, '.desktop-prompt-customizer-backups', 'v1')
  const [backup] = await readdir(root)
  assert.deepEqual(await readFile(join(root, backup, 'package.json')), original)
  assert.deepEqual(events, ['stop', 'start', 'health', 'stop', 'start'])
  assert.equal(await readFile(databasePath, 'utf8'), 'existing-private-prompt-database-fixture')
}, { unhealthy: true }))

test('a third-party plugin using the same row ID remains untouched and cannot be enabled as P2', async () => fixture(async ({ feature, home, manifestPath, original, events }) => {
  const patchPath = join(home, 'cordis.patch.yml')
  const patch = await readFile(patchPath)
  await assert.rejects(feature.setEnabled(true), /owner|third.party|其他插件|占用/iu)
  assert.deepEqual(await readFile(manifestPath), original)
  assert.deepEqual(await readFile(patchPath), patch)
  assert.deepEqual(events, [])
}, { patch: "- insert:\n    - id: prompt-customizer\n      name: '@third-party/retained'\n      config:\n        retained: true\n" }))

test('an explicit higher-priority P2 disable is preserved before stopping the runtime', async () => fixture(async ({ feature, home, manifestPath, original, events }) => {
  const patch = await readFile(join(home, 'cordis.patch.yml'))
  await assert.rejects(feature.setEnabled(true), /override|disabled|覆盖|关闭/iu)
  assert.deepEqual(await readFile(manifestPath), original)
  assert.deepEqual(await readFile(join(home, 'cordis.patch.yml')), patch)
  assert.deepEqual(events, [])
}, { patch: '- id: prompt-customizer\n  disabled: true\n' }))

test('only the owned Dock settings sender can change P2 and a healthy owner route gates success', async () => fixture(async ({ home, manifestPath }) => {
  const handlers = new Map(), sender = { send() {} }, requests = [], events = []
  const qqBotBinding = Object.assign(new EventEmitter(), { status: () => ({ bound: false }) })
  const ipcMain = { handle: (name, handler) => handlers.set(name, handler), removeHandler: name => handlers.delete(name) }
  const unregister = registerExtensionIpc({ ipcMain, isDockSettingsSender: candidate => candidate === sender,
    surfaceRegistry: { assert: (candidate, surface) => { assert.equal(candidate, sender); return surface } },
    dialog: {}, shell: {}, getWindow: () => undefined, pluginManager: {}, qqBotBinding, pluginRecovery: new EventEmitter(),
    dshHome: home, projectRoot: home, ensureProfile: () => ensureDesktopProfile({ dshHome: home }),
    controller: { status: { state: 'ready', url: 'dsh-runtime://app/' },
      stop: async () => { events.push('stop') }, start: async () => { events.push('start') },
      fetch: async (url, options) => { requests.push(new URL(url).pathname); assert.ok(options.signal instanceof AbortSignal); return Response.json({ ok: true, config: {} }) },
    },
  })
  try {
    const get = handlers.get('dock-settings:prompt-customizer-status'), set = handlers.get('dock-settings:prompt-customizer-set')
    assert.equal(typeof get, 'function'); assert.equal(typeof set, 'function')
    await assert.rejects(get({ sender: {} }), error => error.code === DESKTOP_ERROR_CODES.CAPABILITY_DENIED)
    await assert.rejects(set({ sender: {} }, true), error => error.code === DESKTOP_ERROR_CODES.CAPABILITY_DENIED)
    await assert.rejects(set({ sender }, { enabled: true, path: 'arbitrary' }), error => error.code === DESKTOP_ERROR_CODES.INVALID_ARGUMENT)
    assert.deepEqual(events, [])
    assert.equal((await set({ sender }, true)).enabled, true)
    assert.deepEqual(requests, ['/api/prompt-customizer/config'])
    assert.deepEqual(events, ['stop', 'start'])
    assert.equal(JSON.parse(await readFile(manifestPath, 'utf8')).dsh.profile.desktopOptionalPlugins['dsh-prompt-customizer'], true)
  } finally { unregister() }
}))

test('P2 duplicate requests are idempotent and concurrent intent changes serialize in call order', async () => fixture(async ({ feature, profileDir, events }) => {
  const results = await Promise.all([feature.setEnabled(true), feature.setEnabled(false), feature.setEnabled(true)])
  assert.deepEqual(results.map(result => result.enabled), [true, false, true])
  assert.equal((await feature.status()).enabled, true)
  const before = [...events]
  await feature.setEnabled(true)
  assert.deepEqual(events, before, 'a duplicate request does not restart or claim another health check')
  assert.equal((await readdir(join(profileDir, '.desktop-prompt-customizer-backups', 'v1'))).length, 3)
}))

test('P2 disable health failure restores the enabled configuration and retains its SQLite', async () => fixture(async ({ feature, manifestPath, databasePath }) => {
  await feature.setEnabled(true)
  const enabled = await readFile(manifestPath)
  await assert.rejects(feature.setEnabled(false), /disabled service still active/u)
  assert.deepEqual(await readFile(manifestPath), enabled)
  assert.equal((await feature.status()).enabled, true)
  assert.equal(await readFile(databasePath, 'utf8'), 'existing-private-prompt-database-fixture')
}, { health: async enabled => { if (!enabled) throw new Error('disabled service still active') } }))

for (const kind of ['manifest', 'patch']) for (const phase of ['before-restart', 'after-restart']) {
  test(`P2 preserves a foreign ${kind} edit ${phase} rather than overwriting it during recovery`, async () => {
    let injected = false
    const edit = async ({ manifestPath, patchPath }) => {
      if (injected) return
      injected = true
      if (kind === 'manifest') {
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
        manifest.foreignRetained = 'concurrent-owner-edit'
        await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
      } else await writeFile(patchPath, `${await readFile(patchPath, 'utf8')}\n# concurrent-owner-edit\n`)
    }
    await fixture(async ({ feature, manifestPath, profileDir }) => {
      await assert.rejects(feature.setEnabled(true), /changed|foreign|recovery/u)
      if (kind === 'manifest') assert.equal(JSON.parse(await readFile(manifestPath, 'utf8')).foreignRetained, 'concurrent-owner-edit')
      else assert.match(await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8'), /concurrent-owner-edit/u)
    }, phase === 'before-restart' ? { onStop: edit } : { onStart: edit })
  })
}

test('P2 retains an enabled control provider during native normalization of SDK-saved preferences', async () => fixture(async ({ feature, profileDir }) => {
  await feature.setEnabled(true)
  const patch = await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /retained-native-model/u)
  assert.match(patch, /id: desktop-computer-provider\n\s+name: '@deepseek-ai\/dsh-experimental-computer-use-cua-driver-native'\n\s+disabled: false/u)
}, { setup: async ({ home, patchPath }) => {
  const { ControlCenterStore } = await import('../src/control-center.mjs')
  const path = join(home, 'desktop-control-center.json')
  const configuration = await new ControlCenterStore({ path }).load()
  configuration.computer.enabled = true
  await writeFile(path, JSON.stringify(configuration))
  const { mergeDesktopPatch } = await import('../src/profile.mjs')
  const { QQBOT_PATCH_END, mergeQqBotPatch } = await import('../src/extensions/qqbot.mjs')
  const native = mergeQqBotPatch(mergeDesktopPatch('', await new ControlCenterStore({ path }).profileConfiguration(),
    { minimalDefaults: true, contextDefaults: true }), false)
  await writeFile(patchPath, native.replace(QQBOT_PATCH_END,
    "- id: agent-default-model\n  name: '@deepseek-ai/dsh-agent-default-model'\n  config:\n    provider: retained\n    model: retained-native-model\n" + QQBOT_PATCH_END))
} }))
