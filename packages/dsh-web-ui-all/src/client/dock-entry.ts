/**
 * Desktop Extension Dock sidebar entry.
 *
 * The footer Dock takes precedence when mounted. Older shells receive a
 * navigation row between New Session and the workspace browser alongside
 * Task Board and SSH. The button prefers the main-window desktop bridge and
 * retains the runtime transport bridge for older desktop shells.
 *
 * This file is part of the aggregate plugin; it does not modify DSH source
 * and can be removed without affecting the core runtime.
 */
import { newSessionAnchor, sidebarRoot } from './sidebar-entry-anchor.ts'

/** Stable data attribute identifying the injected entry row. */
export const ENTRY_SELECTOR = '[data-dsh-dock-entry]'
export const FOOTER_ENTRY_SELECTOR = '[data-dsh-extension-dock-entry] button'

/** Inline icon (matches the shell's 16px nav-icon look): a dock/panel glyph. */
const ICON = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2.5" width="7" height="11" rx="1.5"/><rect x="11" y="2.5" width="3" height="4" rx="1"/><rect x="11" y="9.5" width="3" height="4" rx="1"/></svg>`

/** Build the entry row (a detached button; insert once the shell is up). */
function createEntry(): HTMLButtonElement {
  const entry = document.createElement('button')
  entry.type = 'button'
  entry.dataset.dshDockEntry = ''
  entry.className = 'dsh-dock-entry'
  entry.setAttribute('aria-label', '扩展坞')
  entry.setAttribute('title', '打开扩展坞')
  entry.innerHTML = `<span class="dsh-dock-entry-icon">${ICON}</span><span class="dsh-dock-entry-label">扩展坞</span>`
  entry.addEventListener('click', () => {
    entry.title = '打开扩展坞'
    const desktop = globalThis as {
      dshDesktop?: { openExtensionDock?: () => Promise<unknown> }
      dshDesktopTransport?: { openExtensions?: (tab?: string) => Promise<unknown> }
    }
    try {
      const opening = typeof desktop.dshDesktop?.openExtensionDock === 'function'
        ? desktop.dshDesktop.openExtensionDock()
        : desktop.dshDesktopTransport?.openExtensions?.()
      if (opening === undefined) entry.title = '无法打开扩展坞，请重试'
      void Promise.resolve(opening).then(opened => {
        if (opened === false) entry.title = '无法打开扩展坞，请重试'
      }).catch(() => { entry.title = '无法打开扩展坞，请重试' })
    } catch {
      entry.title = '无法打开扩展坞，请重试'
    }
  })
  return entry
}

/** Re-insert the entry after the New Session row (before the browser region). */
function placeEntry(root: HTMLElement, entry: HTMLButtonElement): boolean {
  const base = newSessionAnchor(root, 'first-button')
  if (base === undefined) return false
  if (entry.parentElement !== root) {
    const family = Array.from(root.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.matches('[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-dock-entry]'),
    )
    // dock entry sits after the whole family block.
    const anchor = family.length > 0 ? family[family.length - 1].nextElementSibling : base.nextElementSibling
    root.insertBefore(entry, anchor)
  }
  return true
}

/**
 * Mount the sidebar entry, waiting for the shell to render and self-healing
 * on later React re-renders.
 * @returns disposer removing the entry and its observers.
 */
export function mountDockEntry(): () => void {
  if (typeof document !== 'undefined' && document.querySelector(ENTRY_SELECTOR) !== null) {
    return () => {}
  }
  const entry = createEntry()
  let root: HTMLElement | undefined
  let placed = false
  let footerEntry: HTMLElement | undefined

  const tryPlace = (): void => {
    if (root !== undefined && !root.isConnected) {
      rootObserver.disconnect()
      root = undefined
      placed = false
      footerEntry = undefined
    }
    root ??= sidebarRoot()
    if (root === undefined) return
    rootObserver.observe(root, { childList: true, subtree: true })
    footerEntry = root.querySelector<HTMLElement>(FOOTER_ENTRY_SELECTOR) ?? undefined
    if (footerEntry !== undefined) {
      entry.remove()
      placed = false
      return
    }
    if (placed && root.contains(entry)) return
    placed = placeEntry(root, entry)
  }

  const waitObserver = new MutationObserver(() => {
    if (root === undefined || !root.isConnected) tryPlace()
  })
  waitObserver.observe(document.body, { childList: true, subtree: true })

  const rootObserver = new MutationObserver(records => {
    if (root === undefined || !root.isConnected) {
      placed = false
      tryPlace()
      return
    }
    if (footerEntry?.isConnected) return
    if (footerEntry !== undefined || !root.contains(entry) || records.some(record =>
      [...record.addedNodes].some(node => node instanceof Element &&
        (node.matches(`[data-dsh-extension-dock-entry], ${FOOTER_ENTRY_SELECTOR}`) || node.querySelector(FOOTER_ENTRY_SELECTOR))))) tryPlace()
  })

  tryPlace()

  return () => {
    waitObserver.disconnect()
    rootObserver.disconnect()
    entry.remove()
  }
}
