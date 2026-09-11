/** Keep delayed composer autofocus from cancelling the native directory path editor. */
export function protectDirectoryEditorFocus(document: Document): () => void {
  const composer = '[data-composer-input], [data-composer-card] textarea'
  let alive = true
  let intentionalLeave = false
  let intentTimer: ReturnType<typeof setTimeout> | undefined
  let restoring = false
  const rememberIntent = (event: Event): void => {
    intentionalLeave = event instanceof KeyboardEvent
      ? event.key === 'Tab'
      : event.target instanceof Element && event.target.closest(composer) !== null
    clearTimeout(intentTimer)
    intentTimer = setTimeout(() => { intentionalLeave = false }, 0)
  }
  const onBlur = (event: FocusEvent): void => {
    const input = event.target
    const next = event.relatedTarget
    if (intentionalLeave || restoring || !document.hasFocus()
      || !(input instanceof HTMLInputElement)
      || !['编辑路径', 'Edit path'].includes(input.getAttribute('aria-label') ?? '')
      || !(next instanceof Element) || !next.matches(composer)) return
    const dialog = input.closest<HTMLElement>('[role="dialog"]')
    if (!dialog || dialog.contains(next)) return
    // The official editor interprets this bubbling blur as an explicit cancel.
    // Suppress only the unsolicited editor-to-composer transfer, not other focus.
    event.stopImmediatePropagation()
    restoring = true
    queueMicrotask(() => {
      restoring = false
      if (!alive || !input.isConnected || !dialog.isConnected || !document.hasFocus()
        || document.activeElement !== next || getComputedStyle(dialog).display === 'none'
        || getComputedStyle(dialog).visibility === 'hidden') return
      input.focus({ preventScroll: true })
    })
  }
  document.addEventListener('pointerdown', rememberIntent, true)
  document.addEventListener('keydown', rememberIntent, true)
  document.addEventListener('focusout', onBlur, true)
  return () => {
    alive = false
    clearTimeout(intentTimer)
    document.removeEventListener('pointerdown', rememberIntent, true)
    document.removeEventListener('keydown', rememberIntent, true)
    document.removeEventListener('focusout', onBlur, true)
  }
}
