import { useEffect, useMemo, useRef, useState } from 'react'
import { CHECKPOINT_API } from '../core/protocol.ts'
import type { CheckpointRenderOptions } from './pierre-renderer.ts'
import { splitDiffRows } from './model.ts'
import css from './checkpoints.module.css'

export type DiffMode = CheckpointRenderOptions['mode']

type Renderer = { mountCheckpointDiff(container: HTMLElement, options: CheckpointRenderOptions): () => void }
type PagingLabels = { previous: string; next: string; page(current: number, count: number): string }
const PAGE_SIZE = 500
let rendererRequest: Promise<Renderer> | undefined

function loadRenderer() {
  const url = new URL(CHECKPOINT_API + '/renderer.js', window.location.href).href
  rendererRequest ??= (import(/* @vite-ignore */ url) as Promise<Renderer>).catch(error => {
    rendererRequest = undefined
    throw error
  })
  return rendererRequest
}

function PlainDiff({ patch, mode, labels }: { patch: string; mode: DiffMode; labels: PagingLabels }) {
  const rows = useMemo(() => mode === 'unified' ? patch.split(/\r?\n/u) : splitDiffRows(patch), [mode, patch])
  const [page, setPage] = useState(0)
  const count = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, count - 1)
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  return <>
    <pre className={mode === 'split' ? `${css.plain} ${css.split}` : css.plain} data-checkpoint-plain-diff={mode}>{visible.map((row, index) => {
      if (typeof row === 'string') return <span className={css.line} key={index} data-delta={row[0] === '+' ? 'add' : row[0] === '-' ? 'delete' : undefined}>{row}{'\n'}</span>
      if ('shared' in row) return <span className={css.sharedLine} key={index}>{row.shared}</span>
      return <span className={css.splitLine} key={index}>
        <span data-delta={row.deleted ? 'delete' : undefined}>{row.deleted}</span>
        <span data-delta={row.added ? 'add' : undefined}>{row.added}</span>
      </span>
    })}</pre>
    {count > 1 && <div className={`${css.actions} ${css.diffPaging}`}>
      <button type="button" className={css.button} disabled={current === 0} onClick={() => setPage(current - 1)}>{labels.previous}</button>
      <span role="status">{labels.page(current + 1, count)}</span>
      <button type="button" className={css.button} disabled={current + 1 === count} onClick={() => setPage(current + 1)}>{labels.next}</button>
    </div>}
  </>
}

export function DiffContent({ patch, mode, labels }: { patch: string; mode: DiffMode; labels: PagingLabels }) {
  const container = useRef<HTMLDivElement>(null)
  const [enhanced, setEnhanced] = useState(false)
  const [dark, setDark] = useState(() => document.body.hasAttribute('data-ds-dark-theme'))

  useEffect(() => {
    const update = () => setDark(document.body.hasAttribute('data-ds-dark-theme'))
    const observer = new MutationObserver(update)
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const target = container.current
    if (!target || patch.length > 200_000 || !/^@@ /mu.test(patch)) return
    let active = true
    let dispose: (() => void) | undefined
    setEnhanced(false)
    void loadRenderer().then(renderer => {
      if (!active) return
      dispose = renderer.mountCheckpointDiff(target, { patch, mode, dark, ready: () => {
        if (active) setEnhanced(true)
      } })
    }).catch(() => {})
    return () => { active = false; dispose?.() }
  }, [patch, mode, dark])

  return <div className={css.diffContent} data-checkpoint-diff-content={mode}>
    {!enhanced && <PlainDiff key={mode} patch={patch} mode={mode} labels={labels} />}
    <div ref={container} className={css.pierre} data-checkpoint-pierre={enhanced ? 'ready' : 'loading'} aria-hidden={!enhanced} />
  </div>
}
