import { describe, expect, it } from 'vitest'

import { createDesktopTaskBoardHostScheduleRunner } from '../src/background-scheduler-runner.ts'

const input = {
  task: { prompt: 'Summarize the current workspace.' },
  project: { workspaceId: 'workspace-1', defaultIsolation: 'shared-workspace' as const },
  executionKey: 'schedule-task-1',
  run: {
    runId: 'schedule-task-1',
    workspaceId: 'workspace-1',
    startedAt: 100,
    resultStatus: 'running',
  },
}

function fixture({
  reason = { kind: 'completed' },
  workspace = true,
  workspaceStatus = 'ok',
  model = true,
  persisted = false,
  persistedPrompt = false,
} = {}) {
  const calls: Record<string, unknown[]> = { create: [], resume: [], followup: [], flush: [], dispose: [] }
  const session = {
    seq: persistedPrompt ? 5 : 4,
    events: [
      { seq: 4, type: 'turn/start', data: { turn: 1 } },
      ...(persistedPrompt
        ? [{
            seq: 5,
            type: 'user/message',
            data: {
              content: [{ type: 'text', text: input.task.prompt }],
              source: { kind: 'user' },
            },
          }]
        : []),
      { seq: persistedPrompt ? 6 : 5, type: 'turn/end', data: { turn: 1, reason } },
    ],
    snapshotEvents() {
      return this.events
    },
  }
  const agent = {
    id: 'task-board-session-1',
    session,
    whenIdle: async () => {},
    followup: (message: unknown) => { calls.followup.push(message) },
  }
  const runner = createDesktopTaskBoardHostScheduleRunner({
    agents: {
      create: async (options: unknown) => {
        calls.create.push(options)
        return { agent, dispose: async () => { calls.dispose.push(true) } }
      },
      resume: async (options: unknown) => {
        calls.resume.push(options)
        return { agent, dispose: async () => { calls.dispose.push(true) } }
      },
    } as never,
    defaultModel: { currentSelection: () => model ? ({ provider: 'deepseek', model: 'deepseek-chat' }) : ({ provider: '', model: '' }) } as never,
    sessions: { flush: async (value: unknown) => { calls.flush.push(value); return true } } as never,
    sessionPersistence: {
      list: async () => persisted ? [{ header: { id: 'task-board-session-1' } }] : [],
    } as never,
    workspaceRegistry: {
      get: () => workspace
        ? { path: 'C:\\workspace', status: async () => workspaceStatus }
        : undefined,
    } as never,
    now: () => 500,
    createSessionId: () => 'task-board-session-1',
  })
  return { calls, runner }
}

describe('Desktop Task Board Host scheduler runner', () => {
  it('publishes and applies the same task-scoped ownership boundary before Host admission', async () => {
    const { runner } = fixture()
    expect(runner.taskOwnership).toEqual({
      requiresProject: true,
      requiresPrompt: true,
      supportedIsolationModes: ['shared-workspace'],
    })
    expect(await runner.canOwnTask({ task: input.task, project: input.project })).toBe(true)
    expect(await runner.canOwnTask({ task: input.task })).toBe(false)
    expect(await runner.canOwnTask({
      task: { prompt: input.task.prompt, isolationMode: 'git-worktree' },
      project: input.project,
    })).toBe(false)
    expect(await runner.canOwnTask({
      task: { prompt: input.task.prompt, isolationMode: 'inherit' },
      project: { workspaceId: 'workspace-1', defaultIsolation: 'git-worktree' },
    })).toBe(false)
    expect(await runner.canOwnTask({ task: { prompt: '   ' }, project: input.project })).toBe(false)
    expect(await fixture({ workspace: false }).runner.canOwnTask({ task: input.task, project: input.project })).toBe(false)
    expect(await fixture({ workspaceStatus: 'unavailable' }).runner.canOwnTask({ task: input.task, project: input.project })).toBe(false)
    expect(await fixture({ model: false }).runner.canOwnTask({ task: input.task, project: input.project })).toBe(false)
  })

  it('uses a registered workspace and durable DSH session, then retains the canonical TaskRun key', async () => {
    const { calls, runner } = fixture()
    const result = await runner.run(input)

    expect(result).toMatchObject({
      kind: 'settled',
      outcome: 'succeeded',
      sessionId: 'task-board-session-1',
      workspaceId: 'workspace-1',
      run: {
        runId: 'schedule-task-1',
        resultStatus: 'awaiting-review',
        sessionId: 'task-board-session-1',
        runtimeProviderEvidence: { providerId: 'dsh-cli-provider-v1', sessionCwdVerified: true },
      },
    })
    expect(calls.create).toHaveLength(1)
    expect(calls.create[0]).toMatchObject({
      sessionId: 'task-board-session-1',
      meta: { cwd: 'C:\\workspace' },
      agentOptions: { provider: 'deepseek', model: 'deepseek-chat' },
    })
    expect(calls.followup[0]).toMatchObject({
      content: [{ type: 'text', text: 'Summarize the current workspace.' }],
      source: { kind: 'user' },
    })
    expect(calls.flush).toHaveLength(1)
    expect(calls.dispose).toHaveLength(1)
  })

  it('maps an aborted turn to cancellation and never executes unregistered workspaces', async () => {
    const cancelled = fixture({ reason: { kind: 'aborted', reason: { kind: 'user' } } })
    expect(await cancelled.runner.run(input)).toMatchObject({ kind: 'settled', outcome: 'cancelled' })

    const unavailable = fixture({ workspace: false })
    expect(await unavailable.runner.run(input)).toMatchObject({
      kind: 'settled',
      outcome: 'failed',
      error: 'scheduled task workspace is no longer registered',
    })
    expect(unavailable.calls.create).toHaveLength(0)
  })

  it('resumes the deterministic session for an admitted crash-recovery slot instead of creating another agent', async () => {
    const { calls, runner } = fixture({ persisted: true, persistedPrompt: true })
    const result = await runner.run(input)

    expect(result).toMatchObject({
      kind: 'settled',
      outcome: 'succeeded',
      sessionId: 'task-board-session-1',
      run: { runId: input.executionKey },
    })
    expect(calls.create).toHaveLength(0)
    expect(calls.resume).toEqual([
      expect.objectContaining({
        resumeSessionId: 'task-board-session-1',
        agentOptions: { provider: 'deepseek', model: 'deepseek-chat' },
      }),
    ])
    expect(calls.followup).toHaveLength(0)
  })

  it('fails safely rather than silently converting a Git Worktree task into a shared-directory run', async () => {
    const { calls, runner } = fixture()
    const result = await runner.run({
      ...input,
      task: { prompt: input.task.prompt, isolationMode: 'git-worktree' },
    })
    expect(result).toMatchObject({ kind: 'settled', outcome: 'failed' })
    expect(result.error).toMatch(/Worktree adapter/u)
    expect(calls.create).toHaveLength(0)
  })
})
