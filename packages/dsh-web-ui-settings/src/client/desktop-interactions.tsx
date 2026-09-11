import { createRoot, type Root } from 'react-dom/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { ProjectDialog } from './ProjectDialog.tsx'
import css from './desktop-interactions.module.css'

/** Add a persistent browser close action by delegating to the existing tab's lifecycle. */
export function installBrowserClose(document: Document): () => void {
  const owned = new Set<HTMLButtonElement>()
  const scan = () => {
    for (const input of document.querySelectorAll<HTMLInputElement>('[data-dsh-panel-host] input[placeholder]')) {
      if (!/^(输入网址|Enter a URL)/.test(input.placeholder)) continue
      const bar = input.parentElement
      const browser = bar?.parentElement
      const tabContent = browser?.parentElement
      const contents = tabContent?.parentElement
      const strip = contents?.previousElementSibling
      if (!bar || !tabContent || !contents || !strip || bar.querySelector('[data-dsh-browser-close]')) continue
      const index = [...contents.children].indexOf(tabContent)
      const tab = strip.querySelectorAll<HTMLElement>('[draggable="true"]')[index]
      const original = tab?.querySelector<HTMLButtonElement>('button[aria-label="关闭"], button[aria-label="Close"]')
      if (!original) continue
      const button = document.createElement('button')
      button.type = 'button'; button.className = css.browserClose; button.textContent = '×'
      button.dataset.dshBrowserClose = 'true'
      button.title = document.documentElement.lang.startsWith('en') ? 'Close browser' : '关闭浏览器'
      button.setAttribute('aria-label', button.title)
      button.addEventListener('click', () => {
        if (!original.isConnected) return
        original.click()
        document.querySelector<HTMLTextAreaElement>('[data-slot="conversation"] textarea')?.focus()
      })
      owned.add(button); bar.append(button)
    }
    for (const button of owned) if (!button.isConnected) owned.delete(button)
  }
  const observer = new MutationObserver(scan)
  observer.observe(document.body, { childList: true, subtree: true })
  const onKey = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'w' || event.shiftKey) return
    const active = document.activeElement
    for (const button of owned) {
      const browser = button.parentElement?.parentElement
      if (browser?.contains(active)) { event.preventDefault(); event.stopImmediatePropagation(); button.click(); return }
    }
  }
  document.addEventListener('keydown', onKey, true); scan()
  return () => { observer.disconnect(); document.removeEventListener('keydown', onKey, true); for (const button of owned) button.remove() }
}

export function installProjectDialog(ctx: ClientContext): () => void {
  let root: Root | undefined
  let host: HTMLElement | undefined
  let trigger: HTMLElement | undefined
  const close = () => { root?.unmount(); root = undefined; host?.remove(); host = undefined; trigger?.focus() }
  const open = (event: Event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button,[role="button"],[role="menuitem"]') : null
    if (!target || target.closest('[data-dsh-project-dialog]')) return
    const label = target.getAttribute('aria-label') || target.getAttribute('title') || target.textContent?.trim() || ''
    if (!/^(创建项目|新建项目|添加项目|添加工作区|新建工作区|选择工作区|Choose workspace|Select workspace|Create project|New project|Add project|Add workspace|Create workspace)$/i.test(label)) return
    const desktop = (window as unknown as { dshDesktop?: { pickProjectDirectory?: () => Promise<string | undefined> } }).dshDesktop
    // Browser and remote hosts retain their official directory-browser flow.
    if (typeof desktop?.pickProjectDirectory !== 'function') return
    event.preventDefault(); event.stopImmediatePropagation()
    if (root) return
    trigger = target; host = document.createElement('div'); document.body.append(host); root = createRoot(host)
    root.render(<ProjectDialog services={ctx} chooseExisting={/^(选择工作区|Choose workspace|Select workspace)$/i.test(label)} pickFolder={desktop?.pickProjectDirectory} language={document.documentElement.lang.startsWith('en') ? 'en' : 'zh'} onClose={close} />)
  }
  document.addEventListener('click', open, true)
  return () => { document.removeEventListener('click', open, true); close() }
}
