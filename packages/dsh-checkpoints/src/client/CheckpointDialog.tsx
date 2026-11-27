import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import type { Checkpoint, CheckpointFile, CheckpointRestorePreview } from '../core/protocol.ts'
import { CheckpointRequestError, checkpointDiff, nativeActions, prepareCheckpoint, restoreCheckpoint, type Comparison } from './api.ts'
import { DiffContent, type DiffMode } from './DiffContent.tsx'
import type { CheckpointKey } from './locales.ts'
import css from './checkpoints.module.css'

type Translate = TranslateNS<'workspace-checkpoints'>
type Undo = { checkpoint: Checkpoint; paths: string[] }

const statusKey = { added: 'add', modified: 'modify', deleted: 'delete' } as const

export function CheckpointDialog({ initial, initialComparison, sessionId, cwd, timeline, close, refresh, t }: {
  initial: Checkpoint
  initialComparison: Comparison
  sessionId: string
  cwd?: string
  timeline: readonly Checkpoint[]
  close(): void
  refresh(): void
  t: Translate
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [checkpoint, setCheckpoint] = useState(initial)
  const [against, setAgainst] = useState(initialComparison)
  const [mode, setMode] = useState<DiffMode>('split')
  const [files, setFiles] = useState<CheckpointFile[]>()
  const [activePath, setActivePath] = useState<string>()
  const [patch, setPatch] = useState<{ path: string; text: string }>()
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [preview, setPreview] = useState<CheckpointRestorePreview>()
  const [undo, setUndo] = useState<Undo>()
  const [feedback, setFeedback] = useState<CheckpointKey>()
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [fileError, setFileError] = useState(false)
  const selectedFile = files?.find(file => file.path === activePath)
  const native = nativeActions()
  const history = new Map<string, Checkpoint>()
  for (const item of [...timeline, initial, ...(undo ? [undo.checkpoint] : [])]) {
    if (item.source === 'pre-restore' || ((item.source === 'post-turn' || item.source === 'post-tool') && item.stats.filesChanged > 0)) {
      history.set(item.checkpointId, item)
    }
  }

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void checkpointDiff(sessionId, checkpoint.checkpointId, against, undefined, controller.signal).then(result => {
      if (controller.signal.aborted) return
      setFiles(result.files)
      setActivePath(result.files[0]?.path)
    }).catch(() => { if (!controller.signal.aborted) setFileError(true) })
    return () => controller.abort()
  }, [sessionId, checkpoint.checkpointId, against, revision])

  useEffect(() => {
    if (!selectedFile || selectedFile.binary) return
    const controller = new AbortController()
    const path = selectedFile.path
    void checkpointDiff(sessionId, checkpoint.checkpointId, against, path, controller.signal).then(result => {
      if (!controller.signal.aborted) setPatch({ path, text: result.patch })
    }).catch(() => { if (!controller.signal.aborted) setFileError(true) })
    return () => controller.abort()
  }, [sessionId, checkpoint.checkpointId, against, selectedFile, revision])

  const resetFiles = () => {
    setFiles(undefined)
    setActivePath(undefined)
    setPatch(undefined)
    setSelected(new Set())
    setFileError(false)
    setFeedback(undefined)
  }

  function fail(error: unknown) {
    if (error instanceof CheckpointRequestError) {
      if (error.code === 'stale-preview') { setFeedback('stale'); return }
      if (error.code === 'busy') { setFeedback('workspaceBusy'); return }
    }
    setFeedback('failure')
  }

  async function previewRestore(checkpointId: string, paths?: string[]) {
    if (busy) return
    setBusy(true)
    setFeedback(undefined)
    try {
      const result = await prepareCheckpoint(sessionId, checkpointId, paths)
      if (result.challengeId && result.files.length > 0) setPreview(result)
      else setFeedback('empty')
    } catch (error) { fail(error) }
    finally { setBusy(false) }
  }

  function confirm(event: MouseEvent<HTMLButtonElement>) {
    const challengeId = preview?.challengeId
    if (!event.nativeEvent.isTrusted || !challengeId || busy || !native?.confirmCheckpointRestore) return
    setBusy(true)
    void native.confirmCheckpointRestore(challengeId).then(async proof => {
      setPreview(undefined)
      if (!proof) { setFeedback('dismissed'); return }
      const result = await restoreCheckpoint(sessionId, challengeId, proof)
      resetFiles()
      setRevision(value => value + 1)
      setUndo({ checkpoint: result.undoCheckpoint, paths: result.files.map(file => file.path) })
      setFeedback('restored')
      refresh()
    }).catch(error => { setPreview(undefined); fail(error) }).finally(() => setBusy(false))
  }

  function toggle(path: string) {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return <dialog ref={dialog} className={css.dialog} aria-labelledby={titleId} aria-busy={busy} data-checkpoint-dialog=""
    onCancel={event => { event.preventDefault(); if (!busy) { if (preview) setPreview(undefined); else close() } }}>
    <header className={css.header}>
      <h2 id={titleId}>{t('title')}</h2>
      <nav className={css.actions}>
        {native?.openExtensionDock && <button type="button" className={css.button} disabled={busy} data-checkpoint-open-inbox="" onClick={() => {
          void native.openExtensionDock?.({ setting: 'agent-inbox' }).catch(fail)
        }}>{t('inbox')}</button>}
        {cwd && <button type="button" className={css.button} disabled={busy} data-checkpoint-open-git="" onClick={() => {
          close()
          window.dispatchEvent(new CustomEvent('dsh:open-project-git-graph', { detail: { sessionId, cwd } }))
        }}>{t('gitGraph')}</button>}
        <button autoFocus type="button" className={css.button} disabled={busy} onClick={close}>{t('close')}</button>
      </nav>
    </header>

    <div className={css.controls}>
      <label className={css.snapshotPicker}>{t('checkpoint')}
        <select value={checkpoint.checkpointId} disabled={busy || !!preview} data-checkpoint-history="" onChange={event => {
          const item = history.get(event.currentTarget.value)
          if (!item) return
          resetFiles()
          setCheckpoint(item)
          if (item.source === 'pre-restore') setAgainst('working')
        }}>
          {[...history.values()].sort((a, b) => b.timestamp - a.timestamp).map(item => (
            <option key={item.checkpointId} value={item.checkpointId}>
              {item.source === 'pre-restore' ? t('undoCheckpoint') : t('turn', { turn: item.turnId ?? '' })} · {new Date(item.timestamp).toLocaleString()}
            </option>
          ))}
        </select>
      </label>
      <div className={css.actions}>
        <button type="button" className={css.button} disabled={busy || !!preview || checkpoint.source === 'pre-restore'} aria-pressed={against === 'parent'}
          data-checkpoint-compare="parent" onClick={() => { if (against !== 'parent') { resetFiles(); setAgainst('parent') } }}>{t('turnChanges')}</button>
        <button type="button" className={css.button} disabled={busy || !!preview} aria-pressed={against === 'working'}
          data-checkpoint-compare="working" onClick={() => { if (against !== 'working') { resetFiles(); setAgainst('working') } }}>{t('currentWorkspace')}</button>
        <button type="button" className={css.button} aria-pressed={mode === 'split'} data-checkpoint-diff-mode="split" onClick={() => setMode('split')}>{t('split')}</button>
        <button type="button" className={css.button} aria-pressed={mode === 'unified'} data-checkpoint-diff-mode="unified" onClick={() => setMode('unified')}>{t('unified')}</button>
      </div>
    </div>

    {checkpoint.skippedLargeFiles.length > 0 && <details className={css.skipped}>
      <summary>{t('skipped')}</summary>
      <ul>{checkpoint.skippedLargeFiles.map(path => <li key={path}>{path}</li>)}</ul>
    </details>}

    {preview ? <section className={css.preview} data-checkpoint-confirmation="">
      <h3>{t('restorePreview')}</h3>
      <p>{t('restoreHint')}</p>
      {preview.files.some(file => file.status === 'deleted') && <p>{t('deleteHint')}</p>}
      <ul>{preview.files.map(file => <li key={file.path} data-checkpoint-preview-file={file.status}><span>{t(statusKey[file.status])}</span> <code>{file.path}</code></li>)}</ul>
      <div className={css.actions}>
        <button type="button" className={css.button} disabled={busy} onClick={() => setPreview(undefined)}>{t('cancel')}</button>
        <button type="button" className={`${css.button} ${css.primary}`} disabled={busy} data-checkpoint-confirm="" onClick={confirm}>{t('confirm')}</button>
      </div>
    </section> : <div className={css.workspaceDiff}>
      <nav className={css.fileList} aria-label={t('fileList')}>
        <ul>{files?.map(file => <li key={file.path}>
          {native?.confirmCheckpointRestore && <input type="checkbox" disabled={busy} checked={selected.has(file.path)} data-checkpoint-select-file={file.path}
            aria-label={t('selectedFile', { path: file.path })} onChange={() => toggle(file.path)} />}
          <button type="button" className={css.fileButton} title={file.path} aria-pressed={activePath === file.path} data-checkpoint-file={file.path}
            onClick={() => { setFileError(false); setActivePath(file.path) }}>
            <span>{file.path}</span><span className={css.status} data-file-status={file.status}>{t(statusKey[file.status])}</span>
          </button>
        </li>)}</ul>
      </nav>
      <div className={css.diffPane}>
        {fileError ? <div className={css.message} role="alert">{t('failure')} <button type="button" className={css.button} onClick={() => { resetFiles(); setRevision(value => value + 1) }}>{t('refresh')}</button></div>
          : files === undefined || (selectedFile && !selectedFile.binary && patch?.path !== activePath) ? <p className={css.message} role="status">{t('loading')}</p>
          : selectedFile?.binary ? <p className={css.message}>{t('binary')}</p>
          : patch?.text ? <DiffContent key={activePath} patch={patch.text} mode={mode} labels={{
            previous: t('previousPage'), next: t('nextPage'), page: (current, count) => t('diffPage', { current, count }),
          }} />
          : <p className={css.message}>{t(!selectedFile ? 'empty' : (selectedFile.insertions || selectedFile.deletions) ? 'largeDiff' : 'noPatch')}</p>}
      </div>
    </div>}

    <footer className={css.footer}>
      <span role="status" data-checkpoint-feedback={feedback}>{feedback ? t(feedback) : ''}</span>
      {!preview && native?.confirmCheckpointRestore && <div className={css.actions}>
        {undo && <button type="button" disabled={busy} className={css.button} data-checkpoint-undo="" onClick={() => void previewRestore(undo.checkpoint.checkpointId, undo.paths)}>{t('undo')}</button>}
        <button type="button" disabled={busy || !selected.size} className={css.button} data-checkpoint-prepare="selected"
          onClick={() => void previewRestore(checkpoint.checkpointId, [...selected])}>{t('restoreSelected')}</button>
        <button type="button" disabled={busy} className={css.button} data-checkpoint-prepare="all" onClick={() => void previewRestore(checkpoint.checkpointId)}>{t('restoreAll')}</button>
      </div>}
    </footer>
  </dialog>
}
