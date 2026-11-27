/**
 * The branch picker popover: searchable local branch list with the current
 * branch checked, the dirtiness line, switch feedback (success/error), and
 * the footer flows (create branch / Git graph).
 * @module dsh-git-graph/client/chips/BranchPopover
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { IconBranchOutlineMedium, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { BranchesView, SwitchResult } from '../../core/types.ts'
import type { GitGraphKey } from '../locales.ts'
import { errorMessage } from './error-copy.ts'
import css from './context.module.css'

/** Props of the branch picker popover. */
export interface BranchPopoverProps {
  view: BranchesView
  /** Workspace-level switch verb; resolves to a stable git error on rejection. */
  onSwitch: (branch: string) => Promise<SwitchResult>
  /** Fired after a successful switch (the owner refetches its status). */
  onSwitched: () => void
  /** Open the create-branch dialog. */
  onCreate: () => void
  /** Open the Git graph panel. */
  onGraph: () => void
  /** Close the popover (backdrop / after a successful switch). */
  onClose: () => void
  t: Translate<GitGraphKey>
  /** Open downward from the official hero row (the default opens upward from the dock row). */
  hero?: boolean
  anchorRef?: RefObject<HTMLButtonElement>
}

/** How long the success notice stays before the popover closes itself. */
const SUCCESS_DISMISS_MS = 900

/**
 * The branch picker popover.
 * @param props - see {@link BranchPopoverProps}.
 */
export function BranchPopover({ view, onSwitch, onSwitched, onCreate, onGraph, onClose, t, hero = false, anchorRef }: BranchPopoverProps) {
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => {
    if (dismissTimer.current !== undefined) clearTimeout(dismissTimer.current)
  }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return view.branches
    return view.branches.filter(branch => branch.name.toLowerCase().includes(needle))
  }, [view.branches, query])

  const switchTo = (branch: string): void => {
    if (pending !== null) return
    setPending(branch)
    setError(null)
    setSuccess(null)
    void onSwitch(branch).then((result) => {
      if (result.ok) {
        onSwitched()
        setSuccess(t('toast.switchSuccess', { branchName: result.branch }))
        dismissTimer.current = setTimeout(onClose, SUCCESS_DISMISS_MS)
        return
      }
      setError(errorMessage(result.error, t))
    }).finally(() => { setPending(null) })
  }

  // Prefix only branch IDs: a branch may itself be named "create" or "graph".
  const branchId = (name: string) => `branch/${name}`
  return (
    <Menu open portal={anchorRef !== undefined} anchor={null} anchorRef={anchorRef}
      side={hero ? 'bottom' : 'top'} onClose={onClose}
      isExternalTrigger={node => anchorRef?.current?.contains(node) === true}
      search={{ label: t('branch.search'), value: query, onChange: setQuery, emptyMessage: t('branch.empty') }}
      items={filtered.map(branch => ({
        id: branchId(branch.name), label: branch.name,
        icon: <IconBranchOutlineMedium size={14} />, disabled: pending !== null,
      }))}
      selectedId={branchId(view.branch)}
      footer={[
        { id: 'create', label: t('branch.create') },
        { id: 'graph', label: t('branch.graph') },
      ]}
      onSelect={id => {
        if (id === 'create') onCreate()
        else if (id === 'graph') onGraph()
        else switchTo(id.slice('branch/'.length))
      }}
    >
      {view.branch === '' && <div className={css.branchStatus}>{t('branch.detached')}</div>}
      {view.dirtyFiles > 0 && <div className={css.dirty}>{t('branch.dirty', { count: view.dirtyFiles })}</div>}
      {success !== null && <div role="status" className={`${css.notice} ${css.noticeOk}`}>{success}</div>}
      {error !== null && <div role="alert" className={css.notice}>{error}</div>}
    </Menu>
  )
}
