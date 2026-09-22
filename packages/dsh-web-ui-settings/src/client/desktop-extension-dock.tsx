import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import {
  dismissDockNudge,
  getDockEntryState,
  hasCapability,
  openDesktopSurface,
  type DockDismissReason,
} from '@linxin666/dsh-desktop-client'
import type { WebUIPluginsKey } from './locales.ts'
import { APP_BRAND_ICON_DATA_URL } from './app-brand-icon.generated.ts'
import css from './web-ui-settings.module.css'

export type DesktopExtensionDockEntryProps = {
  wide: boolean
  t: (key: WebUIPluginsKey, params?: Record<string, unknown>) => string
}

type ManagementTab = 'plugins' | 'skills'

type PluginSettingsRequest = Readonly<{ name?: unknown }>
type PluginSettingsBridge = Readonly<{
  onPluginSettingsOpen?: (listener: (request: PluginSettingsRequest) => void) => () => void
}>

function mainBridge(): PluginSettingsBridge | undefined {
  return (window as unknown as { dshDesktop?: PluginSettingsBridge }).dshDesktop
}

/**
 * Re-enter the Runtime-owned plugin manager for the one installed package the
 * Extension Dock selected. The Dock remains the single list/management entry;
 * the Runtime page remains the only place third-party slot forms are rendered.
 */
export async function openRuntimePluginSettings(
  ownerDocument: Document,
  name: string,
  allowNativeClick: (entry: HTMLElement) => void,
  wait: (callback: () => void, delay: number) => unknown = globalThis.setTimeout,
): Promise<boolean> {
  if (name.length === 0 || name.length > 214) return false
  const sidebar = ownerDocument.querySelector<HTMLElement>('[data-pane="sidebar"], [class*="sidebarCol"]')
  const entry = sidebar?.querySelector<HTMLElement>('[data-dsh-desktop-management-entry="plugins"]')
  if (entry === null || entry === undefined) return false
  allowNativeClick(entry)
  entry.click()
  const started = Date.now()
  return new Promise(resolve => {
    const inspect = () => {
      const detail = [...ownerDocument.querySelectorAll<HTMLElement>('[data-plugin-detail]')]
        .find(item => item.dataset.pluginDetail === name)
      if (detail !== undefined) { resolve(true); return }
      const card = [...ownerDocument.querySelectorAll<HTMLElement>('[data-plugin-package]')]
        .find(item => item.dataset.pluginPackage === name)
      const button = card?.querySelector<HTMLButtonElement>('button[aria-label]')
      if (button !== null && button !== undefined) {
        button.click()
        resolve(true)
        return
      }
      if (Date.now() - started >= 10_000) { resolve(false); return }
      wait(inspect, 50)
    }
    inspect()
  })
}

/**
 * Reuse the Runtime's existing Plugins and Skill Center sidebar rows while
 * making the Extension Dock their single Desktop destination. The original
 * plugin surfaces remain mounted for ordinary Web hosts and for their APIs.
 */
