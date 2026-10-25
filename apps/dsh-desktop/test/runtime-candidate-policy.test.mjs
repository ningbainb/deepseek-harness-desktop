import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  assessCandidateRuntimeSupport,
  candidateRuntimeOptions,
  normalizeCandidateRuntimeEvidence,
} from '../src/runtime-candidate-policy.mjs'
import { assessRuntimeSupport, normalizeKnownGoodRuntimeEvidence } from '../src/runtime-support-policy.mjs'

const version = '0.2.1-alpha.2'
const files = { 'package.json': 'a'.repeat(64), 'lib/bin.js': 'b'.repeat(64) }
const patches = { registry: 'packages/dsh-desktop-compat/src/patch-registry.ts', sha256: 'c'.repeat(64), ids: ['test-patch'] }
const lockfile = { path: 'pnpm-lock.yaml', sha256: 'd'.repeat(64) }
const document = {
  schemaVersion: 1,
  supportStatus: 'candidate',
  desktop: { version: '5.0.1' },
  runtime: { version, integrity: 'sha512-test', files },
  provider: { providerId: 'dsh-cli-provider-v1', upstreamVersion: version, supportStatus: 'candidate' },
  lockfile,
  compatPatches: patches,
}
const matrix = { schemaVersion: 1, entries: [{
  status: 'candidate', upstreamVersion: version, providerId: 'dsh-cli-provider-v1', desktopRange: '=5.0.1',
  evidence: { package: document.runtime, lockfile, patches },
}] }
const identity = {
  upstreamVersion: version, providerId: 'dsh-cli-provider-v1', desktopVersion: '5.0.1',
  integrity: 'sha512-test', lockfileSha256: lockfile.sha256, fileHashes: files, patchEvidence: patches,
}
const environment = {
  DSH_DESKTOP_CANDIDATE_VERSION: version,
  DSH_HOME: join(tmpdir(), 'candidate-policy-fixture', 'home'),
  DSH_DESKTOP_USER_DATA: join(tmpdir(), 'candidate-policy-fixture', 'user-data'),
  DSH_DESKTOP_CANDIDATE_EVIDENCE: join(tmpdir(), 'candidate-policy-fixture', 'evidence.json'),
  DSH_DESKTOP_CANDIDATE_MATRIX: join(tmpdir(), 'candidate-policy-fixture', 'matrix.json'),
}

test('Candidate evaluation remains opt-in and cannot admit candidates to Stable', () => {
  assert.equal(candidateRuntimeOptions({ isPackaged: false, environment: {} }), undefined)
  assert.equal(candidateRuntimeOptions({ isPackaged: false, environment }).version, version)
  const before = JSON.stringify({ matrix, document })
  const evidence = normalizeCandidateRuntimeEvidence(document, version)
  assert.equal(evidence.runtimeVersion, version)
  const assessment = assessCandidateRuntimeSupport(matrix, identity, version)
  assert.equal(assessment.status, 'candidate')
  assert.equal(assessment.entry.status, 'candidate')
  assert.equal(assessRuntimeSupport(matrix, identity).reason, 'runtime-matrix-status-candidate')
  assert.throws(() => normalizeKnownGoodRuntimeEvidence(document), /not Stable eligible/u)
  assert.equal(JSON.stringify({ matrix, document }), before)
})

test('Candidate evaluation refuses packaged apps, missing isolation, shared paths and non-exact versions', () => {
  assert.throws(() => candidateRuntimeOptions({ isPackaged: true, environment }), /unpackaged/u)
  for (const patch of [
    { DSH_HOME: undefined }, { DSH_DESKTOP_USER_DATA: undefined },
    { DSH_HOME: tmpdir() }, { DSH_HOME: join(tmpdir(), '..', 'personal-profile') },
    { DSH_HOME: environment.DSH_DESKTOP_USER_DATA }, { DSH_HOME: 'relative-home' },
    { DSH_DESKTOP_CANDIDATE_VERSION: 'latest' }, { DSH_DESKTOP_CANDIDATE_VERSION: '0.2.1' },
    { DSH_DESKTOP_CANDIDATE_MATRIX: undefined }, { DSH_DESKTOP_CANDIDATE_EVIDENCE: 'relative.json' },
  ]) assert.throws(() => candidateRuntimeOptions({ isPackaged: false, environment: { ...environment, ...patch } }), /isolated/u)
})

test('Candidate evidence rejects other versions, Stable statuses and missing provenance', () => {
  for (const change of [
    { supportStatus: 'supported' }, { provider: { ...document.provider, supportStatus: 'blocked' } },
    { runtime: { ...document.runtime, version: '0.2.0-rc.2' } },
    { runtime: { ...document.runtime, files: {} } }, { lockfile: undefined }, { compatPatches: undefined },
  ]) assert.throws(() => normalizeCandidateRuntimeEvidence({ ...document, ...change }, version))
})

test('Candidate assessment retains all byte, provider, Desktop and patch identity checks', () => {
  for (const change of [
    { providerId: 'wrong-provider' }, { desktopVersion: '4.4.0' }, { integrity: 'sha512-other' },
    { lockfileSha256: 'e'.repeat(64) }, { fileHashes: { ...files, 'lib/bin.js': 'f'.repeat(64) } },
    { patchEvidence: { ...patches, sha256: 'e'.repeat(64) } },
  ]) assert.equal(assessCandidateRuntimeSupport(matrix, { ...identity, ...change }, version).status, 'blocked')
  for (const status of ['supported', 'known-good', 'blocked']) {
    assert.equal(assessCandidateRuntimeSupport({ ...matrix, entries: [{ ...matrix.entries[0], status }] }, identity, version).status, 'blocked')
  }
  assert.throws(() => assessCandidateRuntimeSupport(matrix, { ...identity, upstreamVersion: '0.2.0-rc.2' }, version), /requested candidate/u)
})

test('Candidate assessment reports the matching entry rather than an earlier incompatible Desktop entry', () => {
  const entries = [{ ...matrix.entries[0], desktopRange: '=4.4.0', knownIssues: ['different-desktop'] }, matrix.entries[0]]
  const result = assessCandidateRuntimeSupport({ ...matrix, entries }, identity, version)
  assert.equal(result.status, 'candidate')
  assert.equal(result.entry.desktopRange, '=5.0.1')
  assert.deepEqual(result.entry.knownIssues, [])
})
