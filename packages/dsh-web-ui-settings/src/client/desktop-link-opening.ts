import type { Context } from '@deepseek-ai/cordis'
import { openExternalUrl } from './open-external.ts'

export function installDesktopLinkOpening(ctx: Context, doc: Document): () => void {
  const host = doc.defaultView as (Window & { dshDesktop?: unknown; dshDesktopTransport?: unknown }) | null
  if (!host?.dshDesktop && !host?.dshDesktopTransport) return () => {}
  const settings = ctx.configForms.get<{ linkOpening?: 'sidebar' | 'new-tab' }>('ui-chat')
  const ownedTitles = new Map<HTMLAnchorElement, string | null>()
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
    if (!anchor?.closest('[data-slot="conversation.view"], [data-slot="conversation"], [data-pane="conversation"]') || anchor.hasAttribute('download')) return
    let url: URL
    try { url = new URL(anchor.href) } catch { return }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.origin === doc.location.origin) return
    const tabs = ctx.get('sidebarRightTabs') as { get: (id: string) => unknown } | undefined
    const forced = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
    const destination = settings.getSnapshot().value?.linkOpening ?? 'sidebar'
    if (!forced && destination === 'sidebar' && tabs?.get('browser') !== undefined) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const previous = ownedTitles.get(anchor)
    if (previous !== undefined) {
      if (previous === null) anchor.removeAttribute('title')
      else anchor.title = previous
    }
    const reportFailure = () => {
      if (!ownedTitles.has(anchor)) ownedTitles.set(anchor, anchor.getAttribute('title'))
      anchor.title = doc.documentElement.lang.startsWith('en')
        ? 'Could not open the system browser. Copy this link to continue.'
        : '无法打开系统浏览器，请复制此链接后继续。'
    }
    if (!openExternalUrl(url.href, reportFailure)) reportFailure()
  }
  doc.addEventListener('click', onClick, true)
  return () => {
    doc.removeEventListener('click', onClick, true)
    for (const [anchor, title] of ownedTitles) {
      if (title === null) anchor.removeAttribute('title')
      else anchor.title = title
    }
  }
}
