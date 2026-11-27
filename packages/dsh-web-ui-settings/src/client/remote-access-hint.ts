/**
 * Rewrite stale loopback-only remote-access instructions inside the Remote Access
 * modal and provide a one-click jump directly into plugin settings.
 */

export interface RemoteAccessHintOptions {
  openPluginSettings: () => boolean | void
}

const ENHANCED_ATTR = 'data-dsh-remote-hint-enhanced'
const ACTION_ATTR = 'data-dsh-remote-open-settings'
export const REMOTE_ACCESS_ROW_IDS = ['remote-web-ui', 'web-ui-remote-web-ui'] as const
const REMOTE_ROW = REMOTE_ACCESS_ROW_IDS
  .flatMap(id => [`[data-plugin-row="${id}"]`, `[data-plugin-row="include:${id}"]`]).join(',')
const REMOTE_DETAIL = REMOTE_ACCESS_ROW_IDS
  .map(id => `[data-plugin-row-detail="@linxin666/dsh-web-all#${id}"]`).join(',')

const ZH_REWRITTEN_HINT =
  '当前仅绑定在本机（127.0.0.1），手机或其他设备暂无法访问。你可以直接前往插件设置开启「局域网访问」，或配置公网隧道地址。'
const EN_REWRITTEN_HINT =
  'Currently bound to localhost (127.0.0.1), so other devices cannot reach it yet. Open plugin settings to enable LAN access or configure a public tunnel URL.'

function isEnglishDocument(doc: Document): boolean {
  return doc.documentElement.lang.toLowerCase().startsWith('en')
}

function isStaleRemoteHintParagraph(text: string): boolean {
  if (!text.includes('127.0.0.1')) return false
  return (
    text.includes('设置 → Web 插件 → 远程访问设置')
    || text.includes('dsh web --host 0.0.0.0')
    || text.includes('Settings → Web Plugins → Remote access')
  )
}

function openRemotePluginRowWhenReady(doc: Document): () => void {
  const win = doc.defaultView
  if (!win) return () => {}
  let panelSeen = false
  let rowOpened = false
  const stop = () => observer.disconnect()
  const openRow = () => {
    const panel = doc.querySelector('[data-plugin-panel]')
    if (!panel) {
      if (panelSeen) stop()
      return
    }
    panelSeen = true
    if (panel.getAttribute('aria-busy') === 'true') return
    const detail = panel.querySelector(REMOTE_DETAIL)
    if (detail) {
      const expand = detail.querySelector<HTMLButtonElement>('[data-plugin-config] button[aria-expanded]')
      if (!expand) return
      stop()
      if (expand.getAttribute('aria-expanded') === 'false') expand.click()
      return
    }
    if (rowOpened) return
    const configure = panel.querySelector(REMOTE_ROW)
      ?.querySelector<HTMLButtonElement>('button[type="button"][aria-label]:not([role="switch"]):not(:disabled)')
    if (!configure) return
    rowOpened = true
    configure.click()
  }
  const observer = new win.MutationObserver(openRow)
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-busy', 'disabled'] })
  openRow()
  return stop
}

export function installRemoteAccessHintEnhancer(
  doc: Document,
  options: RemoteAccessHintOptions,
): () => void {
  let disposed = false
  let stopNavigation: (() => void) | undefined

  const scan = () => {
    if (disposed) return
    const alerts = doc.querySelectorAll<HTMLElement>('[role="dialog"] [role="alert"]')
    for (const alert of alerts) {
      if (alert.getAttribute(ENHANCED_ATTR) === 'true') continue
      const paragraphs = alert.querySelectorAll<HTMLParagraphElement>('p')
      let matchedParagraph: HTMLParagraphElement | undefined
      for (const paragraph of paragraphs) {
        if (isStaleRemoteHintParagraph(paragraph.textContent ?? '')) {
          matchedParagraph = paragraph
          break
        }
      }
      if (!matchedParagraph && !alert.hasAttribute('data-dsh-remote-lan-required')) continue

      const english = isEnglishDocument(doc)
      alert.setAttribute(ENHANCED_ATTR, 'true')
      if (matchedParagraph) matchedParagraph.textContent = english ? EN_REWRITTEN_HINT : ZH_REWRITTEN_HINT

      if (alert.querySelector(`[${ACTION_ATTR}="true"]`) !== null) continue

      const actions = doc.createElement('div')
      actions.style.cssText = 'margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;'

      const jumpButton = doc.createElement('button')
      jumpButton.type = 'button'
      jumpButton.setAttribute(ACTION_ATTR, 'true')
      jumpButton.textContent = english ? 'Open remote access settings →' : '前往远程访问设置 →'
      jumpButton.style.cssText = [
        'border: 1px solid var(--dsw-alias-border-l3, rgba(128, 128, 128, 0.3))',
        'border-radius: 8px',
        'padding: 6px 12px',
        'font-size: 13px',
        'font-weight: 500',
        'cursor: pointer',
        'background: var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.08))',
        'color: var(--dsw-alias-label-primary, inherit)',
      ].join('; ')

      jumpButton.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        const dialog = alert.closest('[role="dialog"]')
        const closeButton = dialog?.querySelector<HTMLButtonElement>(
          'button[aria-label*="关闭"], button[aria-label*="Close"]',
        )
        closeButton?.click()
        const schedule = doc.defaultView?.setTimeout.bind(doc.defaultView) ?? globalThis.setTimeout
        schedule(() => {
          if (disposed) return
          stopNavigation?.()
          if (options.openPluginSettings() !== false) stopNavigation = openRemotePluginRowWhenReady(doc)
        }, 0)
      })

      actions.append(jumpButton)
      alert.append(actions)
    }
  }

  scan()

  const root = doc.body ?? doc.documentElement
  const Observer = doc.defaultView?.MutationObserver ?? globalThis.MutationObserver
  const observer = typeof Observer === 'function' && root !== null
    ? new Observer(() => { scan() })
    : undefined
  observer?.observe(root, { childList: true, subtree: true })

  return () => {
    disposed = true
    observer?.disconnect()
    stopNavigation?.()
  }
}
