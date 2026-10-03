import { openDesktopSurface } from '@linxin666/dsh-desktop-client'
import { relayEn, relayZh } from './locales.ts'
import css from './relay-onboarding.module.css'

export function installAccountRelayRecommendation(doc: Document): () => void {
  if (!(doc.defaultView as Window & { dshDesktop?: unknown } | null)?.dshDesktop) return () => {}
  const owned = new Map<HTMLElement, HTMLElement>()
  const label = (item: HTMLElement) => {
    const copy = item.cloneNode(true) as HTMLElement
    for (const hidden of copy.querySelectorAll('[aria-hidden="true"], svg')) hidden.remove()
    return copy.textContent?.trim() ?? ''
  }
  let disposed = false
  const sync = () => {
    if (disposed) return
    for (const [official, node] of owned) {
      if (!official.isConnected || !node.isConnected) {
        node.remove()
        owned.delete(official)
      }
    }
    const accountOpen = doc.querySelector('[data-signed-out="true"][aria-expanded="true"][aria-haspopup="menu"]')
    if (!accountOpen) {
      for (const node of owned.values()) node.remove()
      owned.clear()
      return
    }
    for (const menu of doc.querySelectorAll<HTMLElement>('[role="menu"]')) {
      const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      if (!items.some(item => /^(?:设置|Settings)$/iu.test(label(item)))) continue
      const official = items.find(item => /^(?:登录|Sign in|Log in)$/iu.test(label(item)))
      if (!official || owned.has(official)) continue
      const copy = label(official) === '登录' ? relayZh : relayEn
      const node = doc.createElement('div')
      node.dataset.dshAccountRelay = 'true'
      node.className = css.accountRecommendation ?? ''
      const description = doc.createElement('p')
      description.textContent = copy.accountRecommendation
      description.className = css.description ?? ''
      const button = doc.createElement('button')
      button.type = 'button'
      button.setAttribute('role', 'menuitem')
      button.textContent = copy.accountConnect
      button.className = css.secondary ?? ''
      button.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        button.disabled = true
        void openDesktopSurface('extensions', { setting: 'models' }).then(opened => {
          if (!opened) description.textContent = copy.accountOpenFailed
        }).catch(() => { description.textContent = copy.accountOpenFailed }).finally(() => {
          if (button.isConnected) button.disabled = false
        })
      })
      node.append(description, button)
      official.after(node)
      owned.set(official, node)
    }
  }
  const observer = new MutationObserver(sync)
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded', 'data-signed-out'] })
  sync()
  return () => {
    disposed = true
    observer.disconnect()
    for (const node of owned.values()) node.remove()
    owned.clear()
  }
}
