/** Save custom-provider keys before the official form commits its profile. */
import { CUSTOM_PROVIDER_KEY_PREFLIGHT_PATH } from '../protocol.ts'
export type ProviderKeyCopy = 'providerKeySaving' | 'providerKeySaveFailed' | 'providerKeyChanged'

export interface CustomProviderKeyPersistence {
  saveAndConfirm(ref: string, value: string): Promise<void>
  translate(key: ProviderKeyCopy): string
}

/** The Host owns serialization; browser locks would not span separate window partitions. */
export async function confirmCustomProviderKey(ref: string, value: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl(CUSTOM_PROVIDER_KEY_PREFLIGHT_PATH, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(60_000),
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ref, value }),
  })
  const result: unknown = await response.json()
  if (!response.ok || !result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) {
    throw new Error('credential preflight refused')
  }
}

const creates = new Set(['创建提供商', 'Create provider'])
const routePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u
const keySelector = 'input[aria-label="API 密钥"], input[aria-label="API key"]'

export function installCustomProviderKeyPersistence(doc: Document, deps: CustomProviderKeyPersistence): () => void {
  let alive = true
  const pending = new Set<HTMLButtonElement>()
  const replay = new WeakSet<HTMLButtonElement>()
  const notices = new Set<HTMLElement>()
  const busyBefore = new Map<HTMLButtonElement, string | null>()
  const clearBusy = (button: HTMLButtonElement) => {
    if (!busyBefore.has(button)) return
    const before = busyBefore.get(button)
    if (button.getAttribute('aria-busy') === 'true') {
      if (before == null) button.removeAttribute('aria-busy')
      else button.setAttribute('aria-busy', before)
    }
    busyBefore.delete(button)
  }
  const onClick = (event: MouseEvent): void => {
    if (!alive || event.defaultPrevented || event.button !== 0 || !(event.target instanceof Element)) return
    const button = event.target.closest<HTMLButtonElement>('button')
    if (!button || replay.has(button) || button.disabled || !creates.has(button.textContent?.trim() ?? '')
      || !button.closest('.dsh-desktop-settings-window, [data-dsh-dock-settings="models"]')) return
    if (pending.has(button)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
    let editor = button.parentElement
    while (editor && !editor.querySelector('input[aria-label="Provider ID"]')) editor = editor.parentElement
    const route = editor?.querySelector<HTMLInputElement>('input[aria-label="Provider ID"]')
    const key = editor?.querySelector<HTMLInputElement>(keySelector)
    if (!editor || !route || !key || route.disabled || key.disabled || !routePattern.test(route.value)) return
    const value = key.value.trim()
    if (!value) return
    event.preventDefault()
    event.stopImmediatePropagation()
    pending.add(button)
    busyBefore.set(button, button.getAttribute('aria-busy'))
    button.setAttribute('aria-busy', 'true')
    const previousNotice = editor.querySelector<HTMLElement>('[data-dsh-provider-key-save]')
    previousNotice?.remove()
    if (previousNotice) notices.delete(previousNotice)
    const notice = doc.createElement('p')
    notice.dataset.dshProviderKeySave = 'true'
    notice.setAttribute('role', 'status')
    notice.setAttribute('aria-live', 'polite')
    notice.textContent = deps.translate('providerKeySaving')
    editor.append(notice)
    notices.add(notice)
    const dismissNotice = () => { notice.remove(); notices.delete(notice) }
    const routeValue = route.value
    const inputState = () => JSON.stringify([...editor.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')]
      .map(input => [input.value, input instanceof HTMLInputElement ? input.checked : undefined]))
    const originalInputState = inputState()
    const ref = routeValue.toUpperCase().replace(/[^A-Z0-9]+/gu, '_') + '_API_KEY'
    void Promise.resolve().then(() => deps.saveAndConfirm(ref, value)).then(() => {
      if (!alive || !button.isConnected || !editor.isConnected || !key.isConnected || !route.isConnected
        || !button.getClientRects().length) { dismissNotice(); return }
      if (key.value.trim() !== value || route.value !== routeValue || inputState() !== originalInputState) {
        notice.textContent = deps.translate('providerKeyChanged')
        return
      }
      dismissNotice()
      if (button.disabled) return
      replay.add(button)
      try { button.click() } finally { replay.delete(button) }
    }, () => {
      if (!alive || !notice.isConnected) { dismissNotice(); return }
      notice.setAttribute('role', 'alert')
      // Never display a provider exception: its text could contain a secret.
      notice.textContent = deps.translate('providerKeySaveFailed')
    }).finally(() => {
      pending.delete(button)
      clearBusy(button)
    })
  }
  doc.addEventListener('click', onClick, true)
  return () => {
    if (!alive) return
    alive = false
    doc.removeEventListener('click', onClick, true)
    for (const notice of notices) notice.remove()
    notices.clear()
    for (const button of pending) clearBusy(button)
    pending.clear()
  }
}
