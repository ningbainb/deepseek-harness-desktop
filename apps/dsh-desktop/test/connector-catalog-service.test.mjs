import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  ConnectorCatalogError,
  ConnectorCatalogService,
  diffConnectorSecurityChanges,
  isCompatibleWithDesktop,
  validateConnectorCatalog,
  verifyCatalogSignature,
} from '../src/connectors/connector-catalog-service.mjs'

const EMOJI_PATTERN = /(?:\p{Extended_Pictographic}|\uFE0F)/u

test('builtin connector catalog passes schema validation and has zero emoji', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-cat-builtin-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const rawBuiltin = await readFile(new URL('../src/connectors/builtin-catalog.v1.json', import.meta.url), 'utf8')
  assert.equal(EMOJI_PATTERN.test(rawBuiltin), false, 'builtin catalog must not contain emoji')

  const service = new ConnectorCatalogService({ cacheDir: dir, desktopVersion: '5.4.0' })
  const loaded = await service.load()
  assert.equal(loaded.source, 'builtin')
  assert.deepEqual(
    loaded.connectors.map(item => item.id),
    ['feishu', 'tencent-docs', 'yuque', 'kdocs', 'wecom', 'dingtalk', 'tencent-meeting', 'wps365'],
  )
  assert.equal(loaded.connectors.every(item => item.compatible === true), true)
})

test('validateConnectorCatalog rejects inline scripts and non-HTTPS remote URLs', () => {
  assert.throws(
    () => validateConnectorCatalog({
      schemaVersion: 1,
      catalogVersion: '1',
      updatedAt: '2026-11-25T00:00:00.000Z',
      connectors: [{
        id: 'evil',
        name: { zh: '坏', en: 'Evil' },
        summary: { zh: 'x', en: 'x' },
        category: 'other',
        minDesktopVersion: '5.4.0',
        officialUrls: { docs: 'https://example.com' },
        drivers: [{ kind: 'mcp-remote', id: 'bad-url', url: 'http://insecure.local', remoteTransport: 'streamable-http' }],
        auth: { mode: 'personal-token', guideSteps: { zh: ['1'], en: ['1'] } },
        healthCheck: { kind: 'mcp-probe' },
        riskRules: [{ actionPattern: '*', level: 'L0' }],
      }],
    }),
    (error) => error instanceof ConnectorCatalogError && error.code === 'INVALID_CATALOG',
  )

  assert.throws(
    () => validateConnectorCatalog({
      schemaVersion: 1,
      catalogVersion: '1',
      updatedAt: '2026-11-25T00:00:00.000Z',
      connectors: [{
        id: 'scripted',
        name: { zh: '脚本', en: 'Scripted' },
        summary: { zh: 'x', en: 'x' },
        category: 'other',
        minDesktopVersion: '5.4.0',
        officialUrls: { docs: 'https://example.com' },
        drivers: [{ kind: 'cli', id: 'cli', binary: 'x', installScript: 'curl | sh', installSource: { kind: 'npm', package: 'x' } }],
        auth: { mode: 'cli-native', guideSteps: { zh: ['1'], en: ['1'] } },
        healthCheck: { kind: 'cli-command' },
        riskRules: [{ actionPattern: '*', level: 'L0' }],
      }],
    }),
    (error) => error instanceof ConnectorCatalogError && error.code === 'UNSAFE_CATALOG_ENTRY',
  )
})

test('ConnectorCatalogService verifies Ed25519 signatures, caches ETag/304, and falls back offline', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-cat-remote-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString('utf8')

  const builtin = await readFile(new URL('../src/connectors/builtin-catalog.v1.json', import.meta.url), 'utf8')
  const updatedCatalog = JSON.parse(builtin)
  updatedCatalog.catalogVersion = '2026.11.26-1'
  updatedCatalog.connectors[0].minDesktopVersion = '6.0.0'
  const payloadBytes = Buffer.from(JSON.stringify(updatedCatalog), 'utf8')
  const validSig = sign(null, payloadBytes, privateKey).toString('base64')
  assert.equal(verifyCatalogSignature(payloadBytes, validSig, publicKeyPem), true)

  const service = new ConnectorCatalogService({ cacheDir: dir, desktopVersion: '5.4.0' })

  const tampered = await service.refresh({
    remoteUrl: 'https://catalog.example.test/catalog.json',
    publicKeyPem,
    fetchImpl: async () => new Response(Buffer.from(JSON.stringify({ ...updatedCatalog, catalogVersion: 'evil' })), {
      status: 200,
      headers: { 'x-catalog-signature': validSig },
    }),
  })
  assert.equal(tampered.source, 'builtin')
  assert.equal(tampered.lastError?.code, 'INVALID_SIGNATURE')

  const refreshed = await service.refresh({
    remoteUrl: 'https://catalog.example.test/catalog.json',
    publicKeyPem,
    fetchImpl: async () => new Response(payloadBytes, {
      status: 200,
      headers: { etag: '"v2"', 'x-catalog-signature': validSig },
    }),
  })
  assert.equal(refreshed.source, 'remote')
  assert.equal(refreshed.catalogVersion, '2026.11.26-1')
  assert.equal(refreshed.connectors.find(c => c.id === 'feishu')?.compatible, false)
  assert.equal(isCompatibleWithDesktop('5.4.0', '5.4.0'), true)

  let sentEtag
  const cached304 = await service.refresh({
    remoteUrl: 'https://catalog.example.test/catalog.json',
    publicKeyPem,
    fetchImpl: async (_url, init) => {
      sentEtag = init.headers['if-none-match']
      return new Response(null, { status: 304 })
    },
  })
  assert.equal(sentEtag, '"v2"')
  assert.equal(cached304.catalogVersion, '2026.11.26-1')

  const offline = await service.refresh({
    remoteUrl: 'https://catalog.example.test/catalog.json',
    publicKeyPem,
    fetchImpl: async () => { throw new Error('network down') },
  })
  assert.equal(offline.source, 'cache')
  assert.equal(offline.lastError?.code, 'REFRESH_FAILED')
})

test('diffConnectorSecurityChanges flags auth host and package source changes', () => {
  const prev = {
    auth: { quickAuthUrl: 'https://docs.qq.com/open/auth/mcp.html' },
    drivers: [{ kind: 'mcp-remote', url: 'https://mcp.docs.qq.com/mcp', remoteTransport: 'streamable-http', allowedTools: ['read'] }],
  }
  const next = {
    auth: { quickAuthUrl: 'https://evil.example.com/auth' },
    drivers: [{ kind: 'mcp-remote', url: 'https://evil.example.com/mcp', remoteTransport: 'streamable-http', allowedTools: ['read', 'delete'] }],
  }
  const diff = diffConnectorSecurityChanges(prev, next)
  assert.equal(diff.requiresUserApproval, true)
  assert.equal(diff.reasons.length, 3)
})
