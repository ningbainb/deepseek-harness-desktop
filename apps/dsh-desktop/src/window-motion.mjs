/** Publish only gesture edges, never one renderer round-trip for every native move. */
export function installWindowMotion(window, publish, { delay = 180 } = {}) {
  let timer
  let active = false
  const finish = () => {
    clearTimeout(timer); timer = undefined
    if (active) { active = false; publish(false) }
  }
  const move = () => {
    if (!active) { active = true; publish(true) }
    clearTimeout(timer); timer = setTimeout(finish, delay)
  }
  const dispose = () => {
    finish()
    for (const event of ['will-move', 'will-resize']) window.removeListener(event, move)
    window.removeListener('blur', finish); window.removeListener('closed', dispose)
  }
  for (const event of ['will-move', 'will-resize']) window.on(event, move)
  window.on('blur', finish); window.once('closed', dispose)
  return dispose
}

export function publishWindowMotion(contents, active) {
  if (!contents || contents.isDestroyed()) return
  void contents.executeJavaScript(`window.dispatchEvent(new CustomEvent('dsh:window-motion', { detail: ${Boolean(active)} }))`).catch(() => {})
}
