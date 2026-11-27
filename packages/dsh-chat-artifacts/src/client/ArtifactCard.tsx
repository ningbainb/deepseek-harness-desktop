import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  IconCheckOutlineMedium, IconCopyOutlineMedium, IconDataOutlineMedium, IconDownloadOutlineMedium,
  IconFullscreenOutlineMedium, IconRefreshOutlineMedium, Tooltip, writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { utf8ByteLength, type ArtifactKind, type ArtifactRecord } from '../core/types.ts'
import { sanitizeStreamingHtml } from '../core/streaming.ts'
import { ArtifactFullscreenModal } from './ArtifactFullscreenModal.tsx'
import {
  MAX_PREVIEW_HEIGHT, MIN_PREVIEW_HEIGHT, SafeArtifactFrame, buildSafeArtifactDocument,
  type ArtifactActionRequest, type ArtifactFrameDiagnostic,
} from './SafeArtifactFrame.tsx'
import { artifactVersion } from './artifact-transcript.ts'
import { downloadDiagram, findInlineSvg, findMermaidBlock, rasterizeDiagram, renderOfflineMermaid, sanitizeExportSvg } from './diagram-export.ts'
import css from './artifact.module.css'

type Translate = TranslateNS<'chat-artifacts'>
type InputActions = PropsRuntime<'conversation.input.left'>['inputActions']
type View = 'preview' | 'source' | 'split'

export interface ArtifactCardProps {
  artifact: ArtifactRecord
  t: Translate
  versions?: readonly ArtifactRecord[]
  anchor?: string
  inputActions?: InputActions
}

function Action({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return <Tooltip label={label} portal><button type="button" className={css.actionButton} aria-label={label} onClick={onClick} disabled={disabled}>
    {children}
  </button></Tooltip>
}

function exportHtml(artifact: ArtifactRecord, t: Translate): boolean {
  const html = artifact.mode === 'interactive' ? sanitizeStreamingHtml(artifact.html) : artifact.html
  if (!html) return false
  downloadDiagram(artifactFileBase(artifact.title, t) + '.html', new Blob([buildSafeArtifactDocument(html)], { type: 'text/html;charset=utf-8' }))
  return true
}

function artifactFileBase(title: string, t: Translate): string {
  return title.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '-').slice(0, 80).trim() || t('card.preview')
}

function ResizeHandle({ height, onHeight, t }: { height: number; onHeight: (height?: number) => void; t: Translate }) {
  const drag = useRef<{ top: number; height: number }>()
  const move = (next: number) => onHeight(Math.min(MAX_PREVIEW_HEIGHT, Math.max(MIN_PREVIEW_HEIGHT, next)))
  return <div role="separator" aria-label={t('card.resize')} aria-orientation="horizontal"
    aria-valuemin={MIN_PREVIEW_HEIGHT} aria-valuemax={MAX_PREVIEW_HEIGHT} aria-valuenow={height}
    tabIndex={0} className={css.resizeHandle}
    onPointerDown={event => {
      if (event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      const viewport = event.currentTarget.previousElementSibling?.querySelector('.' + css.frameViewport)
      drag.current = { top: event.clientY, height: viewport?.getBoundingClientRect().height ?? height }
    }}
    onPointerMove={event => {
      if (drag.current) move(drag.current.height + event.clientY - drag.current.top)
    }}
    onLostPointerCapture={() => { drag.current = undefined }}
    onDoubleClick={() => onHeight()}
    onKeyDown={event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onHeight()
        return
      }
      const next = { ArrowUp: height - 16, ArrowDown: height + 16, Home: MIN_PREVIEW_HEIGHT, End: MAX_PREVIEW_HEIGHT }[event.key]
      if (next === undefined) return
      event.preventDefault()
      move(next)
    }} />
}

