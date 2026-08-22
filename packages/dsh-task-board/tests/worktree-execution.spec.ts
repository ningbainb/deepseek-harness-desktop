import { describe, expect, it } from 'vitest'

import { collectEvidence, InMemoryEvidenceStore } from '../src/core/evidence.ts'
import { EvidenceReviewService } from '../src/core/review.ts'
import { createProject, type Evidence, type TaskRunReference } from '../src/core/runs.ts'
import { WorktreeExecutionCoordinator, type ProviderSession, type ProviderSessionEvent, type RuntimeProviderBoundary, type WorktreeExecutionFace } from '../src/core/worktree-execution.ts'
import { createTask } from '../src/core/tasks.ts'

function fixture({ complete = true } = {}) {
  const events = new Set<(event: ProviderSessionEvent) => void>()
  const emit = (event: ProviderSessionEvent): void => { for (const listener of events) listener(event) }
  const worktree = { worktreeId: 'wt-1', path: 'C:/controlled/worktree/run-1', baseRevision: 'base', branch: 'dsh/task/task-run' }
  const session: ProviderSession = {
    sessionId: 'session-1',
    workspaceId: 'provider-workspace-1',
    cwd: worktree.path,
    prompt: async () => {
      if (complete) queueMicrotask(() => { emit({ type: 'completed', resultStatus: 'succeeded' }) })
      return { ok: true }
    },
    subscribe: listener => { events.add(listener); return () => events.delete(listener) },
    cancel: async () => { emit({ type: 'cancelled', resultStatus: 'cancelled' }) },
  }
  const provider: RuntimeProviderBoundary = {
    probe: () => ({ providerId: 'fixture', capabilities: [
      { id: 'workspace.register', status: 'available' },
      { id: 'session.create', status: 'available' },
      { id: 'session.observe', status: 'available' },
    ] }),
    registerWorkspace: async () => ({ workspaceId: session.workspaceId }),
    createSession: async () => session,
  }
  const worktrees: WorktreeExecutionFace = {
    createWorktree: async () => ({ ok: true, value: worktree }),
    getWorktreeStatus: async () => ({ ok: true, value: { clean: false, dirty: true, head: 'final', baseRevision: 'base' } }),
    diffWorktree: async () => ({ ok: true, value: { baseRevision: 'base', finalRevision: 'final', files: [{ path: 'src/a.ts', additions: 2, deletions: 1 }], additions: 2, deletions: 1, preview: 'diff --git', previewTruncated: false } }),
    listWorktrees: async () => ({ ok: true, value: [worktree] }),
  }
  return { provider, worktrees, session, worktree, emit, events }
}

const project = createProject({ id: 'project-1', name: 'fixture', workspaceId: 'workspace-1', defaultIsolation: 'git-worktree' })
const task = createTask({ title: 'isolated task', description: '', prompt: 'run fixture' }, 1, 'task-1')

