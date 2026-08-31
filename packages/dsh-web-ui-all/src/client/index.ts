/**
 * dsh-web-ui compat shim, browser half (folded into the aggregate package).
 *
 * The current dsh web shell renders its grid columns without the legacy
 * `data-pane` / `data-dsh-frame` hooks (the columns carry css-module class
 * names such as `*_sidebarCol` / `*_centerCol` / `*_detailsCol`). The
 * dsh-web-ui family plugins (task-board, ssh, aionui-panel, several skins)
 * mount at the DOM level through those legacy selectors, so without them the
 * plugins stay silent even though they load.
 *
 * This shim stamps the expected attributes onto the real shell elements and
 * re-applies them on any DOM mutation (React re-renders that re-create the
 * columns), which restores every DOM-mounting plugin and the skins' column
 * selectors in one place. It only ever WRITES attributes; it never removes
 * nodes and never disturbs React's reconciliation.
 */
import type { Context } from '@deepseek-ai/cordis'
import './sidebar-rail.module.css'
import { installTurnNavigator } from './turn-navigator.ts'

/** Column shims: element selector → attribute to stamp. */
const COLUMN_SHIMS: ReadonlyArray<readonly [selector: string, attribute: string]> = [
  ['[class*="sidebarCol"]', 'data-pane="sidebar"'],
  ['[class*="centerCol"]', 'data-pane="conversation"'],
  ['[class*="detailsCol"]', 'data-pane="details"'],
]

/**
 * The current shell writes rail-only layout declarations directly onto the
 * footer slot wrapper. It removes the width/flex declarations when the rail
 * opens again, but older shell builds leave `margin-inline:auto` and
 * `justify-content:center` behind. Clear only those known rail declarations
 * while the sidebar is wide so the shell's normal footer layout can resume.
 */
function resetExpandedFooterActionStyles(sidebar: HTMLElement, isCollapsed: boolean): boolean {
  if (isCollapsed) return false
  let changed = false
  for (const action of sidebar.querySelectorAll<HTMLElement>('[data-slot="sidebar.footer.action"]')) {
    if (action.style.getPropertyValue('margin-inline') === 'auto') {
      action.style.removeProperty('margin-inline')
      changed = true
    }
    if (action.style.getPropertyValue('justify-content') === 'center') {
      action.style.removeProperty('justify-content')
      changed = true
    }
  }
  return changed
}

/** One pass over the current DOM. Returns false once every stamp is already in place. */
function applyShims(): boolean {
  let changed = false
  for (const [selector, attribute] of COLUMN_SHIMS) {
    const el = document.querySelector(selector)
    const eq = attribute.indexOf('=')
    const name = attribute.slice(0, eq)
    const value = attribute.slice(eq + 1).replace(/^"|"$/g, '')
    if (el !== null && el.getAttribute(name) !== value) {
      el.setAttribute(name, value)
      changed = true
    }
  }

  const sidebarEl = document.querySelector<HTMLElement>('[data-pane="sidebar"], [class*="sidebarCol"]')
  const frame = sidebarEl?.parentElement ?? null
  if (frame !== null && frame.getAttribute('data-dsh-frame') !== '') {
    frame.setAttribute('data-dsh-frame', '')
    changed = true
  }

  // Only use stable state owned by the shell itself. Descendant rail markers
  // are written during the collapse animation and may survive one or more
  // React commits after the sidebar has already widened again; using them as
  // the source of truth is what made the footer drift persistently.
  const sidebarClassName = typeof sidebarEl?.className === 'string' ? sidebarEl.className : ''
  const isCollapsed = sidebarEl !== null && (
    (sidebarEl.offsetWidth > 0 && sidebarEl.offsetWidth <= 80) ||
    sidebarEl.classList.contains('hHd-Xa_collapsed') ||
    /(?:^|\s)collapsed(?:\s|$)/u.test(sidebarClassName)
  )

  if (sidebarEl !== null) {
    changed = resetExpandedFooterActionStyles(sidebarEl, isCollapsed) || changed
  }

  if (frame !== null) {
    if (isCollapsed && !frame.hasAttribute('data-sidebar-collapsed')) {
      frame.setAttribute('data-sidebar-collapsed', '')
      changed = true
    } else if (!isCollapsed && frame.hasAttribute('data-sidebar-collapsed')) {
      frame.removeAttribute('data-sidebar-collapsed')
      changed = true
    }
  }

  if (sidebarEl !== null) {
    if (isCollapsed && !sidebarEl.hasAttribute('data-sidebar-collapsed')) {
      sidebarEl.setAttribute('data-sidebar-collapsed', '')
      changed = true
    } else if (!isCollapsed && sidebarEl.hasAttribute('data-sidebar-collapsed')) {
      sidebarEl.removeAttribute('data-sidebar-collapsed')
      changed = true
    }
  }

  if (isCollapsed && !document.body.hasAttribute('data-sidebar-collapsed')) {
    document.body.setAttribute('data-sidebar-collapsed', '')
    changed = true
  } else if (!isCollapsed && document.body.hasAttribute('data-sidebar-collapsed')) {
    document.body.removeAttribute('data-sidebar-collapsed')
    changed = true
  }

  return changed
}

/**
 * Coalesce mutation bursts into one pass per frame. React renders burst
 * dozens of subtree mutations per commit; stamping on every single mutation
 * callback turned each render into many querySelector sweeps. A scheduled
 * rAF plus a done flag folds the whole burst into a single pass, and the
 * idempotence check stops the work entirely once every attribute is set.
 */
function schedulePass(): void {
  if (shimScheduled) return
  shimScheduled = true
  requestAnimationFrame(() => {
    shimScheduled = false
    applyShims()
  })
}

/** True while a coalesced pass is pending. */
let shimScheduled = false

/** Required services: none — the shim must run before any DOM mount waits. */
export const inject = [] as const

/**
 * Register the shim for the page lifetime.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    applyShims()
    // The shell renders after boot settlement and React can re-create the
    // columns on re-render; re-stamp on any DOM mutation. The callback only
    // schedules a coalesced pass — mutations never run the sweep inline, and
    // the pass short-circuits once every attribute is in place. Writes only
    // the same attribute values, so this never fights React.
    const observer = new MutationObserver(schedulePass)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'data-wide', 'data-rail'] })

    let resizeObserver: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(schedulePass)
      const sidebar = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]')
      if (sidebar) resizeObserver.observe(sidebar)
    }

    return () => {
      observer.disconnect()
      resizeObserver?.disconnect()
      shimScheduled = false
    }
  })

  // Conversation turn navigator: floating ↑ ↓ ⤓ buttons in the chat pane.
  ctx.effect(() => installTurnNavigator(), 'dsh-web-ui-all: turn navigator')
}
