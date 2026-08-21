import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  assessRuntimeSupport,
  normalizeKnownGoodRuntimeEvidence,
  normalizeRuntimeSupportMatrix,
  readRuntimePackageVersion,
  readRuntimeSupportMatrix,
  runtimeSupportStartupLogDetails,
  verifyRuntimeFileEvidence,
} from '../src/runtime-support-policy.mjs'

const fileHashes = {
  'package.json': 'c'.repeat(64),
  'lib/bin.js': 'd'.repeat(64),
}

const patchEvidence = {
  registry: 'packages/dsh-desktop-compat/src/patch-registry.ts',
  sha256: 'e'.repeat(64),
  ids: ['test-patch'],
}

const knownGoodEvidence = {
  schemaVersion: 1,
  supportStatus: 'known-good',
  desktop: { version: '3.0.0' },
  runtime: {
    version: '0.1.0-rc.7',
    integrity: 'sha512-test',
    files: fileHashes,
  },
  lockfile: { path: 'pnpm-lock.yaml', sha256: 'a'.repeat(64) },
  provider: {
    providerId: 'dsh-cli-provider-v1',
    upstreamVersion: '0.1.0-rc.7',
    supportStatus: 'known-good',
  },
  compatPatches: patchEvidence,
}

const matrix = {
  schemaVersion: 1,
  entries: [{
    status: 'known-good',
    upstreamVersion: '0.1.0-rc.7',
    providerId: 'dsh-cli-provider-v1',
    desktopRange: '=3.0.0',
    verifiedAt: '2026-08-20',
    matrixArtifact: 'apps/dsh-desktop/runtime-support/known-good.json',
    knownIssues: [],
    evidence: {
      package: { integrity: 'sha512-test', files: fileHashes },
      lockfile: { path: 'pnpm-lock.yaml', sha256: 'a'.repeat(64) },
      patches: patchEvidence,
    },
  }],
}

test('runtime support policy admits only matching Stable matrix entries', () => {
  const result = assessRuntimeSupport(matrix, {
    upstreamVersion: '0.1.0-rc.7',
    providerId: 'dsh-cli-provider-v1',
    desktopVersion: '3.0.0',
    integrity: 'sha512-test',
    lockfileSha256: 'a'.repeat(64),
    fileHashes,
    patchEvidence,
  })
  assert.equal(result.status, 'known-good')
  assert.equal(result.entry.requiredPatches[0], 'test-patch')
})

test('runtime support policy accepts the validated matrix returned by its file reader', async () => {
  const loaded = await readRuntimeSupportMatrix('runtime-support.json', {
    readFile: async () => JSON.stringify(matrix),
  })
  const result = assessRuntimeSupport(loaded, {
    upstreamVersion: '0.1.0-rc.7',
    providerId: 'dsh-cli-provider-v1',
    desktopVersion: '3.0.0',
    integrity: 'sha512-test',
    lockfileSha256: 'a'.repeat(64),
    fileHashes,
    patchEvidence,
  })
  assert.equal(result.status, 'known-good')
})

test('runtime support policy blocks missing, mismatched, Candidate, and blocked entries', () => {
  const base = {
    upstreamVersion: '0.1.0-rc.7',
    providerId: 'dsh-cli-provider-v1',
    desktopVersion: '3.0.0',
    integrity: 'sha512-test',
    lockfileSha256: 'a'.repeat(64),
    fileHashes,
    patchEvidence,
  }
  assert.equal(assessRuntimeSupport(matrix, { ...base, upstreamVersion: '0.1.0-rc.8' }).status, 'blocked')
  assert.equal(assessRuntimeSupport(matrix, { ...base, providerId: 'other-provider' }).reason, 'runtime-provider-not-in-matrix')
  assert.equal(assessRuntimeSupport(matrix, { ...base, integrity: 'sha512-other' }).reason, 'runtime-integrity-not-in-matrix')
  assert.equal(assessRuntimeSupport(matrix, { ...base, lockfileSha256: 'b'.repeat(64) }).reason, 'runtime-lockfile-not-in-matrix')
  assert.equal(assessRuntimeSupport(matrix, {
    ...base,
    fileHashes: { ...fileHashes, 'lib/bin.js': 'e'.repeat(64) },
  }).reason, 'runtime-file-integrity-not-in-matrix')
  for (const evidence of [
    { integrity: undefined },
    { integrity: 'sha512-' },
    { lockfileSha256: undefined },
    { lockfileSha256: 'not-a-digest' },
    { fileHashes: undefined },
    { fileHashes: { 'package.json': 'c'.repeat(64) } },
    { patchEvidence: undefined },
    { patchEvidence: { ...patchEvidence, ids: [] } },
  ]) {
    assert.throws(() => assessRuntimeSupport(matrix, { ...base, ...evidence }), /provenance|integrity/u)
  }
  for (const status of ['candidate', 'blocked']) {
    assert.equal(assessRuntimeSupport({ ...matrix, entries: [{ ...matrix.entries[0], status }] }, base).status, 'blocked')
  }
})

