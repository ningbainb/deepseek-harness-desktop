import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  readLegacyCredentialCompatibility,
} from '../src/legacy-credential-compat.mjs'

const SECRET_OLD = 'test-secret-old-do-not-log'
const SECRET_NEW = 'test-secret-new-do-not-log'
const SECRET_FLAT = 'test-secret-flat-do-not-log'

async function fixture(context) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-legacy-credentials-'))
  context.after(async () => {
    const { rm } = await import('node:fs/promises')
    await rm(root, { recursive: true, force: true })
  })
  const userDataDir = join(root, 'user-data')
  const dshHomeDir = join(root, 'current-dsh')
  await mkdir(userDataDir, { recursive: true })
  await mkdir(dshHomeDir, { recursive: true })
  return { root, userDataDir, dshHomeDir }
}

async function writeLegacy(userDataDir, sessionId, content, modifiedAt) {
  const dsh = join(userDataDir, 'free-mode-sessions', 'active', sessionId, 'dsh')
  await mkdir(dsh, { recursive: true })
  const path = join(dsh, '.credentials.yaml')
  await writeFile(path, content, { encoding: 'utf8', mode: 0o600 })
  await utimes(path, modifiedAt, modifiedAt)
  return path
}

test('recovers refs from the newest valid app-owned Free Mode home without modifying it', async (context) => {
  const { userDataDir, dshHomeDir } = await fixture(context)
  const olderPath = await writeLegacy(
    userDataDir,
    'older-session',
    `version: 1\nrefs:\n  DEEPSEEK_API_KEY: ${SECRET_OLD}\n`,
    new Date('2026-08-20T00:00:00.000Z'),
  )
  const newestPath = await writeLegacy(
    userDataDir,
    'newer-session',
    `version: 1\nrefs:\n  DEEPSEEK_API_KEY: ${SECRET_NEW}\n  OPENAI_API_KEY: ${SECRET_FLAT}\nrecords:\n  llm-pi-ai/example:\n    kind: api-key\n    key: ignored-record-secret\n`,
    new Date('2026-08-21T00:00:00.000Z'),
  )
  const before = await Promise.all([readFile(olderPath), readFile(newestPath)])

  const result = await readLegacyCredentialCompatibility({ userDataDir, dshHomeDir })

  assert.deepEqual(result.environment, {
    DEEPSEEK_API_KEY: SECRET_NEW,
    OPENAI_API_KEY: SECRET_FLAT,
  })
  assert.deepEqual(result.summary, {
    candidates: 2,
    validCandidates: 2,
    recoveredRefs: 2,
    skippedCurrentRefs: 0,
    rejectedRefs: 0,
    invalidCandidates: 0,
  })
  assert.deepEqual(await Promise.all([readFile(olderPath), readFile(newestPath)]), before)
})

test('supports the historical flat layout and never exposes the selected path', async (context) => {
  const { userDataDir, dshHomeDir } = await fixture(context)
  await writeLegacy(
    userDataDir,
    'flat-session',
    `ANTHROPIC_API_KEY: ${SECRET_FLAT}\n`,
    new Date('2026-08-21T00:00:00.000Z'),
  )

  const result = await readLegacyCredentialCompatibility({ userDataDir, dshHomeDir })

  assert.deepEqual(result.environment, { ANTHROPIC_API_KEY: SECRET_FLAT })
  assert.equal(JSON.stringify(result.summary).includes('flat-session'), false)
})

test('current process and current credential refs win over legacy values', async (context) => {
  const { userDataDir, dshHomeDir } = await fixture(context)
  await writeFile(
    join(dshHomeDir, '.credentials.yaml'),
    `version: 1\nrefs:\n  DEEPSEEK_API_KEY: ${SECRET_NEW}\n`,
    { encoding: 'utf8', mode: 0o600 },
  )
  await writeLegacy(
    userDataDir,
    'legacy-session',
    `version: 1\nrefs:\n  DEEPSEEK_API_KEY: ${SECRET_OLD}\n  OPENAI_API_KEY: ${SECRET_OLD}\n  ANTHROPIC_API_KEY: ${SECRET_OLD}\n`,
    new Date('2026-08-21T00:00:00.000Z'),
  )

  const result = await readLegacyCredentialCompatibility({
    userDataDir,
    dshHomeDir,
    currentEnvironment: { OPENAI_API_KEY: SECRET_NEW },
  })

  assert.deepEqual(result.environment, { ANTHROPIC_API_KEY: SECRET_OLD })
  assert.equal(result.summary.skippedCurrentRefs, 2)
})

