import type { ParticleContentRect } from './theme.ts'

// Official flow markers, plus the older message contract. Restrict the lookup
// to the conversation so unrelated plugin pages cannot mask the whole theme.
export const MESSAGE_SELECTOR = '[data-pane="conversation"] [data-chat-flow-kind], [data-pane="conversation"] [data-message-role]'

export function messageClearanceRects(
  targets: readonly Element[], canvas: DOMRect, contentBottom: number,
): ParticleContentRect[] {
  const result: ParticleContentRect[] = []
  const styles = new Map<Element, CSSStyleDeclaration | undefined>()
  const boundsCache = new Map<Element, DOMRect>()
  const styleOf = (element: Element) => {
    if (!styles.has(element)) styles.set(element, element.ownerDocument.defaultView?.getComputedStyle(element))
    return styles.get(element)
  }
  for (const target of targets) {
    if (target.closest('[hidden], [aria-hidden="true"]')) continue
    const bounds = target.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) continue
    const targetStyle = styleOf(target)
    if (targetStyle?.display === 'none' || targetStyle?.visibility === 'hidden') continue
    let left = Math.max(canvas.left, bounds.left - 4)
    let top = Math.max(canvas.top, bounds.top - 4)
    let right = Math.min(canvas.right, bounds.right + 4)
    let bottom = Math.min(canvas.bottom, contentBottom, bounds.bottom + 4)
    if (right <= left || bottom <= top) continue
    // Offscreen history must not punch holes across headers or other panes.
    for (let parent = target.parentElement; parent; parent = parent.parentElement) {
      const style = styleOf(parent)
      if (style?.display === 'none' || style?.visibility === 'hidden') { bottom = top; break }
      const clipX = /^(auto|scroll|hidden|clip)$/.test(style?.overflowX || style?.overflow || '')
      const clipY = /^(auto|scroll|hidden|clip)$/.test(style?.overflowY || style?.overflow || '')
      if (clipX || clipY) {
        if (!boundsCache.has(parent)) boundsCache.set(parent, parent.getBoundingClientRect())
        const box = boundsCache.get(parent)!
        if (clipX) { left = Math.max(left, box.left); right = Math.min(right, box.right) }
        if (clipY) { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom) }
      }
    }
    if (right <= left || bottom <= top) continue
    const rect = { x: left - canvas.left, y: top - canvas.top, width: right - left, height: bottom - top }
    if (result.some(outer => rect.x >= outer.x && rect.y >= outer.y
      && rect.x + rect.width <= outer.x + outer.width && rect.y + rect.height <= outer.y + outer.height)) continue
    result.push(rect)
  }
  return result
}
