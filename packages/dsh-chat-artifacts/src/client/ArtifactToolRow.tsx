import {
  IconChevronDownOutline14,
  IconDataOutline16,
  IconLoadingOutline16,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { ToolCallBlock, ToolResultNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import {
  ARTIFACT_KINDS,
  artifactSourceFromMeta,
  isArtifactRecord,
  type ArtifactKind,
} from '../core/types.ts'
import type { ChatArtifactsKey } from './locales.ts'
import css from './artifact.module.css'
import { ArtifactCard } from './ArtifactCard.tsx'

type ArtifactTranslate = TranslateNS<'chat-artifacts'>
type ArtifactToolRowProps = ToolCallViewProps & PropsLocale<'chat-artifacts'>
type RowState = 'running' | 'ok' | 'error' | 'stopped'

function isSettled(block: ToolCallBlock): block is ToolResultNode {
  return 'kind' in block && block.kind === 'tool-result'
}

function callArgs(block: ToolCallBlock): string {
  return isSettled(block) ? block.call?.argsRaw ?? '' : block.argsRaw
}

function pendingArgs(raw: string): { title?: string; kind?: ArtifactKind } {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const value = parsed as { title?: unknown; kind?: unknown }
    return {
      ...(typeof value.title === 'string' ? { title: value.title } : {}),
      ...(typeof value.kind === 'string' && (ARTIFACT_KINDS as readonly string[]).includes(value.kind)
        ? { kind: value.kind as ArtifactKind }
        : {}),
    }
  } catch {
    return {}
  }
}

function resultText(node: ToolResultNode): string {
  return node.content.map(block => block.type === 'text' ? block.text : JSON.stringify(block) ?? '').join('\n').trim()
}

function firstLine(text: string): string {
  return text.split(/\r?\n/u).map(line => line.trim()).find(Boolean) ?? ''
}

function errorText(node: ToolResultNode, t: ArtifactTranslate): string {
  const text = firstLine(resultText(node))
  if (text.length > 0) return text
  if (node.error !== undefined) return node.error.code
  return t('card.unknownError')
}

function kindLabel(t: ArtifactTranslate, kind: ArtifactKind): string {
  const key = ('kind.' + kind) as ChatArtifactsKey
  return t(key)
}

function StatusIcon({ state }: { state: RowState }) {
  if (state === 'running') return <IconLoadingOutline16 className={css.statusIcon} />
  if (state === 'error') return <StateDot state="error" />
  if (state === 'stopped') return <StateDot state="warning" />
  return <IconDataOutline16 className={css.statusIcon} />
}

interface FallbackRowProps {
  state: RowState
  title: string
  summary: string
  t: ArtifactTranslate
  source?: string
}

function FallbackRow({ state, title, summary, t, source }: FallbackRowProps) {
  return (
    <section className={css.fallback} data-artifact-state={state}>
      <div className={css.fallbackHeader}>
        <div className={css.heading}>
          <StatusIcon state={state} />
          <div className={css.headingText}>
            <div className={css.title}>{title}</div>
            <div className={css.meta}>{summary}</div>
          </div>
        </div>
        <IconChevronDownOutline14 className={css.fallbackChevron} />
      </div>
      {source !== undefined ? (
        <details className={css.fallbackSource}>
          <summary>{t('card.viewSource')}</summary>
          <pre className={css.source}><code>{source}</code></pre>
        </details>
      ) : null}
    </section>
  )
}

/** Keyed Tool renderer for render_artifact, including pending and replay fallback states. */
export function ArtifactToolRow({ block, t }: ArtifactToolRowProps) {
  if (!isSettled(block)) {
    const args = pendingArgs(callArgs(block))
    const title = args.title?.trim() || 'Render artifact'
    const summary = args.kind === undefined ? t('card.generating') : kindLabel(t, args.kind) + ' · ' + t('card.generating')
    return <FallbackRow state="running" title={title} summary={summary} t={t} />
  }

  if (block.isError) {
    return <FallbackRow state="error" title="Render artifact" summary={errorText(block, t)} t={t} />
  }

  if (isArtifactRecord(block.meta)) {
    return <ArtifactCard artifact={block.meta} t={t} />
  }

  const source = artifactSourceFromMeta(block.meta)
  return (
    <FallbackRow
      state="error"
      title="Render artifact"
      summary={source === undefined ? t('card.unavailable') : t('card.invalid')}
      t={t}
      source={source}
    />
  )
}