test('runtime support policy requires complete matching known-good and matrix patch provenance', () => {
  assert.deepEqual(normalizeKnownGoodRuntimeEvidence(knownGoodEvidence).patches, {
    registry: patchEvidence.registry,
    sha256: patchEvidence.sha256,
    ids: ['test-patch'],
  })

  const strippedKnownGood = structuredClone(knownGoodEvidence)
  delete strippedKnownGood.compatPatches
  assert.throws(() => normalizeKnownGoodRuntimeEvidence(strippedKnownGood), /compatibility patch evidence/u)

  const strippedMatrix = structuredClone(matrix)
  delete strippedMatrix.entries[0].evidence.patches
  assert.throws(() => normalizeRuntimeSupportMatrix(strippedMatrix), /compatibility patch evidence/u)

  const base = {
    upstreamVersion: '0.1.0-rc.7',
    providerId: 'dsh-cli-provider-v1',
    desktopVersion: '3.0.0',
    integrity: 'sha512-test',
    lockfileSha256: 'a'.repeat(64),
    fileHashes,
    patchEvidence,
  }
  for (const evidence of [
    { ...patchEvidence, registry: 'packages/other/patch-registry.ts' },
    { ...patchEvidence, sha256: 'f'.repeat(64) },
    { ...patchEvidence, ids: ['other-patch'] },
  ]) {
    assert.equal(
      assessRuntimeSupport(matrix, { ...base, patchEvidence: evidence }).reason,
      'runtime-patch-evidence-not-in-matrix',
    )
  }
})

test('runtime support policy rejects malformed machine artifacts', () => {
  assert.throws(() => normalizeRuntimeSupportMatrix({ schemaVersion: 1, entries: [{ status: 'known-good' }] }), /upstreamVersion/u)
  const malformed = structuredClone(matrix)
  delete malformed.entries[0].evidence.package.files
  assert.throws(() => normalizeRuntimeSupportMatrix(malformed), /runtime file evidence/u)
  const malformedPatches = structuredClone(matrix)
  malformedPatches.entries[0].evidence.patches.sha256 = 'not-a-digest'
  assert.throws(() => normalizeRuntimeSupportMatrix(malformedPatches), /patch evidence sha256/u)
})

test('runtime support startup diagnostics allowlist reason and redact unsafe error messages', () => {
  assert.deepEqual(
    runtimeSupportStartupLogDetails({
      reason: 'runtime-matrix-unavailable',
      stage: 'assess',
      desktopVersion: '3.0.0',
      runtimeVersion: '0.1.0-rc.7',
      error: new TypeError('runtime matrix integrity evidence must be sha512 integrity evidence'),
    }),
    {
      reason: 'runtime-matrix-unavailable',
      stage: 'assess',
      desktopVersion: '3.0.0',
      runtimeVersion: '0.1.0-rc.7',
      errorCode: 'none',
      errorName: 'TypeError',
      errorMessage: 'runtime matrix integrity evidence must be sha512 integrity evidence',
    },
  )
  assert.deepEqual(
    runtimeSupportStartupLogDetails({
      reason: 'unexpected-reason',
      stage: 'unexpected-stage',
      desktopVersion: 'C:\\Users\\name',
      runtimeVersion: 'not/a/version',
      error: new Error('C:\\Users\\name\\profile data'),
    }),
    {
      reason: 'runtime-support-assessment-failed',
      stage: 'assess',
      desktopVersion: 'unknown',
      runtimeVersion: 'unknown',
      errorCode: 'none',
      errorName: 'Error',
      errorMessage: 'unclassified runtime support validation failure',
    },
  )
})

