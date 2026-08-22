import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  createPreBootstrapMigrationWindowAnchor,
  preflightDesktopMigrationGate,
  preflightMigrationRepairGuidance,
  runtimeStartupRepairCategory,
  runtimeSupportRepairCategory,
  shouldAutoContinuePreBootstrapMigration,
} from '../src/electron-app.mjs'

const PRE_BOOTSTRAP_BLOCKED_LOG = '[migration] pre-bootstrap recovery state unavailable; bootstrap blocked'
const PRE_BOOTSTRAP_REPAIR_LOG = '[migration] pre-bootstrap migration repair required; bootstrap blocked'

function eligiblePlan() {
  return Object.freeze({
    status: 'safe',
    sourceVersion: '2.7.0',
    targetVersion: '3.0.0',
  })
}

function preparedJournal() {
  return Object.freeze({
    id: 'migration-0001',
    state: 'started',
    sourceVersion: '2.7.0',
    targetVersion: '3.0.0',
  })
}

test('preflight recovery errors fail closed before profile bootstrap', async () => {
  const cases = [
    {
      name: 'journal scan',
      expectedCalls: ['list'],
      createAssistant(calls) {
        return {
          listJournals: async () => {
            calls.push('list')
            throw new Error('simulated recovery journal scan failure')
          },
          planMigration: async () => calls.push('plan'),
          beginMigration: async () => calls.push('begin'),
        }
      },
    },
    {
      name: 'migration plan',
      expectedCalls: ['list', 'plan'],
      createAssistant(calls) {
        return {
          listJournals: async () => {
            calls.push('list')
            return []
          },
          planMigration: async () => {
            calls.push('plan')
            throw new Error('simulated recovery plan failure')
          },
          beginMigration: async () => calls.push('begin'),
        }
      },
    },
    {
      name: 'journal creation after snapshot capture',
      expectedCalls: ['list', 'plan', 'begin'],
      createAssistant(calls) {
        return {
          listJournals: async () => {
            calls.push('list')
            return []
          },
          planMigration: async () => {
            calls.push('plan')
            return eligiblePlan()
          },
          beginMigration: async () => {
            calls.push('begin')
            throw new Error('simulated journal write failure after snapshot capture')
          },
        }
      },
    },
  ]

  for (const item of cases) {
    const calls = []
    const logs = []
    let profileBootstrapCalls = 0
    const gate = await preflightDesktopMigrationGate({
      migrationAssistant: item.createAssistant(calls),
      log: async (message) => logs.push(message),
    })

    assert.equal(gate.bootstrapAllowed, false, item.name)
    assert.equal(gate.reason, 'migration-preflight-unavailable', item.name)
    assert.equal(gate.plan, undefined, item.name)
    assert.equal(gate.journal, undefined, item.name)
    assert.equal(Object.isFrozen(gate), true, item.name)
    assert.deepEqual(calls, item.expectedCalls, item.name)
    assert.deepEqual(logs, [PRE_BOOTSTRAP_BLOCKED_LOG], item.name)

    if (gate.bootstrapAllowed) profileBootstrapCalls += 1
    assert.equal(profileBootstrapCalls, 0, `${item.name} must not reach profile bootstrap`)
  }
})

test('preflight logging errors also fail closed after an eligible journal is prepared', async () => {
  const calls = []
  const logs = []
  let profileBootstrapCalls = 0
  const gate = await preflightDesktopMigrationGate({
    migrationAssistant: {
      listJournals: async () => {
        calls.push('list')
        return []
      },
      planMigration: async () => {
        calls.push('plan')
        return eligiblePlan()
      },
      beginMigration: async () => {
        calls.push('begin')
        return preparedJournal()
      },
    },
    log: async (message) => {
      logs.push(message)
      throw new Error('simulated diagnostics failure')
    },
  })

  assert.equal(gate.bootstrapAllowed, false)
  assert.equal(gate.reason, 'migration-preflight-unavailable')
  assert.deepEqual(calls, ['list', 'plan', 'begin'])
  assert.deepEqual(logs, [
    '[migration] pre-bootstrap journal prepared for 2.7.0',
    PRE_BOOTSTRAP_BLOCKED_LOG,
  ])
  if (gate.bootstrapAllowed) profileBootstrapCalls += 1
  assert.equal(profileBootstrapCalls, 0)
})

