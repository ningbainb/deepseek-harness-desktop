/** Desktop web previews use official tab ownership, placement and close actions. */
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useRef, useState } from 'react'
import type { ISidebarRight, SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { createBrowserState, UrlViewer, type BrowserState } from './preview/content.tsx'
import type { StateHandle } from './store.ts'
import { NS, t } from './locales.ts'
import { SplitIcon } from './components/icons.tsx'
import previewCss from './styles/preview.module.css'

export const NATIVE_BROWSER = 'dsh-browser'
const ADDRESS_PREFIX = 'dsh-resource://desktop-browser/'
export const nativeBrowserDefinition: SidebarRightTabDefinition = {
  id: '@linxin666/dsh-client-ui-aionui-panel/browser', kind: NATIVE_BROWSER,
  title: () => t('native.browser'),
  patterns: [`${ADDRESS_PREFIX}*`],
  canOpen: address => /^dsh-resource:\/\/desktop-browser\/[\w-]{1,100}$/u.test(address),
  guide: [{ order: 40, title: () => t('native.browser'), description: () => t('native.browserHint') }],
}

/** Record lifetime, not React mount lifetime: split/float/remount retains the draft address. */
export class BrowserTabs {
  private readonly states = new WeakMap<AbortSignal, StateHandle<BrowserState>>()
  for(signal: AbortSignal): StateHandle<BrowserState> {
    let state = this.states.get(signal)
    if (!state) { state = createBrowserState(); this.states.set(signal, state) }
    return state
  }
}

export type NativeBrowserProps = PropsRuntime<'sidebar.right.pane.tab'> & { browsers: BrowserTabs }
export function NativeBrowserBody({ useTabInfo, browsers }: NativeBrowserProps) {
  const { tab } = useTabInfo()
  if (!tab.visible || tab.signal.aborted) return null
  return <div className="aionui-root" data-aionui-native-panel="browser" style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
    <UrlViewer tab={{ id: tab.id, title: t('native.browser'), content: '' }}
      browserState={browsers.for(tab.signal)} canAct={() => !tab.signal.aborted}
      showCloseButton={false}
      onClose={() => { if (!tab.signal.aborted) tab.actions.close() }} />
  </div>
}

export function registerNativeBrowser(ctx: Context): () => void {
  const browsers = new BrowserTabs()
  const fork = ctx.inject(['slots', 'sidebarRightTabs'], scope => {
    scope.effect(() => scope.sidebarRightTabs.register(nativeBrowserDefinition), 'aionui: browser type')
    scope.effect(() => scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
      name: 'sidebar.right.pane.tab', key: nativeBrowserDefinition.id, locale: NS,
    }, props => <NativeBrowserBody {...props} browsers={browsers} />)), 'aionui: browser body')
  })
  return () => { void fork.dispose() }
}

/** Each explicit plus action opens an independent tab in the native strip. */
export function openNativeBrowser(ctx: Context): boolean {
  if (!ctx.sessions.list.getSnapshot().current) return false
  const sidebar = ctx.get('sidebarRight', false)
  const registry = ctx.get('sidebarRightTabs', false)
  if (!sidebar || !registry?.get(NATIVE_BROWSER)) return false
  try {
    sidebar.openResource(`${ADDRESS_PREFIX}${crypto.randomUUID()}`, { kind: NATIVE_BROWSER })
    return true
  } catch { return false }
}

export interface NativeSidebarReturnProps {
  getSidebar: () => Pick<ISidebarRight, 'isExpanded' | 'toggleExpanded'> | undefined
  isCurrent: () => boolean
}
/** Empty conversations omit the header. Retain a route through the public controller. */
export function NativeSidebarReturn({ getSidebar, isCurrent }: NativeSidebarReturnProps) {
  const host = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    let pending: number | undefined
    let disposed = false
    const inspect = () => {
      pending = undefined
      if (disposed) return
      const sidebar = getSidebar()
      if (!isCurrent() || !sidebar || sidebar.isExpanded()) {
        setVisible(false)
        return
      }
      const hasHeaderControl = [...document.querySelectorAll<HTMLElement>('[data-sidebar-right-expand]')]
        .some(button => !host.current?.contains(button) && button.getClientRects().length > 0)
      setVisible(!hasHeaderControl)
    }
    // History arrives in many DOM batches. Read native control visibility once
    // before painting, not after every mutation where it can force layout.
    const schedule = () => {
      if (!disposed && pending === undefined) pending = requestAnimationFrame(inspect)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'data-sidebar-right-expand'] })
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : undefined
    resize?.observe(document.body)
    window.addEventListener('resize', schedule)
    document.addEventListener('visibilitychange', schedule)
    inspect()
    return () => {
      disposed = true
      observer.disconnect(); resize?.disconnect()
      window.removeEventListener('resize', schedule)
      document.removeEventListener('visibilitychange', schedule)
      if (pending !== undefined) cancelAnimationFrame(pending)
    }
  }, [getSidebar, isCurrent])
  return <span ref={host} data-aionui-native-return style={{ display: 'contents' }}>
    {visible && <button type="button" className={previewCss.urlClose} data-aionui-sidebar-return-button
      aria-label={t('native.reopen')} title={t('native.reopen')} onClick={() => {
        const sidebar = getSidebar()
        if (isCurrent() && sidebar && !sidebar.isExpanded()) sidebar.toggleExpanded()
      }}><SplitIcon size={16} /></button>}
  </span>
}

export function registerNativeSidebarReturn(ctx: Context): () => void {
  const fork = ctx.inject(['slots', 'sidebarRight', 'sessions'], scope => {
    scope.effect(() => scope.slots.inject('conversation.input.left', () => scope.slots.register({
      name: 'conversation.input.left', id: 'aionui-native-sidebar-return', order: 90,
    }, props => <NativeSidebarReturn getSidebar={() => scope.get('sidebarRight', false)}
      isCurrent={() => scope.sessions.list.getSnapshot().current === props.sessionId} />)), 'aionui: native sidebar return without header')
  })
  return () => { void fork.dispose() }
}
