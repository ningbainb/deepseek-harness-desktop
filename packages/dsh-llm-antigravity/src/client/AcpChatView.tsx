import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MarkdownText, UserMessageBubble } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { acpStore, type AcpChatMessage, type AntigravityAcpStore } from './acpStore.ts'
import css from './AcpChat.module.css'

type Translate = PropsLocale<'llm-antigravity'>['t']

function AssistantMessage({ msg, store, t }: { msg: AcpChatMessage; store: AntigravityAcpStore; t: Translate }) {
  const markdown = useMemo(() => ({
    code: { copyLabel: t('copyText'), copiedLabel: t('copied') },
    footnotes: t('footnotes'),
  }), [t])
  const permission = msg.pendingPermission

  return <div className={css.assistantRow}>
    {msg.thoughts && <details className={css.activity}>
      <summary>{t(msg.streaming && !msg.text ? 'thinking' : 'thoughts')}</summary>
      <div className={css.preWrap}>{msg.thoughts}</div>
    </details>}
    {msg.plan && msg.plan.length > 0 && <details className={css.activity}>
      <summary>{t('plan')}</summary>
      <ol>{msg.plan.map((entry, index) => <li key={index}>{entry.content}</li>)}</ol>
    </details>}
    {msg.toolCalls?.map((call, index) => <details key={call.toolCallId || index} className={css.activity}>
      <summary>{call.title || call.kind || t('tool')}</summary>
      {call.status && <p>{call.status}</p>}
      {call.diff && <pre className={css.preWrap}>{[
        call.diff.path,
        call.diff.oldText ? '- ' + call.diff.oldText : undefined,
        call.diff.newText ? '+ ' + call.diff.newText : undefined,
      ].filter(Boolean).join('\n')}</pre>}
    </details>)}

    {permission && <div className={css.permission} role="group" aria-label={t('permission')}>
      <strong>{permission.title || permission.kind || t('permission')}</strong>
      {permission.rawInput !== undefined && <details className={css.activity}>
        <summary>{t('details')}</summary>
        <pre className={css.preWrap}>{JSON.stringify(permission.rawInput, null, 2)}</pre>
      </details>}
      <div className={css.actions}>
        {permission.options.map(option => <button key={option.optionId} type="button" disabled={permission.resolving}
          onClick={event => { if (event.nativeEvent.isTrusted) void store.resolvePermission(msg.id, permission.permissionId, option.optionId) }}>
          {option.kind === 'allow_once' ? t('allowOnce') : option.kind === 'allow_session' ? t('allowSession') : option.name || option.optionId}
        </button>)}
        <button type="button" disabled={permission.resolving}
          onClick={event => { if (event.nativeEvent.isTrusted) void store.resolvePermission(msg.id, permission.permissionId, undefined, true) }}>
          {t('deny')}
        </button>
      </div>
    </div>}

    {msg.text && <MarkdownText text={msg.text} streaming={msg.streaming} labels={markdown} />}
    {msg.usage?.used !== undefined && !msg.streaming && <p className={css.usage}>
      {t('acpContextUsage')} {msg.usage.used.toLocaleString()}{msg.usage.size === undefined ? '' : ' / ' + msg.usage.size.toLocaleString()}
    </p>}
    {msg.streaming && !msg.text && !msg.thoughts && <span className={css.spinner} role="status" aria-label={t('generating')} />}
    {msg.error && <p className={css.error} role="alert">{msg.error}</p>}
  </div>
}

export function AcpChatView({ t, store = acpStore }: PropsLocale<'llm-antigravity'> & { store?: AntigravityAcpStore }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const thread = useRef<HTMLDivElement>(null)
  const previousCount = useRef(0)
  const stickToBottom = useRef(true)

  useEffect(() => {
    const scroll = thread.current?.closest('[data-conversation-scroll]')
    if (!scroll) return
    const onScroll = () => {
      stickToBottom.current = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80
    }
    scroll.addEventListener('scroll', onScroll, { passive: true })
    return () => scroll.removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    const scroll = thread.current?.closest('[data-conversation-scroll]')
    const newTurn = state.messages.length > previousCount.current
    previousCount.current = state.messages.length
    if (scroll && (newTurn || stickToBottom.current)) scroll.scrollTop = scroll.scrollHeight
  }, [state.messages])

  return <div ref={thread} className={css.transcript} data-antigravity-acp-chat="" data-has-messages={state.messages.length > 0 ? '' : undefined}>
    {state.messages.map(message => message.role === 'user'
      ? <div key={message.id} className={css.userRow}>
        <UserMessageBubble className={css.userBubble} data-message-bubble="">{message.text}</UserMessageBubble>
      </div>
      : <AssistantMessage key={message.id} msg={message} store={store} t={t} />)}
    {state.error && <p className={css.error} role="alert">{state.error}</p>}
  </div>
}

export function AcpChatFrameHoc({ children, t }: { children?: ReactNode } & PropsLocale<'llm-antigravity'>) {
  const state = useSyncExternalStore(acpStore.subscribe, acpStore.getSnapshot, acpStore.getSnapshot)
  const anchor = useRef<HTMLSpanElement>(null)
  const [mount, setMount] = useState<HTMLDivElement>()
  const [nativeSession, setNativeSession] = useState<string>()
  const showTranscript = state.active && nativeSession === state.conversationId && Boolean(state.messages.length || state.error)

  useLayoutEffect(() => {
    const content = anchor.current?.closest<HTMLElement>('[data-conversation-content]')
    if (!content || content.closest('[data-slot="main.conversation"]')?.querySelector('[data-conversation-content]') !== content) return
    const readSession = () => setNativeSession(content.dataset.conversationSession)
    const observer = new MutationObserver(readSession)
    observer.observe(content, { attributes: true, attributeFilter: ['data-conversation-session'] })
    readSession()
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (!showTranscript) return
    const content = anchor.current?.closest<HTMLElement>('[data-conversation-content]')
    const main = content?.closest('[data-slot="main.conversation"]')
    if (!content || main?.querySelector('[data-conversation-content]') !== content
      || content.dataset.conversationSession !== state.conversationId) return
    const composer = content.querySelector('[data-conversation-scroll] > [data-composer-seat]')
    if (!composer) return
    const target = content.ownerDocument.createElement('div')
    target.className = css.transcriptMount
    composer.before(target)
    setMount(target)
    return () => { target.remove(); setMount(undefined) }
  }, [showTranscript, state.conversationId])

  useEffect(() => { void acpStore.refreshDiagnostic() }, [])

  return <><span ref={anchor} hidden />{children}{mount && createPortal(<AcpChatView t={t} />, mount)}</>
}
