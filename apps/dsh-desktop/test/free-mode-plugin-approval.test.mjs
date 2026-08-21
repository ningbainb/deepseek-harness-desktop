import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveExternalPluginSource } from '../src/external-plugin-source.mjs'
import { createFreeModePluginApproval } from '../src/free-mode-plugin-approval.mjs'

function descriptor() {
  return Object.freeze({
    schemaVersion: 1,
    sourceId: `sha256:${'a'.repeat(64)}`,
    candidateId: `sha256:${'b'.repeat(64)}`,
    sourceType: 'directory',
    referenceType: 'path',
    canonicalPath: 'C:\\private\\plugin',
    installSpec: 'file:///C:/private/plugin',
    contentFingerprint: `sha256:${'c'.repeat(64)}`,
    package: Object.freeze({ name: '@private/free-plugin', version: '1.0.0' }),
    loader: Object.freeze({
      sourceType: 'directory',
      installSpec: 'file:///C:/private/plugin',
      packageName: '@private/free-plugin',
      declaredDshBundle: false,
    }),
  })
}

function memoryStore() {
  const calls = []
  let allowed = false
  return {
    calls,
    authorize: async () => ({ allowed, reason: allowed ? 'approved-source' : 'approval-required' }),
    approve: async (request) => {
      calls.push(request)
      allowed = true
    },
    clearSession: async (sessionId) => {
      calls.push({ clearSession: sessionId })
      return 1
    },
    load: async () => [],
    list: async () => [],
    revoke: async () => false,
  }
}

