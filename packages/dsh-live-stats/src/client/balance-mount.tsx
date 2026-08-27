/**
 * LLM Balance Overview Surface Mounting.
 * Mounts into center column and handles activation/deactivation synchronization.
 */
import { createElement } from 'react'
import type { BalanceController } from './balance-controller.ts'
import { BalanceOverviewView } from './BalanceOverviewView.tsx'

type ReactRoot = { unmount(): void }

export const BALANCE_VIEW_SELECTOR = '[data-dsh-balance-view]'
const CONVERSATION_COLUMN_SELECTOR = '[data-pane="conversation"], [class*="centerCol"]'
const ACTIVE_ATTR = 'data-dsh-balance-active'
const SURFACE_NAVIGATION_EVENT = 'dsh-web-ui:surface-navigation'
const SURFACE_ID = 'balance'

function conversationColumn(): HTMLElement | undefined {
  return document.querySelector<HTMLElement>(CONVERSATION_COLUMN_SELECTOR) ?? undefined
}

export function mountBalanceView(controller: BalanceController): () => void {
  let root: ReactRoot | undefined
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
    container = document.createElement('div')
    container.dataset.dshBalanceView = ''
    container.style.position = 'absolute'
    container.style.inset = '0'
    container.style.zIndex = '90'
    container.style.display = 'none'
    column.appendChild(container)
    void import('react-dom/client').then(({ createRoot }) => {
      if (!container) return
      root = createRoot(container)
      ;(root as unknown as { render(e: unknown): void }).render(
        createElement(BalanceOverviewView, { controller, onClose: () => sync() }),
      )
    }).catch(() => {})
  }

  const sync = (): void => {
    const open = controller.getSnapshot().open
    if (open) {
      ensure()
      if (container) container.style.display = 'flex'
      document.documentElement.setAttribute(ACTIVE_ATTR, '')
    } else {
      if (container) container.style.display = 'none'
      document.documentElement.removeAttribute(ACTIVE_ATTR)
    }
  }

  const onSurfaceNav = (event: Event): void => {
    const custom = event as CustomEvent<{ surface?: string }>
    if (custom.detail?.surface !== SURFACE_ID) {
      controller.setOpen(false)
    }
  }

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
    document.removeEventListener(SURFACE_NAVIGATION_EVENT, onSurfaceNav)
    unsub()
    observer.disconnect()
    document.documentElement.removeAttribute(ACTIVE_ATTR)
    root?.unmount()
    container?.remove()
  }
}
