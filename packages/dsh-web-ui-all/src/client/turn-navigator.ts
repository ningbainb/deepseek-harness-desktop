/**
 * Conversation Turn Navigator.
 *
 * Injects a floating navigation widget into the conversation pane that lets
 * users jump instantly to previous / next user messages (turns), and to the
 * bottom of the conversation. The widget self-heals via MutationObserver,
 * re-syncing whenever React re-renders the conversation pane.
 *
 * Selectors used:
 *  - Container: [data-pane="conversation"] (stamped by dsh-web-ui-all shim)
 *  - Scrollport: [data-conversation-scroll] (official conversation contract)
 *  - User messages: [data-chat-flow-kind="user"] (official conversation contract),
 *    followed by compatibility selectors for older shells.
 */

/** Stable data attribute for the injected navigator widget. */
const NAVIGATOR_ATTR = 'data-dsh-turn-navigator'

/** CSS injected once into <head> for the navigator widget. */
const NAVIGATOR_STYLE = `
[data-dsh-turn-navigator] {
  position: absolute;
  bottom: 12px;
  left: 16px;
  z-index: 200;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--dsw-alias-border-l2, #64748b);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, #1e293b);
  pointer-events: none;
}

[data-dsh-turn-navigator] button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2, rgba(30, 41, 59, 0.92));
  color: var(--dsw-alias-label-secondary, #94a3b8);
  font-size: 14px;
  cursor: pointer;
  pointer-events: all;
  transition: background 120ms ease, color 120ms ease, transform 80ms ease;
  box-shadow: none;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

[data-dsh-turn-navigator] button:hover {
  background: var(--dsw-alias-brand-primary, #3b82f6);
  color: #ffffff;
  transform: scale(1.08);
}

[data-dsh-turn-navigator] button:active {
  transform: scale(0.96);
}

[data-dsh-turn-navigator] button:disabled {
  opacity: 0.35;
  cursor: default;
  transform: none;
}

[data-dsh-turn-navigator] button[hidden] {
  display: none;
}

[data-dsh-turn-navigator] .dsh-turn-counter {
  font-size: 11px;
  font-weight: 600;
  color: var(--dsw-alias-label-tertiary, #64748b);
  background: var(--dsw-alias-bg-layer-2, rgba(30,41,59,0.85));
  border-radius: 10px;
  padding: 2px 8px;
  letter-spacing: 0.02em;
  pointer-events: none;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: none;
}
`.trim()

const USER_MSG_SELECTORS = [
  '[data-chat-flow-kind="user"]',
  '[data-message-role="user"]',
  '[class*="userMessage"]',
  '[class*="humanTurn"]',
  '[class*="turnUser"]',
  '[data-role="user"]',
].join(', ')

/** Collect all user message elements in DOM order. */
export function getUserMessages(pane: HTMLElement): HTMLElement[] {
  const matches = Array.from(pane.querySelectorAll<HTMLElement>(USER_MSG_SELECTORS))
  return matches.filter(turn => {
    const ancestor = turn.parentElement?.closest(USER_MSG_SELECTORS)
    return !ancestor || ancestor === pane || !pane.contains(ancestor)
  })
}

/** Find the conversation scrollable area inside the pane. */
export function findScrollRoot(pane: HTMLElement, turns = getUserMessages(pane)): HTMLElement {
  const official = pane.matches('[data-conversation-scroll]')
    ? pane
    : pane.querySelector<HTMLElement>('[data-conversation-scroll]')
  if (official !== null) return official

  const candidates = [pane, ...Array.from(pane.querySelectorAll<HTMLElement>('*'))]
    .filter((child) => {
      const style = getComputedStyle(child)
      return style.overflowY === 'auto' || style.overflowY === 'scroll'
    })
  const containingAllTurns = turns.length === 0
    ? candidates
    : candidates.filter(candidate => turns.every(turn => candidate.contains(turn)))
  const visiblyScrollable = containingAllTurns.filter(candidate => candidate.scrollHeight > candidate.clientHeight + 1)
  const pool = visiblyScrollable.length > 0 ? visiblyScrollable : containingAllTurns
  for (const child of pool) {
    if (!pool.some(other => other !== child && child.contains(other))) return child
  }
  return pane
}

