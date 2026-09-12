/**
 * Transfer tab: upload/download one file with progress, plus a toggleable
 * remote directory browser (api.ls) whose file rows fill the remote path
 * input and whose directory rows navigate.
 */
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { SshApi } from '../api.ts'
import type { RemoteDirEntry, SshHostSummary, TransferProgress } from '../../protocol.ts'
import { errorMessage, tt } from './helpers.ts'
import css from './panel.module.css'

/** Transfer tab props. */
export interface TransferTabProps {
  api: SshApi
}

/** One in-flight transfer (drives the progress bar). */
interface TransferState {
  kind: 'upload' | 'download'
  phase: TransferProgress['phase']
  percent: number
  speedBps?: number
  file: string
}

/** The last transfer's outcome line. */
type TransferStatus = { kind: 'ok'; bytes: number } | { kind: 'error'; error: string }

/** Join a directory path with a child entry name. */
function joinRemotePath(dir: string, name: string): string {
  const base = dir.endsWith('/') ? dir : dir + '/'
  return base + name
}

/** Parent path of a remote directory ('/' stays '/'). */
function parentOf(dir: string): string {
  const trimmed = dir.replace(/\/+$/, '')
  const index = trimmed.lastIndexOf('/')
  if (index <= 0) return '/'
  return trimmed.slice(0, index)
}

