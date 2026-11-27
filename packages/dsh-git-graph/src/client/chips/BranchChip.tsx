/** Session-scoped branch selector and entry to the Git graph. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconBranchOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BranchSlotProps } from '../slot-contracts.ts'
import type { BranchesView, GraphView, RepoStatus, SwitchResult } from '../../core/types.ts'
import { Chip } from './Chip.tsx'
import { BranchPopover } from './BranchPopover.tsx'
import { CreateBranchDialog } from './CreateBranchDialog.tsx'
import { GraphDialog } from '../graph/GraphDialog.tsx'
import css from './context.module.css'

type SessionId = NonNullable<BranchSlotProps['sessionId']>

/** Injected business face of the branch chip: git verbs, keyed by the current session id. */
export interface GitGraphInjected {
  /** The workspace repository snapshot; null when not a repository. */
  repoStatus: (sessionId: SessionId | undefined) => Promise<RepoStatus | null>
  /** Local branch list with the current branch marked. */
  branches: (sessionId: SessionId | undefined) => Promise<BranchesView | null>
  /** Workspace-level `git switch --no-guess <branch>`. */
  switchBranch: (sessionId: SessionId | undefined, branch: string) => Promise<SwitchResult>
  /** `git switch --no-guess -c <name>` from the current HEAD. */
  createBranch: (sessionId: SessionId | undefined, name: string) => Promise<SwitchResult>
  /** Topo-ordered commit graph. */
  graph: (sessionId: SessionId | undefined, limit?: number) => Promise<GraphView | null>
  /** Host-pushed branch-state changes for the session's workspace. */
  subscribeChanges: (sessionId: SessionId | undefined, onChange: () => void) => () => void
}

export type BranchChipProps = BranchSlotProps & GitGraphInjected

/** Minimum gap between window-focus git refetches (ms). */
export const FOCUS_REFRESH_MIN_MS = 5_000

export function BranchChip(props: BranchChipProps) {
  const sessionId = props.sessionId
  const workspaceCwd = props.useSessions(state =>
    sessionId === undefined ? undefined : state.byId[sessionId]?.cwd)
  if (sessionId === undefined || !workspaceCwd) return null
  return <WorkspaceBranchChip key={JSON.stringify([sessionId, workspaceCwd])}
    {...props} sessionId={sessionId} workspaceCwd={workspaceCwd} />
}

/** Keep status, event streams and open dialogs scoped to one live worktree. */
function WorkspaceBranchChip(props: BranchChipProps & { sessionId: SessionId; workspaceCwd: string }) {
  const { sessionId, workspaceCwd } = props
  /** Repository state: undefined = loading, null = not a repository, else the snapshot. */
  const [repo, setRepo] = useState<RepoStatus | null | undefined>(undefined)
  /** Fresh branch list, fetched when the branch popover opens. */
  const [branchesView, setBranchesView] = useState<BranchesView | null>(null)
  const [branchOpen, setBranchOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [graphOpen, setGraphOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!repo) return
    const openProjectGraph = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const detail = event.detail as { sessionId?: string; cwd?: string } | undefined
      if (detail?.sessionId !== sessionId || detail.cwd !== workspaceCwd) return
      setBranchOpen(false)
      setGraphOpen(true)
    }
    window.addEventListener('dsh:open-project-git-graph', openProjectGraph)
    return () => window.removeEventListener('dsh:open-project-git-graph', openProjectGraph)
  }, [repo, sessionId, workspaceCwd])

  const refetch = useCallback(() => {
    let live = true
    props.repoStatus(sessionId)
      .then((status) => { if (live) setRepo(status) })
      .catch(() => { if (live) setRepo(null) })
    return () => { live = false }
  }, [props.repoStatus, sessionId])

  // Initial load + host-pushed external changes + focus refresh. A session
  // switch changes props.sessionId and re-fetches through the session-keyed
  // verbs. Focus refetches are throttled (a focus burst would otherwise
  // spawn a full git status round-trip per event; the host poll and SSE
  // pushes already keep the chip fresh within 30s).
  const lastFocusRefetch = useRef(0)
  useEffect(() => refetch(), [refetch])
  useEffect(() => {
    const unsubscribe = props.subscribeChanges(sessionId, () => { refetch() })
    const onFocus = (): void => {
      const now = Date.now()
      if (now - lastFocusRefetch.current < FOCUS_REFRESH_MIN_MS) return
      lastFocusRefetch.current = now
      refetch()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      unsubscribe()
      window.removeEventListener('focus', onFocus)
    }
  }, [props.subscribeChanges, sessionId, refetch])

  const closeCreate = (): void => {
    setCreateOpen(false)
    refetch()
  }

  // Fetch the fresh branch list each time the popover opens. All hooks stay
  // above the data-gated returns so the hook order is stable while `repo`
  // settles from undefined (loading) to a snapshot.
  useEffect(() => {
    if (!branchOpen) return
    let live = true
    props.branches(sessionId).then((view) => {
      if (!live) return
      setBranchesView(view)
      if (view === null) setBranchOpen(false)
    }).catch(() => { if (live) setBranchOpen(false) })
    return () => { live = false }
  }, [branchOpen, props.branches, sessionId])

  // Loading or not a repository: no chip (no dead control). A workspace that
  // becomes a repository appears on the next refresh.
  if (repo === undefined || repo === null) return null

  const branchName = repo.branch || props.t('branch.detached')
  const label = props.t('chip.branchName', { branchName })

  return (
    <span className={css.toolbarControl}>
      <Chip icon={<IconBranchOutlineMedium size={14} />} label={label} ariaLabel={label}
        buttonRef={triggerRef} open={branchOpen && branchesView !== null} onClick={() => {
          setBranchesView(null)
          setBranchOpen(open => !open)
        }} />
      {branchOpen && branchesView !== null && (
        <BranchPopover
          anchorRef={triggerRef}
          view={branchesView}
          onSwitch={(branch) => props.switchBranch(sessionId, branch)}
          onSwitched={refetch}
          onCreate={() => {
            setBranchOpen(false)
            setCreateOpen(true)
          }}
          onGraph={() => {
            setBranchOpen(false)
            setGraphOpen(true)
          }}
          onClose={() => { setBranchOpen(false) }}
          t={props.t}
        />
      )}
      {createOpen && createPortal(
        <CreateBranchDialog
          onCreate={(name) => props.createBranch(sessionId, name)}
          onClose={closeCreate}
          t={props.t}
        />, document.body
      )}
      {graphOpen && createPortal(
        <GraphDialog
          graph={(limit) => props.graph(sessionId, limit)}
          onClose={() => { setGraphOpen(false) }}
          t={props.t}
        />, document.body
      )}
    </span>
  )
}
