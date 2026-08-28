/**
 * LLM Balance Sidebar Entry.
 * Injects a sidebar button that shows live balance and opens the balance overview.
 */
import type { BalanceController } from './balance-controller.ts'
import css from './balance.module.css'

export const BALANCE_ENTRY_SELECTOR = '[data-dsh-balance-entry]'
const SURFACE_NAVIGATION_EVENT = 'dsh-web-ui:surface-navigation'
const SURFACE_ID = 'balance'

const BALANCE_ICON = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 13.5h11"/><path d="M4 11V7.5"/><path d="M8 11V3.5"/><path d="M12 11V6"/></svg>`

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
  entry.title = state.loading ? '大模型用量' : `大模型用量 · 余额 ${state.totalBalance} ${state.currency}`
  entry.toggleAttribute('data-active', state.open)
}

function placeEntry(root: HTMLElement, entry: HTMLButtonElement): boolean {
  // Anchor directly below the shell's New Session row, ahead of entries
  // injected by sibling plugins, so the usage entry is always the first
  // custom row. On current desktop shells the "新开会话" button is a direct
  // child of the sidebar root sitting right after the logo row (NOT nested
  // inside it), so prefer the button itself as the anchor; older shells that
  // nest it in the logo row anchor on that row instead.
  const newSession = root.querySelector<HTMLButtonElement>('button[class*="newSession"]')
  const newSessionRow = newSession?.closest('[class*="logoRow"]')
  const base = newSessionRow instanceof HTMLElement && newSessionRow.parentElement === root
    ? newSessionRow
    : newSession !== null && newSession.parentElement === root
      ? newSession
      : (() => {
          const logoRow = root.querySelector<HTMLElement>('[class*="logoRow"]')
          return logoRow !== null && logoRow.parentElement === root ? logoRow : undefined
        })()
  if (base === undefined) return false

  // Sibling plugins (task board / ssh / skill center) insert their own rows
  // right after the New Session row too, pushing this entry down. They only
  // re-insert when detached, so re-asserting our slot whenever it drifts is
  // stable: once we sit directly after the base, nobody moves again.
  if (entry.parentElement === root && entry.previousElementSibling === base) return true
  // NOTE: base.nextElementSibling may be null (base last) — insertBefore
  // treats null as "append", which is exactly the slot after base.
  root.insertBefore(entry, base.nextElementSibling)
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
      // Subscribe at creation time, not only at bootstrap: when the shell is
      // not mounted yet on first pass, the observer creates the entry later
      // and a bootstrap-only subscription would never attach, leaving the
      // amount and tooltip empty forever.
      unsubState = controller.subscribe((state) => {
        if (entry) updateEntryAmount(entry, state)
      })
      // Kick off initial balance fetch
      void controller.fetchBalance()
    }
    placeEntry(root, entry)
  }

  observer = new MutationObserver(() => {
    if (entry === undefined || !entry.isConnected) {
      ensureEntry()
      return
    }
    // Re-assert the slot: sibling plugin insertions push this entry down
    // without disconnecting it, so presence alone is not enough.
    const root = sidebarRoot()
    if (root !== undefined) placeEntry(root, entry)
  })
  observer.observe(document.body, { childList: true, subtree: true })

  ensureEntry()
  return () => {
    observer?.disconnect()
    unsubState?.()
    entry?.remove()
    entry = undefined
  }
}
