/**
 * LLM Balance Overview Surface Mounting.
 * Mounts into center column and handles activation/deactivation synchronization.
 */
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { BalanceController } from './balance-controller.ts'
import { BalanceOverviewView } from './BalanceOverviewView.tsx'

export const BALANCE_VIEW_SELECTOR = '[data-dsh-balance-view]'
const CONVERSATION_COLUMN_SELECTOR = '[data-pane="conversation"], [class*="centerCol"]'
const ACTIVE_ATTR = 'data-dsh-balance-active'
const SURFACE_NAVIGATION_EVENT = 'dsh-web-ui:surface-navigation'
const SURFACE_ID = 'balance'

function conversationColumn(): HTMLElement | undefined {
  return document.querySelector<HTMLElement>(CONVERSATION_COLUMN_SELECTOR) ?? undefined
}

export function mountBalanceView(controller: BalanceController): () => void {
  let root: Root | undefined
  let container: HTMLDivElement | undefined

  const ensure = (): void => {
    if (container !== undefined) {
      if (container.isConnected) return
      root?.unmount()
      root = undefined
      container.remove()
      container = undefined
    }
    const column = conversationColumn()
    if (column === undefined) return
    // Positioning, stacking and visibility ride the [data-dsh-balance-view]
    // rules in balance.module.css (aligned with dsh-task-board); the mount
    // only toggles the root activation attribute.
    container = document.createElement('div')
    container.dataset.dshBalanceView = ''
    column.appendChild(container)
    root = createRoot(container)
    root.render(
      createElement(BalanceOverviewView, { controller, onClose: () => sync() }),
    )
  }

  const sync = (): void => {
    const open = controller.getSnapshot().open
    if (open) {
      ensure()
      document.documentElement.setAttribute(ACTIVE_ATTR, '')
    } else {
      document.documentElement.removeAttribute(ACTIVE_ATTR)
    }
  }

  const onSurfaceNav = (event: Event): void => {
    const custom = event as CustomEvent<{ surface?: string }>
    if (custom.detail?.surface !== SURFACE_ID) {
      controller.setOpen(false)
    }
  }

  // The usage view covers the conversation column, so the shell's normal
  // session click does not otherwise have a chance to reveal the selected
  // conversation. Close in capture phase before the shell handles the click;
  // this also covers clicking the already-current session, which emits no
  // session-change event.
  const SIDEBAR_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]'
  const onClickSidebarRow = (event: MouseEvent): void => {
    if (!controller.getSnapshot().open) return
    const target = event.target as HTMLElement | null
    if (target === null) return
    if (target.closest(SIDEBAR_ROW_SELECTOR) !== null) controller.setOpen(false)
  }

  document.addEventListener('click', onClickSidebarRow, true)
  document.addEventListener(SURFACE_NAVIGATION_EVENT, onSurfaceNav)
  const unsub = controller.subscribe(() => sync())

  // Observe conversation column mounting
  const observer = new MutationObserver(() => {
    if (controller.getSnapshot().open && (!container || !container.isConnected)) {
      sync()
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })

  return () => {
    document.removeEventListener('click', onClickSidebarRow, true)
    document.removeEventListener(SURFACE_NAVIGATION_EVENT, onSurfaceNav)
    unsub()
    observer.disconnect()
    document.documentElement.removeAttribute(ACTIVE_ATTR)
    root?.unmount()
    container?.remove()
  }
}