/** Human byte sizes through the transfer.* locale templates. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return tt('transfer.bytes', { value: bytes })
  if (bytes < 1024 * 1024) return tt('transfer.kib', { value: (bytes / 1024).toFixed(1) })
  if (bytes < 1024 * 1024 * 1024) return tt('transfer.mib', { value: (bytes / (1024 * 1024)).toFixed(1) })
  return tt('transfer.gib', { value: (bytes / (1024 * 1024 * 1024)).toFixed(1) })
}

/** The upload/download tab. */
export function TransferTab({ api }: TransferTabProps) {
  const [hosts, setHosts] = useState<SshHostSummary[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [alias, setAlias] = useState('')
  const [remotePath, setRemotePath] = useState('')
  const [browseOpen, setBrowseOpen] = useState(false)
  const [browseDir, setBrowseDir] = useState('/')
  const [entries, setEntries] = useState<RemoteDirEntry[]>([])
  const [browsing, setBrowsing] = useState(false)
  const [transfer, setTransfer] = useState<TransferState | null>(null)
  const [status, setStatus] = useState<TransferStatus | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const seqRef = useRef(0)

  useEffect(() => {
    let disposed = false
    void (async () => {
      try {
        const list = await api.listHosts()
        if (!disposed) setHosts(list)
      } catch (cause) {
        if (!disposed) setListError(errorMessage(cause))
      }
    })()
    return () => { disposed = true; seqRef.current++ }
  }, [api])

  const changeHost = (next: string): void => {
    if (next === alias || transfer !== null) return
    // A directory response belongs to the host that started it. Invalidate
    // it before rendering a different host, including an A -> B -> A switch.
    seqRef.current++
    setAlias(next)
    setRemotePath('')
    setEntries([])
    setBrowseDir('/')
    setBrowseOpen(false)
    setBrowsing(false)
    setListError(null)
    setStatus(null)
  }

  const loadDir = async (path: string): Promise<void> => {
    if (alias === '') return
    const seq = ++seqRef.current
    setBrowsing(true)
    try {
      const list = await api.ls(alias, path)
      if (seq !== seqRef.current) return
      const sorted = [...list].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      setEntries(sorted)
      setBrowseDir(path)
      setListError(null)
    } catch (cause) {
      if (seq === seqRef.current) setListError(errorMessage(cause))
    } finally {
      if (seq === seqRef.current) setBrowsing(false)
    }
  }

  const openBrowse = (): void => {
    if (alias === '') return
    setBrowseOpen(true)
    const path = remotePath.trim() === '' ? '/' : remotePath.trim()
    void loadDir(path)
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file === undefined || alias === '' || remotePath.trim() === '' || transfer !== null) return
    setStatus(null)
    setTransfer({ kind: 'upload', phase: 'connecting', percent: 0, file: file.name })
    try {
      const outcome = await api.uploadFile(file, alias, remotePath.trim(), progress => {
        setTransfer(prev => prev === null ? prev : {
          kind: 'upload',
          phase: progress.phase,
          percent: progress.percent,
          speedBps: progress.speedBps,
          file: progress.file,
        })
      })
      setStatus({ kind: 'ok', bytes: outcome.transferredBytes })
    } catch (cause) {
      setStatus({ kind: 'error', error: errorMessage(cause) })
    } finally {
      setTransfer(null)
    }
  }

  const handleDownload = async (): Promise<void> => {
    if (alias === '' || remotePath.trim() === '' || transfer !== null) return
    setStatus(null)
    setTransfer({ kind: 'download', phase: 'connecting', percent: 0, file: remotePath.trim() })
    try {
      const result = await api.downloadFile(alias, remotePath.trim(), progress => {
        setTransfer(prev => prev === null ? prev : {
          kind: 'download',
          phase: progress.phase,
          percent: progress.percent,
          speedBps: progress.speedBps,
          file: progress.file,
        })
      })
      // Streamed downloads (File System Access API) were already saved; the
      // Blob fallback triggers a browser save here.
      if (!result.streamed && result.blob !== undefined) {
        const url = URL.createObjectURL(result.blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = result.filename
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        // Defer the revoke: some engines need the URL alive past the click.
        setTimeout(() => { URL.revokeObjectURL(url) }, 10_000)
      }
      setStatus({ kind: 'ok', bytes: result.bytes })
    } catch (cause) {
      setStatus({ kind: 'error', error: errorMessage(cause) })
    } finally {
      setTransfer(null)
    }
  }

  const ready = alias !== '' && remotePath.trim() !== '' && transfer === null

  return (
    <div className={css.tabBody}>
      <div className={css.controls}>
        <select className={css.input} aria-label={tt('transfer.selectHost')} value={alias} disabled={transfer !== null} onChange={event => { changeHost(event.target.value) }}>
          <option value="">{tt('transfer.selectHost')}</option>
          {hosts.map(host => <option key={host.alias} value={host.alias}>{host.alias} ({host.host})</option>)}
        </select>
        <input className={css.input} placeholder={tt('transfer.remotePathHint')} value={remotePath} disabled={transfer !== null} onChange={event => { setRemotePath(event.target.value) }} />
        <button type="button" className={css.ghostButton} disabled={alias === '' || transfer !== null} onClick={openBrowse}>{tt('transfer.browseRemote')}</button>
        <div className={css.toolbarSpacer} />
        <button type="button" className={css.primaryButton} disabled={!ready} onClick={() => { fileRef.current?.click() }}>{tt('transfer.upload')}</button>
        <button type="button" className={css.ghostButton} disabled={!ready} onClick={() => { void handleDownload() }}>{tt('transfer.download')}</button>
        <input ref={fileRef} type="file" className={css.hiddenFile} onChange={event => { void handleFile(event) }} />
      </div>
      {listError !== null && <div className={css.banner} data-kind="error">{tt('common.error', { error: listError })}</div>}
      {browseOpen && (
        <div className={css.browsePanel}>
          <div className={css.browseHeader}>
            <span className={css.browsePath}>{browseDir}</span>
            <button type="button" className={css.linkButton} disabled={browsing || transfer !== null} onClick={() => { void loadDir(browseDir) }}>{tt('transfer.refresh')}</button>
          </div>
          <div className={css.browseList}>
            {browseDir !== '/' && (
              <button type="button" className={css.dirRow} data-up disabled={transfer !== null} onClick={() => { void loadDir(parentOf(browseDir)) }}>
                <span className={css.dirName}>{tt('transfer.upLevel')}</span>
                <span className={css.dirType} />
                <span className={css.dirSize} />
              </button>
            )}
            {entries.map(entry => (
              <button key={entry.name} type="button" className={css.dirRow} data-type={entry.type} disabled={transfer !== null} onClick={() => {
                if (entry.type === 'dir') {
                  void loadDir(joinRemotePath(browseDir, entry.name))
                } else {
                  setRemotePath(joinRemotePath(browseDir, entry.name))
                }
              }}>
                <span className={css.dirName}>{entry.name}</span>
                <span className={css.dirType}>{entry.type === 'dir' ? '[' + tt('transfer.dir') + ']' : entry.type === 'file' ? '[' + tt('transfer.file') + ']' : ''}</span>
                <span className={css.dirSize}>{formatBytes(entry.size)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {transfer !== null && (
        <div className={css.transferBlock}>
          <div className={css.progressMeta}>
            <span>{transfer.kind === 'upload' ? tt('transfer.uploading', { file: transfer.file }) : tt('transfer.downloading')}</span>
            <span>{tt('transfer.percent', { value: Math.round(transfer.percent) })}</span>
            {transfer.speedBps !== undefined && transfer.phase === 'transferring' && <span>{tt('transfer.speed', { value: formatBytes(transfer.speedBps) })}</span>}
          </div>
          <div className={css.progressTrack}>
            <div className={css.progressBar} style={{ width: Math.min(100, Math.max(0, transfer.percent)) + '%' }} />
          </div>
        </div>
      )}
      {status !== null && (
        <div className={css.banner} data-kind={status.kind}>
          {status.kind === 'ok' ? tt('transfer.done', { bytes: status.bytes }) : tt('transfer.failed', { error: status.error })}
        </div>
      )}
    </div>
  )
}
