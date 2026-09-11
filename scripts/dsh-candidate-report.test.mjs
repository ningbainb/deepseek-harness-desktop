import assert from 'node:assert/strict'
import test from 'node:test'

import { createCandidateReport, renderCandidateReportMarkdown } from './dsh-candidate-report.mjs'
import {
  collectWorkspaceDshPackages,
  createCandidateInstallPlan,
  validateCandidateVersion,
} from './prepare-dsh-candidate.mjs'

const stableEvidence = {
  desktop: { version: '2.7.0' },
  runtime: {
    packageName: '@deepseek-ai/dsh',
    version: '0.1.0-rc.7',
    integrity: 'sha512-YWJjZA==',
    exports: null,
    peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
  },
  provider: { capabilities: [{ id: 'runtime.lifecycle', status: 'available' }] },
  compatPatches: { ids: ['queued-turn-continuation'] },
  clientSlots: { ids: ['conversation.input.dock'] },
  packagedRuntimeIdentity: { cli: 'resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh/lib/bin.js' },
}
const candidateEvidence = structuredClone(stableEvidence)
candidateEvidence.runtime.version = '0.1.0-rc.8'
candidateEvidence.desktop.version = '2.7.0'
const stableHashes = { package: 'a', lockfile: 'b', updater: 'c' }

function reportWith(checks, overrides = {}) {
  return createCandidateReport({
    candidateVersion: '0.1.0-rc.8',
    candidateSource: 'workflow_dispatch',
    stableEvidence,
    candidateEvidence,
    checks,
    stableHashesBefore: stableHashes,
    stableHashesAfter: stableHashes,
    ...overrides,
  })
}

test('Candidate Matrix accepts only exact versions and resolves exact peer installs', async () => {
  assert.equal(validateCandidateVersion('0.1.0-rc.8'), '0.1.0-rc.8')
  for (const value of ['latest', '^0.1.0', '~0.1.0', 'github:user/repo', 'file:../dsh']) {
    assert.throws(() => validateCandidateVersion(value), /exact/u)
  }
  const plan = await createCandidateInstallPlan({
    candidateVersion: '0.1.0-rc.8',
    viewManifest: async () => ({
      name: '@deepseek-ai/dsh',
      version: '0.1.0-rc.8',
      peerDependencies: { '@deepseek-ai/cordis': '^4.0.0' },
    }),
    resolvePeerVersion: async () => ['4.0.0', '4.0.2'],
  })
  assert.deepEqual(plan.peers, [{
    name: '@deepseek-ai/cordis',
    range: '^4.0.0',
    version: '4.0.2',
    spec: '@deepseek-ai/cordis@4.0.2',
  }])
  assert.deepEqual(plan.workspacePackages, [])
  assert.deepEqual(plan.unavailableWorkspacePackages, [])
  assert.deepEqual(plan.companionPackages, [])
  assert.deepEqual(plan.unresolvedCompanionPackages, [])
})

test('Candidate Matrix plans every workspace DSH SDK package and exposes retired entry points', async () => {
  const workspaceManifests = [{
    dependencies: {
      '@deepseek-ai/cordis': '4.0.1',
      '@deepseek-ai/dsh': '0.1.1-rc.1',
      '@deepseek-ai/dsh-session': '0.1.1-rc.1',
    },
    devDependencies: {
      '@deepseek-ai/dsh-client-runtime': '^0.1.1-rc.1',
      react: '^19.0.0',
    },
  }]
  assert.deepEqual(collectWorkspaceDshPackages(workspaceManifests), [
    '@deepseek-ai/dsh',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-session',
  ])
  const plan = await createCandidateInstallPlan({
    candidateVersion: '0.1.5-alpha.1',
    viewManifest: async () => ({
      name: '@deepseek-ai/dsh',
      version: '0.1.5-alpha.1',
      dependencies: { '@deepseek-ai/cordis': '^4.0.2' },
    }),
    resolvePeerVersion: async (name) => name === '@deepseek-ai/cordis' ? '4.0.2' : [],
    workspaceManifests,
    viewPackageManifest: async (name, version) => name === '@deepseek-ai/dsh-client-runtime'
      ? null
      : { name, version },
  })
  assert.deepEqual(plan.workspacePackages, [
    {
      name: '@deepseek-ai/dsh',
      version: '0.1.5-alpha.1',
      spec: '@deepseek-ai/dsh@0.1.5-alpha.1',
    },
    {
      name: '@deepseek-ai/dsh-session',
      version: '0.1.5-alpha.1',
      spec: '@deepseek-ai/dsh-session@0.1.5-alpha.1',
    },
  ])
  assert.deepEqual(plan.unavailableWorkspacePackages, ['@deepseek-ai/dsh-client-runtime'])
  assert.deepEqual(plan.companionPackages, [{
    name: '@deepseek-ai/cordis',
    ranges: ['^4.0.2'],
    version: '4.0.2',
    spec: '@deepseek-ai/cordis@4.0.2',
  }])
  assert.deepEqual(plan.unresolvedCompanionPackages, [])
})

