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

export function petRailOffset(surface, viewport) {
  const width = Math.min(224, Math.max(160, Math.floor(viewport.width * 0.4)))
  const left = viewport.width - width + 12
  const top = 12
  return {
    width,
    x: Math.max(left, Math.min(surface.left, viewport.width - surface.width - 12)) - surface.left,
    y: Math.max(top, Math.min(surface.top, viewport.height - surface.height - 12)) - surface.top,
  }
}

export function installPetControlClearance(resolveOffset, resolveRailOffset) {
  globalThis.dshPetControlClearance?.dispose()
  const selector = 'button[data-dsh-relay-model-entry], [data-pane="conversation"] button[aria-haspopup="menu"], [data-pane="conversation"] button[aria-label="回到底部"], [data-pane="conversation"] button[aria-label="Scroll to bottom"], [data-pane="conversation"] textarea, [data-pane="conversation"] [contenteditable="true"], [data-dsh-dock-settings] :is(button, input, textarea, select, summary, [role="button"], [role="switch"])'
  let sprite, floating, previousTranslate, offset = { x: 0, y: 0 }, frame, dragging = false, disposed = false
  let settingsPage, previousRailWidth, previousRailPriority
  const watched = new Set()
  const restoreRail = () => {
    if (!settingsPage) return
    settingsPage.removeAttribute('data-dsh-dock-pet-rail')
    if (previousRailWidth) document.documentElement.style.setProperty('--dsh-dock-pet-rail-width', previousRailWidth, previousRailPriority)
    else document.documentElement.style.removeProperty('--dsh-dock-pet-rail-width')
    settingsPage = undefined
  }
  const restore = () => {
    if (floating) floating.style.translate = previousTranslate
    sprite = floating = undefined
    offset = { x: 0, y: 0 }
    restoreRail()
  }
  const sync = () => {
    frame = undefined
    if (disposed || dragging) return
    const next = document.querySelector('[data-dsh-pet-root] [role="button"]')
      ?? document.querySelector('[data-dsh-pet-root] [data-dsh-part="summon-button"]')
    if (next !== sprite) {
      restore()
      positionObserver.disconnect()
      surfaceObserver.disconnect()
      sizeObserver?.disconnect()
      watched.clear()
      sprite = next
      floating = sprite
      while (floating && floating.parentElement && !floating.matches('[data-dsh-pet-root]')
        && getComputedStyle(floating).position !== 'fixed') floating = floating.parentElement
      if (floating) {
        previousTranslate = floating.style.translate
        positionObserver.observe(floating, { attributes: true, attributeFilter: ['style'] })
        surfaceObserver.observe(floating, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-placement'] })
      }
    }
    if (!floating) return
    const visibleBounds = floating.getBoundingClientRect()
    const settings = visibleBounds.width > 0 && visibleBounds.height > 0 ? document.querySelector('[data-dsh-dock-settings]') : null
    if (settingsPage !== settings) {
      restoreRail()
      if (settings) {
        settingsPage = settings
        previousRailWidth = document.documentElement.style.getPropertyValue('--dsh-dock-pet-rail-width')
        previousRailPriority = document.documentElement.style.getPropertyPriority('--dsh-dock-pet-rail-width')
        settingsPage.setAttribute('data-dsh-dock-pet-rail', '')
      }
    }
    const viewport = { width: innerWidth, height: innerHeight }
    if (settingsPage) {
      const width = `${resolveRailOffset({ left: 0, top: 0, width: 0, height: 0 }, viewport).width}px`
      if (document.documentElement.style.getPropertyValue('--dsh-dock-pet-rail-width') !== width) {
        document.documentElement.style.setProperty('--dsh-dock-pet-rail-width', width)
      }
    }
    const bounds = floating.getBoundingClientRect()
    const original = { left: bounds.left - offset.x, top: bounds.top - offset.y, width: bounds.width, height: bounds.height }
    const controls = [...document.querySelectorAll(selector)].filter(control => !control.closest('[data-dsh-pet-root]')
      && (!settings || settings.contains(control)))
      .map(control => control.getBoundingClientRect()).filter(control => control.width > 0 && control.height > 0)
    let nextOffset
    if (settingsPage) {
      const root = floating.closest('[data-dsh-pet-root]')
      const surfaces = [floating, ...floating.querySelectorAll('*')]
      if (surfaces.length !== watched.size || surfaces.some(surface => !watched.has(surface))) {
        sizeObserver?.disconnect()
        watched.clear()
        for (const surface of surfaces) { watched.add(surface); sizeObserver?.observe(surface) }
      }
      const rectangles = surfaces.map(surface => surface.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0)
      const left = Math.min(...rectangles.map(rect => rect.left)) - offset.x + (root?.scrollLeft || 0)
      const top = Math.min(...rectangles.map(rect => rect.top)) - offset.y + (root?.scrollTop || 0)
      const right = Math.max(...rectangles.map(rect => rect.left + rect.width)) - offset.x + (root?.scrollLeft || 0)
      const bottom = Math.max(...rectangles.map(rect => rect.top + rect.height)) - offset.y + (root?.scrollTop || 0)
      nextOffset = resolveRailOffset({ left, top, width: right - left, height: bottom - top }, viewport)
    } else nextOffset = resolveOffset(original, controls, viewport)
    const changed = offset.x !== nextOffset.x || offset.y !== nextOffset.y
    offset = nextOffset
    if (changed) floating.style.translate = offset.x || offset.y ? `${offset.x}px ${offset.y}px` : previousTranslate
  }
  const schedule = () => { if (!disposed && frame === undefined) frame = requestAnimationFrame(sync) }
  const observer = new MutationObserver(records => {
    if (!sprite?.isConnected || records.some(record => record.type === 'attributes' || record.target === floating
      || [...record.addedNodes, ...record.removedNodes].some(node => node.matches?.('[data-dsh-pet-root]')
        || node.matches?.(selector) || node.querySelector?.(selector)))) schedule()
  })
  observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-dsh-dock-settings'] })
  const positionObserver = new MutationObserver(schedule)
  const surfaceObserver = new MutationObserver(schedule)
  const sizeObserver = globalThis.ResizeObserver ? new ResizeObserver(schedule) : undefined
  const down = event => { if (sprite?.contains(event.target)) dragging = true }
  const up = () => { dragging = false; schedule() }
  const dispose = () => {
    disposed = true
    if (frame !== undefined) cancelAnimationFrame(frame)
    observer.disconnect()
    positionObserver.disconnect()
    surfaceObserver.disconnect()
    sizeObserver?.disconnect()
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

export const PET_CONTROL_CLEARANCE_SCRIPT = `(${installPetControlClearance.toString()})(${petControlOffset.toString()}, ${petRailOffset.toString()})`
