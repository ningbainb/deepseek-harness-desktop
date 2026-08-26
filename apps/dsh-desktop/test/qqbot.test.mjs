import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  QQBOT_PATCH_START,
  QqBotBindingService,
  QqBotCredentialStore,
  maskAppId,
  mergeQqBotPatch,
  readQqBotPatchEnabled,
  setQqBotProfileEnabled,
} from '../src/extensions/qqbot.mjs'

const tick = () => new Promise((resolve) => setImmediate(resolve))

test('QQ Bot patch state is isolated and preserves every other managed section', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-qqbot-patch-'))
  const profileDir = join(root, 'profiles', 'desktop')
  const patchPath = join(profileDir, 'cordis.patch.yml')
  const original = '# --- dsh-desktop managed (auto-generated; do not edit) ---\n- id: desktop\n# --- end dsh-desktop managed ---\n\n- id: community\n'
  try {
    await mkdir(profileDir, { recursive: true })
    await writeFile(patchPath, original)
    await setQqBotProfileEnabled({ profileDir, enabled: false })
    let content = await readFile(patchPath, 'utf8')
    assert.match(content, /id: im-qqbot\n  disabled: true/u)
    assert.equal(readQqBotPatchEnabled(content), false)
    assert.match(content, /id: community/u)
    await setQqBotProfileEnabled({ profileDir, enabled: true })
    content = await readFile(patchPath, 'utf8')
    assert.match(content, /id: im-qqbot\n  disabled: false/u)
    assert.equal(readQqBotPatchEnabled(content), true)
    assert.equal(content.split(QQBOT_PATCH_START).length - 1, 1)
    assert.equal(mergeQqBotPatch(content, true), content)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('credential store encrypts the complete payload and never persists plaintext', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-qqbot-store-'))
  const path = join(root, 'qqbot.json')
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`protected:${Buffer.from(value).toString('base64')}`),
    decryptString: (value) => Buffer.from(value.toString().slice('protected:'.length), 'base64').toString(),
  }
  const store = new QqBotCredentialStore({ path, safeStorage })
  try {
    await store.save({ appId: '123456789', appSecret: 'top-secret-value' })
    const disk = await readFile(path, 'utf8')
    assert.doesNotMatch(disk, /123456789|top-secret-value/u)
    assert.deepEqual(await store.load(), { appId: '123456789', appSecret: 'top-secret-value' })
    await store.clear()
    assert.equal(await store.load(), undefined)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('binding service publishes a QR image, saves credentials, enables the profile, and restarts', async () => {
  let callbacks
  const calls = []
  const events = []
  const service = new QqBotBindingService({
    credentialStore: { save: async (value) => calls.push(['save', value]), clear: async () => {} },
    startQrConnect: (value, options) => {
      callbacks = value
      assert.equal(options.displayQrCodeToConsole, false)
      return () => calls.push(['stop'])
    },
    renderQr: async (url) => `data:image/png;base64,${Buffer.from(url).toString('base64')}`,
    setProfileEnabled: async (enabled) => calls.push(['profile', enabled]),
    setRuntimeCredentials: (value) => calls.push(['runtime', value]),
    restartRuntime: async () => calls.push(['restart']),
  })
  service.on('event', (event) => events.push(event))

  assert.equal(service.start().binding, true)
  callbacks.onQrDisplayed('https://example.test/qr')
  await tick()
  assert.match(service.status().qrImage, /^data:image\/png;base64,/u)
  callbacks.onSuccess([{ appId: '123456789', appSecret: 'never-rendered' }])
  await tick()
  await tick()

  assert.deepEqual(service.status(), { bound: true, binding: false, pending: false, appId: '12*****89', qrImage: undefined })
  assert.deepEqual(calls.map(([name]) => name), ['save', 'profile', 'runtime', 'restart'])
  assert.equal(events.some((event) => JSON.stringify(event).includes('never-rendered')), false)
  assert.equal(events.at(-1).type, 'bound')
})

test('binding cancellation ignores the connector failure callback and unbind clears state', async () => {
  let callbacks
  let stopped = false
  const calls = []
  const service = new QqBotBindingService({
    initialCredentials: undefined,
    credentialStore: { save: async () => {}, clear: async () => calls.push('clear') },
    startQrConnect: (value) => {
      callbacks = value
      return () => {
        stopped = true
        callbacks.onFailure(new Error('canceled by connector'))
      }
    },
    renderQr: async () => 'data:image/png;base64,qr',
    setProfileEnabled: async (enabled) => calls.push(`profile:${enabled}`),
    setRuntimeCredentials: (value) => calls.push(`runtime:${String(value)}`),
    restartRuntime: async () => calls.push('restart'),
  })
  service.start()
  assert.equal(service.cancel().binding, false)
  assert.equal(stopped, true)

  const boundService = new QqBotBindingService({
    initialCredentials: { appId: 'abcd1234', appSecret: 'secret' },
    credentialStore: service.credentialStore,
    startQrConnect: service.startQrConnect,
    setProfileEnabled: service.setProfileEnabled,
    setRuntimeCredentials: service.setRuntimeCredentials,
    restartRuntime: service.restartRuntime,
  })
  assert.equal((await boundService.unbind()).bound, false)
  assert.deepEqual(calls, ['clear', 'profile:false', 'runtime:undefined', 'restart'])
  assert.equal(maskAppId('abcd1234'), 'ab****34')
})

test('binding cancellation stops a connector that finishes loading later', async () => {
  let releaseConnector
  let stopped = 0
  const service = new QqBotBindingService({
    credentialStore: { save: async () => {}, clear: async () => {} },
    startQrConnect: async () => {
      await new Promise((resolve) => { releaseConnector = resolve })
      return () => { stopped += 1 }
    },
    setProfileEnabled: async () => {},
    setRuntimeCredentials: () => {},
    restartRuntime: async () => {},
  })

  assert.equal(service.start().binding, true)
  assert.equal(service.cancel().binding, false)
  releaseConnector()
  await tick()

  assert.equal(stopped, 1)
  assert.deepEqual(service.status(), {
    bound: false,
    binding: false,
    pending: false,
    appId: undefined,
    qrImage: undefined,
  })
})

test('an asynchronously loaded connector still publishes QR state', async () => {
  let callbacks
  const service = new QqBotBindingService({
    credentialStore: { save: async () => {}, clear: async () => {} },
    startQrConnect: async (value) => {
      await tick()
      callbacks = value
      return () => {}
    },
    renderQr: async () => 'data:image/png;base64,lazy',
    setProfileEnabled: async () => {},
    setRuntimeCredentials: () => {},
    restartRuntime: async () => {},
  })

  assert.equal(service.start().binding, true)
  await tick()
  await tick()
  callbacks.onQrDisplayed('https://example.test/lazy-qr')
  await tick()

  assert.equal(service.status().qrImage, 'data:image/png;base64,lazy')
  service.cancel()
})

test('a connector that fails synchronously cannot publish waiting after the error', () => {
  let stopped = 0
  const events = []
  const service = new QqBotBindingService({
    credentialStore: { save: async () => {}, clear: async () => {} },
    startQrConnect: (callbacks) => {
      callbacks.onFailure(new Error('connector startup failed'))
      return () => { stopped += 1 }
    },
    setProfileEnabled: async () => {},
    setRuntimeCredentials: () => {},
    restartRuntime: async () => {},
  })
  service.on('event', (event) => events.push(event))

  assert.equal(service.start().binding, false)
  assert.equal(stopped, 1)
  assert.equal(events.at(-1).type, 'error')
  assert.match(events.at(-1).error, /connector startup failed/u)
})

test('unbind is serialized after an in-flight credential save', async () => {
  let callbacks
  let releaseSave
  let connectorStarts = 0
  const calls = []
  const service = new QqBotBindingService({
    credentialStore: {
      save: async () => {
        calls.push('save')
        await new Promise((resolve) => { releaseSave = resolve })
      },
      clear: async () => calls.push('clear'),
    },
    startQrConnect: (value) => {
      connectorStarts += 1
      callbacks = value
      return () => {}
    },
    setProfileEnabled: async (enabled) => calls.push(`profile:${enabled}`),
    setRuntimeCredentials: (value) => calls.push(`runtime:${value ? 'set' : 'clear'}`),
    restartRuntime: async () => calls.push('restart'),
  })

  service.start()
  callbacks.onSuccess([{ appId: '123456789', appSecret: 'secret' }])
  assert.equal(service.status().pending, true)
  service.start()
  assert.equal(connectorStarts, 1)
  const unbinding = service.unbind()
  await tick()
  assert.deepEqual(calls, ['save'])
  releaseSave()
  assert.equal((await unbinding).bound, false)
  assert.deepEqual(calls, [
    'save',
    'profile:true',
    'runtime:set',
    'restart',
    'clear',
    'profile:false',
    'runtime:clear',
    'restart',
  ])
})

test('binding restart failure rolls back credentials, profile state, and runtime environment', async () => {
  let callbacks
  let restarts = 0
  const calls = []
  const events = []
  const service = new QqBotBindingService({
    credentialStore: {
      save: async (value) => calls.push(['save', value]),
      clear: async () => calls.push(['clear']),
    },
    startQrConnect: (value) => { callbacks = value; return () => {} },
    setProfileEnabled: async (enabled) => { calls.push(['profile', enabled]); return true },
    setRuntimeCredentials: (value) => calls.push(['runtime', value]),
    restartRuntime: async () => {
      restarts += 1
      calls.push(['restart', restarts])
      if (restarts === 1) throw new Error('new runtime failed')
    },
  })
  service.on('event', (event) => events.push(event))

  service.start()
  callbacks.onSuccess([{ appId: '123456789', appSecret: 'secret' }])
  await tick()
  await tick()
  await tick()

  assert.deepEqual(calls.map(([name, value]) => [name, name === 'runtime' ? Boolean(value) : value]), [
    ['save', { appId: '123456789', appSecret: 'secret' }],
    ['profile', true],
    ['runtime', true],
    ['restart', 1],
    ['runtime', false],
    ['profile', false],
    ['clear', undefined],
    ['restart', 2],
  ])
  assert.equal(service.status().bound, false)
  assert.equal(service.status().pending, false)
  assert.equal(events.at(-1).type, 'error')
  assert.match(events.at(-1).error, /new runtime failed/u)
})

test('unbind restart failure restores the previous bound state', async () => {
  const credentials = { appId: 'abcd1234', appSecret: 'secret' }
  let restarts = 0
  const calls = []
  const service = new QqBotBindingService({
    initialCredentials: credentials,
    credentialStore: {
      save: async (value) => calls.push(['save', value]),
      clear: async () => calls.push(['clear']),
    },
    startQrConnect: () => () => {},
    setProfileEnabled: async (enabled) => { calls.push(['profile', enabled]); return true },
    setRuntimeCredentials: (value) => calls.push(['runtime', value]),
    restartRuntime: async () => {
      restarts += 1
      calls.push(['restart', restarts])
      if (restarts === 1) throw new Error('unbind runtime failed')
    },
  })

  await assert.rejects(service.unbind(), /unbind runtime failed/u)
  assert.deepEqual(service.status(), {
    bound: true,
    binding: false,
    pending: false,
    appId: 'ab****34',
    qrImage: undefined,
  })
  assert.deepEqual(calls.map(([name, value]) => [name, name === 'runtime' ? Boolean(value) : value]), [
    ['clear', undefined],
    ['profile', false],
    ['runtime', false],
    ['restart', 1],
    ['runtime', true],
    ['profile', true],
    ['save', credentials],
    ['restart', 2],
  ])
})

test('binding reports both the original failure and a rollback failure', async () => {
  let callbacks
  const service = new QqBotBindingService({
    credentialStore: {
      save: async () => {},
      clear: async () => { throw new Error('credential rollback failed') },
    },
    startQrConnect: (value) => { callbacks = value; return () => {} },
    setProfileEnabled: async () => { throw new Error('profile enable failed') },
    setRuntimeCredentials: () => {},
    restartRuntime: async () => {},
  })
  const events = []
  service.on('event', (event) => events.push(event))

  service.start()
  callbacks.onSuccess([{ appId: '123456789', appSecret: 'secret' }])
  await tick()
  await tick()

  assert.equal(events.at(-1).type, 'error')
  assert.match(events.at(-1).error, /profile enable failed/u)
  assert.match(events.at(-1).error, /credential rollback failed/u)
})

test('a renderer event delivery failure cannot roll back a committed binding', async () => {
  let callbacks
  const reported = []
  const delivered = []
  const service = new QqBotBindingService({
    credentialStore: { save: async () => {}, clear: async () => {} },
    startQrConnect: (value) => { callbacks = value; return () => {} },
    setProfileEnabled: async () => true,
    setRuntimeCredentials: () => {},
    restartRuntime: async () => {},
    onEventError: (error) => reported.push(error.message),
  })
  service.on('event', (event) => {
    if (event.type === 'bound') throw new Error('extension window closed')
  })
  service.on('event', (event) => delivered.push(event.type))

  service.start()
  callbacks.onSuccess([{ appId: '123456789', appSecret: 'secret' }])
  await tick()
  await tick()

  assert.equal(service.status().bound, true)
  assert.deepEqual(reported, ['extension window closed'])
  assert.ok(delivered.includes('bound'))
})

test('quiescing a settling bind rolls back and prevents a late runtime restart', async () => {
  let callbacks
  let releaseSave
  const saveBarrier = new Promise((resolve) => { releaseSave = resolve })
  const calls = []
  const service = new QqBotBindingService({
    credentialStore: {
      save: async () => {
        calls.push('save')
        await saveBarrier
      },
      clear: async () => { calls.push('clear') },
    },
    startQrConnect: (value) => { callbacks = value; return () => {} },
    setProfileEnabled: async (enabled) => { calls.push(`profile:${enabled}`) },
    setRuntimeCredentials: (value) => { calls.push(`runtime:${value ? 'set' : 'clear'}`) },
    restartRuntime: async () => { calls.push('restart') },
  })

  service.start()
  callbacks.onSuccess([{ appId: '123456789', appSecret: 'secret' }])
  await tick()
  const quiescing = service.quiesce()
  releaseSave()
  await quiescing

  assert.deepEqual(calls, ['save', 'clear'])
  assert.deepEqual(service.status(), {
    bound: false,
    binding: false,
    pending: false,
    appId: undefined,
    qrImage: undefined,
  })
})
