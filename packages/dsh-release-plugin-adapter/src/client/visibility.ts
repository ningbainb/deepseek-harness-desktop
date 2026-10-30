export const VISIBILITY_KEY = 'dsh-release-plugin-adapter.dafeiyu-visible'
export const VISIBILITY_EVENT = 'dsh-dafeiyu-visibility'
const ATTRIBUTE = 'data-desktop-dafeiyu-visible'
type Reader = Pick<Storage, 'getItem'>
type Writer = Pick<Storage, 'setItem'>
type AttributeTarget = Pick<Element, 'getAttribute' | 'setAttribute' | 'removeAttribute'>

export function companionVisibleInDocument(visible: boolean, search: string): boolean {
  return visible && !new URLSearchParams(search).has('desktop-dock-setting')
}

/** The patched community widget owns its resources; the adapter only signals policy. */
export function notifyCompanionLifecycle(target: Pick<Window, 'dispatchEvent'>, visible: boolean): void {
  target.dispatchEvent(new CustomEvent(VISIBILITY_EVENT, { detail: visible }))
}

export function readVisible(storage: Reader): boolean {
  try {
    const saved = storage.getItem(VISIBILITY_KEY)
    return saved === null || saved === 'true'
  } catch { return false }
}

/** False means the current page can change but persistence was denied. */
export function writeVisible(storage: Writer, visible: boolean): boolean {
  try { storage.setItem(VISIBILITY_KEY, String(visible)); return true } catch { return false }
}

/** Own exactly one attribute; the CSS targets only the vendor's dafeiyu root. */
export function installVisibility(target: AttributeTarget, initial: boolean) {
  const previous = target.getAttribute(ATTRIBUTE)
  let alive = true
  const set = (visible: boolean) => { if (alive) target.setAttribute(ATTRIBUTE, String(visible)) }
  set(initial)
  return {
    set,
    dispose() {
      if (!alive) return
      alive = false
      if (previous === null) target.removeAttribute(ATTRIBUTE)
      else target.setAttribute(ATTRIBUTE, previous)
    },
  }
}
