import { useEffect, useRef, useState } from 'react'
import {
  IconCheckOutline16,
  IconCodeOutline16,
  IconCopyOutline16,
  IconDataOutline16,
  IconFullscreenOutline16,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ArtifactKind, ArtifactRecord } from '../core/types.ts'
import css from './artifact.module.css'
import { SafeArtifactFrame } from './SafeArtifactFrame.tsx'
import type { ChatArtifactsKey } from './locales.ts'

type ArtifactTranslate = TranslateNS<'chat-artifacts'>

const KIND_KEYS: Record<ArtifactKind, ChatArtifactsKey> = {
  architecture: 'kind.architecture',
  flow: 'kind.flow',
  timeline: 'kind.timeline',
  comparison: 'kind.comparison',
  roadmap: 'kind.roadmap',
  dashboard: 'kind.dashboard',
  table: 'kind.table',
  wireframe: 'kind.wireframe',
  report: 'kind.report',
  other: 'kind.other',
}

export interface ArtifactCardProps {
  artifact: ArtifactRecord
  t: ArtifactTranslate
}

function kindLabel(t: ArtifactTranslate, kind: ArtifactKind): string {
  return t(KIND_KEYS[kind])
}

/** Card body for one validated artifact record. */
export function ArtifactCard({ artifact, t }: ArtifactCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => {
    if (copyTimer.current !== undefined) clearTimeout(copyTimer.current)
  }, [])

  const copyHtml = async (): Promise<void> => {
    let copied = false
    try {
      copied = await writeClipboard(artifact.html)
    } catch {
      copied = false
    }
    setCopyState(copied ? 'copied' : 'failed')
    if (copyTimer.current !== undefined) clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopyState('idle'), 2200)
  }

  const copyLabel = copyState === 'copied'
    ? t('card.copied')
    : copyState === 'failed' ? t('card.copyFailed') : t('card.copy')

  return (
    <section className={css.card} data-artifact-id={artifact.artifactId}>
      <header className={css.header}>
        <div className={css.heading}>
          <IconDataOutline16 className={css.headingIcon} />
          <div className={css.headingText}>
            <div className={css.title} title={artifact.title}>{artifact.title}</div>
            <div className={css.meta}>
              <span>{kindLabel(t, artifact.kind)}</span>
              <span aria-hidden="true">·</span>
              <span>{artifact.bytes} {t('card.bytes')}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          className={css.expandButton}
          aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}
        >
          <IconFullscreenOutline16 />
          <span>{expanded ? t('card.collapse') : t('card.expand')}</span>
        </button>
      </header>

      {artifact.description !== undefined ? (
        <p className={css.description}>{artifact.description}</p>
      ) : null}

      <SafeArtifactFrame
        html={artifact.html}
        title={artifact.title}
        height={artifact.height}
        expanded={expanded}
        unloadedLabel={t('card.frameUnloaded')}
      />

      {sourceOpen ? (
        <div className={css.sourcePanel}>
          <div className={css.sourceHeading}>
            <span>{t('card.source')}</span>
            <span className={css.sourceId}>{artifact.artifactId}</span>
          </div>
          <pre className={css.source}><code>{artifact.html}</code></pre>
        </div>
      ) : null}

      <footer className={css.actions}>
        <button type="button" className={css.actionButton} onClick={() => setSourceOpen(value => !value)}>
          <IconCodeOutline16 />
          <span>{sourceOpen ? t('card.hideSource') : t('card.viewSource')}</span>
        </button>
        <button type="button" className={css.actionButton} onClick={() => { void copyHtml() }}>
          {copyState === 'copied' ? <IconCheckOutline16 /> : <IconCopyOutline16 />}
          <span>{copyLabel}</span>
        </button>
        {copyState !== 'idle' ? <span className={css.copyStatus} role="status">{copyLabel}</span> : null}
        <span className={css.artifactId} title={artifact.artifactId}>{t('card.artifactId')}: {artifact.artifactId}</span>
      </footer>
    </section>
  )
}
