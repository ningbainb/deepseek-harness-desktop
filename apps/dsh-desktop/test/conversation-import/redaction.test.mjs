import assert from 'node:assert/strict'
import test from 'node:test'

import { Redactor } from '../../src/conversation-import/redaction.mjs'

test('Redactor strips known API keys, tokens, auth headers, and secrets', () => {
  const sample = [
    'Here is the key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890',
    'OpenAI: sk-proj-1234567890abcdefghijklmnopqrstuvwxyz',
    'GitHub: ghp_1234567890abcdefghijklmnopqrstuvwxyz',
    'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
    'password = "mySuperSecretPassword123"',
    'OPENAI_API_KEY=sk-12345678901234567890',
    '-----BEGIN RSA PRIVATE KEY-----',
    'MIIEowIBAAKCAQEA0',
    '-----END RSA PRIVATE KEY-----',
  ].join('\n')

  const redacted = Redactor.redact(sample)

  assert.ok(!redacted.includes('sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890'))
  assert.ok(!redacted.includes('sk-proj-1234567890abcdefghijklmnopqrstuvwxyz'))
  assert.ok(!redacted.includes('ghp_1234567890abcdefghijklmnopqrstuvwxyz'))
  assert.ok(!redacted.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'))
  assert.ok(!redacted.includes('mySuperSecretPassword123'))
  assert.ok(!redacted.includes('MIIEowIBAAKCAQEA0'))
  assert.ok(redacted.includes('[REDACTED_API_KEY]'))
  assert.ok(redacted.includes('[REDACTED_AUTH]'))
  assert.ok(redacted.includes('[REDACTED_SECRET]'))
  assert.ok(redacted.includes('[REDACTED_PRIVATE_KEY]'))
})

test('Redactor deeply redacts objects and arrays', () => {
  const input = {
    user: 'alice',
    auth: {
      token: 'sk-abcdefghijklmnopqrstuvwxyz12345',
      headers: ['Authorization: Bearer secret-token-123456789'],
    },
  }

  const output = Redactor.redactObject(input)
  assert.equal(output.user, 'alice')
  assert.ok(!output.auth.token.includes('sk-abcdefghijklmnopqrstuvwxyz12345'))
  assert.ok(output.auth.token.includes('[REDACTED_API_KEY]') || output.auth.token.includes('[REDACTED_SECRET]'))
})

test('Redactor handles JSON, shell, URL, and quoted values with spaces', () => {
  const secrets = [
    'alpha beta gamma delta',
    'ALPHAKEYALPHAKEYALPHA',
    'ALPHATOKENALPHATOKEN',
    'postgres://svcacct:alphapass@dbhost/primary',
  ]
  const sample = [
    'password: "alpha beta gamma delta"',
    '{ "api_key": "ALPHAKEYALPHAKEYALPHA" }',
    'X-Api-Key: "alpha beta gamma delta"',
    'export MY_SECRET_TOKEN=ALPHATOKENALPHATOKEN',
    'DATABASE_URL=postgres://svcacct:alphapass@dbhost/primary',
  ].join('\n')

  const redacted = Redactor.redact(sample)
  for (const secret of secrets) assert.equal(redacted.includes(secret), false, 'secret leaked: ' + secret)
  assert.ok(redacted.includes('[REDACTED_SECRET]'))
})

test('Redactor treats sensitive object keys as secret regardless of value shape', () => {
  const output = Redactor.redactObject({
    apiKey: 'alpha beta gamma delta',
    database_url: 'postgres://svcacct:alphapass@dbhost/primary',
    nested: { authorization: { token: 'opaque credential object' } },
    safe: 'keep this value',
  })

  assert.equal(output.apiKey, '[REDACTED_SECRET]')
  assert.equal(output.database_url, '[REDACTED_SECRET]')
  assert.equal(output.nested.authorization, '[REDACTED_SECRET]')
  assert.equal(output.safe, 'keep this value')
})