test('runtime file provenance reads the resolved bytes and rejects same-version modifications', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-provenance-'))
  const packageRoot = join(root, 'node_modules', '@deepseek-ai', 'dsh')
  const cliPath = join(packageRoot, 'lib', 'bin.js')
  const packageBytes = Buffer.from('{"name":"@deepseek-ai/dsh","version":"0.1.0-rc.7"}\n')
  const cliBytes = Buffer.from('console.log("dsh")\n')
  const expected = {
    'package.json': createHash('sha256').update(packageBytes).digest('hex'),
    'lib/bin.js': createHash('sha256').update(cliBytes).digest('hex'),
  }
  try {
    await mkdir(join(packageRoot, 'lib'), { recursive: true })
    await writeFile(join(packageRoot, 'package.json'), packageBytes)
    await writeFile(cliPath, cliBytes)
    assert.deepEqual(
      await verifyRuntimeFileEvidence({ cliPath, expectedFileHashes: expected, readFile }),
      expected,
    )

    await writeFile(cliPath, 'console.log("altered")\n')
    await assert.rejects(
      verifyRuntimeFileEvidence({ cliPath, expectedFileHashes: expected, readFile }),
      (error) => error?.code === 'DSH_DESKTOP_RUNTIME_PROVENANCE_MISMATCH'
        && error?.file === 'lib/bin.js'
        && /runtime integrity checksum mismatch/u.test(error.message),
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runtime version is derived from the verified CLI package instead of a legacy profile declaration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-package-version-'))
  const packageRoot = join(root, 'installed-runtime', 'node_modules', '@deepseek-ai', 'dsh')
  const cliPath = join(packageRoot, 'lib', 'bin.js')
  const legacyProfilePath = join(root, 'dsh-home', 'profiles', 'desktop', 'package.json')
  const packageBytes = Buffer.from('{"name":"@deepseek-ai/dsh","version":"0.1.0-rc.7"}\n')
  const cliBytes = Buffer.from('console.log("dsh")\n')
  const actualFileHashes = {
    'package.json': createHash('sha256').update(packageBytes).digest('hex'),
    'lib/bin.js': createHash('sha256').update(cliBytes).digest('hex'),
  }
  try {
    await mkdir(join(packageRoot, 'lib'), { recursive: true })
    await mkdir(join(root, 'dsh-home', 'profiles', 'desktop'), { recursive: true })
    await Promise.all([
      writeFile(join(packageRoot, 'package.json'), packageBytes),
      writeFile(cliPath, cliBytes),
      writeFile(legacyProfilePath, '{"dependencies":{"@deepseek-ai/dsh":"0.1.0-rc.6"}}\n'),
    ])
    const runtimeVersion = await readRuntimePackageVersion({ cliPath, readFile })
    assert.equal(runtimeVersion, '0.1.0-rc.7')
    const runtimeMatrix = structuredClone(matrix)
    runtimeMatrix.entries[0].evidence.package.files = actualFileHashes
    assert.equal(assessRuntimeSupport(runtimeMatrix, {
      upstreamVersion: runtimeVersion,
      providerId: 'dsh-cli-provider-v1',
      desktopVersion: '3.0.0',
      integrity: 'sha512-test',
      lockfileSha256: 'a'.repeat(64),
      fileHashes: actualFileHashes,
      patchEvidence,
    }).status, 'known-good')

    await writeFile(cliPath, 'console.log("altered")\n')
    await assert.rejects(
      verifyRuntimeFileEvidence({ cliPath, expectedFileHashes: actualFileHashes, readFile }),
      (error) => error?.code === 'DSH_DESKTOP_RUNTIME_PROVENANCE_MISMATCH'
        && error?.file === 'lib/bin.js',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
