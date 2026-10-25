import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createSkillMarketActivation } from '../src/skill-market-activation.mjs'
import { createRuntimeMutationCoordinator } from '../src/runtime-mutation-coordinator.mjs'
import { mergeDesktopPatch } from '../src/profile.mjs'
import { mergeQqBotPatch, QQBOT_PATCH_END, readQqBotPatchEnabled } from '../src/extensions/qqbot.mjs'
import { withFileLock } from '../src/atomic-write-adapter.mjs'
import { setTimeout as delay } from 'node:timers/promises'

const originalPatch = `- insert:
    - id: dsh-agent-plugins-market
      name: dsh-agent-plugins-market
      disabled: true
      config:
        sources: [{ id: retained, url: E:/retained-skills, local: true }]
    - id: llm-pi-ai
      name: '@deepseek-ai/dsh-llm-pi-ai'
      config:
        providers: { retained: { apiKey: keep-local-fixture } }
`

async function fixture(body, { stop, start, ensureProfile, verifyHealth = async () => true, stopRuntime = async () => {} } = {}) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-market-activation-'))
  const profileDir = join(home, 'profiles', 'desktop')
  await mkdir(profileDir, { recursive: true })
  const patchPath = join(profileDir, 'cordis.patch.yml')
  await writeFile(patchPath, originalPatch)
  const events = []
  const coordinator = createRuntimeMutationCoordinator({
    controller: {
      stop: async () => { events.push('stop'); await stop?.({ patchPath, profileDir }) },
      start: async () => { events.push('start'); await start?.({ patchPath, profileDir }) },
    },
    ensureProfile: async () => { await ensureProfile?.({ patchPath, profileDir }) },
  })
  const service = createSkillMarketActivation({ dshHome: home, profileDir, agentsHome: join(home, 'agents'), verifyHealth,
    stopRuntime: async () => { events.push('quiesce'); await stopRuntime({ patchPath, profileDir }) }, runMutation: plan => coordinator.run(plan) })
  try { await body({ service, home, profileDir, patchPath, events }) } finally { await rm(home, { recursive: true, force: true }) }
}

test('describing and cancelling activation never changes the profile or starts a runtime mutation', async () => fixture(async ({ service, patchPath, events, home }) => {
  const before = await readFile(patchPath)
  const status = await service.describe()
  assert.equal(status.enabled, false)
  assert.equal(status.packageVersion, '0.11.1')
  assert.equal(status.dshHome, home)
  assert.equal(status.agentsHome, join(home, 'agents'))
  assert.match(status.revision, /^[a-f0-9]{64}$/u)
  await assert.rejects(service.activate({ confirmed: false, expectedRevision: status.revision }), /confirm/iu)
  assert.deepEqual(await readFile(patchPath), before)
  assert.deepEqual(events, [])
}))

test('activation honors the SDK profile writer lock before reading or replacing provider configuration', async () => fixture(async ({ service, patchPath, profileDir }) => {
  const status = await service.describe()
  let pending
  let observed
  await withFileLock(join(profileDir, 'package.json'), async () => {
    pending = service.activate({ confirmed: true, expectedRevision: status.revision }).then(value => ({ value }), error => ({ error }))
    await delay(100)
    observed = await readFile(patchPath, 'utf8')
    await writeFile(patchPath, `${originalPatch}\n# SDK provider save\n`)
  })
  const outcome = await pending
  assert.equal(observed, originalPatch)
  assert.match(outcome.error?.message ?? '', /changed|stale/iu)
  assert.match(await readFile(patchPath, 'utf8'), /SDK provider save/u)
}))

