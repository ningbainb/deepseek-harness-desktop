import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { hasConfiguredRepairModel } from '../src/repair-model-availability.mjs'

async function fixture(context) {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-repair-model-'))
  context.after(() => rm(dshHome, { recursive: true, force: true }))
  return dshHome
}

async function writeYaml(dshHome, name, source) {
  await mkdir(dshHome, { recursive: true })
  await writeFile(join(dshHome, name), source, { encoding: 'utf8', mode: 0o600 })
}

test('returns false when no configured credential can be detected', async (context) => {
  const dshHome = await fixture(context)

  assert.equal(await hasConfiguredRepairModel({
    dshHome,
    environment: {},
    compatibilityEnvironment: {},
  }), false)
})

test('accepts the base DeepSeek model only when its credential ref resolves', async (context) => {
  const dshHome = await fixture(context)
  await writeYaml(dshHome, '.credentials.yaml', 'version: 1\nrefs:\n  DEEPSEEK_API_KEY: configured-secret\n')

  assert.equal(await hasConfiguredRepairModel({
    dshHome,
    environment: {},
    compatibilityEnvironment: {},
  }), true)
})

test('accepts an explicitly selected pi-ai model with a stored OAuth record', async (context) => {
  const dshHome = await fixture(context)
  await writeYaml(dshHome, 'settings.yaml', [
    'agent-default-model:',
    '  provider: openai-codex',
    '  model: gpt-5.6-terra',
    'llm-pi-ai:',
    '  providers:',
    '    openai-codex: {}',
    '',
  ].join('\n'))
  await writeYaml(dshHome, '.credentials.yaml', [
    'version: 1',
    'refs: {}',
    'records:',
    '  llm-pi-ai/openai-codex:',
    '    kind: oauth',
    '    access: configured-secret',
    '',
  ].join('\n'))

  assert.equal(await hasConfiguredRepairModel({
    dshHome,
    environment: {},
    compatibilityEnvironment: {},
  }), true)
})

test('rejects a selected pi-ai model when its route has no usable credential', async (context) => {
  const dshHome = await fixture(context)
  await writeYaml(dshHome, 'settings.yaml', [
    'agent-default-model:',
    '  provider: openai',
    '  model: gpt-5.4',
    'llm-pi-ai:',
    '  providers:',
    '    openai:',
    '      apiKeyEnv: OPENAI_API_KEY',
    '',
  ].join('\n'))

  assert.equal(await hasConfiguredRepairModel({
    dshHome,
    environment: {},
    compatibilityEnvironment: {},
  }), false)
})

test('resolves explicit provider refs from the compatibility environment', async (context) => {
  const dshHome = await fixture(context)
  await writeYaml(dshHome, 'settings.yaml', [
    'agent-default-model:',
    '  provider: company-gateway',
    '  model: repair-model',
    'llm-pi-ai:',
    '  providers:',
    '    company-gateway:',
    '      api: openai-responses',
    '      baseURL: https://gateway.example/v1',
    '      apiKeyEnv: COMPANY_GATEWAY_API_KEY',
    '      models:',
    '        - id: repair-model',
    '',
  ].join('\n'))

  assert.equal(await hasConfiguredRepairModel({
    dshHome,
    environment: {},
    compatibilityEnvironment: { COMPANY_GATEWAY_API_KEY: 'configured-secret' },
  }), true)
})

test('does not accept an OAuth record when the selected provider route is absent', async (context) => {
  const dshHome = await fixture(context)
  await writeYaml(dshHome, 'settings.yaml', [
    'agent-default-model:',
    '  provider: openai-codex',
    '  model: gpt-5.6-terra',
    '',
  ].join('\n'))
  await writeYaml(dshHome, '.credentials.yaml', [
    'version: 1',
    'records:',
    '  llm-pi-ai/openai-codex:',
    '    kind: oauth',
    '    access: configured-secret',
    '',
  ].join('\n'))

  assert.equal(await hasConfiguredRepairModel({
    dshHome,
    environment: {},
    compatibilityEnvironment: {},
  }), false)
})
