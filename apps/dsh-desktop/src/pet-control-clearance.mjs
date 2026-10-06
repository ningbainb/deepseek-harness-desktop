export function petControlOffset(sprite, controls, viewport) {
  const overlaps = (left, top, control) => left < control.right + 8 && left + sprite.width > control.left - 8
    && top < control.bottom + 8 && top + sprite.height > control.top - 8
  if (!controls.some(control => overlaps(sprite.left, sprite.top, control))) return { x: 0, y: 0 }
  const candidates = controls.flatMap(control => [
    { left: control.left - sprite.width - 8, top: sprite.top },
    { left: control.right + 8, top: sprite.top },
    { left: sprite.left, top: control.top - sprite.height - 8 },
    { left: sprite.left, top: control.bottom + 8 },
  ])
  const safe = candidates.filter(candidate => candidate.left >= 8 && candidate.top >= 40
    && candidate.left + sprite.width <= viewport.width - 8 && candidate.top + sprite.height <= viewport.height - 8
    && !controls.some(control => overlaps(candidate.left, candidate.top, control)))
    .sort((left, right) => Math.hypot(left.left - sprite.left, left.top - sprite.top)
      - Math.hypot(right.left - sprite.left, right.top - sprite.top))[0]
  return safe ? { x: safe.left - sprite.left, y: safe.top - sprite.top } : { x: 0, y: 0 }
}

export function installPetControlClearance(resolveOffset) {
  globalThis.dshPetControlClearance?.dispose()
  const selector = 'button[data-dsh-relay-model-entry], [data-pane="conversation"] button[aria-haspopup="menu"], [data-pane="conversation"] button[aria-label="回到底部"], [data-pane="conversation"] button[aria-label="Scroll to bottom"], [data-pane="conversation"] textarea, [data-pane="conversation"] [contenteditable="true"]'
  let sprite, floating, previousTranslate, offset = { x: 0, y: 0 }, frame, dragging = false, disposed = false
  const restore = () => {
    if (floating) floating.style.translate = previousTranslate
    sprite = floating = undefined
    offset = { x: 0, y: 0 }
  }
  const sync = () => {
    frame = undefined
    if (disposed || dragging) return
    const next = document.querySelector('[data-dsh-pet-root] [role="button"]')
    if (next !== sprite) {
      restore()
      positionObserver.disconnect()
      sprite = next
      floating = sprite?.parentElement
      while (floating && floating.parentElement && !floating.matches('[data-dsh-pet-root]')
        && getComputedStyle(floating).position !== 'fixed') floating = floating.parentElement
      if (floating) {
        previousTranslate = floating.style.translate
        positionObserver.observe(floating, { attributes: true, attributeFilter: ['style'] })
      }
    }
    if (!floating) return
    const bounds = floating.getBoundingClientRect()
    const original = { left: bounds.left - offset.x, top: bounds.top - offset.y, width: bounds.width, height: bounds.height }
    const controls = [...document.querySelectorAll(selector)].filter(control => !control.closest('[data-dsh-pet-root]'))
      .map(control => control.getBoundingClientRect()).filter(control => control.width > 0 && control.height > 0)
    const nextOffset = resolveOffset(original, controls, { width: innerWidth, height: innerHeight })
    const changed = offset.x !== nextOffset.x || offset.y !== nextOffset.y
    offset = nextOffset
    if (changed) floating.style.translate = offset.x || offset.y ? `${offset.x}px ${offset.y}px` : previousTranslate
  }
  const schedule = () => { if (!disposed && frame === undefined) frame = requestAnimationFrame(sync) }
  const observer = new MutationObserver(records => {
    if (!sprite?.isConnected || records.some(record => record.target === floating
      || [...record.addedNodes, ...record.removedNodes].some(node => node.matches?.('[data-dsh-pet-root]')
        || node.matches?.(selector) || node.querySelector?.(selector)))) schedule()
  })
  observer.observe(document, { childList: true, subtree: true })
  const positionObserver = new MutationObserver(schedule)
  const down = event => { if (sprite?.contains(event.target)) dragging = true }
  const up = () => { dragging = false; schedule() }
  const dispose = () => {
    disposed = true
    if (frame !== undefined) cancelAnimationFrame(frame)
    observer.disconnect()
    positionObserver.disconnect()
    document.removeEventListener('pointerdown', down, true)
    document.removeEventListener('pointerup', up, true)
    document.removeEventListener('pointercancel', up, true)
    document.removeEventListener('scroll', schedule, true)
    globalThis.removeEventListener('resize', schedule)
    globalThis.removeEventListener('pagehide', dispose)
    restore()
    if (globalThis.dshPetControlClearance?.dispose === dispose) delete globalThis.dshPetControlClearance
  }
  document.addEventListener('pointerdown', down, true)
  document.addEventListener('pointerup', up, true)
  document.addEventListener('pointercancel', up, true)
  document.addEventListener('scroll', schedule, true)
  globalThis.addEventListener('resize', schedule)
  globalThis.addEventListener('pagehide', dispose)
  globalThis.dshPetControlClearance = { dispose }
  sync()
}

export const PET_CONTROL_CLEARANCE_SCRIPT = `(${installPetControlClearance.toString()})(${petControlOffset.toString()})`
