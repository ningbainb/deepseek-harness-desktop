import {
  IconDataOutlineMedium,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { ToolResultNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { artifactSourceFromMeta, isArtifactRecord } from '../core/types.ts'
import { CHAT_ARTIFACTS_PATCH_TOOL_NAME } from '../invariant.ts'
import { ArtifactCard } from './ArtifactCard.tsx'
import { artifactAnchor, artifactTranscript } from './artifact-transcript.ts'
import css from './artifact.module.css'

type Translate = TranslateNS<'chat-artifacts'>

function errorText(node: ToolResultNode, t: Translate): string {
  const firstLine = node.content.flatMap(block => block.type === 'text' ? block.text.split(/\r?\n/u) : [])
    .map(line => line.trim()).find(Boolean)
  return firstLine ?? node.error?.code ?? t('card.unknownError')
}

function openPinnedArtifact(anchor: string) {
  const target = document.getElementById(anchor)
  if (!target) return
  target.focus({ preventScroll: true })
  target.scrollIntoView({ block: 'nearest', behavior: 'auto' })
}

export function ArtifactToolRow({ phase, block, toolName, useChat, inputActions, inspect, t }: ToolCallViewProps & PropsLocale<'chat-artifacts'>) {
  const pinned = useChat(snapshot => phase === 'result' ? artifactTranscript(snapshot).pinnedCalls.get(block.callId) : undefined,
    (a, b) => a?.record === b?.record && a?.turn === b?.turn)
  const label = t(toolName === CHAT_ARTIFACTS_PATCH_TOOL_NAME ? 'tool.patch' : 'tool.render')
  if (phase !== 'result') {
    const title = block.args.textPrefix('title', 160)?.trim() || label
    return <div className={css.toolSummary}><span><IconDataOutlineMedium />{title}</span></div>
  }
  if (!block.isError && isArtifactRecord(block.meta)) {
    if (!pinned) return <ArtifactCard artifact={block.meta} t={t} inputActions={inputActions} />
    const anchor = artifactAnchor(pinned.turn, pinned.record.artifactId)
    return <div data-artifact-tool-summary="" className={css.toolSummary}>
      <span><IconDataOutlineMedium />{block.meta.title}</span>
      <button type="button" className={css.actionButton} onClick={() => openPinnedArtifact(anchor)}>{t('card.locate')}</button>
      {inspect && <button type="button" className={css.actionButton} onClick={inspect}>{t('card.inspect')}</button>}
      {!inspect && <details><summary>{t('card.inspect')}</summary>
        <pre className={css.source}><code>{block.meta.html}</code></pre>
      </details>}
    </div>
  }
  const source = artifactSourceFromMeta(block.meta)
  return <section className={css.fallback} data-artifact-state="error">
    <div className={css.fallbackHeader}>
      <div className={css.heading}>
        <StateDot state="error" />
        <div className={css.headingText}>
          <div className={css.title}>{label}</div>
          <p className={css.errorText}>{block.isError ? errorText(block, t) : t(source === undefined ? 'card.unavailable' : 'card.invalid')}</p>
        </div>
      </div>
    </div>
    {source !== undefined && <details className={css.fallbackSource}>
      <summary>{t('card.viewSource')}</summary>
      <pre className={css.source}><code>{source}</code></pre>
    </details>}
  </section>
}