function ArtifactContents({ artifact, t, inputActions, expanded = false, onFullscreen, heading }: {
  artifact: ArtifactRecord
  t: Translate
  inputActions?: InputActions
  expanded?: boolean
  onFullscreen?: () => void
  heading?: ReactNode
}) {
  const [view, setView] = useState<View>('preview')
  const [runNonce, setRunNonce] = useState(0)
  const [height, setHeight] = useState<number>()
  const [automaticHeight, setAutomaticHeight] = useState(artifact.height)
  const [diagnostic, setDiagnostic] = useState<ArtifactFrameDiagnostic>()
  const [action, setAction] = useState<ArtifactActionRequest>()
  const [diagram, setDiagram] = useState<string>()
  const [diagramBusy, setDiagramBusy] = useState(false)
  const [status, setStatus] = useState<'copied' | 'copyFailed' | 'inserted' | 'insertFailed' | 'exportFailed' | 'diagramUnavailable' | 'graphicExportFailed'>()
  const statusTimer = useRef<ReturnType<typeof setTimeout>>()
  const currentHeight = height ?? automaticHeight
  const mermaid = artifact.mode !== 'interactive' ? findMermaidBlock(artifact.html) : undefined
  const previewHtml = diagram && mermaid ? artifact.html.replace(mermaid.markup, () => diagram) : artifact.html
  const exportableSvg = diagram ?? findInlineSvg(artifact.html)

  useEffect(() => () => clearTimeout(statusTimer.current), [])

  function notify(value: NonNullable<typeof status>) {
    setStatus(value)
    clearTimeout(statusTimer.current)
    statusTimer.current = setTimeout(() => setStatus(undefined), 2200)
  }

  const stageDraft = (text: string) => {
    if (!inputActions) return
    const inserted = inputActions.insertText('\n' + text + '\n', inputActions.captureInsertion())
    notify(inserted ? 'inserted' : 'insertFailed')
    if (inserted) setAction(undefined)
  }

  async function copy() {
    let copied = false
    try { copied = await writeClipboard(artifact.html) } catch {}
    notify(copied ? 'copied' : 'copyFailed')
  }

  async function renderDiagram() {
    if (!mermaid || diagramBusy) return
    setDiagramBusy(true)
    try {
      const dark = document.body.hasAttribute('data-ds-dark-theme')
      setDiagram(await renderOfflineMermaid(mermaid.text, dark))
      setView('preview')
    } catch { notify('diagramUnavailable') }
    finally { setDiagramBusy(false) }
  }

  async function exportGraphic(format: 'svg' | 'png') {
    if (!exportableSvg) return
    try {
      const svg = new Blob([sanitizeExportSvg(exportableSvg)], { type: 'image/svg+xml' })
      downloadDiagram(artifactFileBase(artifact.title, t) + '.' + format, format === 'png' ? await rasterizeDiagram(svg) : svg)
    } catch { notify('graphicExportFailed') }
  }

  return <>
    <div className={css.toolbar}>
      {heading}
      <div className={css.segments} role="group" aria-label={t('card.view')}>
        {(['preview', 'source', 'split'] as const).map(item =>
          <button type="button" key={item} aria-pressed={view === item} onClick={() => setView(item)}>{t(`view.${item}`)}</button>)}
      </div>
      <div className={css.iconActions}>
        {artifact.mode === 'interactive' && <Action label={t('card.runAgain')} onClick={() => {
          setDiagnostic(undefined)
          setAction(undefined)
          setHeight(undefined)
          setRunNonce(previous => previous + 1)
        }}><IconRefreshOutlineMedium /></Action>}
        <Action label={t('card.copy')} onClick={() => { void copy() }}>
          {status === 'copied' ? <IconCheckOutlineMedium /> : <IconCopyOutlineMedium />}
        </Action>
        <Action label={t('card.export')} onClick={() => { if (!exportHtml(artifact, t)) notify('exportFailed') }}>
          <IconDownloadOutlineMedium />
        </Action>
        {mermaid && !diagram && <Action label={t('card.renderDiagram')} onClick={() => void renderDiagram()} disabled={diagramBusy}>
          <IconRefreshOutlineMedium />
        </Action>}
        {exportableSvg && <>
          <Action label={t('card.exportSvg')} onClick={() => void exportGraphic('svg')}><span className={css.graphicFormat}>SVG</span></Action>
          <Action label={t('card.exportPng')} onClick={() => void exportGraphic('png')}><span className={css.graphicFormat}>PNG</span></Action>
        </>}
        {onFullscreen && <Action label={t('card.fullscreen')} onClick={onFullscreen}><IconFullscreenOutlineMedium /></Action>}
      </div>
    </div>

    {!expanded && artifact.description && <p className={css.description}>{artifact.description}</p>}
    <div data-artifact-view={view} className={css.canvas}>
      <div hidden={view === 'source'} className={css.previewPane}>
        <SafeArtifactFrame html={previewHtml} title={artifact.title} height={artifact.height}
          mode={artifact.mode} runNonce={runNonce} manualHeight={height} expanded={expanded}
          unloadedLabel={t('card.frameUnloaded')} onAutoHeight={setAutomaticHeight} onDiagnostic={setDiagnostic} onAction={setAction} />
      </div>
      {view !== 'preview' && <pre className={css.source} aria-label={t('card.source')}><code>{artifact.html}</code></pre>}
    </div>
    {!expanded && view !== 'source' && <ResizeHandle height={currentHeight} onHeight={next => setHeight(next)} t={t} />}
    {diagnostic && <details className={css.diagnostic}>
      <summary>{t('card.scriptError')}</summary>
      <pre>{diagnostic.message}{diagnostic.line && ' (' + diagnostic.line + ':' + (diagnostic.column ?? 0) + ')'}</pre>
      {inputActions && <button className={css.actionButton} type="button" onClick={() => stageDraft(t('card.repairRequest', {
        id: artifact.artifactId, error: diagnostic.message + (diagnostic.line ? ' (' + diagnostic.line + ':' + (diagnostic.column ?? 0) + ')' : ''),
      }))}>{t('card.askRepair')}</button>}
    </details>}
    {action && inputActions && <div className={css.diagnostic} data-artifact-action-request="">
      <strong>{t('card.actionProposed', { action: action.action })}</strong>
      <pre>{JSON.stringify(action.payload, null, 2)}</pre>
      <button className={css.actionButton} type="button" onClick={() => stageDraft(t('card.actionDraft', {
        id: artifact.artifactId, action: action.action, payload: JSON.stringify(action.payload) ?? 'null',
      }))}>{t('card.insertAction')}</button>
      <button className={css.actionButton} type="button" onClick={() => setAction(undefined)}>{t('card.dismissAction')}</button>
    </div>}
    {status && <span className={css.copyStatus} role="status">{t(`card.${status}`)}</span>}
  </>
}