test('skips damaged candidates, forbidden launch controls, invalid refs and empty values', async (context) => {
  const { userDataDir, dshHomeDir } = await fixture(context)
  await writeLegacy(
    userDataDir,
    'damaged-newest',
    `version: 1\nrefs:\n  DEEPSEEK_API_KEY: [${SECRET_NEW}\n`,
    new Date('2026-08-22T00:00:00.000Z'),
  )
  await writeLegacy(
    userDataDir,
    'valid-older',
    `version: 1\nrefs:\n  OPENAI_API_KEY: ${SECRET_OLD}\n  DSH_HOME: should-not-win\n  NODE_OPTIONS: --require=untrusted.cjs\n  lowercase_ref: rejected\n  EMPTY_KEY: ''\n`,
    new Date('2026-08-21T00:00:00.000Z'),
  )

  const result = await readLegacyCredentialCompatibility({ userDataDir, dshHomeDir })

  assert.deepEqual(result.environment, { OPENAI_API_KEY: SECRET_OLD })
  assert.equal(result.summary.invalidCandidates, 1)
  assert.equal(result.summary.rejectedRefs, 4)
})

test('does not follow a credentials symlink out of the app-owned session tree', async (context) => {
  const { root, userDataDir, dshHomeDir } = await fixture(context)
  const outside = join(root, 'outside.yaml')
  await writeFile(outside, `DEEPSEEK_API_KEY: ${SECRET_OLD}\n`, 'utf8')
  const dsh = join(userDataDir, 'free-mode-sessions', 'active', 'linked-session', 'dsh')
  await mkdir(dsh, { recursive: true })
  const { symlink } = await import('node:fs/promises')
  try {
    await symlink(outside, join(dsh, '.credentials.yaml'), 'file')
  } catch (error) {
    if (error?.code === 'EPERM') return context.skip('Windows symlink privilege is unavailable')
    throw error
  }

  const result = await readLegacyCredentialCompatibility({ userDataDir, dshHomeDir })

  assert.deepEqual(result.environment, {})
  assert.equal(result.summary.validCandidates, 0)
  assert.equal(result.summary.invalidCandidates, 1)
})

test('returns only bounded counters when YAML contains a secret in a parser error', async (context) => {
  const { userDataDir, dshHomeDir } = await fixture(context)
  await writeLegacy(
    userDataDir,
    'broken-session',
    `version: 1\nrefs:\n  DEEPSEEK_API_KEY: "${SECRET_OLD}\n`,
    new Date('2026-08-21T00:00:00.000Z'),
  )

  const result = await readLegacyCredentialCompatibility({ userDataDir, dshHomeDir })
  const publicResult = JSON.stringify(result)

  assert.equal(publicResult.includes(SECRET_OLD), false)
  assert.deepEqual(result.environment, {})
  assert.equal(result.summary.invalidCandidates, 1)
})

test('rejects non-absolute roots before reading files', async () => {
  await assert.rejects(
    readLegacyCredentialCompatibility({ userDataDir: 'relative', dshHomeDir: 'also-relative' }),
    /absolute/u,
  )
})

test('bounds oversized credential files without reading their content', async (context) => {
  const { userDataDir, dshHomeDir } = await fixture(context)
  const path = await writeLegacy(
    userDataDir,
    'oversized-session',
    `DEEPSEEK_API_KEY: ${SECRET_OLD}\n`,
    new Date('2026-08-21T00:00:00.000Z'),
  )
  const { truncate } = await import('node:fs/promises')
  await truncate(path, 1024 * 1024 + 1)
  assert.equal((await stat(path)).size > 1024 * 1024, true)

  const result = await readLegacyCredentialCompatibility({ userDataDir, dshHomeDir })

  assert.deepEqual(result.environment, {})
  assert.equal(result.summary.invalidCandidates, 1)
})