test('blocked migration plans fail closed before profile bootstrap without creating a journal', async () => {
  const plan = Object.freeze({
    status: 'blocked',
    sourceVersion: '2.7.0',
    targetVersion: '3.0.0',
    blockers: ['runtime-support-blocked'],
  })
  const calls = []
  const logs = []
  let profileBootstrapCalls = 0
  const gate = await preflightDesktopMigrationGate({
    migrationAssistant: {
      listJournals: async () => {
        calls.push('list')
        return []
      },
      planMigration: async () => {
        calls.push('plan')
        return plan
      },
      beginMigration: async () => {
        calls.push('begin')
        throw new Error('blocked plans must not create a journal')
      },
    },
    log: async (message) => logs.push(message),
  })

  assert.equal(gate.bootstrapAllowed, false)
  assert.equal(gate.reason, 'migration-preflight-blocked')
  assert.equal(gate.plan, plan)
  assert.equal(gate.journal, undefined)
  assert.deepEqual(calls, ['list', 'plan'])
  assert.deepEqual(logs, [PRE_BOOTSTRAP_REPAIR_LOG])
  if (gate.bootstrapAllowed) profileBootstrapCalls += 1
  assert.equal(profileBootstrapCalls, 0)
})

test('blocked migration guidance is capped and selected only from allowlisted blocker codes', () => {
  const guidance = preflightMigrationRepairGuidance({
    blockers: [
      'runtime-support-blocked',
      'invalid-taskState',
      'untrusted-blocker',
      'plugin-compatibility-blocked',
    ],
    guidance: [
      'C:\\private\\profile.json must not be shown',
      'untrusted recovery text must not be shown',
    ],
  })

  assert.deepEqual(guidance, [
    '安装 Known Good 或 Supported Runtime 后重试。',
    '修复损坏的 Desktop 状态文件后重试。',
    '不要删除私有迁移恢复文件。',
  ])
  assert.equal(Object.isFrozen(guidance), true)
  assert.equal(guidance.length <= 3, true)
  assert.equal(guidance.every((line) => line.length <= 120), true)
  assert.equal(guidance.some((line) => /private|untrusted|\\/iu.test(line)), false)

  assert.deepEqual(preflightMigrationRepairGuidance({
    blockers: ['toString', 'constructor', '__proto__', 'untrusted-blocker'],
    guidance: ['C:\\private\\profile.json must not be shown'],
  }), [
    '请先修复本地 Desktop 升级状态后重试。',
    '不要删除私有迁移恢复文件。',
  ])
})

test('runtime support failures map to fixed local repair categories without exposing details', () => {
  assert.equal(runtimeSupportRepairCategory({ reason: 'runtime-file-integrity-not-in-matrix' }), 'runtime-integrity-failed')
  assert.equal(runtimeSupportRepairCategory({ reason: 'runtime-matrix-unavailable' }), 'runtime-integrity-failed')
  assert.equal(runtimeSupportRepairCategory({ reason: 'runtime-version-not-in-matrix' }), 'runtime-unavailable')
  assert.equal(runtimeSupportRepairCategory({
    reason: 'C:\\Users\\alice\\private-token',
  }), 'runtime-unavailable')
})

test('Runtime startup failures are classified in main without sending raw stderr to the recovery surface', () => {
  assert.equal(
    runtimeStartupRepairCategory({ error: 'Error: spawn git.exe ENOENT C:\\Users\\alice\\secret' }),
    'external-tool-missing',
  )
  assert.equal(
    runtimeStartupRepairCategory({ error: 'ERR_MODULE_NOT_FOUND: failed to import loader entry zod' }),
    'packaged-dependency-missing',
  )
  assert.equal(
    runtimeStartupRepairCategory({ error: 'user plugin failed while loading' }),
    'plugin-startup-failure',
  )
  assert.equal(runtimeStartupRepairCategory({ error: undefined }), 'plugin-startup-failure')
})

