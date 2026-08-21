import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  atomicWriteValidated,
  createCandidateRuntimeMatrix,
  createSupportedRuntimeMatrix,
  renderRuntimeSupportMatrix,
  stableRuntimeEntry,
  validateRuntimeSupportMatrix,
} from './generate-runtime-support-matrix.mjs'

const supportEvidence = {
  schemaVersion: 1,
  derived: true,
  supportStatus: 'known-good',
  desktop: { version: '2.7.0' },
  runtime: {
    packageName: '@deepseek-ai/dsh',
    version: '0.1.0-rc.7',
    integrity: 'sha512-YWJjZA==',
    files: {
      'package.json': 'b'.repeat(64),
      'lib/bin.js': 'c'.repeat(64),
    },
    peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
  },
  lockfile: {
    path: 'pnpm-lock.yaml',
    sha256: 'a'.repeat(64),
  },
  provider: {
    providerId: 'dsh-cli-provider-v1',
    capabilities: [
      { id: 'runtime.lifecycle', status: 'available' },
      { id: 'schedule.host-jobs', status: 'unsupported' },
    ],
  },
  clientSlots: { ids: ['conversation.input.dock'] },
  compatPatches: {
    registry: 'packages/dsh-desktop-compat/src/patch-registry.ts',
    sha256: 'd'.repeat(64),
    ids: ['queued-turn-continuation'],
  },
  packagedRuntimeIdentity: {
    packageRoot: 'resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh',
    cli: 'resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh/lib/bin.js',
    profileName: 'desktop',
    executionMode: 'electron-run-as-node',
    requiredFiles: ['package.json', 'lib/bin.js'],
  },
}

const source = {
  schemaVersion: 1,
  status: 'known-good',
  verifiedAt: '2026-08-20',
  desktopRange: 'current',
  matrixArtifact: 'apps/dsh-desktop/runtime-support/known-good.json',
  knownIssues: [],
}

test('supported-runtime matrix derives a stable entry with package, peer, slot, capability, patch, and packaged evidence', async () => {
  const matrix = await createSupportedRuntimeMatrix({ supportEvidence, source })
  assert.equal(matrix.entries.length, 1)
  const entry = stableRuntimeEntry(matrix, '0.1.0-rc.7')
  assert.equal(entry.status, 'known-good')
  assert.equal(entry.desktopRange, '=2.7.0')
  assert.deepEqual(entry.evidence.peers, { '@deepseek-ai/cordis': '^4.0.1' })
  assert.deepEqual(entry.evidence.lockfile, { path: 'pnpm-lock.yaml', sha256: 'a'.repeat(64) })
  assert.deepEqual(entry.evidence.package.files, {
    'package.json': 'b'.repeat(64),
    'lib/bin.js': 'c'.repeat(64),
  })
  assert.deepEqual(entry.evidence.slots, ['conversation.input.dock'])
  assert.equal(entry.evidence.patches.ids[0], 'queued-turn-continuation')
  assert.match(renderRuntimeSupportMatrix(matrix), /resources\/app\.asar\.unpacked/u)
})

test('candidate matrix keeps a successful candidate separate from Stable and blocks incomplete evidence', async () => {
  const candidateEvidence = structuredClone(supportEvidence)
  candidateEvidence.supportStatus = 'candidate'
  candidateEvidence.runtime.version = '0.1.0-rc.8'
  const passing = await createCandidateRuntimeMatrix({
    supportEvidence,
    source,
    candidateEvidence,
    candidateVersion: '0.1.0-rc.8',
    candidateStatus: 'candidate',
    verifiedAt: '2026-08-20',
  })
  assert.equal(passing.entries.find((entry) => entry.status === 'candidate')?.upstreamVersion, '0.1.0-rc.8')
  assert.throws(() => validateRuntimeSupportMatrix(passing, { stableOnly: true }), /Stable runtime selection/u)

  const blocked = await createCandidateRuntimeMatrix({
    supportEvidence,
    source,
    candidateEvidence: {},
    candidateVersion: '0.1.0-rc.9',
    candidateStatus: 'blocked',
    verifiedAt: '2026-08-20',
    knownIssues: ['candidate install did not produce runtime evidence'],
  })
  const blockedEntry = blocked.entries.find((entry) => entry.status === 'blocked')
  assert.equal(blockedEntry?.evidence.available, false)
  assert.deepEqual(blockedEntry?.knownIssues, ['candidate install did not produce runtime evidence'])
  assert.throws(() => stableRuntimeEntry(blocked, '0.1.0-rc.9'), /Stable runtime selection/u)
})

test('reviewed supported entries are valid Stable selections without treating candidates as Stable', async () => {
  const matrix = await createSupportedRuntimeMatrix({
    supportEvidence,
    source: { ...source, status: 'supported' },
  })
  assert.equal(stableRuntimeEntry(matrix, '0.1.0-rc.7').status, 'supported')
})

test('matrix output is validated before and after its atomic replacement', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-runtime-matrix-'))
  const output = join(temporary, 'supported-runtimes.json')
  try {
    await writeFile(output, '{"old":true}\n', 'utf8')
    const matrix = await createSupportedRuntimeMatrix({ supportEvidence, source })
    await atomicWriteValidated(output, renderRuntimeSupportMatrix(matrix), validateRuntimeSupportMatrix)
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')).entries[0].status, 'known-good')
    await assert.rejects(
      atomicWriteValidated(output, '{"schemaVersion":1}\n', validateRuntimeSupportMatrix),
      /runtime support matrix schema/u,
    )
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')).entries[0].status, 'known-good')
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('matrix rejects non-calendar verification dates before writing evidence', async () => {
  await assert.rejects(
    createSupportedRuntimeMatrix({
      supportEvidence,
      source: { ...source, verifiedAt: '2026-02-30' },
    }),
    /ISO calendar date/u,
  )
})

test('matrix requires per-entry lockfile evidence', async () => {
  const withoutLockfile = structuredClone(supportEvidence)
  delete withoutLockfile.lockfile
  await assert.rejects(
    createSupportedRuntimeMatrix({ supportEvidence: withoutLockfile, source }),
    /runtime support evidence is incomplete/u,
  )
})

test('matrix requires exact Runtime entrypoint byte evidence', async () => {
  const withoutCliHash = structuredClone(supportEvidence)
  delete withoutCliHash.runtime.files['lib/bin.js']
  await assert.rejects(
    createSupportedRuntimeMatrix({ supportEvidence: withoutCliHash, source }),
    /runtime file evidence/u,
  )
})

test('matrix requires complete canonical compatibility patch evidence', async () => {
  for (const compatPatches of [
    { ...supportEvidence.compatPatches, ids: [] },
    { ...supportEvidence.compatPatches, ids: ['not a patch id'] },
    { ...supportEvidence.compatPatches, sha256: 'not-a-digest' },
    { ...supportEvidence.compatPatches, registry: '../outside/patch-registry.ts' },
  ]) {
    const invalid = structuredClone(supportEvidence)
    invalid.compatPatches = compatPatches
    await assert.rejects(
      createSupportedRuntimeMatrix({ supportEvidence: invalid, source }),
      /patch/u,
    )
  }
})