describe('WorktreeExecutionCoordinator', () => {
  it('proves Session CWD is the controlled Worktree and writes derived Evidence', async () => {
    const { provider, worktrees } = fixture()
    const evidence = new InMemoryEvidenceStore()
    const coordinator = new WorktreeExecutionCoordinator(provider, worktrees, evidence, () => 20)
    const result = await coordinator.run({ task, project, runId: 'run-1', startedAt: 10 })
    expect(result.mode).toBe('git-worktree')
    expect(result.run.worktreeId).toBe('wt-1')
    expect(result.run.resultStatus).toBe('awaiting-review')
    expect(result.capabilityEvidence.sessionCwdVerified).toBe(true)
    expect(evidence.list?.('run-1')).toHaveLength(1)
    expect(evidence.get('ev-run-1')?.changedFiles[0]?.path).toBe('src/a.ts')
  })

  it('subscribes and reports started before prompting the Session', async () => {
    const { provider, worktrees, session, emit, events } = fixture({ complete: false })
    const order: string[] = []
    session.prompt = async () => {
      order.push('prompt')
      queueMicrotask(() => { emit({ type: 'completed', resultStatus: 'succeeded' }) })
      return { ok: true }
    }
    const coordinator = new WorktreeExecutionCoordinator(provider, worktrees, new InMemoryEvidenceStore())
    await coordinator.runTask(task, { id: 'run-order', runId: 'run-order', sessionId: undefined, startedAt: 1, endedAt: undefined, result: undefined, error: undefined }, project, event => {
      order.push(event.kind)
    })
    expect(order).toEqual(['started', 'prompt', 'settled'])
  })

  it('returns an explicit shared fallback when provider capabilities are missing', async () => {
    const { worktrees } = fixture()
    let worktreeCreates = 0
    const provider: RuntimeProviderBoundary = {
      probe: () => ({ providerId: 'stable', supportStatus: 'known-good', capabilities: [{ id: 'runtime.lifecycle', status: 'available' }] }),
      registerWorkspace: async () => ({ workspaceId: 'unused' }),
      createSession: async () => { throw new Error('must not be called') },
    }
    const result = await new WorktreeExecutionCoordinator(provider, { ...worktrees, createWorktree: async (input) => { worktreeCreates += 1; return worktrees.createWorktree(input) } }, new InMemoryEvidenceStore()).run({ task, project, runId: 'run-unsupported', startedAt: 1 })
    expect(result.mode).toBe('shared-workspace-fallback')
    expect(result.fallbackReason).toMatch(/lacks/u)
    expect(worktreeCreates).toBe(0)
  })

  it('falls back safely when the provider capability probe throws', async () => {
    const { provider, worktrees } = fixture()
    let worktreeCreates = 0
    const result = await new WorktreeExecutionCoordinator({
      ...provider,
      probe: () => { throw new Error('probe unavailable') },
    }, {
      ...worktrees,
      createWorktree: async (input) => { worktreeCreates += 1; return worktrees.createWorktree(input) },
    }, new InMemoryEvidenceStore()).run({ task, project, runId: 'run-probe-fail', startedAt: 1 })
    expect(result.mode).toBe('shared-workspace-fallback')
    expect(result.fallbackReason).toContain('probe unavailable')
    expect(result.capabilityEvidence.registerWorkspace).toBe('failed')
    expect(worktreeCreates).toBe(0)
  })

  it('falls back before provider calls when Worktree creation is blocked', async () => {
    const { provider, worktrees } = fixture()
    let registered = 0
    const guardedProvider: RuntimeProviderBoundary = {
      ...provider,
      registerWorkspace: async () => { registered += 1; return { workspaceId: 'unused' } },
    }
    const result = await new WorktreeExecutionCoordinator(guardedProvider, {
      ...worktrees,
      createWorktree: async () => ({ ok: false, error: { code: 'non-git', message: 'workspace is not a Git repository' } }),
    }, new InMemoryEvidenceStore()).run({ task, project, runId: 'run-no-git', startedAt: 1 })
    expect(result.mode).toBe('shared-workspace-fallback')
    expect(result.fallbackReason).toContain('not a Git repository')
    expect(registered).toBe(0)
  })

  it('blocks after workspace registration failure and retains failed Evidence', async () => {
    const { provider, worktrees } = fixture()
    const evidence = new InMemoryEvidenceStore()
    const result = await new WorktreeExecutionCoordinator({
      ...provider,
      registerWorkspace: async () => { throw new Error('registration rejected') },
    }, worktrees, evidence, () => 9).run({ task, project, runId: 'run-register-fail', startedAt: 1 })
    expect(result.mode).toBe('blocked')
    expect(result.run.worktreeId).toBe('wt-1')
    expect(result.run.evidenceId).toBe('ev-run-register-fail')
    expect(evidence.get('ev-run-register-fail')).toMatchObject({ resultStatus: 'failed', worktreeId: 'wt-1' })
    expect(evidence.get('ev-run-register-fail')?.audit.at(-1)).toMatchObject({ action: 'evidence', status: 'failed' })
  })

  it('blocks on Session creation failure and CWD drift without prompting', async () => {
    const first = fixture()
    const createEvidenceStore = new InMemoryEvidenceStore()
    const createResult = await new WorktreeExecutionCoordinator({
      ...first.provider,
      createSession: async () => { throw new Error('session rejected') },
    }, first.worktrees, createEvidenceStore, () => 9).run({ task, project, runId: 'run-session-fail', startedAt: 1 })
    expect(createResult.mode).toBe('blocked')
    expect(createEvidenceStore.get('ev-run-session-fail')?.resultStatus).toBe('failed')

    const second = fixture()
    let prompts = 0
    second.session.cwd = 'C:/wrong/main-checkout'
    second.session.prompt = async () => { prompts += 1; return { ok: true } }
    const cwdEvidence = new InMemoryEvidenceStore()
    const cwdResult = await new WorktreeExecutionCoordinator(second.provider, second.worktrees, cwdEvidence, () => 9).run({ task, project, runId: 'run-cwd-drift', startedAt: 1 })
    expect(cwdResult.mode).toBe('blocked')
    expect(cwdResult.fallbackReason).toMatch(/CWD/u)
    expect(cwdEvidence.get('ev-run-cwd-drift')?.resultStatus).toBe('failed')
    expect(prompts).toBe(0)
  })

  it('writes failed Evidence when the provider Session fails', async () => {
    const { provider, worktrees, session, emit } = fixture({ complete: false })
    session.prompt = async () => {
      queueMicrotask(() => { emit({ type: 'failed', resultStatus: 'failed', error: 'tool failed' }) })
      return { ok: true }
    }
    const evidence = new InMemoryEvidenceStore()
    const result = await new WorktreeExecutionCoordinator(provider, worktrees, evidence, () => 20).run({ task, project, runId: 'run-provider-fail', startedAt: 1 })
    expect(result.run.resultStatus).toBe('failed')
    expect(evidence.get('ev-run-provider-fail')).toMatchObject({ resultStatus: 'failed', dirty: true })
    expect(evidence.get('ev-run-provider-fail')?.runtimeProviderEvidence.note).toBe('tool failed')
  })

  it('still writes Evidence when Session observation or Git inspection throws', async () => {
    const first = fixture({ complete: false })
    first.session.subscribe = () => { throw new Error('observer unavailable') }
    const observationEvidence = new InMemoryEvidenceStore()
    const observationResult = await new WorktreeExecutionCoordinator(first.provider, first.worktrees, observationEvidence, () => 20).run({ task, project, runId: 'run-observe-fail', startedAt: 1 })
    expect(observationResult.run.resultStatus).toBe('failed')
    expect(observationEvidence.get('ev-run-observe-fail')?.runtimeProviderEvidence.note).toContain('observer unavailable')

    const second = fixture()
    const inspectionEvidence = new InMemoryEvidenceStore()
    const inspectionResult = await new WorktreeExecutionCoordinator(second.provider, {
      ...second.worktrees,
      getWorktreeStatus: async () => { throw new Error('status unavailable') },
      diffWorktree: async () => { throw new Error('diff unavailable') },
    }, inspectionEvidence, () => 20).run({ task, project, runId: 'run-inspect-fail', startedAt: 1 })
    expect(inspectionResult.run.resultStatus).toBe('awaiting-review')
    expect(inspectionEvidence.get('ev-run-inspect-fail')?.runtimeProviderEvidence.note).toContain('status unavailable')
    expect(inspectionEvidence.get('ev-run-inspect-fail')?.runtimeProviderEvidence.note).toContain('diff unavailable')
  })

  it('cancels only the Session and leaves Worktree cleanup to review', async () => {
    const { provider, worktrees } = fixture({ complete: false })
    const evidence = new InMemoryEvidenceStore()
    const coordinator = new WorktreeExecutionCoordinator(provider, worktrees, evidence)
    const promise = coordinator.run({ task, project, runId: 'run-cancel', startedAt: 1 })
    await Promise.resolve()
    expect(await coordinator.cancel('run-cancel')).toBe(true)
    const result = await promise
    expect(result.run.resultStatus).toBe('cancelled')
    expect(evidence.get('ev-run-cancel')).toMatchObject({ resultStatus: 'cancelled', worktreeId: 'wt-1' })
  })

  it('answers false for a settled run instead of queueing a stale cancellation', async () => {
    const { provider, worktrees } = fixture()
    const coordinator = new WorktreeExecutionCoordinator(provider, worktrees, new InMemoryEvidenceStore())
    await coordinator.run({ task, project, runId: 'run-settled-cancel', startedAt: 1 })
    expect(await coordinator.cancel('run-settled-cancel')).toBe(false)
    // A retry with the same run id must not inherit the stale cancellation.
    const retried = await coordinator.run({ task, project, runId: 'run-settled-cancel', startedAt: 2 })
    expect(retried.run.resultStatus).toBe('awaiting-review')
  })

  it('reconciles a persisted Session without creating a second Worktree or prompt', async () => {
    const { provider, worktrees, session } = fixture({ complete: false })
    let prompts = 0
    let creates = 0
    const recovered: ProviderSession = { ...session, prompt: async () => { prompts += 1; return { ok: true } } }
    const reconciler: RuntimeProviderBoundary = {
      ...provider,
      createSession: async () => { creates += 1; return recovered },
      getSession: async () => recovered,
    }
    const coordinator = new WorktreeExecutionCoordinator(reconciler, worktrees, new InMemoryEvidenceStore())
    const result = await coordinator.reconcile([{
      runId: 'run-recovered', sessionId: 'session-1', workspaceId: project.workspaceId,
      worktreeId: 'wt-1', baseRevision: 'base', startedAt: 1, resultStatus: 'running', runtimeProviderEvidence: {},
    }], new Map([[project.id, project]]))
    expect(result[0]?.mode).toBe('git-worktree')
    expect(result[0]?.run.resultStatus).toBe('running')
    expect(prompts).toBe(0)
    expect(creates).toBe(0)
  })

  it('resumes a recovered Session to Evidence without creating or prompting again', async () => {
    const { provider, worktrees, session, emit, events } = fixture({ complete: false })
    let prompts = 0
    let sessionsCreated = 0
    let worktreesCreated = 0
    const recovered: ProviderSession = { ...session, prompt: async () => { prompts += 1; return { ok: true } } }
    const coordinator = new WorktreeExecutionCoordinator({
      ...provider,
      createSession: async () => { sessionsCreated += 1; return recovered },
      getSession: async () => recovered,
    }, {
      ...worktrees,
      createWorktree: async (input) => { worktreesCreated += 1; return worktrees.createWorktree(input) },
    }, new InMemoryEvidenceStore(), () => 30)
    const run: TaskRunReference = {
      runId: 'run-resume', sessionId: recovered.sessionId, workspaceId: project.workspaceId,
      worktreeId: 'wt-1', baseRevision: 'base', startedAt: 1, resultStatus: 'running', runtimeProviderEvidence: {},
    }
    const persisted = { ...task, status: 'running' as const, runs: [run] }
    const pending = coordinator.reconcileTask(persisted, { id: 'run-resume', runId: 'run-resume', sessionId: recovered.sessionId, startedAt: 1, endedAt: undefined, result: undefined, error: undefined }, project)
    for (let index = 0; index < 10 && events.size === 0; index += 1) await Promise.resolve()
    expect(events.size).toBe(1)
    emit({ type: 'completed', resultStatus: 'succeeded' })
    const result = await pending
    expect(result?.run.resultStatus).toBe('awaiting-review')
    expect(result?.run.evidenceId).toBe('ev-run-resume')
    expect(prompts).toBe(0)
    expect(sessionsCreated).toBe(0)
    expect(worktreesCreated).toBe(0)
  })

  it('closes a missing recovered Session as cancelled Evidence and retains the Worktree', async () => {
    const { provider, worktrees } = fixture({ complete: false })
    const evidence = new InMemoryEvidenceStore()
    const coordinator = new WorktreeExecutionCoordinator({ ...provider, getSession: async () => undefined }, worktrees, evidence, () => 30)
    const run: TaskRunReference = {
      runId: 'run-gone', sessionId: 'session-gone', workspaceId: project.workspaceId,
      worktreeId: 'wt-1', baseRevision: 'base', startedAt: 1, resultStatus: 'running', runtimeProviderEvidence: {},
    }
    const result = await coordinator.reconcileTask({ ...task, status: 'running', runs: [run] }, { id: 'run-gone', runId: 'run-gone', sessionId: 'session-gone', startedAt: 1, endedAt: undefined, result: undefined, error: undefined }, project)
    expect(result?.mode).toBe('blocked')
    expect(result?.run.resultStatus).toBe('cancelled')
    expect(evidence.get('ev-run-gone')?.audit.at(-1)).toMatchObject({ action: 'reconcile', status: 'blocked' })
  })

  it('closes a registry failure as cancelled Evidence without creating or prompting again', async () => {
    const { provider, worktrees } = fixture({ complete: false })
    const evidence = new InMemoryEvidenceStore()
    let creates = 0
    const coordinator = new WorktreeExecutionCoordinator({ ...provider, getSession: async () => { throw new Error('must not look up a Session') } }, {
      ...worktrees,
      createWorktree: async (input) => { creates += 1; return worktrees.createWorktree(input) },
      listWorktrees: async () => { throw new Error('registry unavailable') },
    }, evidence, () => 30)
    const run: TaskRunReference = {
      runId: 'run-registry-fail', sessionId: 'session-1', workspaceId: project.workspaceId,
      worktreeId: 'wt-1', baseRevision: 'base', startedAt: 1, resultStatus: 'running', runtimeProviderEvidence: {},
    }
    const result = await coordinator.reconcileTask({ ...task, status: 'running', runs: [run] }, { id: run.runId, runId: run.runId, sessionId: run.sessionId, startedAt: 1, endedAt: undefined, result: undefined, error: undefined }, project)
    expect(result?.mode).toBe('blocked')
    expect(result?.run.resultStatus).toBe('cancelled')
    expect(result?.fallbackReason).toContain('registry unavailable')
    expect(evidence.get('ev-run-registry-fail')?.audit.at(-1)).toMatchObject({ action: 'reconcile', status: 'blocked' })
    expect(creates).toBe(0)
  })
})

