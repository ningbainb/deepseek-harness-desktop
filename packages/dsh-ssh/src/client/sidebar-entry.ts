/**
 * Sidebar entry injection.
 *
 * Desktop opens SSH through the native tools bridge. Web shells use a full
 * navigation row below New Session, alongside Task Board and above the
 * workspace browser. A MutationObserver watches the sidebar
 * root and re-inserts the row whenever a React re-render displaces it
 * (re-insertion happens in the same frame, before paint, so no flicker).
 *
 * The row is plain DOM (no React tree) so it can never disturb the shell's
 * reconciliation; the panel view it toggles is a separate React root mounted
 * in the center column (see mount.tsx).
 */
import { newSessionAnchor, sidebarRoot } from './sidebar-entry-anchor.ts'
import type { PanelController } from './panel/controller.ts'
import { tt } from './panel/helpers.ts'
import css from './panel/panel.module.css'

/** Stable data attribute identifying the injected entry row. */
export const ENTRY_SELECTOR = '[data-dsh-ssh-entry]'

/** Cross-plugin navigation event used by full-column custom surfaces. */
export const SURFACE_NAVIGATION_EVENT = 'dsh-web-ui:surface-navigation'
const SURFACE_ID = 'ssh'

/** Inline icon (matches the shell's 16px nav-icon look): a terminal prompt glyph. */
const ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M4.5 5.5l2.5 2.5-2.5 2.5"/><path d="M8.5 10.5h3"/></svg>'

/** Build the entry row (a detached button; insert once the shell is up). */
function createEntry(controller: PanelController): HTMLButtonElement {
  const entry = document.createElement('button')
  entry.type = 'button'
  entry.dataset.dshSshEntry = ''
  entry.className = css.entry
  entry.setAttribute('aria-label', tt('entry.label'))
  entry.setAttribute('title', tt('entry.tooltip'))
  entry.innerHTML = '<span class="' + css.entryIcon + '">' + ICON + '</span><span class="' + css.entryLabel + '">' + tt('entry.label') + '</span>'
  entry.addEventListener('click', () => {
    if (!controller.getSnapshot().panelOpen) {
      document.dispatchEvent(new CustomEvent(SURFACE_NAVIGATION_EVENT, {
        detail: { surface: SURFACE_ID },
      }))
    }
    controller.toggle()
  })
  return entry
}

/** Re-insert the entry after the New Session row (before the browser region). */
function placeEntry(root: HTMLElement, entry: HTMLButtonElement): boolean {
  const base = newSessionAnchor(root, 'first-button')
  if (base === undefined) return false
  if (entry.parentElement !== root) {
    // Position relative to the family block (entries injected by sibling
    // plugins), never relative to transient logoRow geometry: every family
    // plugin that self-heals during a re-render then lands in the same
    // relative order, so the entries cannot swap positions regardless of
    // observer callback order or of shell wrapper changes. There is no
    // append-to-end fallback: appending at the end would randomly reorder
    // the block after a shell re-render.
    const family = Array.from(root.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.matches('[data-dsh-taskboard-entry], [data-dsh-ssh-entry]'),
    )
    // ssh sits after the whole family block.
    const anchor = family.length > 0 ? family[family.length - 1].nextElementSibling : base.nextElementSibling
    root.insertBefore(entry, anchor)
  }
  return true
}

/**
 * Mount the sidebar entry, waiting for the shell to render and self-healing
 * on later React re-renders.
 * @param controller - the panel controller the entry toggles.
 * @returns disposer removing the entry and its observers.
 */