test('post-start receipt failure quiesces the runtime before rollback and preserves its last provider save', async () => {
  const foreign = `${originalPatch}\n# provider saved while quiescing failed activation\n`
  await fixture(async ({ service, patchPath, events }) => {
    await assert.rejects(service.activate({ confirmed: true, expectedRevision: (await service.describe()).revision }))
    assert.ok(events.includes('quiesce'))
    assert.equal(await readFile(patchPath, 'utf8'), foreign)
  }, {
    start: async ({ profileDir }) => mkdir(join(profileDir, '.desktop-skill-market-activation.json'), { recursive: true }),
    stopRuntime: async ({ patchPath, profileDir }) => withFileLock(join(profileDir, 'package.json'), () => writeFile(patchPath, foreign)),
  })
})

test('an optional market initialization failure cannot commit a receipt or report healthy activation', async () => fixture(async ({ service, patchPath, profileDir }) => {
  await assert.rejects(service.activate({ confirmed: true, expectedRevision: (await service.describe()).revision }), /unavailable/u)
  assert.equal(await readFile(patchPath, 'utf8'), originalPatch)
  assert.equal((await readdir(profileDir)).includes('.desktop-skill-market-activation.json'), false)
}, { verifyHealth: async () => { throw new Error('market unavailable') } }))

test('rollback quiesce failure reports the retained exact-byte recovery snapshot', async () => fixture(async ({ service, profileDir }) => {
  await assert.rejects(service.activate({ confirmed: true, expectedRevision: (await service.describe()).revision }), /backup retained at/u)
  const snapshot = (await readdir(profileDir)).find(name => name.startsWith('.desktop-skill-market-backup-'))
  assert.equal(await readFile(join(profileDir, snapshot, 'cordis.patch.yml'), 'utf8'), originalPatch)
}, { verifyHealth: async () => { throw new Error('market unavailable') }, stopRuntime: async () => { throw new Error('quiesce unavailable') } }))

test('an already enabled but unavailable market exposes a repairable status instead of a false success', async () => fixture(async ({ service, patchPath }) => {
  await writeFile(patchPath, `${originalPatch}\n- id: dsh-agent-plugins-market\n  disabled: false\n`)
  const status = await service.describe()
  assert.equal(status.enabled, true)
  assert.equal(status.available, false)
  await assert.rejects(service.activate({ confirmed: true, expectedRevision: status.revision }), /unavailable/u)
}, { verifyHealth: async () => { throw new Error('market unavailable') } }))

test('consent Agent roots use official tilde expansion and the runtime working directory', async () => fixture(async ({ home }) => {
  for (const [configured, expected] of [['~/.agents-review', join(homedir(), '.agents-review')], ['relative-agents', join(home, 'relative-agents')]]) {
    const service = createSkillMarketActivation({ dshHome: home, agentsHome: configured, runtimeCwd: home,
      runMutation: async () => {}, verifyHealth: async () => true, stopRuntime: async () => {} })
    assert.equal((await service.describe()).agentsHome, expected)
  }
}))

test('activation survives the real Desktop profile reconciliation without losing user configuration', async () => fixture(async ({ service, patchPath }) => {
  await writeFile(patchPath, mergeDesktopPatch(originalPatch))
  const status = await service.describe()
  await service.activate({ confirmed: true, expectedRevision: status.revision })
  assert.equal((await service.describe()).enabled, true)
  assert.match(await readFile(patchPath, 'utf8'), /apiKey: keep-local-fixture/u)
}, { ensureProfile: async ({ patchPath }) => writeFile(patchPath, mergeDesktopPatch(await readFile(patchPath, 'utf8'))) }))

const reconcileNativePatch = patch => mergeQqBotPatch(mergeDesktopPatch(patch), readQqBotPatchEnabled(patch) ?? false)
const nativeSavedPatch = () => reconcileNativePatch(originalPatch).replace(QQBOT_PATCH_END,
  `- id: agent-default-model\n  name: '@deepseek-ai/dsh-agent-default-model'\n  config:\n    provider: retained\n    model: retained-model\n${QQBOT_PATCH_END}`)

