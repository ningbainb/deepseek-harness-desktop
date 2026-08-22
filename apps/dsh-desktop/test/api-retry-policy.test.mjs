import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { parse } from 'yaml'

import {
  DEFAULT_API_RETRY_POLICY,
  withDefaultApiRetryPolicies,
} from '../src/api-retry-policy.mjs'

test('default API recovery is bounded and limited to transient provider failures', () => {
  assert.equal(DEFAULT_API_RETRY_POLICY.mode, 'normal')
  assert.equal(DEFAULT_API_RETRY_POLICY.maxRetries, 4)
  assert.deepEqual(DEFAULT_API_RETRY_POLICY.retryableCodes, [
    'EMPTY_RESPONSE',
    'RATE_LIMIT',
    'SERVER',
    'TIMEOUT',
    'TRANSPORT',
    'STREAM_CLOSED',
  ])
  assert.equal(DEFAULT_API_RETRY_POLICY.retryableCodes.includes('AUTH'), false)
  assert.equal(DEFAULT_API_RETRY_POLICY.retryableCodes.includes('QUOTA'), false)
})

test('retry defaults fill only missing provider policies and preserve explicit choices', () => {
  const explicit = { mode: 'normal', maxRetries: 1 }
  const result = withDefaultApiRetryPolicies({
    'llm-deepseek': { baseURL: 'https://gateway.example' },
    'llm-pi-ai': {
      providers: {
        openai: { apiKeyEnv: 'OPENAI_API_KEY' },
        custom: { baseURL: 'https://custom.example', retryPolicy: explicit },
      },
    },
    pet: { visible: true },
  })

  assert.equal(result.changed, true)
  assert.deepEqual(result.settings['llm-deepseek'].retryPolicy, DEFAULT_API_RETRY_POLICY)
  assert.deepEqual(result.settings['llm-pi-ai'].providers.openai.retryPolicy, DEFAULT_API_RETRY_POLICY)
  assert.deepEqual(result.settings['llm-pi-ai'].providers.custom.retryPolicy, explicit)
  assert.deepEqual(result.settings.pet, { visible: true })
})

test('retry defaults do not create dormant provider sections', () => {
  const result = withDefaultApiRetryPolicies({ pet: { visible: true } })
  assert.equal(result.changed, false)
  assert.equal(result.settings['llm-deepseek'], undefined)
  assert.equal(result.settings['llm-pi-ai'], undefined)
})

test('startup retry normalization is read-only and leaves settings bytes untouched', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-api-retry-'))
  try {
    await mkdir(root, { recursive: true })
    const path = join(root, 'settings.yaml')
    await writeFile(path, '# user settings\nllm-pi-ai:\n  providers:\n    openai:\n      apiKeyEnv: OPENAI_API_KEY\npet:\n  visible: true\n')
    const before = await readFile(path, 'utf8')
    const result = withDefaultApiRetryPolicies(parse(before))
    assert.equal(result.changed, true)
    assert.equal(await readFile(path, 'utf8'), before)
    assert.match(before, /# user settings/u)
    const settings = result.settings
    assert.equal(settings.pet.visible, true)
    assert.equal(settings['llm-pi-ai'].providers.openai.retryPolicy.maxRetries, 4)

    const electronSource = await readFile(new URL('../src/electron-app.mjs', import.meta.url), 'utf8')
    const bootstrap = electronSource.slice(electronSource.indexOf('export async function startElectronApp'))
    assert.doesNotMatch(bootstrap, /ensureApiRetryPolicies|ensureRetryPolicies|migrateSettings:/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