test('Candidate Matrix successful report is diagnostic and leaves stable inputs unchanged', () => {
  const report = reportWith([
    { id: 'build', status: 'passed' },
    { id: 'runtime-start-stop-recover', status: 'passed' },
    { id: 'report', status: 'passed' },
  ])
  assert.equal(report.status, 'candidate')
  assert.equal(report.outcome, 'compatible')
  assert.equal(report.candidateSource, 'workflow_dispatch')
  assert.equal(report.stableDesktopVersion, '2.7.0')
  assert.equal(report.stableCheckoutUnchanged, true)
  assert.equal(report.differences.package.changed, true)
  assert.equal(report.differences.apiExports.changed, false)
  assert.deepEqual(report.patchAssessment, [{
    id: 'queued-turn-continuation',
    action: 'reverify-or-remove',
    reason: 'runtime changed from 0.1.0-rc.7 to 0.1.0-rc.8',
  }])
  assert.equal(report.evidence.stable.peers['@deepseek-ai/cordis'], '^4.0.1')
  assert.match(renderCandidateReportMarkdown(report), /does not update stable dependencies/u)
  assert.match(renderCandidateReportMarkdown(report), /Candidate source: workflow_dispatch/u)
  assert.match(renderCandidateReportMarkdown(report), /Candidate CWD/u)
  assert.match(renderCandidateReportMarkdown(report), /Candidate peers/u)
  assert.match(renderCandidateReportMarkdown(report), /Candidate capabilities/u)
  assert.match(renderCandidateReportMarkdown(report), /Candidate patches/u)
  assert.match(renderCandidateReportMarkdown(report), /Candidate packaged CLI/u)
  assert.match(renderCandidateReportMarkdown(report), /Compatibility patch assessment/u)
})

test('Candidate Matrix reports build and Runtime failures without hiding later evidence', () => {
  const buildFailure = reportWith([
    { id: 'build', status: 'failed', detail: 'typecheck failed' },
    { id: 'runtime-start-stop-recover', status: 'skipped' },
    { id: 'report', status: 'passed' },
  ])
  assert.equal(buildFailure.status, 'blocked')
  assert.equal(buildFailure.checks.at(-1).status, 'passed')
  const runtimeFailure = reportWith([
    { id: 'build', status: 'passed' },
    { id: 'runtime-start-stop-recover', status: 'failed', detail: 'recover failed' },
    { id: 'report', status: 'passed' },
  ])
  assert.equal(runtimeFailure.status, 'blocked')
})

test('Candidate Matrix blocks if the stable package, lockfile, release, or updater inputs changed', () => {
  const report = reportWith([{ id: 'report', status: 'passed' }], {
    stableHashesAfter: { ...stableHashes, lockfile: 'changed' },
  })
  assert.equal(report.status, 'blocked')
  assert.equal(report.stableCheckoutUnchanged, false)
})

test('Candidate Matrix treats Worktree CWD and event changes as compatibility blockers', () => {
  const report = reportWith([{ id: 'report', status: 'passed' }], {
    executionEvidence: {
      status: 'blocked',
      candidate: { status: 'blocked', sessionCwd: 'C:/unexpected', eventSemantics: 'changed' },
    },
  })
  assert.equal(report.status, 'blocked')
  assert.match(renderCandidateReportMarkdown(report), new RegExp('Session CWD and completion/cancel event semantics'))
})
