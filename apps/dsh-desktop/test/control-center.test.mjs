import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

import { ControlCenterStore } from '../src/control-center.mjs'
import { renderControlCenterPatch } from '../src/profile.mjs'

test('Smart Control defaults off and exposes no absolute browser paths', async context => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-control-center-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const store = new ControlCenterStore({
    path: join(root, 'settings.json'),
    platform: 'win32',
    browserCandidates: [{ id: 'edge', label: 'Microsoft Edge', path: process.execPath }],
  })
  const packages = new Map([
    ['@deepseek-ai/dsh-experimental-browser-use-playwright-mcp', 'browser'],
    ['@deepseek-ai/dsh-experimental-computer-use-cua-driver-native', 'computer'],
  ])
  const status = await store.status({ packageRoots: packages })
  assert.equal(status.browser.state, 'disabled')
  assert.equal(status.computer.state, 'disabled')
  assert.deepEqual(status.browser.browsers, [{ id: 'edge', label: 'Microsoft Edge' }])
  assert.doesNotMatch(JSON.stringify(status), /node\.exe/iu)
})

test('Smart Control persists an exact provider and renders a visible isolated browser', async context => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-control-center-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'settings.json')
  const store = new ControlCenterStore({
    path,
    platform: 'win32',
    browserCandidates: [{ id: 'edge', label: 'Microsoft Edge', path: process.execPath }],
  })
  await store.setFeature('browser', true, 'playwright')
  const configuration = await store.profileConfiguration()
  const patch = renderControlCenterPatch(configuration)
  assert.match(patch, /experimental-browser-use-playwright-mcp/u)
  assert.match(patch, /headless: false/u)
  assert.match(patch, /desktop-browser-provider[\s\S]*disabled: false/u)
  assert.equal(JSON.parse(await readFile(path, 'utf8')).browser.enabled, true)
})

test('Smart Control rejects unknown providers before writing configuration', async context => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-control-center-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const store = new ControlCenterStore({ path: join(root, 'settings.json') })
  await assert.rejects(store.setFeature('browser', true, 'arbitrary-shell'), /unknown control provider/u)
})

test('advanced providers use explicit environment references without persisting credentials', async context => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-control-center-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const store = new ControlCenterStore({
    path: join(root, 'settings.json'),
    platform: 'win32',
    environment: {
      DSH_STAGEHAND_MODEL: 'openai/gpt-5.4-mini',
      DSH_STAGEHAND_MODEL_API_KEY: 'not-written-to-profile',
      CUA_MCP_COMMAND: 'cua-driver',
    },
    browserCandidates: [{ id: 'edge', label: 'Microsoft Edge', path: process.execPath }],
  })
  await store.setFeature('browser', true, 'stagehand')
  await store.setFeature('computer', true, 'cua-mcp')
  const patch = renderControlCenterPatch(await store.profileConfiguration())
  assert.match(patch, /modelName: 'openai\/gpt-5\.4-mini'/u)
  assert.match(patch, /apiKey: !!js process\.env\.DSH_STAGEHAND_MODEL_API_KEY/u)
  assert.match(patch, /command: 'cua-driver'[\s\S]*args: \[mcp\]/u)
  assert.doesNotMatch(patch, /not-written-to-profile/u)
})

test('native computer provider is safely suspended after two consecutive failures', async context => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-control-center-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const store = new ControlCenterStore({ path: join(root, 'settings.json') })
  await store.setFeature('computer', true, 'cua-native')
  assert.equal((await store.recordComputerProviderFailure()).suspended, false)
  assert.equal((await store.recordComputerProviderFailure()).suspended, true)
  const configuration = await store.profileConfiguration()
  assert.equal(configuration.computer.enabled, false)
  const status = await store.status({
    packageRoots: new Map([['@deepseek-ai/dsh-experimental-computer-use-cua-driver-native', 'computer']]),
  })
  assert.equal(status.computer.state, 'failed')
  assert.equal(status.computer.enabled, true)
  await store.setFeature('computer', true, 'cua-native')
  assert.equal((await store.load()).computer.suspended, false)
})