export function ArtifactCard({ artifact, t, versions = [], anchor, inputActions }: ArtifactCardProps) {
  const [version, setVersion] = useState<number>()
  const [fullscreen, setFullscreen] = useState(false)
  const catalogue = [...new Map([...versions, artifact].map(record => [artifactVersion(record), record])).values()]
    .sort((a, b) => artifactVersion(b) - artifactVersion(a))
  const active = catalogue.find(record => artifactVersion(record) === version) ?? artifact
  const details = [active.title, t(`kind.${active.kind}`), t(active.mode === 'interactive' ? 'card.interactive' : 'card.static'),
    t('card.size', { size: (active.bytes / 1024).toFixed(1) })].join(' · ')
  const heading = <div className={css.heading}>
    <IconDataOutlineMedium className={css.headingIcon} />
    <div className={css.title} title={details}>{active.title}</div>
    {catalogue.length > 1 && <select className={css.version} aria-label={t('card.version')}
      value={artifactVersion(active)} onChange={e => setVersion(Number(e.target.value))}>
      {catalogue.map(record => <option key={artifactVersion(record)} value={artifactVersion(record)}>v{artifactVersion(record)}</option>)}
    </select>}
  </div>

  return <section id={anchor} tabIndex={anchor ? -1 : undefined} className={css.card} data-artifact-id={artifact.artifactId}
    data-artifact-version={artifactVersion(active)}>
    <ArtifactContents key={active.sha256 + ':' + artifactVersion(active)} artifact={active} inputActions={inputActions}
      t={t} heading={heading} onFullscreen={() => setFullscreen(true)} />
    {fullscreen && <ArtifactFullscreenModal title={active.title} t={t} open={fullscreen} onClose={() => setFullscreen(false)}>
      <ArtifactContents artifact={active} inputActions={inputActions} t={t} expanded />
    </ArtifactFullscreenModal>}
  </section>
}

export function StreamingArtifactCard({ title, kind, html, t }: { title: string; kind?: ArtifactKind; html: string; t: Translate }) {
  const bytes = utf8ByteLength(html)
  return <section className={css.card} data-artifact-streaming="">
    <header className={css.header}>
      <div className={css.heading}><IconDataOutlineMedium className={css.headingIcon} />
        <div className={css.headingText}>
          <div className={css.title}>{title}</div>
          {kind && <div className={css.meta}>{t(`kind.${kind}`)}</div>}
        </div>
      </div>
    </header>
    {html ? <SafeArtifactFrame html={html} title={title} mode="static" phase="streaming" height={320}
      expanded={false} unloadedLabel={t('card.frameUnloaded')} /> : <div className={css.skeleton} />}
    <div className={css.progress} role="status">{t('card.building', { size: (bytes / 1024).toFixed(1) })}</div>
  </section>
}
