// The native renderer retains every node, history page and navigation action.
// Only offscreen layout/paint is deferred; find-in-page and focus stay native.
export const CONVERSATION_RENDERING_CSS = `
[data-conversation-scroll] { overflow-anchor: none; }
[data-conversation-scroll] [data-chat-flow][data-dsh-long-chat-flow] > [data-chat-flow-kind]:not([hidden]):not(:empty) {
  content-visibility: auto;
  contain-intrinsic-block-size: auto 80px;
}
@media print {
  [data-conversation-scroll] [data-chat-flow] > [data-chat-flow-kind] {
    content-visibility: visible;
    contain-intrinsic-block-size: none;
  }
}
`

// Serialized into the current document. Never replace the official onNavigate
// handler, modify the session store, or continue fighting a reader's input.
export function installConversationRendering() {
  globalThis.dshConversationRenderingController?.dispose()
  let stop = () => {}
  const updateFlow = flow => {
    if (!flow?.isConnected) return
    const enabled = flow.childElementCount > 200
    if (flow.hasAttribute('data-dsh-long-chat-flow') !== enabled) flow.toggleAttribute('data-dsh-long-chat-flow', enabled)
  }
  // A :has(:nth-child(...)) rule on every row makes prepends invalidate the
  // whole long list. Count once per changed flow without any geometry reads.
  const flowObserver = new MutationObserver(records => {
    const changed = new Set()
    for (const record of records ?? []) {
      const flow = record.target?.closest?.('[data-chat-flow]')
      if (flow) { changed.add(flow); continue }
      for (const node of record.addedNodes) {
        if (node.matches?.('[data-chat-flow]')) changed.add(node)
        else for (const found of node.querySelectorAll?.('[data-chat-flow]') ?? []) changed.add(found)
      }
    }
    for (const flow of changed) updateFlow(flow)
  })
  flowObserver.observe(document, { childList: true, subtree: true })
  for (const flow of document.querySelectorAll('[data-chat-flow]')) updateFlow(flow)
  const begin = event => {
    const nav = event.target?.closest?.('[data-conversation-scroll] nav')
    if (!nav || !['轮次导航', 'Turn navigation'].includes(nav.getAttribute('aria-label'))) return
    const buttons = [...nav.querySelectorAll('button[aria-label]')]
    let button = event.target.closest('button')
    // Native pointer actions target the rail, whereas keyboard actions target
    // a button. Use actual mark geometry, never upstream CSS hashes or pitch.
    if (!button && event.detail) {
      button = buttons.reduce((best, candidate) => {
        const box = candidate.getBoundingClientRect()
        const distance = Math.abs(event.clientY - (box.top + box.height / 2))
        return !best || distance < best.distance ? { button: candidate, distance } : best
      }, null)?.button
    }
    const numbers = button?.getAttribute('aria-label')?.match(/\d+/g)
    if (numbers?.length !== 1 || !buttons.includes(button)) return
    const turn = Number(numbers[0])
    if (!Number.isSafeInteger(turn) || turn < 1) return
    stop()
    const scroll = nav.closest('[data-conversation-scroll]')
    let frame, deadline, ended = false, readyAt, stableAt
    const cancel = () => {
      ended = true
      cancelAnimationFrame(frame)
      clearTimeout(deadline)
      observer.disconnect()
      for (const name of ['wheel', 'pointerdown', 'keydown']) document.removeEventListener(name, cancel, true)
    }
    stop = cancel
    const check = () => {
      frame = undefined
      if (ended || !scroll.isConnected || !button.isConnected) return cancel()
      const now = performance.now()
      const row = scroll.querySelector(`[data-chat-turn="${turn}"]:not([hidden])`)
      if (row && button.getAttribute('aria-busy') !== 'true') {
        readyAt ??= now
        const offset = row.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 24
        const current = scroll.scrollTop
        const target = Math.max(0, Math.min(scroll.scrollHeight - scroll.clientHeight, current + offset))
        if (Math.abs(target - current) > 1) { scroll.scrollTop = target; stableAt = undefined }
        else stableAt ??= now
        if ((stableAt !== undefined && now - stableAt >= 500) || now - readyAt > 2500) return cancel()
        frame = requestAnimationFrame(check)
      }
    }
    const schedule = () => { if (!ended && frame === undefined) frame = requestAnimationFrame(check) }
    const observer = new MutationObserver(schedule)
    observer.observe(scroll, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-busy', 'aria-current'] })
    for (const name of ['wheel', 'pointerdown', 'keydown']) document.addEventListener(name, cancel, { capture: true, passive: true })
    // No per-frame polling while the official loader is fetching missing pages.
    deadline = setTimeout(cancel, 60000)
    schedule()
  }
  const pageHide = () => stop()
  const dispose = () => {
    stop()
    flowObserver.disconnect()
    document.removeEventListener('click', begin, true)
    globalThis.removeEventListener('pagehide', pageHide)
    if (globalThis.dshConversationRenderingController?.dispose === dispose) delete globalThis.dshConversationRenderingController
  }
  document.addEventListener('click', begin, true)
  globalThis.addEventListener('pagehide', pageHide)
  globalThis.dshConversationRenderingController = { dispose }
  return true
}

export const CONVERSATION_RENDERING_SCRIPT = `(${installConversationRendering.toString()})()`