test('activation accepts the exact native managed-section reconciliation of SDK-saved model preferences', async () => fixture(async ({ service, patchPath, profileDir }) => {
  await writeFile(patchPath, nativeSavedPatch())
  const revision = (await service.describe()).revision
  await service.activate({ confirmed: true, expectedRevision: revision })
  const patch = await readFile(patchPath, 'utf8')
  assert.equal((await service.describe()).enabled, true)
  assert.match(patch, /model: retained-model/u)
  assert.match(patch, /apiKey: keep-local-fixture/u)
  assert.equal(JSON.parse(await readFile(join(profileDir, '.desktop-skill-market-activation.json'), 'utf8')).revision,
    (await service.describe()).revision)
}, { ensureProfile: async ({ patchPath }) => writeFile(patchPath, reconcileNativePatch(await readFile(patchPath, 'utf8'))) }))

test('native reconciliation remains rollback-capable and retains the exact pre-activation recovery bytes', async () => {
  let starts = 0
  await fixture(async ({ service, patchPath, profileDir }) => {
    const original = nativeSavedPatch()
    await writeFile(patchPath, original)
    await assert.rejects(service.activate({ confirmed: true, expectedRevision: (await service.describe()).revision }), /fixture boot failure/u)
    const restored = await readFile(patchPath, 'utf8')
    assert.equal((await service.describe()).enabled, false)
    assert.match(restored, /model: retained-model/u)
    assert.match(restored, /apiKey: keep-local-fixture/u)
    const snapshot = (await readdir(profileDir)).find(name => name.startsWith('.desktop-skill-market-backup-'))
    assert.equal(await readFile(join(profileDir, snapshot, 'cordis.patch.yml'), 'utf8'), original)
    assert.equal((await readdir(profileDir)).includes('.desktop-skill-market-activation.json'), false)
  }, {
    ensureProfile: async ({ patchPath }) => writeFile(patchPath, reconcileNativePatch(await readFile(patchPath, 'utf8'))),
    start: async () => { if (++starts === 1) throw new Error('fixture boot failure') },
  })
})

test('native reconciliation cannot legitimize a foreign provider write before Runtime restart', async () => fixture(async ({ service, patchPath }) => {
  await writeFile(patchPath, nativeSavedPatch())
  await assert.rejects(service.activate({ confirmed: true, expectedRevision: (await service.describe()).revision }), /changed|restore|recovery/u)
  assert.match(await readFile(patchPath, 'utf8'), /foreign-provider-save/u)
}, { ensureProfile: async ({ patchPath }) => {
  const patch = await readFile(patchPath, 'utf8')
  await writeFile(patchPath, reconcileNativePatch(patch).replace('keep-local-fixture', 'foreign-provider-save'))
} }))

test('activation rejects stale revisions and renderer-supplied paths before stopping the runtime', async () => fixture(async ({ service, patchPath, events }) => {
  const status = await service.describe()
  await writeFile(patchPath, `${originalPatch}\n# concurrent provider edit\n`)
  await assert.rejects(service.activate({ confirmed: true, expectedRevision: status.revision }), /changed|stale/iu)
  await assert.rejects(service.activate({ confirmed: true, expectedRevision: (await service.describe()).revision, path: 'C:/outside' }), /argument|field/iu)
  assert.deepEqual(events, [])
}))

test('confirmed activation preserves providers and sources and commits a receipt only after successful restart', async () => fixture(async ({ service, profileDir, events }) => {
  const before = await service.describe()
  const result = await service.activate({ confirmed: true, expectedRevision: before.revision })
  assert.equal(result.enabled, true)
  assert.equal(result.restartRequired, false)
  assert.deepEqual(events, ['stop', 'start'])
  const status = await service.describe()
  assert.equal(status.enabled, true)
  const patch = await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8')
  assert.ok(patch.startsWith(originalPatch))
  assert.match(patch, /apiKey: keep-local-fixture/u)
  assert.match(patch, /E:\/retained-skills/u)
  const receipt = JSON.parse(await readFile(join(profileDir, '.desktop-skill-market-activation.json'), 'utf8'))
  assert.equal(receipt.packageVersion, '0.11.1')
  assert.equal(receipt.revision, status.revision)
}))