describe('Evidence bounds', () => {
  it('limits file rows and previews while keeping binary files as summaries', () => {
    const preview = '汉'.repeat(30 * 1024)
    const evidence = collectEvidence({
      evidenceId: 'ev-large', runId: 'run-large', workspaceId: 'workspace-1', startedAt: 1,
      resultStatus: 'awaiting-review', status: { clean: false, dirty: true },
      diff: {
        files: [
          { path: 'asset.bin', binary: true },
          ...Array.from({ length: 510 }, (_, index) => ({ path: `src/file-${index}.ts`, additions: 1, deletions: 0 })),
        ],
        additions: 510, deletions: 0, preview, previewTruncated: false,
      },
    })
    expect(evidence.changedFiles).toHaveLength(500)
    expect(evidence.changedFiles[0]).toMatchObject({ path: 'asset.bin', status: 'binary', binary: true })
    expect(new TextEncoder().encode(evidence.preview ?? '').byteLength).toBeLessThanOrEqual(64 * 1024)
    expect(evidence.diffCache?.truncated).toBe(true)
  })
})

describe('EvidenceReviewService', () => {
  it('requires a second discard confirmation and records review audit', async () => {
    const evidence = new InMemoryEvidenceStore()
    evidence.put({
      evidenceId: 'ev-review', runId: 'run-review', workspaceId: 'workspace-1', worktreeId: 'wt-1',
      changedFiles: [], additions: 0, deletions: 0, clean: false, dirty: true,
      resultStatus: 'awaiting-review', startedAt: 1, diffSource: 'git-graph', runtimeProviderEvidence: {}, audit: [],
    })
    const removed: unknown[] = []
    const review = new EvidenceReviewService({
      store: evidence,
      worktrees: {
        commitWorktree: async () => ({ ok: true, value: { revision: 'commit' } }),
        mergeWorktree: async () => ({ ok: true, value: { revision: 'merge' } }),
        removeWorktree: async input => { removed.push(input); return { ok: true, value: {} } },
      },
      now: () => 2,
    })
    expect((await review.discard('ev-review', false)).ok).toBe(false)
    expect((await review.discard('ev-review', true)).ok).toBe(true)
    expect(removed).toHaveLength(1)
    expect(evidence.get('ev-review')?.resultStatus).toBe('discarded')
    expect(evidence.get('ev-review')?.audit.at(-1)?.action).toBe('discard')
  })

  it('enforces transitions before Host mutation and audits commit, merge, keep, and failures', async () => {
    const evidence = new InMemoryEvidenceStore()
    const base = (evidenceId: string, status: Evidence['resultStatus']): Evidence => ({
      evidenceId, runId: evidenceId.replace('ev-', 'run-'), workspaceId: 'workspace-1', worktreeId: 'wt-1',
      changedFiles: [], additions: 0, deletions: 0, clean: false, dirty: true,
      resultStatus: status, startedAt: 1, diffSource: 'git-graph', runtimeProviderEvidence: {}, audit: [],
    })
    evidence.put(base('ev-flow', 'awaiting-review'))
    evidence.put(base('ev-keep', 'awaiting-review'))
    evidence.put(base('ev-failed', 'failed'))
    let commits = 0
    let merges = 0
    const review = new EvidenceReviewService({
      store: evidence,
      worktrees: {
        commitWorktree: async () => { commits += 1; return { ok: true, value: { revision: 'commit-1' } } },
        mergeWorktree: async () => { merges += 1; return { ok: true, value: { revision: 'merge-1' } } },
        removeWorktree: async () => ({ ok: true, value: {} }),
      },
      now: () => 2,
    })
    expect((await review.commit('ev-failed', 'must block')).ok).toBe(false)
    expect(commits).toBe(0)
    expect(evidence.get('ev-failed')?.audit.at(-1)).toMatchObject({ action: 'commit', status: 'blocked' })

    expect((await review.commit('ev-flow', 'accept')).status).toBe('accepted')
    expect((await review.merge('ev-flow', 'main')).status).toBe('accepted')
    expect(commits).toBe(1)
    expect(merges).toBe(1)
    expect(evidence.get('ev-flow')?.audit.map(entry => entry.action)).toEqual(['commit', 'merge'])

    expect((await review.keep('ev-keep')).status).toBe('kept')
    expect(evidence.get('ev-keep')?.audit.at(-1)).toMatchObject({ action: 'keep', status: 'ok' })
  })
})