export function installDesktopManagementRouting(
  ownerDocument: Document,
  t: (key: WebUIPluginsKey, params?: Record<string, unknown>) => string,
): () => void {
  let disposed = false
  let observer: MutationObserver | undefined
  const managed = new Set<HTMLElement>()
  const opening = new WeakSet<HTMLElement>()
  const nativeClicks = new WeakSet<HTMLElement>()
  let unsubscribePluginSettings: (() => void) | undefined

  const mark = (entry: HTMLElement | null | undefined, tab: ManagementTab): void => {
    if (entry === null || entry === undefined) return
    entry.dataset.dshDesktopManagementEntry = tab
    managed.add(entry)
  }
  const scan = (): void => {
    const sidebar = ownerDocument.querySelector<HTMLElement>('[data-pane="sidebar"], [class*="sidebarCol"]')
    if (sidebar === null) return
    const plugin = [...sidebar.querySelectorAll<HTMLElement>('button')].find((button) => {
      if (button.closest('[data-slot="sidebar.footer.action"]') !== null) return false
      const label = button.getAttribute('aria-label')?.trim() || button.textContent?.trim() || ''
      return /^(?:插件|Plugins)$/iu.test(label.replace(/\s+/gu, ' '))
    })
    mark(plugin, 'plugins')
    mark(sidebar.querySelector<HTMLElement>('[data-dsh-skill-explorer-entry]'), 'skills')
  }
  const clearError = (entry: HTMLElement): void => {
    entry.removeAttribute('aria-invalid')
    entry.parentElement?.querySelector('[data-dsh-management-routing-error]')?.remove()
  }
  const showError = (entry: HTMLElement, tab: ManagementTab): void => {
    clearError(entry)
    entry.setAttribute('aria-invalid', 'true')
    const message = ownerDocument.createElement('span')
    message.dataset.dshManagementRoutingError = ''
    message.className = css.managementRoutingError
    message.setAttribute('role', 'alert')
    message.textContent = t(tab === 'plugins' ? 'pluginManagementOpenFailed' : 'skillManagementOpenFailed')
    entry.insertAdjacentElement('afterend', message)
  }
  const onClick = (event: Event): void => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-dsh-desktop-management-entry]')
      : null
    if (target === null || !ownerDocument.contains(target)) return
    const tab = target.dataset.dshDesktopManagementEntry
    if (tab !== 'plugins' && tab !== 'skills') return
    if (nativeClicks.has(target)) {
      nativeClicks.delete(target)
      return
    }
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    if (opening.has(target)) return
    opening.add(target)
    target.setAttribute('aria-busy', 'true')
    clearError(target)
    void openDesktopSurface('extensions', { tab }).then(opened => {
      if (!opened) showError(target, tab)
    }).catch(() => showError(target, tab)).finally(() => {
      opening.delete(target)
      target.removeAttribute('aria-busy')
    })
  }

  void hasCapability('extensions.open').then((available) => {
    if (disposed || !available) return
    ownerDocument.addEventListener('click', onClick, true)
    observer = new MutationObserver(scan)
    observer.observe(ownerDocument.body, { childList: true, subtree: true })
    scan()
    unsubscribePluginSettings = mainBridge()?.onPluginSettingsOpen?.((request) => {
      const name = typeof request?.name === 'string' ? request.name : ''
      const entry = ownerDocument.querySelector<HTMLElement>('[data-dsh-desktop-management-entry="plugins"]')
      if (entry !== null) {
        entry.setAttribute('aria-busy', 'true')
        clearError(entry)
      }
      void openRuntimePluginSettings(ownerDocument, name, nativeEntry => nativeClicks.add(nativeEntry))
        .then(opened => { if (!opened && entry !== null) showError(entry, 'plugins') })
        .catch(() => { if (entry !== null) showError(entry, 'plugins') })
        .finally(() => entry?.removeAttribute('aria-busy'))
    })
  }).catch(() => {})

  return () => {
    disposed = true
    observer?.disconnect()
    unsubscribePluginSettings?.()
    ownerDocument.removeEventListener('click', onClick, true)
    for (const entry of managed) {
      clearError(entry)
      delete entry.dataset.dshDesktopManagementEntry
      entry.removeAttribute('aria-busy')
    }
    managed.clear()
  }
}

/** Desktop-only shortcut that opens the Smart Control center. */
export function DesktopSmartControlEntry({ wide, t }: DesktopExtensionDockEntryProps) {
  const [available, setAvailable] = useState(false)
  const [opening, setOpening] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    void hasCapability('extensions.open').then(value => { if (active) setAvailable(value) }).catch(() => {})
    return () => { active = false }
  }, [])
  const openControlCenter = useCallback(async () => {
    if (opening) return
    setOpening(true); setFailed(false)
    try {
      if (!await openDesktopSurface('extensions', { setting: 'control-center' })) setFailed(true)
    } catch { setFailed(true) } finally { setOpening(false) }
  }, [opening])
  if (!available) return null
  const label = t('controlLabel' satisfies WebUIPluginsKey)
  return <div className={css.dockEntry} data-wide={wide ? 'wide' : 'rail'}>
    <button type="button" className={css.dockTrigger} aria-label={label} title={label} disabled={opening} onClick={() => { void openControlCenter() }}>
      <SmartControlIcon wide={wide} />
      {wide && <span className={css.dockTriggerLabel}>{label}</span>}
    </button>
    {failed && <span className={css.dockError} role="alert">{t('controlOpenFailed' satisfies WebUIPluginsKey)}</span>}
  </div>
}

/** Desktop-only shortcut that deep-links straight to the collaboration page. */
export function DesktopCollaborationEntry({ wide, t }: DesktopExtensionDockEntryProps) {
  const [available, setAvailable] = useState(false)
  const [opening, setOpening] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    void hasCapability('extensions.open').then(value => {
      if (active) setAvailable(value)
    }).catch(() => {})
    return () => { active = false }
  }, [])

  const openCollaboration = useCallback(async () => {
    if (opening) return
    setOpening(true)
    setFailed(false)
    try {
      if (!await openDesktopSurface('extensions', { setting: 'value-mode' })) setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setOpening(false)
    }
  }, [opening])

  if (!available) return null
  const label = t('collaborationLabel' satisfies WebUIPluginsKey)
  return <div className={css.dockEntry} data-wide={wide ? 'wide' : 'rail'}>
    <button type="button" className={css.dockTrigger} aria-label={label} title={label} disabled={opening} onClick={() => { void openCollaboration() }}>
      <CollaborationIcon wide={wide} />
      {wide && <span className={css.dockTriggerLabel}>{label}</span>}
    </button>
    {failed && <span className={css.dockError} role="alert">{t('collaborationOpenFailed' satisfies WebUIPluginsKey)}</span>}
  </div>
}

type DockNudgePosition = { left: number; bottom: number; arrowLeft: number }

