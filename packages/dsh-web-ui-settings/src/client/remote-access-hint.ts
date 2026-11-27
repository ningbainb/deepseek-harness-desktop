/**
 * Rewrite stale loopback-only remote-access instructions inside the Remote Access
 * modal and provide a one-click jump directly into plugin settings.
 */

export interface RemoteAccessHintOptions {
  openPluginSettings: () => boolean | void
}

const ENHANCED_ATTR = 'data-dsh-remote-hint-enhanced'
const ACTION_ATTR = 'data-dsh-remote-open-settings'

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

function scrollToRemotePluginCard(doc: Document): void {
  const scrollAttempt = () => {
    const scope = doc.querySelector('[data-plugin-panel], .dsh-desktop-settings-window') ?? doc.body
    if (!scope) return
    const candidates = scope.querySelectorAll('h1, h2, h3, h4, strong, summary, [data-plugin-id], section, article')
    for (const node of candidates) {
      const text = node.textContent ?? ''
      if (
        text.includes('远程访问设置')
        || text.includes('远程访问')
        || text.includes('移动端远程控制')
        || text.includes('remote-web-ui')
      ) {
        node.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
        break
      }
    }
  }
  const win = doc.defaultView
  if (win !== null) {
    win.setTimeout(scrollAttempt, 200)
    win.setTimeout(scrollAttempt, 600)
  }
}

export function installRemoteAccessHintEnhancer(
  doc: Document,
  options: RemoteAccessHintOptions,
): () => void {
  let disposed = false

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
      if (!matchedParagraph) continue

      const english = isEnglishDocument(doc)
      alert.setAttribute(ENHANCED_ATTR, 'true')
      matchedParagraph.textContent = english ? EN_REWRITTEN_HINT : ZH_REWRITTEN_HINT

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
          options.openPluginSettings()
          scrollToRemotePluginCard(doc)
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
  }
}