function viewportTop(scrollRoot: HTMLElement): number {
  return scrollRoot.getBoundingClientRect().top + scrollRoot.clientTop
}

/** Determine the last user turn at or above the readable top anchor. */
export function currentTurnIndex(scrollRoot: HTMLElement, turns: HTMLElement[]): number {
  if (turns.length === 0) return -1
  // Keep this slightly below scrollToTurn's 60px landing offset. Using the
  // viewport center advances tall turns before the reader has reached them and
  // can make a Next click a no-op at the top of a real conversation.
  const viewAnchor = viewportTop(scrollRoot) + Math.min(80, scrollRoot.clientHeight / 4)
  for (let i = turns.length - 1; i >= 0; i--) {
    if ((turns[i]?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY) <= viewAnchor) return i
  }
  return 0
}

/** Smooth-scroll to a turn. */
export function scrollToTurn(scrollRoot: HTMLElement, turn: HTMLElement): void {
  const top = scrollRoot.scrollTop + turn.getBoundingClientRect().top - viewportTop(scrollRoot)
  scrollRoot.scrollTo({ top: Math.max(0, top - 60), behavior: 'smooth' })
}

/** Build and return the navigator widget element. */
function createNavigator(): HTMLDivElement {
  const nav = document.createElement('div')
  nav.setAttribute(NAVIGATOR_ATTR, '')

  const prevBtn = document.createElement('button')
  prevBtn.type = 'button'
  prevBtn.title = '上一条对话 (Previous Turn)'
  prevBtn.setAttribute('aria-label', '跳至上一条对话')
  prevBtn.dataset.role = 'prev'
  prevBtn.textContent = '↑'

  const counter = document.createElement('div')
  counter.className = 'dsh-turn-counter'
  counter.dataset.role = 'counter'
  counter.textContent = '0/0'

  const nextBtn = document.createElement('button')
  nextBtn.type = 'button'
  nextBtn.title = '下一条对话 (Next Turn)'
  nextBtn.setAttribute('aria-label', '跳至下一条对话')
  nextBtn.dataset.role = 'next'
  nextBtn.textContent = '↓'

  const bottomBtn = document.createElement('button')
  bottomBtn.type = 'button'
  bottomBtn.title = '跳至底部 (Jump to Bottom)'
  bottomBtn.setAttribute('aria-label', '跳至底部')
  bottomBtn.dataset.role = 'bottom'
  bottomBtn.textContent = '⤓'

  nav.appendChild(prevBtn)
  nav.appendChild(counter)
  nav.appendChild(nextBtn)
  nav.appendChild(bottomBtn)
  return nav
}

/** Update button disabled state and counter text. */
function syncNavigator(nav: HTMLDivElement, scrollRoot: HTMLElement, pane: HTMLElement): void {
  positionNavigator(nav, scrollRoot, pane)
  const turns = getUserMessages(pane)
  const total = turns.length
  const atBottom = scrollRoot.scrollTop + scrollRoot.clientHeight >= scrollRoot.scrollHeight - 40
  const idx = total > 0 && atBottom ? total - 1 : currentTurnIndex(scrollRoot, turns)

  const prevBtn = nav.querySelector<HTMLButtonElement>('[data-role="prev"]')
  const nextBtn = nav.querySelector<HTMLButtonElement>('[data-role="next"]')
  const counter = nav.querySelector<HTMLDivElement>('[data-role="counter"]')
  const bottomBtn = nav.querySelector<HTMLButtonElement>('[data-role="bottom"]')

  if (prevBtn) prevBtn.disabled = idx <= 0 || total === 0
  if (nextBtn) nextBtn.disabled = idx >= total - 1 || total === 0
  if (bottomBtn) {
    bottomBtn.disabled = atBottom
    const hidden = atBottom || hasNativeBottomAction(pane)
    if (bottomBtn.hidden !== hidden) bottomBtn.hidden = hidden
  }
  const nextCounterText = total === 0 ? '–' : String(idx + 1) + '/' + String(total)
  if (counter && counter.textContent !== nextCounterText) {
    counter.textContent = nextCounterText
  }
}