export function calculateDockNudgePosition({
  trigger,
  viewportWidth,
  viewportHeight,
}: {
  trigger: Pick<DOMRect, 'left' | 'top' | 'width'>
  viewportWidth: number
  viewportHeight: number
}): DockNudgePosition {
  const margin = 12
  const width = Math.min(288, Math.max(0, viewportWidth - margin * 2))
  const maximumLeft = Math.max(margin, viewportWidth - width - margin)
  const left = Math.min(Math.max(margin, trigger.left), maximumLeft)
  const bottom = Math.max(margin, viewportHeight - trigger.top + 10)
  const arrowLeft = Math.min(Math.max(14, trigger.left + trigger.width / 2 - left - 4), Math.max(14, width - 24))
  return { left, bottom, arrowLeft }
}

/** Desktop-only one-click Extension Dock entry beside the Settings control. */
export function DesktopExtensionDockEntry({ wide, t }: DesktopExtensionDockEntryProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [available, setAvailable] = useState(false)
  const [showNudge, setShowNudge] = useState(false)
  const [nudgePosition, setNudgePosition] = useState<DockNudgePosition>()
  const [opening, setOpening] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    void getDockEntryState().then((state) => {
      if (!active) return
      if (state.available === true) {
        setAvailable(true)
        setShowNudge(state.showNudge === true)
      } else {
        setAvailable(false)
      }
    }).catch(() => {})
    return () => { active = false }
  }, [])

  const dismiss = useCallback((reason: DockDismissReason) => {
    setShowNudge(false)
    void dismissDockNudge(reason).catch(() => {})
  }, [])

  useEffect(() => {
    if (!showNudge) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') dismiss('escape')
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [dismiss, showNudge])

  const updateNudgePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (trigger === null) return
    setNudgePosition(calculateDockNudgePosition({
      trigger: trigger.getBoundingClientRect(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }))
  }, [])

  useLayoutEffect(() => {
    if (!showNudge) return
    updateNudgePosition()
    window.addEventListener('resize', updateNudgePosition)
    window.addEventListener('scroll', updateNudgePosition, true)
    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(updateNudgePosition)
      : undefined
    if (triggerRef.current !== null) observer?.observe(triggerRef.current)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateNudgePosition)
      window.removeEventListener('scroll', updateNudgePosition, true)
    }
  }, [showNudge, updateNudgePosition, wide])

  const openDock = useCallback(async () => {
    if (opening) return
    setShowNudge(false)
    setFailed(false)
    setOpening(true)
    void dismissDockNudge('clicked').catch(() => {})
    try {
      const opened = await openDesktopSurface('extensions')
      if (!opened) {
        setFailed(true)
      }
    } catch {
      setFailed(true)
    } finally {
      setOpening(false)
    }
  }, [opening])

  if (!available) return null
  const label = t('dockLabel' satisfies WebUIPluginsKey)

  return (
    <div className={css.dockEntry} data-wide={wide ? 'wide' : 'rail'} data-dsh-extension-dock-entry="">
      <button
        ref={triggerRef}
        type="button"
        className={css.dockTrigger}
        aria-label={label}
        title={label}
        aria-describedby={showNudge ? 'dsh-extension-dock-nudge' : undefined}
        disabled={opening}
        onClick={() => { void openDock() }}
      >
        <DockIcon wide={wide} />
        {wide && <span className={css.dockTriggerLabel}>{label}</span>}
      </button>
      {showNudge && nudgePosition && createPortal(
        <div
          id="dsh-extension-dock-nudge"
          className={css.dockNudge}
          role="status"
          style={{
            left: nudgePosition.left,
            bottom: nudgePosition.bottom,
            '--dock-nudge-arrow-left': `${nudgePosition.arrowLeft}px`,
          } as CSSProperties}
        >
          <span>{t('dockNudge' satisfies WebUIPluginsKey)}</span>
          <button
            type="button"
            className={css.dockNudgeClose}
            aria-label={t('dockDismiss' satisfies WebUIPluginsKey)}
            onClick={() => dismiss('close')}
          >
            ×
          </button>
        </div>,
        document.body,
      )}
      {failed && (
        <span className={css.dockError} role="alert">
          {t('dockOpenFailed' satisfies WebUIPluginsKey)}
        </span>
      )}
    </div>
  )
}

function DockIcon({ wide }: { wide?: boolean }) {
  return (
    <img
      className={css.dockBrandIcon}
      src={APP_BRAND_ICON_DATA_URL}
      width={wide ? 20 : 22}
      height={wide ? 20 : 22}
      alt=""
      aria-hidden="true"
    />
  )
}

function CollaborationIcon({ wide }: { wide?: boolean }) {
  const size = wide ? 16 : 18
  return <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="5" cy="5" r="2" />
    <circle cx="11" cy="5" r="2" />
    <path d="M1.8 12.8c.4-2 1.5-3 3.2-3s2.8 1 3.2 3M7.8 12.8c.4-2 1.5-3 3.2-3s2.8 1 3.2 3" />
  </svg>
}

function SmartControlIcon({ wide }: { wide?: boolean }) {
  const size = wide ? 16 : 18
  return <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="1.8" y="2.2" width="12.4" height="8.2" rx="1.5" />
    <path d="M5.3 13.8h5.4M8 10.5v3.3M10.2 5.2l2.5 2.5M10.2 7.7l2.5-2.5" />
  </svg>
}

