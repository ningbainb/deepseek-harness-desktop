import { openDesktopSurface } from '@linxin666/dsh-desktop-client'

export function installDesktopUsageNavigation(doc: Document, translate: (key: 'usageOpenFailed') => string): () => void {
  const host = doc.defaultView as (Window & { dshDesktop?: unknown; dshDesktopTransport?: unknown }) | null
  if (!host?.dshDesktop && !host?.dshDesktopTransport) return () => {}
  let disposed = false
  let opening = false
  let failure: HTMLElement | undefined
  const onClick = (event: MouseEvent) => {
    if (disposed || event.defaultPrevented || event.button !== 0) return
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest<HTMLButtonElement>('[data-dsh-usage-foot-card] button[data-dsh-part="foot-card-main"]')
    if (!button || button.disabled) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (opening) return
    opening = true
    failure?.remove()
    failure = undefined
    const reportFailure = () => {
      if (disposed) return
      failure = doc.createElement('p')
      failure.setAttribute('role', 'alert')
      failure.dataset.dshUsageNavigationFailure = 'true'
      failure.textContent = translate('usageOpenFailed')
      const card = button.closest('[data-dsh-usage-foot-card]')
      if (card?.isConnected) card.append(failure)
      else doc.body.append(failure)
    }
    void openDesktopSurface('extensions', { setting: 'usage' })
      .then(opened => { if (!opened) reportFailure() }, reportFailure)
      .finally(() => { opening = false })
  }
  doc.addEventListener('click', onClick, true)
  return () => {
    if (disposed) return
    disposed = true
    doc.removeEventListener('click', onClick, true)
    failure?.remove()
  }
}