/** Keep navigation above the composer and away from its send/search controls. */
export function positionNavigator(nav: HTMLElement, scrollRoot: HTMLElement, pane: HTMLElement): void {
  const bounds = pane.getBoundingClientRect()
  if (bounds.height <= 0) return
  const composer = pane.querySelector<HTMLElement>('[data-composer-seat]')
    ?? document.querySelector<HTMLElement>('[data-composer-seat]')
  const composerTop = composer?.getBoundingClientRect().top ?? bounds.bottom
  const contentBottom = Math.min(bounds.bottom, scrollRoot.getBoundingClientRect().bottom, composerTop)
  const bottom = Math.max(12, Math.round(bounds.bottom - contentBottom + 12)) + 'px'
  if (nav.style.bottom !== bottom) nav.style.bottom = bottom
}

/** Attach click handlers to the navigator buttons. */
function bindNavigator(nav: HTMLDivElement, scrollRoot: () => HTMLElement, pane: HTMLElement): () => void {
  let settleTimer: ReturnType<typeof setTimeout> | undefined
  const onClick = (e: MouseEvent): void => {
    const btn = (e.target as HTMLElement).closest('button')
    if (!btn) return
    const role = btn.dataset.role
    const root = scrollRoot()
    const turns = getUserMessages(pane)
    const idx = currentTurnIndex(root, turns)

    if (role === 'prev' && idx > 0 && turns[idx - 1]) {
      scrollToTurn(root, turns[idx - 1]!)
    } else if (role === 'next' && idx < turns.length - 1 && turns[idx + 1]) {
      scrollToTurn(root, turns[idx + 1]!)
    } else if (role === 'bottom') {
      root.scrollTo({ top: root.scrollHeight, behavior: 'smooth' })
    }
    // Re-sync after scroll settles
    clearTimeout(settleTimer)
    settleTimer = setTimeout(() => syncNavigator(nav, scrollRoot(), pane), 350)
  }
  nav.addEventListener('click', onClick)
  return () => {
    clearTimeout(settleTimer)
    nav.removeEventListener('click', onClick)
  }
}

/**
 * Mount the conversation turn navigator into the given conversation pane.
 * @returns disposer.
 */
export function mountTurnNavigator(pane: HTMLElement): () => void {
  // Ensure the pane is positioned relatively so absolute children work
  const previousPosition = pane.style.position
  const ownsPosition = getComputedStyle(pane).position === 'static'
  if (ownsPosition) {
    pane.style.position = 'relative'
  }

  const nav = createNavigator()
  pane.appendChild(nav)
  let scrollRoot = findScrollRoot(pane)
  const onScroll = (): void => syncNavigator(nav, scrollRoot, pane)
  const refresh = (): void => {
    const nextRoot = findScrollRoot(pane)
    if (nextRoot !== scrollRoot) {
      scrollRoot.removeEventListener('scroll', onScroll)
      scrollRoot = nextRoot
      scrollRoot.addEventListener('scroll', onScroll, { passive: true })
    }
    syncNavigator(nav, scrollRoot, pane)
  }
  const disposeClicks = bindNavigator(nav, () => scrollRoot, pane)
  scrollRoot.addEventListener('scroll', onScroll, { passive: true })

  const mutationObs = new MutationObserver(records => {
    // Ignore our counter/position/disabled writes. Native controls may change
    // visibility without being replaced (theme, wrapper or disabled state).
    if (records.some(record => !nav.contains(record.target))) refresh()
  })
  mutationObs.observe(pane, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'aria-label', 'disabled', 'inert'],
  })
  const resizeObs = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(refresh)
  resizeObs?.observe(pane)
  const composer = document.querySelector<HTMLElement>('[data-composer-seat]')
  if (composer) resizeObs?.observe(composer)
  window.addEventListener('resize', refresh)

  syncNavigator(nav, scrollRoot, pane)

  return () => {
    mutationObs.disconnect()
    resizeObs?.disconnect()
    window.removeEventListener('resize', refresh)
    scrollRoot.removeEventListener('scroll', onScroll)
    disposeClicks()
    nav.remove()
    if (ownsPosition && pane.style.position === 'relative') pane.style.position = previousPosition
  }
}

