import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  hasConfiguredRepairModel,
  resolveRepairModelAvailability,
} from '../src/repair-model-availability.mjs'

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

test('reports no-model when a selected pi-ai route is absent', async (context) => {
  const dshHome = await fixture(context)
  await writeYaml(dshHome, 'settings.yaml', JSON.stringify({
    'agent-default-model': { provider: 'missing-route', model: 'repair-model' },
  }))

  assert.deepEqual(await resolveRepairModelAvailability({
    dshHome,
    environment: {},
    compatibilityEnvironment: {},
  }), {
    available: false,
    reason: 'no-model',
    selection: {
      provider: 'missing-route',
      model: 'repair-model',
    },
  })
})

test('reports missing-credentials for a configured route without usable credentials', async (context) => {
  const dshHome = await fixture(context)
  await writeYaml(dshHome, 'settings.yaml', JSON.stringify({
    'agent-default-model': { provider: 'openai', model: 'repair-model' },
    'llm-pi-ai': { providers: { openai: { apiKeyEnv: 'OPENAI_API_KEY' } } },
  }))

  const availability = await resolveRepairModelAvailability({
    dshHome,
    environment: {},
    compatibilityEnvironment: {},
  })
  assert.equal(availability.available, false)
  assert.equal(availability.reason, 'missing-credentials')
  assert.equal(availability.toolsCapability, 'auto')
})

test('reports unsupported-tools before attempting repair on a tools:none route', async (context) => {
  const dshHome = await fixture(context)
  await writeYaml(dshHome, 'settings.yaml', JSON.stringify({
    'agent-default-model': { provider: 'company-gateway', model: 'repair-model' },
    'llm-pi-ai': {
      providers: {
        'company-gateway': {
          apiKeyEnv: 'COMPANY_GATEWAY_API_KEY',
          toolsCapability: 'none',
        },
      },
    },
  }))

  const availability = await resolveRepairModelAvailability({
    dshHome,
    environment: {},
    compatibilityEnvironment: { COMPANY_GATEWAY_API_KEY: 'configured-secret' },
  })
  assert.equal(availability.available, false)
  assert.equal(availability.reason, 'unsupported-tools')
  assert.equal(availability.toolsCapability, 'none')
})

test('keeps repair available when a tools:none default has a compatible fallback', async (context) => {
  const dshHome = await fixture(context)
  await writeYaml(dshHome, 'settings.yaml', JSON.stringify({
    'agent-default-model': { provider: 'company-gateway', model: 'repair-model' },
    'llm-pi-ai': {
      providers: {
        'company-gateway': {
          apiKeyEnv: 'COMPANY_GATEWAY_API_KEY',
          toolsCapability: 'none',
        },
        fallback: {
          apiKeyEnv: 'FALLBACK_API_KEY',
          toolsCapability: 'native',
        },
      },
    },
  }))

  const availability = await resolveRepairModelAvailability({
    dshHome,
    environment: {
      FALLBACK_API_KEY: 'configured-secret',
    },
    compatibilityEnvironment: {
      COMPANY_GATEWAY_API_KEY: 'configured-secret',
    },
    fallbackModels: [{ provider: 'fallback', model: 'repair-model-2' }],
  })
  assert.deepEqual(availability, {
    available: true,
    reason: 'available',
    selection: {
      provider: 'company-gateway',
      model: 'repair-model',
    },
    toolsCapability: 'none',
    fallbackModels: [{
      provider: 'fallback',
      model: 'repair-model-2',
      toolsCapability: 'native',
    }],
  })
})

test('returns safe available repair selection and capability without secret values', async (context) => {
  const dshHome = await fixture(context)
  await writeYaml(dshHome, 'settings.yaml', JSON.stringify({
    'agent-default-model': { provider: 'company-gateway', model: 'repair-model' },
    'llm-pi-ai': {
      providers: {
        'company-gateway': {
          apiKeyEnv: 'COMPANY_GATEWAY_API_KEY',
          toolsCapability: 'native',
        },
      },
    },
  }))

  assert.deepEqual(await resolveRepairModelAvailability({
    dshHome,
    environment: {},
    compatibilityEnvironment: { COMPANY_GATEWAY_API_KEY: 'configured-secret' },
  }), {
    available: true,
    reason: 'available',
    selection: {
      provider: 'company-gateway',
      model: 'repair-model',
    },
    toolsCapability: 'native',
  })
})