function deferred() {
  let resolve
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

test('native full-access confirmation issues a source/content/once grant without returning paths to IPC', async () => {
  const store = memoryStore()
  const dialogs = []
  const value = descriptor()
  const approval = createFreeModePluginApproval({
    resolver: { resolve: async (spec) => { assert.equal(spec, 'file:./plugin'); return value } },
    permissionStore: store,
    dialog: { showMessageBox: async (options) => { dialogs.push(options); return { response: 2 } } },
    idFactory: () => 'native-confirmation-id',
    sessionIdFactory: () => 'free-session-1',
    now: () => '2026-08-20T13:30:00.000Z',
  })
  const resolved = await approval.resolve({ spec: 'file:./plugin' })
  assert.equal(resolved, value)
  assert.equal(await approval.confirm(resolved), true)
  assert.equal(dialogs.length, 1)
  assert.equal(dialogs[0].defaultId, 3)
  assert.equal(dialogs[0].cancelId, 3)
  assert.equal(JSON.stringify(dialogs[0]).includes('C:\\private'), false)
  assert.deepEqual(store.calls[0], {
    trustScope: 'source',
    source: { id: value.sourceId, contentSha256: 'c'.repeat(64) },
    sessionId: 'free-session-1',
    approval: {
      method: 'native-user-confirmation',
      userConfirmed: true,
      confirmationId: 'native-confirmation-id',
      approvedAt: '2026-08-20T13:30:00.000Z',
    },
  })
  assert.deepEqual(approval.approvalFor(resolved), {
    trustScope: 'source',
    persistent: true,
  })
  assert.equal(approval.launchSessionIdFor(resolved), 'free-session-1')
})

test('a cancellation never creates an approval and only resolved descriptors can be confirmed', async () => {
  const store = memoryStore()
  const value = descriptor()
  const approval = createFreeModePluginApproval({
    resolver: { resolve: async () => value },
    permissionStore: store,
    dialog: { showMessageBox: async () => ({ response: 3 }) },
    sessionIdFactory: () => 'free-session-2',
  })
  await assert.rejects(approval.confirm(value), /not resolved/u)
  const resolved = await approval.resolve({ spec: 'file:./plugin' })
  assert.equal(await approval.confirm(resolved), false)
  assert.deepEqual(store.calls, [])
  assert.equal(approval.approvalFor(resolved), undefined)
  assert.throws(() => approval.launchSessionIdFor(resolved), /not approved/u)
})

test('existing persisted authorization remains private but exposes only its scope to Electron main', async () => {
  const value = descriptor()
  const approval = createFreeModePluginApproval({
    resolver: { resolve: async () => value },
    permissionStore: {
      authorize: async () => ({ allowed: true, trustScope: 'content' }),
      approve: async () => { throw new Error('native confirmation must not repeat') },
      clearSession: async () => assert.fail('persistent grants must not be cleared'),
      load: async () => [],
      list: async () => [],
      revoke: async () => false,
    },
    dialog: { showMessageBox: async () => { throw new Error('native confirmation must not repeat') } },
    sessionIdFactory: () => 'free-session-3',
  })
  const resolved = await approval.resolve({ spec: 'file:./plugin' })
  assert.equal(await approval.confirm(resolved), true)
  assert.deepEqual(approval.approvalFor(resolved), {
    trustScope: 'content',
    persistent: true,
  })
})

test('main-process bulk revocation removes only active persistent external-plugin trust and returns no source data', async () => {
  const revokeCalls = []
  const store = {
    authorize: async () => ({ allowed: false, reason: 'approval-required' }),
    approve: async () => {},
    clearSession: async () => 0,
    load: async () => [],
    list: async () => [
      { grantId: 'once-001', trustScope: 'once', active: true, source: { canonicalPath: 'C:\\private\\once-plugin' } },
      { grantId: 'content-001', trustScope: 'content', active: true, source: { canonicalPath: 'C:\\private\\content-plugin' } },
      { grantId: 'source-001', trustScope: 'source', active: true, source: { canonicalPath: 'C:\\private\\source-plugin' } },
      { grantId: 'content-old', trustScope: 'content', active: false, source: { canonicalPath: 'C:\\private\\old-plugin' } },
    ],
    revoke: async (grantId, options) => {
      revokeCalls.push({ grantId, options })
      return true
    },
  }
  const approval = createFreeModePluginApproval({
    resolver: { resolve: async () => descriptor() },
    permissionStore: store,
    dialog: { showMessageBox: async () => ({ response: 3 }) },
    now: () => '2026-08-21T01:00:00.000Z',
  })

  const result = await approval.revokeAllPersistentTrust()

  assert.deepEqual(result, { revokedCount: 2 })
  assert.deepEqual(revokeCalls, [
    { grantId: 'content-001', options: { revokedAt: '2026-08-21T01:00:00.000Z' } },
    { grantId: 'source-001', options: { revokedAt: '2026-08-21T01:00:00.000Z' } },
  ])
  assert.equal(JSON.stringify(result).includes('C:\\private'), false)
  await assert.rejects(
    approval.revokeAllPersistentTrust({ grantId: 'once-001' }),
    /does not accept renderer arguments/u,
  )
})

test('bulk revocation requires the complete main-process permission-store interface and rejects malformed grant lists before mutation', async () => {
  const base = {
    authorize: async () => ({ allowed: false }),
    approve: async () => {},
    clearSession: async () => 0,
    load: async () => [],
  }
  assert.throws(
    () => createFreeModePluginApproval({
      resolver: { resolve: async () => descriptor() },
      permissionStore: { ...base, list: async () => [] },
      dialog: { showMessageBox: async () => ({ response: 3 }) },
    }),
    /permission store/u,
  )

  let revoked = false
  const approval = createFreeModePluginApproval({
    resolver: { resolve: async () => descriptor() },
    permissionStore: {
      ...base,
      list: async () => [{ grantId: 'not a safe ID', trustScope: 'source', active: true }],
      revoke: async () => {
        revoked = true
        return true
      },
    },
    dialog: { showMessageBox: async () => ({ response: 3 }) },
  })
  await assert.rejects(
    approval.revokeAllPersistentTrust(),
    (error) => error?.code === 'free-mode-plugin-persistent-trust-store-invalid'
      && error.message.includes('not a safe ID') === false,
  )
  assert.equal(revoked, false)
})

test('bulk persistent-trust revocation is serialized, preserves once grants, and remains retryable after a durable failure', async () => {
  const active = new Map([
    ['once-serial', { trustScope: 'once', active: true }],
    ['content-serial', { trustScope: 'content', active: true }],
    ['source-serial', { trustScope: 'source', active: true }],
  ])
  const firstRevokeEntered = deferred()
  const allowFirstRevoke = deferred()
  let blockFirst = true
  let listCalls = 0
  const revokeCalls = []
  let failSource = true
  const store = {
    authorize: async () => ({ allowed: false, reason: 'approval-required' }),
    approve: async () => {},
    clearSession: async () => 0,
    load: async () => [],
    list: async () => {
      listCalls += 1
      return [...active.entries()].map(([grantId, value]) => ({ grantId, ...value }))
    },
    revoke: async (grantId) => {
      revokeCalls.push(grantId)
      if (blockFirst) {
        blockFirst = false
        firstRevokeEntered.resolve()
        await allowFirstRevoke.promise
      }
      if (grantId === 'source-serial' && failSource) {
        throw new Error('C:\\private\\source-plugin could not be revoked')
      }
      active.get(grantId).active = false
      return true
    },
  }
  const approval = createFreeModePluginApproval({
    resolver: { resolve: async () => descriptor() },
    permissionStore: store,
    dialog: { showMessageBox: async () => ({ response: 3 }) },
    now: () => '2026-08-21T01:01:00.000Z',
  })

  const first = approval.revokeAllPersistentTrust()
  await firstRevokeEntered.promise
  const second = approval.revokeAllPersistentTrust()
  await Promise.resolve()
  assert.equal(listCalls, 1)
  allowFirstRevoke.resolve()

  await assert.rejects(
    first,
    (error) => error?.code === 'free-mode-plugin-persistent-trust-revoke-failed'
      && error.revokedCount === 1
      && error.message.includes('C:\\private') === false,
  )
  await assert.rejects(
    second,
    (error) => error?.code === 'free-mode-plugin-persistent-trust-revoke-failed'
      && error.revokedCount === 0,
  )
  assert.deepEqual(revokeCalls, ['content-serial', 'source-serial', 'source-serial'])
  assert.equal(active.get('once-serial').active, true)
  assert.equal(active.get('content-serial').active, false)
  assert.equal(active.get('source-serial').active, true)

  failSource = false
  assert.deepEqual(await approval.revokeAllPersistentTrust(), { revokedCount: 1 })
  assert.deepEqual(revokeCalls, ['content-serial', 'source-serial', 'source-serial', 'source-serial'])
  assert.equal(active.get('once-serial').active, true)
  assert.equal(active.get('source-serial').active, false)
})

test('an unresolved remote source permits only one-time native consent', async () => {
  const remote = await resolveExternalPluginSource('https://plugins.example.invalid/external-plugin.tgz')
  const store = memoryStore()
  const dialogs = []
  const approval = createFreeModePluginApproval({
    resolver: { resolve: async () => remote },
    permissionStore: store,
    dialog: { showMessageBox: async (options) => { dialogs.push(options); return { response: 0 } } },
    sessionIdFactory: () => 'free-session-remote',
    idFactory: () => 'remote-confirmation',
    now: () => '2026-08-20T14:00:00.000Z',
  })
  const resolved = await approval.resolve({ spec: remote.installSpec })
  assert.equal(await approval.confirm(resolved), true)
  assert.deepEqual(dialogs[0].buttons, ['仅本次加载', '取消'])
  assert.equal(dialogs[0].defaultId, 1)
  assert.equal(dialogs[0].cancelId, 1)
  assert.equal(store.calls[0].trustScope, 'once')
  assert.deepEqual(approval.approvalFor(resolved), { trustScope: 'once', persistent: false })
  assert.equal(await approval.complete(resolved), true)
  assert.deepEqual(store.calls.at(-1), { clearSession: 'free-session-remote' })
  assert.equal(approval.approvalFor(resolved), undefined)
})

test('a community market install uses one concise native confirmation', async () => {
  const remote = await resolveExternalPluginSource('github:owner/community-plugin')
  const store = memoryStore()
  const dialogs = []
  const approval = createFreeModePluginApproval({
    resolver: { resolve: async () => remote },
    permissionStore: store,
    dialog: { showMessageBox: async (options) => { dialogs.push(options); return { response: 0 } } },
    sessionIdFactory: () => 'free-session-market',
    idFactory: () => 'market-confirmation',
    now: () => '2026-08-22T04:30:00.000Z',
  })
  const resolved = await approval.resolve({ spec: remote.installSpec })

  assert.equal(await approval.confirm(resolved, { mode: 'market' }), true)
  assert.equal(dialogs.length, 1)
  assert.equal(dialogs[0].type, 'question')
  assert.equal(dialogs[0].title, '安装社区插件')
  assert.deepEqual(dialogs[0].buttons, ['安装', '取消'])
  assert.equal(dialogs[0].detail.includes('不安全'), false)
  assert.equal(dialogs[0].detail.includes('完整权限'), false)
  assert.equal(store.calls[0].trustScope, 'once')
})

test('a damaged durable ledger can still load a local source through one native-confirmed ephemeral session', async () => {
  const store = memoryStore()
  const value = descriptor()
  const dialogs = []
  const approval = createFreeModePluginApproval({
    resolver: { resolve: async () => value },
    permissionStore: store,
    dialog: { showMessageBox: async (options) => { dialogs.push(options); return { response: 0 } } },
    sessionIdFactory: () => 'free-session-emergency-once',
    forceOnce: true,
  })

  const resolved = await approval.resolve({ spec: 'file:./plugin' })
  assert.equal(await approval.confirm(resolved), true)
  assert.deepEqual(dialogs[0].buttons, ['仅本次加载', '取消'])
  assert.equal(store.calls[0].trustScope, 'once')
  assert.deepEqual(approval.approvalFor(resolved), { trustScope: 'once', persistent: false })
  await approval.complete(resolved)
  assert.deepEqual(store.calls.at(-1), { clearSession: 'free-session-emergency-once' })
})

test('a local full-access source is revalidated after confirmation and before installation', async () => {
  const store = memoryStore()
  const original = descriptor()
  const refreshed = Object.freeze({ ...original })
  const resolvedSpecs = []
  const approval = createFreeModePluginApproval({
    resolver: {
      resolve: async (spec) => {
        resolvedSpecs.push(spec)
        return resolvedSpecs.length === 1 ? original : refreshed
      },
    },
    permissionStore: store,
    dialog: { showMessageBox: async () => ({ response: 2 }) },
    sessionIdFactory: () => 'free-session-revalidate',
  })

  const resolved = await approval.resolve({ spec: 'file:./plugin' })
  assert.equal(await approval.confirm(resolved), true)
  const revalidated = await approval.revalidate(resolved)

  assert.equal(revalidated, refreshed)
  assert.deepEqual(resolvedSpecs, ['file:./plugin', original.installSpec])
  assert.deepEqual(approval.approvalFor(revalidated), {
    trustScope: 'source',
    persistent: true,
  })
  assert.equal(approval.launchSessionIdFor(revalidated), 'free-session-revalidate')
})

test('a local source changed after confirmation is rejected before pnpm can mutate a profile', async () => {
  const store = memoryStore()
  const original = descriptor()
  const changed = Object.freeze({
    ...original,
    candidateId: `sha256:${'d'.repeat(64)}`,
    contentFingerprint: `sha256:${'e'.repeat(64)}`,
  })
  let resolveCount = 0
  const approval = createFreeModePluginApproval({
    resolver: {
      resolve: async () => {
        resolveCount += 1
        return resolveCount === 1 ? original : changed
      },
    },
    permissionStore: store,
    dialog: { showMessageBox: async () => ({ response: 2 }) },
    sessionIdFactory: () => 'free-session-changed-content',
  })

  const resolved = await approval.resolve({ spec: 'file:./plugin' })
  assert.equal(await approval.confirm(resolved), true)
  await assert.rejects(approval.revalidate(resolved), /changed after native confirmation/u)
})
