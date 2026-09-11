/** Serialized into the renderer: defer an optional prompt behind existing dialogs. */
export function deferModalReveal({ root, document, window, delayMs, claim, reveal, onError }) {
  let timer
  let frame
  let disposed = false
  let claiming = false
  let claimed = false
  const blocked = () => document.visibilityState === 'hidden' || [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')]
    .some(dialog => {
      if (root.contains(dialog) || dialog.closest('[hidden], [aria-hidden="true"]')) return false
      const style = window.getComputedStyle(dialog)
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
      const box = dialog.getBoundingClientRect()
      return box.width > 0 && box.height > 0
    })
  const dispose = () => {
    disposed = true
    window.clearTimeout(timer)
    window.cancelAnimationFrame(frame)
    observer.disconnect()
    document.removeEventListener('visibilitychange', schedule)
    window.removeEventListener('pagehide', dispose)
    window.removeEventListener('resize', schedule)
  }
  const attempt = async () => {
    timer = undefined
    if (disposed || !root.isConnected) { dispose(); return }
    if (blocked() || claiming) return
    try {
      if (!claimed) {
        claiming = true
        const allowed = await claim()
        claiming = false
        if (disposed || !root.isConnected) { dispose(); return }
        if (!allowed) { dispose(); return }
        claimed = true
      }
      // A permission/settings dialog may appear while the main process claims.
      if (blocked()) return
      dispose()
      reveal()
    } catch (error) { dispose(); onError(error) }
  }
  const check = () => {
    frame = undefined
    if (disposed || !root.isConnected) { dispose(); return }
    if (blocked()) { window.clearTimeout(timer); timer = undefined; return }
    if (timer === undefined && !claiming) timer = window.setTimeout(attempt, delayMs)
  }
  function schedule() {
    if (!disposed && frame === undefined) frame = window.requestAnimationFrame(check)
  }
  const observer = new window.MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['class', 'style', 'role', 'hidden', 'aria-hidden', 'aria-modal', 'open'] })
  document.addEventListener('visibilitychange', schedule)
  window.addEventListener('pagehide', dispose)
  window.addEventListener('resize', schedule)
  schedule()
  return dispose
}