test('a provider write during runtime shutdown invalidates activation without overwriting the new bytes', async () => {
  const next = `${originalPatch}\n# provider flush during stop\n`
  await fixture(async ({ service, patchPath }) => {
    const status = await service.describe()
    await assert.rejects(service.activate({ confirmed: true, expectedRevision: status.revision }), /changed|stale/iu)
    assert.equal(await readFile(patchPath, 'utf8'), next)
  }, { stop: ({ patchPath }) => writeFile(patchPath, next) })
})

test('a failed runtime restart restores the exact previous profile bytes and retains a recoverable snapshot', async () => {
  let starts = 0
  await fixture(async ({ service, patchPath, profileDir }) => {
    const before = await readFile(patchPath)
    const status = await service.describe()
    await assert.rejects(service.activate({ confirmed: true, expectedRevision: status.revision }), /fixture boot failure/u)
    assert.deepEqual(await readFile(patchPath), before)
    const snapshots = (await readdir(profileDir)).filter(name => name.startsWith('.desktop-skill-market-backup-'))
    assert.equal(snapshots.length, 1)
    assert.deepEqual(await readFile(join(profileDir, snapshots[0], 'cordis.patch.yml')), before)
    assert.equal((await service.describe()).enabled, false)
  }, { start: () => { starts += 1; if (starts === 1) throw new Error('fixture boot failure') } })
})

test('rollback refuses to overwrite a foreign write and reports the preserved backup location', async () => {
  const foreign = `${originalPatch}\n# external provider write after apply\n`
  let starts = 0
  await fixture(async ({ service, patchPath, profileDir }) => {
    const status = await service.describe()
    await assert.rejects(service.activate({ confirmed: true, expectedRevision: status.revision }), /backup|restore|recovery/iu)
    assert.equal(await readFile(patchPath, 'utf8'), foreign)
    const snapshot = (await readdir(profileDir)).find(name => name.startsWith('.desktop-skill-market-backup-'))
    assert.ok(snapshot)
    assert.equal(await readFile(join(profileDir, snapshot, 'cordis.patch.yml'), 'utf8'), originalPatch)
  }, { start: async ({ patchPath }) => { starts += 1; if (starts === 1) { await writeFile(patchPath, foreign); throw new Error('fixture boot failure') } } })
})

test('a higher-priority explicit home disable is reported without rewriting the user root', async () => fixture(async ({ service, home, patchPath, events }) => {
  const homePatch = '- id: dsh-agent-plugins-market\n  disabled: true\n'
  await writeFile(join(home, 'cordis.patch.yml'), homePatch)
  const status = await service.describe()
  await assert.rejects(service.activate({ confirmed: true, expectedRevision: status.revision }), /override|higher.priority|home/iu)
  assert.equal(await readFile(join(home, 'cordis.patch.yml'), 'utf8'), homePatch)
  assert.equal(await readFile(patchPath, 'utf8'), originalPatch)
  assert.deepEqual(events, [])
}))

test('an existing enable needs no restart and a later explicit disable wins over the activation receipt', async () => fixture(async ({ service, patchPath, events }) => {
  const before = await service.describe()
  await service.activate({ confirmed: true, expectedRevision: before.revision })
  const enabled = await service.describe()
  await service.activate({ confirmed: true, expectedRevision: enabled.revision })
  assert.deepEqual(events, ['stop', 'start'])
  const patch = await readFile(patchPath, 'utf8')
  await writeFile(patchPath, `${patch}\n- id: dsh-agent-plugins-market\n  disabled: true\n`)
  assert.equal((await service.describe()).enabled, false)
}))
