// @vitest-environment jsdom
/**
 * Branch picker tests: the native session composer toolbar renders the
 * branch chip from the session baseline, non-repository workspaces (and
 * sessions without a cwd) hide it, blank (hero) sessions keep it mounted,
 * the popover searches/filters and marks the current branch, the footer
 * flows fire the right verbs, switch rejections surface readable copy, and
 * the create/graph dialogs behave (validation, duplicate copy, lane
 * rendering).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type { BranchesView, GraphView, RepoStatus, SwitchResult } from '../src/core/types.ts'
import type { GitGraphInjected } from '../src/client/index.ts'
import type { BranchChipProps } from '../src/client/chips/BranchChip.tsx'
import { BranchChip } from '../src/client/chips/BranchChip.tsx'
import { zh, type GitGraphKey } from '../src/client/locales.ts'

afterEach(cleanup)

const sid = (value: string): SessionId => value as SessionId

/** Minimal translate over the zh dictionary (template params included). */
function makeTranslate(): BranchChipProps['t'] {
  return (key, params) => {
    let text = zh[key as GitGraphKey] ?? key
    if (params !== undefined) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value))
      }
    }
    return text
  }
}

interface BenchOptions {
  cwd?: string
  blank?: boolean
  repoStatus?: RepoStatus | null
  branchesView?: BranchesView | null
  switchResult?: SwitchResult
  createResult?: SwitchResult
  graphView?: GraphView | null
  /** Override the graph verb (e.g. a deferred promise for the loading state). */
  graph?: (limit?: number) => Promise<GraphView | null>
}

/** Render the branch chip with stub framework hooks and a scripted inject face. */
function bench(options: BenchOptions = {}) {
  const sessionId = sid('sess-1')
  const cwd = 'cwd' in options ? options.cwd : '/ws/proj'
  const repoStatus = options.repoStatus === undefined
    ? { root: '/ws/proj', branch: 'main', head: 'abc1234', dirtyFiles: 0, untrackedFiles: 0, conflicts: 0, operationInProgress: false }
    : options.repoStatus
  const branchesView = options.branchesView === undefined
    ? {
      root: '/ws/proj', branch: 'main',
      branches: [
        { name: 'feature/x', current: false },
        { name: 'main', current: true },
      ],
      dirtyFiles: 0, untrackedFiles: 0, conflicts: 0, operationInProgress: false,
    }
    : options.branchesView

  const calls: Record<string, unknown[]> = {
    repoStatus: [], branches: [], switchBranch: [], createBranch: [], graph: [],
    subscribeChanges: [],
  }
  const record = <K extends keyof typeof calls>(key: K, ...args: unknown[]): void => {
    calls[key].push(args)
  }

  const injected: GitGraphInjected = {
    // The picker queries the host after the workspace is available.
    repoStatus: vi.fn(async (sessionId: SessionId | undefined) => { record('repoStatus', sessionId); return repoStatus }),
    branches: vi.fn(async (sessionId: SessionId | undefined) => { record('branches', sessionId); return cwd === undefined ? null : branchesView }),
    switchBranch: vi.fn(async (sessionId: SessionId | undefined, branch: string): Promise<SwitchResult> => {
      record('switchBranch', sessionId, branch)
      return options.switchResult ?? { ok: true, branch }
    }),
    createBranch: vi.fn(async (sessionId: SessionId | undefined, name: string): Promise<SwitchResult> => {
      record('createBranch', sessionId, name)
      return options.createResult ?? { ok: true, branch: name }
    }),
    graph: vi.fn(async (sessionId: SessionId | undefined, limit?: number) => {
      record('graph', sessionId, limit)
      return options.graph !== undefined ? options.graph(limit) : options.graphView ?? null
    }),
    subscribeChanges: vi.fn((sessionId: SessionId | undefined, _onChange: () => void) => { record('subscribeChanges', sessionId); return () => {} }),
  }

  const sessionsState = {
    byId: { [sessionId]: { cwd, blank: options.blank === true } },
  }
  const unusedSelector = (): never => { throw new Error('Unexpected SDK selector') }
  const props: BranchChipProps = {
    sessionId,
    useSession: unusedSelector,
    useSessions: ((selector: (state: typeof sessionsState) => unknown) => selector(sessionsState)) as never,
    useWorkspaces: unusedSelector,
    useProjection: unusedSelector,
    useAccess: unusedSelector,
    useInput: unusedSelector,
    useConversation: unusedSelector,
    useRemoteAccess: unusedSelector,
    useSessionRetainInfo: unusedSelector,
    useSessionAccess: unusedSelector,
    inputActions: undefined,
    t: makeTranslate(),
    ...injected,
  }
  const view = render(<BranchChip {...props} />)
  return { view, injected, calls, props, sessionsState }
}

