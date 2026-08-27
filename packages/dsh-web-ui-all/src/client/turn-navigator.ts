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
 *  - User messages: [class*="userMessage"], [data-message-role="user"],
 *    [class*="humanTurn"], [class*="turnUser"]
 */

/** Stable data attribute for the injected navigator widget. */
const NAVIGATOR_ATTR = 'data-dsh-turn-navigator'

/** CSS injected once into <head> for the navigator widget. */
const NAVIGATOR_STYLE = `
[data-dsh-turn-navigator] {
  position: absolute;
  bottom: 80px;
  right: 16px;
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: none;
}

[data-dsh-turn-navigator] button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: var(--dsw-alias-bg-layer-2, rgba(30, 41, 59, 0.92));
  color: var(--dsw-alias-label-secondary, #94a3b8);
  font-size: 14px;
  cursor: pointer;
  pointer-events: all;
  transition: background 120ms ease, color 120ms ease, transform 80ms ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
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
  box-shadow: 0 1px 4px rgba(0,0,0,0.18);
}
`.trim()

const USER_MSG_SELECTORS = [
  '[data-message-role="user"]',
  '[class*="userMessage"]',
  '[class*="humanTurn"]',
  '[class*="turnUser"]',
  '[data-role="user"]',
].join(', ')

/** Find the conversation scrollable area inside the pane. */
function findScrollRoot(pane: HTMLElement): HTMLElement {
  // Prefer explicit overflow-y scroll/auto container inside pane
  for (const child of Array.from(pane.querySelectorAll('*')) as HTMLElement[]) {
    const style = getComputedStyle(child)
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') return child
  }
  return pane
}

/** Collect all user message elements in DOM order. */
function getUserMessages(pane: HTMLElement): HTMLElement[] {
  return Array.from(pane.querySelectorAll<HTMLElement>(USER_MSG_SELECTORS))
}

/** Determine the index of the currently-visible turn (first one past viewport center). */
function currentTurnIndex(scrollRoot: HTMLElement, turns: HTMLElement[]): number {
  if (turns.length === 0) return -1
  const viewTop = scrollRoot.scrollTop
  const viewCenter = viewTop + scrollRoot.clientHeight / 2
  for (let i = turns.length - 1; i >= 0; i--) {
    if ((turns[i]?.offsetTop ?? 0) <= viewCenter) return i
  }
  return 0
}

/** Smooth-scroll to a turn. */
function scrollToTurn(scrollRoot: HTMLElement, turn: HTMLElement): void {
  const offsetTop = turn.offsetTop
  scrollRoot.scrollTo({ top: Math.max(0, offsetTop - 60), behavior: 'smooth' })
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
  const turns = getUserMessages(pane)
  const total = turns.length
  const idx = currentTurnIndex(scrollRoot, turns)

  const prevBtn = nav.querySelector<HTMLButtonElement>('[data-role="prev"]')
  const nextBtn = nav.querySelector<HTMLButtonElement>('[data-role="next"]')
  const counter = nav.querySelector<HTMLDivElement>('[data-role="counter"]')
  const bottomBtn = nav.querySelector<HTMLButtonElement>('[data-role="bottom"]')

  if (prevBtn) prevBtn.disabled = idx <= 0 || total === 0
  if (nextBtn) nextBtn.disabled = idx >= total - 1 || total === 0
  if (bottomBtn) {
    const atBottom = scrollRoot.scrollTop + scrollRoot.clientHeight >= scrollRoot.scrollHeight - 40
    bottomBtn.disabled = atBottom
  }
  if (counter) counter.textContent = total === 0 ? '–' : `${idx + 1}/${total}`
}

/** Attach click handlers to the navigator buttons. */
function bindNavigator(nav: HTMLDivElement, scrollRoot: HTMLElement, pane: HTMLElement): void {
  nav.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button')
    if (!btn) return
    const role = btn.dataset.role
    const turns = getUserMessages(pane)
    const idx = currentTurnIndex(scrollRoot, turns)

    if (role === 'prev' && idx > 0 && turns[idx - 1]) {
      scrollToTurn(scrollRoot, turns[idx - 1]!)
    } else if (role === 'next' && idx < turns.length - 1 && turns[idx + 1]) {
      scrollToTurn(scrollRoot, turns[idx + 1]!)
    } else if (role === 'bottom') {
      scrollRoot.scrollTo({ top: scrollRoot.scrollHeight, behavior: 'smooth' })
    }
    // Re-sync after scroll settles
    setTimeout(() => syncNavigator(nav, scrollRoot, pane), 350)
  })
}

/**
 * Mount the conversation turn navigator into the given conversation pane.
 * @returns disposer.
 */
export function mountTurnNavigator(pane: HTMLElement): () => void {
  // Ensure the pane is positioned relatively so absolute children work
  if (getComputedStyle(pane).position === 'static') {
    pane.style.position = 'relative'
  }

  const scrollRoot = findScrollRoot(pane)
  const nav = createNavigator()
  pane.appendChild(nav)
  bindNavigator(nav, scrollRoot, pane)

  const onScroll = (): void => syncNavigator(nav, scrollRoot, pane)
  scrollRoot.addEventListener('scroll', onScroll, { passive: true })

  const mutationObs = new MutationObserver(() => syncNavigator(nav, scrollRoot, pane))
  mutationObs.observe(pane, { childList: true, subtree: true })

  syncNavigator(nav, scrollRoot, pane)

  return () => {
    mutationObs.disconnect()
    scrollRoot.removeEventListener('scroll', onScroll)
    nav.remove()
    if (pane.style.position === 'relative') pane.style.position = ''
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
export function installTurnNavigator(): () => void {
  ensureStyle()
  let disposeNavigator: (() => void) | undefined
  let currentPane: HTMLElement | undefined

  const PANE_SELECTOR = '[data-pane="conversation"]'

  const tryMount = (): void => {
    const pane = document.querySelector<HTMLElement>(PANE_SELECTOR)
    if (pane === currentPane) return
    disposeNavigator?.()
    disposeNavigator = undefined
    currentPane = undefined
    if (!pane) return
    currentPane = pane
    disposeNavigator = mountTurnNavigator(pane)
  }

  const observer = new MutationObserver(tryMount)
  observer.observe(document.body, { childList: true, subtree: true })
  tryMount()

  return () => {
    observer.disconnect()
    disposeNavigator?.()
    const style = document.getElementById('dsh-turn-navigator-style')
    style?.remove()
  }
}
