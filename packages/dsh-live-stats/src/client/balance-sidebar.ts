/**
 * LLM Balance Sidebar Entry.
 * Injects a sidebar button that shows live balance and opens the balance overview.
 */
import type { BalanceController } from './balance-controller.ts'
import css from './balance.module.css'

export const BALANCE_ENTRY_SELECTOR = '[data-dsh-balance-entry]'
const SURFACE_NAVIGATION_EVENT = 'dsh-web-ui:surface-navigation'
const SURFACE_ID = 'balance'

const BALANCE_ICON = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 5v1.5M8 9.5V11M10 7a2 2 0 00-4 0c0 1.1.9 1.7 2 2a2 2 0 010 4"/></svg>`

function sidebarRoot(): HTMLElement | undefined {
  const column = document.querySelector<HTMLElement>('[data-pane="sidebar"], [class*="sidebarCol"]')
  if (column === null) return undefined
  const logoOwner = column.querySelector<HTMLElement>('[class*="logoRow"]')?.parentElement
  return logoOwner ?? (column.firstElementChild as HTMLElement | undefined)
}

function createEntry(controller: BalanceController): HTMLButtonElement {
  const entry = document.createElement('button')
  entry.type = 'button'
  entry.dataset.dshBalanceEntry = ''
  entry.className = css.sidebarEntry

  const iconSpan = document.createElement('span')
  iconSpan.className = css.sidebarIcon
  iconSpan.innerHTML = BALANCE_ICON

  const labelSpan = document.createElement('span')
  labelSpan.className = css.sidebarLabel
  labelSpan.textContent = '大模型用量'

  const amountSpan = document.createElement('span')
  amountSpan.className = css.sidebarAmount
  amountSpan.dataset.dshBalanceAmount = ''

  entry.appendChild(iconSpan)
  entry.appendChild(labelSpan)
  entry.appendChild(amountSpan)

  entry.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent(SURFACE_NAVIGATION_EVENT, {
      detail: { surface: SURFACE_ID },
    }))
    controller.toggleOpen()
  })

  return entry
}

function updateEntryAmount(entry: HTMLButtonElement, state: ReturnType<BalanceController['getSnapshot']>): void {
  const amountSpan = entry.querySelector<HTMLSpanElement>('[data-dsh-balance-amount]')
  if (amountSpan) {
    amountSpan.textContent = state.loading ? '…' : `${state.totalBalance} ${state.currency}`
  }
}

function placeEntry(root: HTMLElement, entry: HTMLButtonElement): boolean {
  const family = Array.from(root.children).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement &&
      (el.matches('[data-dsh-taskboard-entry]') ||
       el.matches('[data-dsh-ssh-entry]') ||
       el.matches('[data-dsh-balance-entry]')),
  )
  if (entry.parentElement === root) return true

  // Balance entry sits after task board and SSH entries
  const lastSibling = family.filter(el => !el.matches('[data-dsh-balance-entry]')).at(-1)
  const anchor = lastSibling
    ? lastSibling.nextElementSibling
    : (() => {
        const logoRow = root.querySelector<HTMLElement>('[class*="logoRow"]')
        const base = logoRow !== null && logoRow.parentElement === root ? logoRow : undefined
        return base?.nextElementSibling ?? root.children[1] ?? null
      })()

  root.insertBefore(entry, anchor)
  return true
}

export function mountBalanceSidebarEntry(controller: BalanceController): () => void {
  let entry: HTMLButtonElement | undefined
  let observer: MutationObserver | undefined
  let unsubState: (() => void) | undefined

  const ensureEntry = (): void => {
    const root = sidebarRoot()
    if (root === undefined) return
    if (entry === undefined) {
      entry = createEntry(controller)
    }
    placeEntry(root, entry)
  }

  const bootstrap = (): void => {
    ensureEntry()
    if (entry) {
      unsubState?.()
      unsubState = controller.subscribe((state) => {
        if (entry) updateEntryAmount(entry, state)
      })
      // Kick off initial balance fetch
      void controller.fetchBalance()
    }
  }

  observer = new MutationObserver(() => {
    if (!entry?.isConnected) {
      ensureEntry()
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })

  bootstrap()
  return () => {
    observer?.disconnect()
    unsubState?.()
    entry?.remove()
    entry = undefined
  }
}
