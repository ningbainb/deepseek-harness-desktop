import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  ConnectorSecretStore,
  ConnectorSecretStoreError,
  redactSecretValues,
} from '../src/connectors/connector-secret-store.mjs'

function createMockSafeStorage({ available = true } = {}) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plaintext) => Buffer.from(`enc:${Buffer.from(plaintext, 'utf8').toString('base64')}`, 'utf8'),
    decryptString: (buffer) => {
      const text = Buffer.from(buffer).toString('utf8')
      if (!text.startsWith('enc:')) throw new Error('bad ciphertext')
      return Buffer.from(text.slice(4), 'base64').toString('utf8')
    },
  }
}

test('ConnectorSecretStore encrypts, isolates profiles, redacts logs, and deletes safely', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-secret-store-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const storePath = join(dir, 'secrets.json')
  const store = new ConnectorSecretStore({ path: storePath, safeStorage: createMockSafeStorage() })

  await store.setProfileSecrets('tencent-docs', 'default', { token: 'td-secret-123' })
  await store.setProfileSecrets('tencent-docs', 'work', { token: 'td-secret-456' })
  await store.setProfileSecrets('yuque', 'default', { token: 'yq-secret-789', host: 'https://team.yuque.com' })

  const rawDisk = await readFile(storePath, 'utf8')
  assert.equal(rawDisk.includes('td-secret-123'), false)
  assert.equal(rawDisk.includes('yq-secret-789'), false)

  assert.deepEqual(await store.listProfiles('tencent-docs'), ['default', 'work'])
  assert.deepEqual(await store.getProfileSecrets('tencent-docs', 'work'), { token: 'td-secret-456' })
  assert.equal(await store.hasSecrets('yuque', 'default'), true)

  const logLine = 'Bearer td-secret-123 failed while calling yq-secret-789'
  assert.equal(
    redactSecretValues(logLine, { a: 'td-secret-123', b: 'yq-secret-789' }),
    'Bearer [REDACTED] failed while calling [REDACTED]',
  )

  assert.equal(await store.deleteProfileSecrets('tencent-docs', 'work'), true)
  assert.equal(await store.getProfileSecrets('tencent-docs', 'work'), undefined)
  assert.deepEqual(await store.getProfileSecrets('tencent-docs', 'default'), { token: 'td-secret-123' })

  assert.equal(await store.deleteConnectorSecrets('tencent-docs'), true)
  assert.equal(await store.deleteConnectorSecrets('yuque'), true)
  assert.equal(await store.hasSecrets('yuque', 'default'), false)
})

test('ConnectorSecretStore fails closed when OS encryption is unavailable or store is corrupted', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-secret-fail-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const storePath = join(dir, 'secrets.json')

  const unavailable = new ConnectorSecretStore({ path: storePath, safeStorage: createMockSafeStorage({ available: false }) })
  await assert.rejects(
    () => unavailable.setProfileSecrets('feishu', 'default', { token: 'abc' }),
    (error) => error instanceof ConnectorSecretStoreError && error.code === 'ENCRYPTION_UNAVAILABLE',
  )

  await writeFile(storePath, '{corrupted json', 'utf8')
  const available = new ConnectorSecretStore({ path: storePath, safeStorage: createMockSafeStorage({ available: true }) })
  await assert.rejects(
    () => available.getProfileSecrets('feishu', 'default'),
    (error) => error instanceof ConnectorSecretStoreError && error.code === 'CORRUPTED_STORE',
  )

  await assert.rejects(
    () => available.getProfileSecrets('../escape', 'default'),
    (error) => error instanceof ConnectorSecretStoreError && error.code === 'INVALID_IDENTIFIER',
  )
})
