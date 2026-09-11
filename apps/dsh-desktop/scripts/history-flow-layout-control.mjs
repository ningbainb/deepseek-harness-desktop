// Isolated experiment only. Not imported or injected by the product.
export function installHistoryFlowLayoutControl() {
  let stop = () => {}
  const begin = event => {
    const nav = event.target?.closest?.('[data-conversation-scroll] nav')
    if (!nav) return
    const buttons = [...nav.querySelectorAll('button[aria-label]')]
    let button = event.target.closest('button')
    if (!button && event.detail) {
      button = buttons.reduce((best, candidate) => {
        const box = candidate.getBoundingClientRect()
        const distance = Math.abs(event.clientY - (box.top + box.height / 2))
        return !best || distance < best.distance ? { button: candidate, distance } : best
      }, null)?.button
    }
    const numbers = button?.getAttribute('aria-label')?.match(/\d+/g)
    if (numbers?.length !== 1) return
    const turn = Number(numbers[0])
    if (!Number.isSafeInteger(turn) || turn < 1) return
    stop()
    const scroll = nav.closest('[data-conversation-scroll]')
    let frame, ended = false, readyAt, stableAt
    const createdAt = performance.now()
    const cancel = () => {
      ended = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      scroll.removeEventListener('wheel', cancel)
      scroll.removeEventListener('pointerdown', cancel)
      scroll.removeEventListener('keydown', cancel)
    }
    stop = cancel
    const check = () => {
      frame = undefined
      if (ended || !scroll.isConnected) return cancel()
      const now = performance.now()
      if (now - createdAt > 60000) return cancel()
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
    scroll.addEventListener('wheel', cancel, { passive: true })
    scroll.addEventListener('pointerdown', cancel, { passive: true })
    scroll.addEventListener('keydown', cancel)
    schedule()
  }
  document.addEventListener('click', begin, true)
  return () => { stop(); document.removeEventListener('click', begin, true) }
}
