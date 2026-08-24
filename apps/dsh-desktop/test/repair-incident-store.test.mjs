import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  RepairIncidentStore,
  repairIncidentFingerprint,
} from '../src/repair-incident-store.mjs'

test('repair incident fingerprints and durable state exclude raw paths, credentials, and logs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-repair-incident-'))
  try {
    const secret = 'sk-secret-value-that-must-not-persist'
    const userPath = 'C:\\Users\\PrivateUser\\project\\plugin.js'
    const input = {
      desktopVersion: '3.0.2',
      runtimeVersion: '0.1.1-rc.1',
      phase: 'full-start',
      error: new Error(`failed at ${userPath} apiKey=${secret}`),
      bundles: [
        { name: '@community/example', version: '1.2.3', enabled: true },
        { name: '@community/disabled', version: '2.0.0', enabled: false },
      ],
    }
    const fingerprint = repairIncidentFingerprint(input)
    assert.match(fingerprint, /^[a-f0-9]{64}$/u)
    assert.equal(fingerprint, repairIncidentFingerprint({
      ...input,
      error: new Error('failed at D:\\AnotherUser\\elsewhere apiKey=another-secret'),
    }))

    const store = new RepairIncidentStore({ userDataDir: root, now: () => 1_000 })
    const claim = await store.claim(input)
    assert.equal(claim.claimed, true)
    assert.equal((await store.claim(input)).claimed, false)
    await store.transition(fingerprint, 'running')
    await store.recordModelAttempt(fingerprint, {
      provider: 'openai-compatible',
      model: 'repair-model',
      outcome: 'failed',
    })
    await store.recordToolAction(fingerprint, {
      tool: 'write_repair_file',
      outcome: 'ok',
      path: 'plugins/example/index.mjs',
    })
    await store.transition(fingerprint, 'exhausted')

    const persisted = await readFile(join(root, 'repair-agent', 'incidents', fingerprint, 'incident.json'), 'utf8')
    assert.doesNotMatch(persisted, /PrivateUser|AnotherUser|sk-secret|another-secret|apiKey|failed at/u)
    assert.match(persisted, /openai-compatible/u)
    assert.match(persisted, /plugins\/example\/index\.mjs/u)

    const nextVersion = await store.claim({ ...input, desktopVersion: '3.0.5' })
    assert.equal(nextVersion.claimed, true)
    assert.notEqual(nextVersion.incident.fingerprint, fingerprint)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('repair incidents cap model attempts and tool action summaries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-repair-budget-'))
  try {
    const store = new RepairIncidentStore({ userDataDir: root })
    const input = {
      desktopVersion: '3.0.2',
      runtimeVersion: '0.1.1-rc.1',
      phase: 'full-start',
      error: { name: 'Error', code: 'PLUGIN_START_FAILED' },
      bundles: [],
    }
    const { incident } = await store.claim(input)
    await store.transition(incident.fingerprint, 'running')
    await store.recordModelAttempt(incident.fingerprint, { provider: 'p1', model: 'm1', outcome: 'failed' })
    await store.recordModelAttempt(incident.fingerprint, { provider: 'p2', model: 'm2', outcome: 'failed' })
    await assert.rejects(
      store.recordModelAttempt(incident.fingerprint, { provider: 'p3', model: 'm3', outcome: 'failed' }),
      /model attempt budget exhausted/u,
    )
    for (let index = 0; index < 12; index += 1) {
      await store.recordToolAction(incident.fingerprint, { tool: 'read_repair_file', outcome: 'ok' })
    }
    await assert.rejects(
      store.recordToolAction(incident.fingerprint, { tool: 'read_repair_file', outcome: 'ok' }),
      /tool action budget exhausted/u,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('latest repair status retains only relative changed files and registered checks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-repair-latest-'))
  let now = 1_000
  try {
    const store = new RepairIncidentStore({ userDataDir: root, now: () => now })
    const { incident } = await store.claim({
      desktopVersion: '3.0.2',
      runtimeVersion: '0.1.1-rc.1',
      phase: 'full-start',
      error: { name: 'Error', code: 'PLUGIN_START_FAILED' },
      bundles: [],
    })
    await store.transition(incident.fingerprint, 'running')
    now += 1_000
    await store.recordVerification(incident.fingerprint, {
      changedFiles: ['plugins/example/index.mjs', 'profile/cordis.patch.yml'],
      checks: ['plugin-example-test'],
    })
    await assert.rejects(
      store.recordVerification(incident.fingerprint, { changedFiles: ['C:\\private\\plugin.js'], checks: [] }),
      /path/u,
    )
    await store.transition(incident.fingerprint, 'verified')

    const latest = await store.latest()
    assert.equal(latest.fingerprint, incident.fingerprint)
    assert.deepEqual(latest.changedFiles, ['plugins/example/index.mjs', 'profile/cordis.patch.yml'])
    assert.deepEqual(latest.checks, ['plugin-example-test'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
