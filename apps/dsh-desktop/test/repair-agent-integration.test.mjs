import assert from 'node:assert/strict'
import { cp, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseDocument } from 'yaml'

import { StartupRepairCoordinator } from '../src/startup-repair-coordinator.mjs'

const FIXTURE_ROOT = fileURLToPath(new URL('./fixtures/direct-start/faults/', import.meta.url))
const REPAIRABLE = new Set(['syntax-error', 'bad-patch', 'startup-throw', 'repairable-config'])
let importNonce = 0

async function inspectPlugin(type, pluginDir) {
  if (type === 'bad-patch') {
    const document = parseDocument(await readFile(join(pluginDir, 'cordis.patch.yml'), 'utf8'))
    if (document.errors.length > 0) throw document.errors[0]
  }
  const entry = pathToFileURL(join(pluginDir, 'index.mjs'))
  entry.searchParams.set('attempt', String(importNonce += 1))
  const plugin = await import(entry.href)
  return plugin.start(pathToFileURL(`${pluginDir}/`))
}

async function applyDeterministicRepair(type, pluginDir) {
  if (type === 'syntax-error' || type === 'startup-throw') {
    await writeFile(join(pluginDir, 'index.mjs'), "export function start() { return 'ready' }\n")
    return ['index.mjs']
  }
  if (type === 'bad-patch') {
    await writeFile(join(pluginDir, 'cordis.patch.yml'), "- insert:\n    - id: repaired-patch\n      name: '@fixture/bad-patch-plugin'\n")
    return ['cordis.patch.yml']
  }
  if (type === 'repairable-config') {
    await writeFile(join(pluginDir, 'config.json'), '{\n  "enabled": true\n}\n')
    return ['config.json']
  }
  return []
}

async function runFaultScenario(type) {
  const root = await mkdtemp(join(tmpdir(), `repair-agent-${type}-`))
  const dshHome = join(root, 'dsh-home')
  const pluginDir = join(dshHome, 'profiles', 'desktop', 'node_modules', '@fixture', type)
  const markerPath = join(dshHome, 'sessions', 'direct-start-fixture', 'marker.json')
  await mkdir(dirname(pluginDir), { recursive: true })
  await mkdir(dirname(markerPath), { recursive: true })
  if (type === 'linked-package') {
    const source = join(FIXTURE_ROOT, 'healthy')
    await symlink(source, pluginDir, process.platform === 'win32' ? 'junction' : 'dir')
    assert.equal((await lstat(pluginDir)).isSymbolicLink(), true)
  } else {
    await cp(join(FIXTURE_ROOT, type), pluginDir, { recursive: true })
  }
  const marker = `same-home-${type}`
  await writeFile(markerPath, `${JSON.stringify({ marker })}\n`)
  const markerReads = []
  let modelCalls = 0
  let committed = false
  let rolledBack = false
  function provider(profileName) {
    return {
      profileName,
      dshHome,
      async ensureProfile() {},
      async start() {
        markerReads.push(JSON.parse(await readFile(markerPath, 'utf8')).marker)
        if (profileName === 'desktop') await inspectPlugin(type, pluginDir)
      },
      async stop() {},
      async forceStop() {},
    }
  }
  const full = provider('desktop')
  const builtins = provider('desktop-builtins')
  const coordinator = new StartupRepairCoordinator({
    createProvider: ({ profileName }) => profileName === 'desktop' ? full : builtins,
    canRepair: async () => true,
    runRepair: async () => {
      modelCalls += 1
      if (!REPAIRABLE.has(type)) return { status: 'unavailable' }
      const changedFiles = await applyDeterministicRepair(type, pluginDir)
      assert.ok(changedFiles.length > 0)
      return {
        status: 'applied',
        async commit() { committed = true },
        async rollback() { rolledBack = true },
      }
    },
  })
  try {
    const result = await coordinator.start()
    return { result, marker, markerReads, modelCalls, committed, rolledBack, dshHome }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('deterministic local model repairs syntax, patch, startup, and configuration faults', async () => {
  for (const type of REPAIRABLE) {
    const outcome = await runFaultScenario(type)
    assert.equal(outcome.result.state, 'ready-full', type)
    assert.equal(outcome.result.repaired, true, type)
    assert.equal(outcome.modelCalls, 1, type)
    assert.equal(outcome.committed, true, type)
    assert.equal(outcome.rolledBack, false, type)
    assert.equal(outcome.markerReads.every(value => value === outcome.marker), true, type)
    assert.equal(outcome.result.provider.dshHome, outcome.dshHome, type)
  }
})

test('linked user packages load directly without invoking a model', async () => {
  const outcome = await runFaultScenario('linked-package')
  assert.equal(outcome.result.state, 'ready-full')
  assert.equal(outcome.result.fullAttempts, 1)
  assert.equal(outcome.modelCalls, 0)
  assert.deepEqual(outcome.markerReads, [outcome.marker])
})

test('native ABI faults are not model-edited and converge on same-Home builtins', async () => {
  const outcome = await runFaultScenario('native-abi')
  assert.equal(outcome.result.state, 'ready-builtins')
  assert.equal(outcome.modelCalls, 1)
  assert.equal(outcome.committed, false)
  assert.equal(outcome.result.provider.dshHome, outcome.dshHome)
  assert.deepEqual(outcome.markerReads, [outcome.marker, outcome.marker, outcome.marker])
})
