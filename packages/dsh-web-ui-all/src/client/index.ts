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

/** Column shims: element selector → attribute to stamp. */
const COLUMN_SHIMS: ReadonlyArray<readonly [selector: string, attribute: string]> = [
  ['[class*="sidebarCol"]', 'data-pane="sidebar"'],
  ['[class*="centerCol"]', 'data-pane="conversation"'],
  ['[class*="detailsCol"]', 'data-pane="details"'],
]

/** Stamp one attribute of the form `name="value"` onto an element, if found. */
function stamp(el: Element | null, attribute: string): void {
  if (el === null) return
  const eq = attribute.indexOf('=')
  const name = attribute.slice(0, eq)
  const value = attribute.slice(eq + 1).replace(/^"|"$/g, '')
  el.setAttribute(name, value)
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
  // The frame is the grid item that parents the sidebar column.
  const frame = document.querySelector('[class*="sidebarCol"]')?.parentElement ?? null
  if (frame !== null && frame.getAttribute('data-dsh-frame') !== '') {
    frame.setAttribute('data-dsh-frame', '')
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
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      shimScheduled = false
    }
  })
}