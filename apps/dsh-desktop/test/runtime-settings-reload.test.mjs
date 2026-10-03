import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  assertNoRootIncludeReloadErrors,
  assertSettingsEventsReady,
  createSettingsProvider,
  createSettingsRpcRequest,
  parseSettingsReloadArguments,
  persistedSettingsConfig,
  settingsNamespace,
} from '../scripts/verify-runtime-settings-reload.mjs'

test('settings reload script is import-safe and has no timeout override or background Runtime option', () => {
  assert.deepEqual(parseSettingsReloadArguments([]), { help: false, resources: undefined, executable: process.execPath })
  assert.equal(parseSettingsReloadArguments(['--help']).help, true)
  assert.deepEqual(parseSettingsReloadArguments(['--resources=fixture-resources', '--executable=fixture.exe']), {
    help: false, resources: resolve('fixture-resources'), executable: resolve('fixture.exe'),
  })
  for (const option of ['--resources=', '--executable=', '--timeout=360000', '--mock-rpc', '--transport=remote']) {
    assert.throws(() => parseSettingsReloadArguments([option]), /Unknown settings reload argument/u)
  }
})

test('real settings RPC uses the rc2 envelope and exact named settings arguments', () => {
  const args = { ns: 'agent-default-model', patch: { provider: 'fixture', model: 'reload-model-b' }, expectedRevision: 4 }
  assert.deepEqual(createSettingsRpcRequest('settings/update', args, 'rpc-1'), {
    type: 'client-request', rpcId: 'rpc-1', method: 'settings/update', payload: { args },
  })
  assert.deepEqual(createSettingsRpcRequest('settings/describe', {}, 'rpc-2').payload, { args: {} })
  assert.throws(() => createSettingsRpcRequest('session/prompt'), /Only settings configuration RPCs/u)
  assert.throws(() => createSettingsRpcRequest('model/list'), /Only settings configuration RPCs/u)
})

test('verification model configuration permits only a loopback provider without credentials', () => {
  const configuration = createSettingsProvider('fixture', 'http://127.0.0.1:43125/v1/')
  assert.equal(configuration.providers.fixture.api, 'openai-completions')
  assert.equal(configuration.providers.fixture.baseURL, 'http://127.0.0.1:43125/v1/')
  assert.deepEqual(configuration.providers.fixture.models.map(model => model.id), ['reload-model-a', 'reload-model-b'])
  assert.equal(Object.hasOwn(configuration.providers.fixture, 'apiKeyEnv'), false)
  for (const baseURL of ['https://api.deepseek.com/v1/', 'http://example.com/v1/', 'https://127.0.0.1/v1/']) {
    assert.throws(() => createSettingsProvider('fixture', baseURL))
  }
})

test('settings reads require the real writable live namespace and a revision', () => {
  const namespace = { ns: 'agent-default-model', applies: 'live', revision: 3, value: { provider: 'fixture', model: 'reload-model-a' } }
  const document = { writable: true, hasDocument: true, namespaces: [namespace] }
  assert.equal(settingsNamespace(document, namespace.ns), namespace)
  assert.throws(() => settingsNamespace(document, 'missing'), /Missing real SDK settings namespace/u)
  assert.throws(() => settingsNamespace({ ...document, writable: false }, namespace.ns), /must be writable/u)
  assert.throws(() => settingsNamespace({ ...document, hasDocument: false }, namespace.ns), /must be present/u)
})

test('rc2 events readiness requires the OS home and a client identity rather than the isolated DSH home', () => {
  const ready = { done: false, value: { type: 'ready', clientId: 'client-1', host: { home: homedir() } } }
  assert.doesNotThrow(() => assertSettingsEventsReady(ready))
  assert.throws(() => assertSettingsEventsReady({ ...ready, done: true }))
  assert.throws(() => assertSettingsEventsReady({ done: false, value: { ...ready.value, clientId: '' } }))
  assert.throws(() => assertSettingsEventsReady({ done: false, value: { ...ready.value, host: { home: '/isolated-dsh-home' } } }))
})

test('Root Include reload errors are failures even if an existing tree remains running', () => {
  assert.doesNotThrow(() => assertNoRootIncludeReloadErrors(['[runtime-startup] boot=10ms', 'dsh desktop pipe: ready']))
  for (const failure of [
    'dsh: profile reload requires the root Include entry',
    'config reload at cordis.patch.yml failed; keeping the running tree',
    'Configuration entry changed during reload',
    'Configuration plugin is no longer active',
  ]) assert.throws(() => assertNoRootIncludeReloadErrors([failure]), /Root Include configuration reload failed/u)
})

test('SDK profile persistence is read from patch entries, not legacy settings.yaml', () => {
  const selection = { provider: 'fixture', model: 'reload-model-b' }
  assert.deepEqual(persistedSettingsConfig('- id: agent-default-model\n  config:\n    provider: fixture\n    model: reload-model-b\n', 'agent-default-model'), selection)
  assert.deepEqual(persistedSettingsConfig('- insert:\n    - id: agent-default-model\n      config:\n        provider: fixture\n        model: reload-model-b\n', 'agent-default-model'), selection)
  assert.throws(() => persistedSettingsConfig('agent-default-model: {}\n', 'agent-default-model'), /profile patch list/u)
  assert.throws(() => persistedSettingsConfig('[]\n', 'agent-default-model'), /Missing persisted configuration/u)
  assert.throws(() => persistedSettingsConfig('[invalid', 'agent-default-model'), /valid YAML/u)
})

test('E2E script retains the complete profile, real carrier, restart and readiness assertions without mocks', async () => {
  const source = await readFile(new URL('../scripts/verify-runtime-settings-reload.mjs', import.meta.url), 'utf8')
  assert.match(source, /ensureDesktopProfile\(\{ dshHome, packageRoots \}\)/u)
  assert.match(source, /controller\.fetch\(/u)
  assert.match(source, /controller\.openDuplex\('\$events'/u)
  assert.match(source, /controller\.restart\(\)/u)
  assert.match(source, /expectedRevision: before\.revision/u)
  assert.match(source, /providerRequests, \[\]/u)
  assert.match(source, /'ui-community-plugins', \{ enabled \}/u)
  assert.match(source, /'desktop-launcher', \{ enabled \}/u)
  assert.match(source, /shutdownRoute\.status, enabled \? 405 : 404/u)
  assert.match(source, /settingsNamespace\(restarted, 'ui-community-plugins'\)\.value\.enabled, false/u)
  assert.match(source, /settingsNamespace\(restarted, 'desktop-launcher'\)\.value\.enabled, false/u)
  assert.equal(source.includes('startupTimeoutMs:'), false)
  assert.equal(source.includes('page.route('), false)
  assert.equal(source.includes('prototype.'), false)
})