test('preflight preserves a prepared plan and journal for automatic migration', async () => {
  const plan = eligiblePlan()
  const journal = preparedJournal()
  const calls = []
  const logs = []
  const gate = await preflightDesktopMigrationGate({
    migrationAssistant: {
      listJournals: async () => {
        calls.push('list')
        return []
      },
      planMigration: async () => {
        calls.push('plan')
        return plan
      },
      beginMigration: async (receivedPlan) => {
        calls.push('begin')
        assert.equal(receivedPlan, plan)
        return journal
      },
    },
    log: async (message) => logs.push(message),
  })

  assert.equal(gate.bootstrapAllowed, true)
  assert.equal(gate.plan, plan)
  assert.equal(gate.journal, journal)
  assert.equal(Object.isFrozen(gate), true)
  assert.deepEqual(calls, ['list', 'plan', 'begin'])
  assert.deepEqual(logs, ['[migration] pre-bootstrap journal prepared for 2.7.0'])
})

test('preflight preserves an interrupted journal without a second migration scan', async () => {
  const journal = preparedJournal()
  const calls = []
  const gate = await preflightDesktopMigrationGate({
    migrationAssistant: {
      listJournals: async () => {
        calls.push('list')
        return [journal]
      },
      planMigration: async () => calls.push('plan'),
      beginMigration: async () => calls.push('begin'),
    },
  })

  assert.equal(gate.bootstrapAllowed, true)
  assert.equal(gate.plan, undefined)
  assert.equal(gate.journal, journal)
  assert.deepEqual(calls, ['list'])
})

test('validated safe and legacy-browser migration journals resume automatically', () => {
  assert.equal(shouldAutoContinuePreBootstrapMigration({
    planStatus: 'safe',
    confirmationRequired: false,
  }), true)
  assert.equal(shouldAutoContinuePreBootstrapMigration({
    planStatus: 'needs-confirmation',
    confirmationRequired: true,
  }), true)
  assert.equal(shouldAutoContinuePreBootstrapMigration({
    planStatus: 'needs-confirmation',
    confirmationRequired: false,
  }), false)
  assert.equal(shouldAutoContinuePreBootstrapMigration({
    planStatus: 'safe',
    confirmationRequired: true,
  }), false)
  assert.equal(shouldAutoContinuePreBootstrapMigration({ planStatus: 'safe' }), false)
  assert.equal(shouldAutoContinuePreBootstrapMigration(undefined), false)
})

test('pre-bootstrap migration anchor is inert, hidden, and released only once', () => {
  const created = []
  class FakeBrowserWindow {
    constructor(options) {
      this.options = options
      this.destroyed = false
      this.webContents = {
        setWindowOpenHandler: (handler) => { this.windowOpenHandler = handler },
      }
      created.push(this)
    }

    isDestroyed() {
      return this.destroyed
    }

    destroy() {
      this.destroyed = true
    }
  }

  const anchor = createPreBootstrapMigrationWindowAnchor({ BrowserWindow: FakeBrowserWindow })
  assert.equal(created.length, 1)
  assert.deepEqual(created[0].options, {
    show: false,
    skipTaskbar: true,
    focusable: false,
    frame: false,
    width: 1,
    height: 1,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  })
  assert.deepEqual(created[0].windowOpenHandler({ url: 'https://example.invalid/' }), { action: 'deny' })
  assert.equal(anchor.release(), true)
  assert.equal(created[0].destroyed, true)
  assert.equal(anchor.release(), false)
})

test('electron normal bootstrap does not scan, plan, or resume migrations', async () => {
  const source = await readFile(new URL('../src/electron-app.mjs', import.meta.url), 'utf8')
  const bootstrap = source.slice(source.indexOf('export async function startElectronApp'))
  const profileBootstrapAt = bootstrap.indexOf('prepareDesktopRuntimeInputs({')
  const migrationAssistantAt = bootstrap.indexOf('const migrationAssistant = new MigrationAssistant')

  assert.ok(profileBootstrapAt >= 0)
  assert.ok(migrationAssistantAt >= 0)
  assert.doesNotMatch(bootstrap, /prepareDesktopRuntimeInputsWithBaselineRecovery\(/u)
  assert.doesNotMatch(bootstrap, /preflightDesktopMigrationGate\(/u)
  assert.doesNotMatch(bootstrap.slice(0, profileBootstrapAt), /migrationAssistant\.(?:listJournals|planMigration|beginMigration|resumeMigration)\(/u)
  assert.doesNotMatch(bootstrap, /resolvePreBootstrapMigration/u)
  assert.doesNotMatch(bootstrap, /preBootstrapMigrationWindowAnchor/u)
})
