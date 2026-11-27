import { useState, type ReactNode } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { sanitizeStreamingHtml } from '../core/streaming.ts'
import { SafeArtifactFrame } from './SafeArtifactFrame.tsx'
import css from './artifact.module.css'

export function ArtifactFenceEnhancer({ code, streaming, lang, children, t }: PropsRuntime<'conversation.chat.markdown.fence'> & PropsLocale<'chat-artifacts'> & { children?: ReactNode }) {
  const [opened, setOpened] = useState(false)
  const completeDocument = /^\s*(?:<!doctype\s+html[^>]*>\s*)?<html\b[\s\S]*<\/html>\s*$/iu.test(code)
  if (streaming || (lang !== 'html-live' && !completeDocument)) return <>{children}</>
  const fragment = opened ? sanitizeStreamingHtml(code) : undefined
  return <div className={css.fence} data-artifact-fence={lang}>
    <button type="button" className={css.actionButton} aria-expanded={opened} onClick={() => setOpened(value => !value)}>
      {t(opened ? 'card.hidePreview' : 'card.showPreview')}
    </button>
    {opened ? (fragment ? <SafeArtifactFrame html={fragment} title={t('card.preview')} height={320} expanded={false}
      unloadedLabel={t('card.frameUnloaded')} /> : <p role="status">{t('card.invalid')}</p>) : children}
  </div>
}
