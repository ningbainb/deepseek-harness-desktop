import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { acpStore } from './acpStore.ts'
import { AcpEnginePicker, type AcpWorkbenchActions } from './AcpEnginePicker.tsx'
import css from './AcpChat.module.css'

type Props = PropsRuntime<'conversation.input.right'> & PropsLocale<'llm-antigravity'> & AcpWorkbenchActions & { getCwd?: () => string | undefined }

export function AcpComposerControl({ sessionId, useInput, inputActions, getCwd, registerWorkbench, t }: Props) {
  const state = useSyncExternalStore(acpStore.subscribe, acpStore.getSnapshot, acpStore.getSnapshot)
  const input = useInput(snapshot => snapshot)
  const latestInput = useRef(input)
  latestInput.current = input
  const anchor = useRef<HTMLSpanElement>(null)
  const [stop, setStop] = useState<{ mount: HTMLElement; className: string }>()
  const [mainComposer, setMainComposer] = useState(false)
  const active = state.active && state.conversationId === String(sessionId)

  useLayoutEffect(() => {
    const content = anchor.current?.closest('[data-conversation-content]')
    setMainComposer(Boolean(content && content.closest('[data-slot="main.conversation"]')?.querySelector('[data-conversation-content]') === content))
  }, [sessionId])

  useLayoutEffect(() => {
    const card = anchor.current?.closest<HTMLElement>('[data-composer-card]')
    const content = card?.closest('[data-conversation-content]')
    if (!active || !card || content?.closest('[data-slot="main.conversation"]')?.querySelector('[data-conversation-content]') !== content) return

    // The SDK keeps ownership of the editor. Capture the same primary button
    // and Enter gesture before its default Host send when Gemini is selected.
    const primary = card.querySelector<HTMLButtonElement>('button[aria-busy]')
    if (!primary) return
    function submit(event: Event) {
      const current = acpStore.getSnapshot()
      if (!current.active || current.conversationId !== String(sessionId)) return
      event.preventDefault()
      event.stopPropagation()
      if (!event.isTrusted || current.busy || current.starting) return
      const draft = latestInput.current
      if (draft.attachmentIds.length) {
        acpStore.reportComposerError(t(current.agentId === 'antigravity' ? 'textOnly' : 'acpTextOnly'))
        return
      }
      if (!draft.draft.trim() || draft.phase !== 'plain') return
      inputActions.setDraft('')
      void acpStore.sendPrompt(draft.draft)
    }

    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Node && primary.contains(event.target) && latestInput.current.phase !== 'claimed') submit(event)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.target instanceof HTMLElement) || !event.target.closest('[contenteditable="true"]')) return
      if (event.key === 'Escape' && acpStore.getSnapshot().busy && !card.querySelector('[role="listbox"]')) {
        event.preventDefault()
        event.stopPropagation()
        if (event.isTrusted) acpStore.cancelTurn()
        return
      }
      if (event.key !== 'Enter' || event.shiftKey || event.altKey || (event.ctrlKey && event.metaKey)
        || event.isComposing || event.keyCode === 229 || card.querySelector('[role="listbox"]')) return
      if (event.repeat) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      // Explicit composer commands still use the SDK's command dispatcher.
      if (latestInput.current.phase === 'claimed') return
      submit(event)
    }

    card.addEventListener('click', onClick, true)
    card.addEventListener('keydown', onKeyDown, true)
    return () => {
      card.removeEventListener('click', onClick, true)
      card.removeEventListener('keydown', onKeyDown, true)
    }
  }, [active, inputActions, sessionId, t])

  useLayoutEffect(() => {
    if (!active || !state.busy) return
    const primary = anchor.current?.closest('[data-composer-card]')?.querySelector<HTMLButtonElement>('button[aria-busy]')
    if (!primary) return
    const className = primary.className
    const mount = primary.ownerDocument.createElement('span')
    mount.className = css.stopMount
    primary.classList.add(css.nativeSendHidden)
    primary.after(mount)
    setStop({ mount, className })
    return () => {
      setStop(undefined)
      primary.classList.remove(css.nativeSendHidden)
      mount.remove()
    }
  }, [active, state.busy])

  return <>
    <span ref={anchor} hidden />
    {mainComposer && <AcpEnginePicker key={String(sessionId)} conversationId={String(sessionId)} getCwd={getCwd}
      registerWorkbench={registerWorkbench} t={t} focusComposer={() => {
        anchor.current?.closest('[data-composer-card]')?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus()
      }} />}
    {stop && createPortal(<button className={stop.className} type="button" data-dsh-acp-stop="" aria-label={t('stop')} title={t('stop')}
      onMouseDown={event => event.preventDefault()} onClick={() => acpStore.cancelTurn()}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <rect x="3" y="3" width="10" height="10" rx="3" fill="currentColor" />
      </svg>
    </button>, stop.mount)}
  </>
}