/** Install styles once into <head>. */
function ensureStyle(): void {
  if (document.getElementById('dsh-turn-navigator-style')) return
  const style = document.createElement('style')
  style.id = 'dsh-turn-navigator-style'
  style.textContent = NAVIGATOR_STYLE
  document.head.appendChild(style)
}

/**
 * Bootstrap the turn navigator for the whole page lifetime.
 * Watches for the conversation pane to mount / re-mount and re-injects the widget.
 * @returns disposer.
 */
function isVisibleControl(element: HTMLElement, pane: HTMLElement): boolean {
  if (!element.isConnected || element.closest('[hidden], [aria-hidden="true"], [inert]')) return false
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false
    if (node === pane) break
  }
  return true
}

/** Native labels are from the pinned SDK locale contract, not CSS hashes. */
export function hasNativeBottomAction(pane: HTMLElement): boolean {
  return Array.from(pane.querySelectorAll<HTMLButtonElement>('button[aria-label="回到底部"], button[aria-label="Back to bottom"]'))
    .some(button => !button.disabled
      && !button.closest('[data-chat-flow], [data-dsh-turn-navigator]')
      && isVisibleControl(button, pane))
}

export function hasNativeTurnNavigator(pane: HTMLElement): boolean {
  return Array.from(pane.querySelectorAll<HTMLElement>('nav[aria-label="轮次导航"], nav[aria-label="Turn navigation"]'))
    .some(nav => {
      if (nav.querySelectorAll('button').length < 2) return false
      // DSH hides its rail in narrow conversation containers. A registered
      // but CSS-hidden rail must not suppress the usable Desktop fallback.
      return isVisibleControl(nav, pane)
    })
}

export function installTurnNavigator(): () => void {
  ensureStyle()
  let disposeNavigator: (() => void) | undefined
  let currentPane: HTMLElement | undefined
  let fallbackNeeded = false

  const PANE_SELECTOR = '[data-pane="conversation"]'

  const tryMount = (): void => {
    const pane = document.querySelector<HTMLElement>(PANE_SELECTOR)
    const native = pane !== null && hasNativeTurnNavigator(pane)
    // Empty sessions have no navigation actions. Keep observing so restored
    // history or the first message can enable the fallback in the same pane.
    const turns = pane && !native ? getUserMessages(pane) : []
    const scroll = pane && !native && turns.length === 0 ? findScrollRoot(pane, turns) : null
    const needed = pane !== null && !native && (turns.length > 0
      || (scroll !== null && scroll.scrollHeight > scroll.clientHeight + 40))
    if (pane === currentPane && needed === fallbackNeeded
      && (!needed || pane?.querySelector(`[${NAVIGATOR_ATTR}]`))) return
    if (pane !== currentPane) {
      resizeObserver?.disconnect()
      if (pane) resizeObserver?.observe(pane)
    }
    disposeNavigator?.()
    disposeNavigator = undefined
    currentPane = undefined
    fallbackNeeded = needed
    if (!pane) return
    currentPane = pane
    if (needed) disposeNavigator = mountTurnNavigator(pane)
  }

  const observer = new MutationObserver(tryMount)
  const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(tryMount)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'aria-hidden', 'hidden'] })
  window.addEventListener('resize', tryMount)
  tryMount()

  return () => {
    observer.disconnect()
    resizeObserver?.disconnect()
    window.removeEventListener('resize', tryMount)
    disposeNavigator?.()
    const style = document.getElementById('dsh-turn-navigator-style')
    style?.remove()
  }
}