describe('BranchChip', () => {
  it.each([false, true])('shows a single icon for the current session branch (blank = %s)', async blank => {
    bench({ blank })
    const trigger = await screen.findByRole('button', { name: '分支：main' })
    expect(trigger.title).toBe('分支：main')
    expect(trigger.textContent).toBe('')
    expect(trigger.querySelector('svg')).not.toBeNull()
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.tabIndex).toBe(0)
  })

  it('restores the active worktree control when the sessions baseline arrives after mount', async () => {
    const { view, props, sessionsState, calls } = bench({ cwd: undefined })
    expect(screen.queryByRole('button')).toBeNull()
    expect(calls.repoStatus).toEqual([])
    sessionsState.byId[sid('sess-1')]!.cwd = '/ws/late'
    view.rerender(<BranchChip {...props} />)
    await screen.findByRole('button', { name: '分支：main' })
    expect(calls.subscribeChanges).toEqual([['sess-1']])
  })

  it('shows detached HEAD in the accessible control and picker', async () => {
    const status = { root: '/ws/proj', branch: '', head: 'abc', dirtyFiles: 0, untrackedFiles: 0, conflicts: 0, operationInProgress: false }
    bench({ repoStatus: status, branchesView: { ...status, branches: [] } })
    const trigger = await screen.findByRole('button', { name: '分支：分离 HEAD' })
    fireEvent.click(trigger)
    expect(await screen.findByText('分离 HEAD')).toBeTruthy()
  })

  it('keeps one toolbar item while a long branch name and the open picker are shown', async () => {
    const branch = 'feature/expand-the-session-workspace-search-index'
    const status = { root: '/ws/proj', branch, head: 'abc', dirtyFiles: 0, untrackedFiles: 0, conflicts: 0, operationInProgress: false }
    const { view } = bench({ repoStatus: status, branchesView: { ...status, branches: [{ name: branch, current: true }] } })
    const trigger = await screen.findByRole('button', { name: '分支：' + branch })
    expect(trigger.title).toContain(branch)
    expect(trigger.textContent).toBe('')
    fireEvent.click(trigger)
    const row = await screen.findByRole('menuitem', { name: branch })
    expect(view.container.children).toHaveLength(1)
    expect(view.container.contains(row)).toBe(false)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('refetches status and closes the previous picker when its session changes cwd', async () => {
    const { view, props, sessionsState, injected } = bench()
    fireEvent.click(await screen.findByRole('button', { name: '分支：main' }))
    await screen.findByRole('searchbox')
    sessionsState.byId[sid('sess-1')]!.cwd = '/ws/next'
    vi.mocked(injected.repoStatus).mockResolvedValueOnce({
      root: '/ws/next', branch: 'release', head: 'def', dirtyFiles: 0, untrackedFiles: 0, conflicts: 0, operationInProgress: false,
    })
    view.rerender(<BranchChip {...props} />)
    expect(await screen.findByRole('button', { name: '分支：release' })).toBeTruthy()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(injected.subscribeChanges).toHaveBeenCalledTimes(2)
  })

  it('lets a subsequent click retry a branch list that was temporarily unavailable', async () => {
    const { injected } = bench()
    const trigger = await screen.findByRole('button', { name: '分支：main' })
    vi.mocked(injected.branches).mockResolvedValueOnce(null)
    await act(async () => { fireEvent.click(trigger) })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(trigger)
    expect(await screen.findByRole('menuitem', { name: 'main' })).toBeTruthy()
    expect(injected.branches).toHaveBeenCalledTimes(2)
  })

  it.each(['graph', 'create'])('keeps branch "%s" distinct from the footer actions', async name => {
    const { calls } = bench({ branchesView: {
      root: '/ws/proj', branch: 'main', dirtyFiles: 0, untrackedFiles: 0, conflicts: 0, operationInProgress: false,
      branches: [{ name: 'main', current: true }, { name, current: false }],
    } })
    fireEvent.click(await screen.findByRole('button', { name: '分支：main' }))
    fireEvent.click(await screen.findByRole('menuitem', { name }))
    await screen.findByRole('status')
    expect(calls.switchBranch).toEqual([['sess-1', name]])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('supports keyboard focus, branch search and Escape through the native menu', async () => {
    bench()
    const trigger = await screen.findByRole('button', { name: '分支：main' })
    trigger.focus()
    fireEvent.click(trigger)
    const search = await screen.findByRole('searchbox', { name: '搜索分支' })
    fireEvent.change(search, { target: { value: 'feature' } })
    expect(screen.getByRole('menuitem', { name: 'feature/x' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'main' })).toBeNull()
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(screen.queryByRole('menuitem', { name: 'feature/x' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('hides the branch chip when the workspace is not a git repository', async () => {
    bench({ repoStatus: null })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('hides the branch chip without a session cwd (cold start)', async () => {
    bench({ cwd: undefined })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('switches a branch from the list and closes on success', async () => {
    const { injected, calls } = bench()
    fireEvent.click(await screen.findByRole('button', { name: '分支：main' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'feature/x' }))
    expect(calls.switchBranch).toEqual([['sess-1', 'feature/x']])
    expect(await screen.findByText('已切换到分支 feature/x')).toBeTruthy()
    expect(injected.switchBranch).toHaveBeenCalled()
  })

  it('shows readable copy when a switch is rejected', async () => {
    bench({
      switchResult: { ok: false, error: { code: 'conflicts-present', message: 'conflicts' } },
    })
    fireEvent.click(await screen.findByRole('button', { name: '分支：main' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'feature/x' }))
    expect(await screen.findByText('当前仓库还有未解决的冲突，先处理完再切换分支。')).toBeTruthy()
  })

  it('shows the overwrite copy with blocked paths', async () => {
    bench({
      switchResult: {
        ok: false,
        error: { code: 'untracked-changes-would-be-overwritten', message: 'blocked', paths: ['a.txt'], moreFiles: 2 },
      },
    })
    fireEvent.click(await screen.findByRole('button', { name: '分支：main' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'feature/x' }))
    expect(await screen.findByText(/未跟踪文件会被目标分支覆盖："a.txt" 等另外 2 个文件/)).toBeTruthy()
  })

  it('creates a branch through the dialog with validation copy', async () => {
    const { injected } = bench()
    fireEvent.click(await screen.findByRole('button', { name: '分支：main' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /创建并检出新分支/ }))
    const input = screen.getByLabelText('分支名')
    fireEvent.change(input, { target: { value: 'bad name' } })
    fireEvent.click(screen.getByRole('button', { name: '创建并切换' }))
    expect(await screen.findByText('分支名无效，请重新输入。')).toBeTruthy()
    expect(injected.createBranch).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: 'feature/good' } })
    fireEvent.click(screen.getByRole('button', { name: '创建并切换' }))
    expect(injected.createBranch).toHaveBeenCalledWith(sid('sess-1'), 'feature/good')
  })

  it('shows duplicate-name copy from the host', async () => {
    bench({
      createResult: { ok: false, error: { code: 'branch-already-exists', message: 'dup' } },
    })
    fireEvent.click(await screen.findByRole('button', { name: '分支：main' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /创建并检出新分支/ }))
    fireEvent.change(screen.getByLabelText('分支名'), { target: { value: 'feature/x' } })
    fireEvent.click(screen.getByRole('button', { name: '创建并切换' }))
    expect(await screen.findByText('分支已存在，请换一个名称。')).toBeTruthy()
  })

  it('opens the graph from the checkpoint modal only in the current session and workspace', async () => {
    const { calls } = bench()
    await screen.findByRole('button', { name: '分支：main' })
    const navigate = (sessionId: string, cwd: string) => act(() => {
      window.dispatchEvent(new CustomEvent('dsh:open-project-git-graph', { detail: { sessionId, cwd } }))
    })
    navigate('different-session', '/ws/proj')
    navigate('sess-1', '/ws/other')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(calls.graph).toEqual([])
    navigate('sess-1', '/ws/proj')
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(calls.graph).toEqual([['sess-1', 200]])
    expect(calls.switchBranch).toEqual([])
  })

  it('renders the Git graph with lanes, refs, and load-more', async () => {
    const graphView: GraphView = {
      root: '/ws/proj', branch: 'main',
      commits: [
        { oid: 'aabbcc', parents: ['ddeeff'], subject: 'merge work', author: 'Alice', authorTime: 1700000000, refs: ['main', 'v1'] },
        { oid: 'ddeeff', parents: [], subject: 'root commit', author: 'Bob', authorTime: 1690000000, refs: [] },
      ],
      hasMore: true,
    }
    const { calls } = bench({ graphView })
    fireEvent.click(await screen.findByRole('button', { name: '分支：main' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Git 图谱' }))
    const dialog = await screen.findByRole('dialog', { name: 'Git 图谱' })
    expect(dialog.textContent).toContain('merge work')
    expect(dialog.textContent).toContain('2 个提交')
    expect(calls.graph).toEqual([['sess-1', 200]])
    // Refs render as pills; the current branch is highlighted.
    expect(dialog.querySelectorAll('[class*="graphRef"]')).toHaveLength(2)
    expect(dialog.querySelectorAll('[class*="graphRefCurrent"]')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }))
    expect(calls.graph).toEqual([['sess-1', 200], ['sess-1', 102]])
  })

  it('shows a loading hint before the first graph response', async () => {
    let resolveGraph!: (view: GraphView) => void
    bench({
      graph: () => new Promise<GraphView>((resolve) => { resolveGraph = resolve }),
    })
    fireEvent.click(await screen.findByRole('button', { name: '分支：main' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Git 图谱' }))
    expect(await screen.findByText('加载中…')).toBeTruthy()
    resolveGraph({
      root: '/ws/proj', branch: 'main',
      commits: [
        { oid: 'aabbcc', parents: [], subject: 'root commit', author: 'Bob', authorTime: 1690000000, refs: [] },
      ],
      hasMore: false,
    })
    expect(await screen.findByText('root commit')).toBeTruthy()
  })

  it('throttles focus refetches to one per 5s window', async () => {
    // now starts past the initial lastFocusRefetch (0) so the FIRST focus is
    // the one consumed by the throttle window (a second burst focus is held).
    vi.useFakeTimers({ now: 10_000 })
    try {
      const { injected } = bench()
      // Flush the initial mount load so the throttle deltas are relative to it.
      await act(async () => {})
      const initialCalls = vi.mocked(injected.repoStatus).mock.calls.length

      await act(async () => { window.dispatchEvent(new Event('focus')) })
      await act(async () => {})
      expect(injected.repoStatus).toHaveBeenCalledTimes(initialCalls + 1)

      // A second focus inside the 5s window is throttled: no new call.
      await act(async () => { window.dispatchEvent(new Event('focus')) })
      await act(async () => {})
      expect(injected.repoStatus).toHaveBeenCalledTimes(initialCalls + 1)

      // The window elapses; the next focus refetches again.
      await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
      await act(async () => { window.dispatchEvent(new Event('focus')) })
      await act(async () => {})
      expect(injected.repoStatus).toHaveBeenCalledTimes(initialCalls + 2)
    } finally {
      vi.useRealTimers()
    }
  })
})