export function mountSidebarEntry(
  controller: PanelController,
  options?: { ensureView?: () => boolean; prepareMainSurface?: () => void },
): () => void {
  const candidate = typeof window === 'undefined' ? undefined : (window as typeof window & { dshDesktop?: {
    onDesktopToolOpen?: (tool: 'task-board' | 'ssh', callback: () => boolean) => () => void
  } }).dshDesktop
  const desktop = typeof candidate?.onDesktopToolOpen === 'function' ? candidate : undefined
  const entry = createEntry(controller)
  let root: HTMLElement | undefined
  let placed = false

  const tryPlace = (): void => {
    if (desktop) return
    if (root !== undefined && !root.isConnected) {
      // The shell rebuilt the sidebar pane (whole-tree teardown); the root
      // observer is gone with the old tree, so detach it and re-query from
      // scratch. The new pane is later noticed by the body-level watcher.
      rootObserver.disconnect()
      root = undefined
      placed = false
    }
    if (placed) {
      // Cheap short-circuit: entry still lives in a mountable subtree.
      if (document.body.contains(entry)) return
      // Entry was torn down together with the old tree; reset and re-place.
      rootObserver.disconnect()
      root = undefined
      placed = false
    }
    root ??= sidebarRoot()
    if (root === undefined) return
    placed = placeEntry(root, entry)
    if (placed) {
      rootObserver.observe(root, { childList: true, subtree: true })
    }
  }

  // Body-level watcher retained as the "whole rebuild" fallback: when the shell
  // tears down the whole sidebar pane, the root observer is gone with it and
  // only this body observation can notice the new pane mounting. It is no
  // longer disconnected after placement; the placed-and-still-mounted case
  // short-circuits through the cheap document.body.contains(entry) check, so
  // unrelated app mutations (e.g. chat streaming) cost one contains check
  // instead of churning the full re-query.
  const waitObserver = new MutationObserver(() => { tryPlace() })
  if (!desktop) waitObserver.observe(document.body, { childList: true, subtree: true })

  // Self-heal: if a React re-render displaces the row, re-insert it in the
  // same frame (microtask before paint -> no visible flicker).
  const rootObserver = new MutationObserver(() => {
    if (root === undefined || !root.isConnected) {
      placed = false
      tryPlace()
      return
    }
    if (!root.contains(entry)) {
      placed = placeEntry(root, entry)
    }
  })

  // Reflect the panel's open state on the row (active highlight). Note: assigning
  // undefined to dataset.active materializes data-active="undefined" and keeps the
  // row permanently highlighted — delete the attribute instead.
  const syncActive = () => {
    if (controller.getSnapshot().panelOpen) entry.dataset.active = 'true'
    else delete entry.dataset.active
  }
  const unsubscribe = controller.subscribe(syncActive)
  syncActive()

  const closeForNativeNavigation = (event: Event): void => {
    const target = event.target
    if (!(target instanceof Element) || entry.contains(target)) return
    if (target.closest('[data-pane="sidebar"], [class*="sidebarCol"]') !== null) {
      controller.close()
    }
  }
  const closeForOtherSurface = (event: Event): void => {
    const surface = (event as CustomEvent<{ surface?: string }>).detail?.surface
    if (surface !== undefined && surface !== SURFACE_ID) controller.close()
  }
  document.addEventListener('click', closeForNativeNavigation, true)
  document.addEventListener(SURFACE_NAVIGATION_EVENT, closeForOtherSurface)
  const unsubscribeDesktop = desktop?.onDesktopToolOpen?.('ssh', () => {
    options?.prepareMainSurface?.()
    const ready = (options?.ensureView?.() ?? false) || Boolean(document.querySelector('[data-dsh-ssh-view]')?.isConnected)
    if (!ready) return false
    document.dispatchEvent(new CustomEvent(SURFACE_NAVIGATION_EVENT, { detail: { surface: SURFACE_ID } }))
    controller.open()
    return true
  })

  tryPlace()

  return () => {
    waitObserver.disconnect()
    rootObserver.disconnect()
    unsubscribe()
    unsubscribeDesktop?.()
    document.removeEventListener('click', closeForNativeNavigation, true)
    document.removeEventListener(SURFACE_NAVIGATION_EVENT, closeForOtherSurface)
    entry.remove()
  }
}
