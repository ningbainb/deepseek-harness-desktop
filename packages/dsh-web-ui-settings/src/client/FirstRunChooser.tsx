import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { RELAY_STATUS_PATH, type RelayStatusResponse } from '../relay-protocol.ts'
import type { RelayLocaleKey } from './locales.ts'
import { postRelay } from './relay-client.ts'
import { RELAY_SIGN_IN_REQUIRED_EVENT } from './relay-send-guard.ts'
import css from './relay-onboarding.module.css'

export const FIRST_RUN_DISMISSED_KEY = 'dsh.firstRunChooser.dismissed.v1'

type Translate = (key: RelayLocaleKey) => string

export interface FirstRunChooserOptions {
  openModelsSettings: () => void
  readStatus?: () => Promise<RelayStatusResponse>
}

export function FirstRunChooser({
  t,
  onOfficial,
  onRelay,
  onLocal,
  onDismiss,
}: {
  t: Translate
  onOfficial: () => void
  onRelay: () => void
  onLocal: () => void
  onDismiss: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        onDismiss()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [onDismiss])

  const isZh = /[\u4e00-\u9fff]/.test(t('firstRunTitle'))

  return (
    <div className={css.firstRunBackdrop}>
      <section
        ref={dialogRef}
        className={css.firstRunDialog}
        role="region"
        aria-label={t('firstRunTitle')}
        data-dsh-first-run-chooser="true"
      >
        <header className={css.firstRunHeader}>
          <div>
            <h2>{t('firstRunTitle')}</h2>
            <p>{t('firstRunSubtitle')}</p>
          </div>
          <button
            type="button"
            className={css.iconClose}
            aria-label={t('closeAccess')}
            title={t('closeAccess')}
            onClick={onDismiss}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className={css.firstRunGrid}>
          <article className={css.firstRunCard}>
            <div className={css.firstRunCardTop}>
              <span className={css.firstRunBadge}>{t('firstRunOfficialBadge')}</span>
            </div>
            <h3 className={css.firstRunCardTitle}>{t('firstRunOfficialTitle')}</h3>
            <p className={css.firstRunCardDesc}>{t('firstRunOfficialDesc')}</p>
            <div className={css.firstRunChips}>
              <span>{isZh ? '官方原版' : 'Official'}</span>
              <span>{isZh ? '直连账号' : 'Direct'}</span>
            </div>
            <div className={css.firstRunCardActions}>
              <button type="button" className={css.secondary} onClick={onOfficial}>
                {t('firstRunOfficialAction')}
              </button>
            </div>
          </article>

          <article className={`${css.firstRunCard} ${css.firstRunCardRecommended}`}>
            <div className={css.firstRunCardTop}>
              <span className={css.firstRunBadge}>{t('firstRunRelayBadge')}</span>
              <span className={css.firstRunRecommendedTag}>{t('firstRunRecommended')}</span>
            </div>
            <h3 className={css.firstRunCardTitle}>{t('firstRunRelayTitle')}</h3>
            <p className={css.firstRunCardDesc}>{t('firstRunRelayDesc')}</p>
            <div className={`${css.firstRunChips} ${css.firstRunChipsGrid}`}>
              <span>Claude</span>
              <span>GPT</span>
              <span>Gemini</span>
              <span>DeepSeek</span>
            </div>
            <div className={css.firstRunCardActions}>
              <button
                type="button"
                data-first-run-primary="true"
                className={css.primaryWide}
                onClick={onRelay}
              >
                {t('firstRunRelayAction')}
              </button>
            </div>
          </article>

          <article className={css.firstRunCard}>
            <div className={css.firstRunCardTop}>
              <span className={css.firstRunBadge}>{t('firstRunLocalBadge')}</span>
            </div>
            <h3 className={css.firstRunCardTitle}>{t('firstRunLocalTitle')}</h3>
            <p className={css.firstRunCardDesc}>{t('firstRunLocalDesc')}</p>
            <div className={css.firstRunChips}>
              <span>Gemini CLI</span>
              <span>Codex</span>
              <span>{isZh ? '自定义 Key' : 'Custom Key'}</span>
            </div>
            <div className={css.firstRunCardActions}>
              <button type="button" className={css.secondary} onClick={onLocal}>
                {t('firstRunLocalAction')}
              </button>
            </div>
          </article>
        </div>

        <footer className={css.firstRunFooter}>
          <button type="button" className={css.firstRunLater} onClick={onDismiss}>
            {t('firstRunLater')}
          </button>
        </footer>
      </section>
    </div>
  )
}

function isElementVisible(element: Element | null, win: Window): element is HTMLElement {
  const HtmlElementCtor = (win as Window & typeof globalThis).HTMLElement ?? HTMLElement
  if (!element || !(element instanceof HtmlElementCtor)) return false
  if (element.closest('[hidden], [aria-hidden="true"]')) return false
  const style = win.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function composerHasText(doc: Document): boolean {
  const inputs = doc.querySelectorAll('[data-composer-card] textarea, [data-composer-card] [data-composer-input]')
  for (const input of inputs) {
    const value = 'value' in input ? String((input as HTMLTextAreaElement).value) : input.textContent ?? ''
    if (value.trim().length > 0) return true
  }
  return false
}

export function installFirstRunChooser(
  doc: Document,
  translate: Translate,
  options: FirstRunChooserOptions,
): () => void {
  if (!doc.body) return () => {}
  try {
    if (doc.defaultView?.localStorage?.getItem(FIRST_RUN_DISMISSED_KEY)) return () => {}
  } catch {}

  const container = doc.createElement('div')
  container.dataset.dshFirstRunRoot = 'true'
  doc.body.append(container)
  const root = createRoot(container)
  let disposed = false
  let active = false
  let rendered = false
  let frame = 0

  const renderCard = () => {
    root.render(
      <FirstRunChooser
        t={translate}
        onDismiss={dismiss}
        onOfficial={() => {
          dismiss()
          options.openModelsSettings()
        }}
        onRelay={() => {
          dismiss()
          doc.dispatchEvent(new CustomEvent(RELAY_SIGN_IN_REQUIRED_EVENT, { detail: { source: 'first-run-chooser', autoConnect: false } }))
        }}
        onLocal={() => {
          dismiss()
          options.openModelsSettings()
        }}
      />,
    )
  }

  const clearContainerPlacement = () => {
    container.style.cssText = ''
    const wrapper = container.firstElementChild as HTMLElement | null
    if (wrapper) {
      wrapper.style.left = ''
      wrapper.style.top = ''
      wrapper.style.width = ''
      wrapper.style.height = ''
    }
  }

  const updatePlacement = () => {
    frame = 0
    if (disposed || !active) return
    const win = doc.defaultView
    if (!win) return

    // In jsdom or non-layout environments, innerWidth/rects are 0; render directly without geometric gating.
    const composerCard = doc.querySelector('[data-composer-card]')
    const composerRect = composerCard?.getBoundingClientRect()
    const hasRealViewport = win.innerWidth > 0 && win.innerHeight > 0 && composerRect && composerRect.width > 0
    if (!hasRealViewport) {
      if (!rendered) {
        rendered = true
        renderCard()
      }
      clearContainerPlacement()
      return
    }

    const blockingSelector = [
      '[role="dialog"]',
      '[aria-modal="true"]',
      'dialog[open]',
      '#dsh-desktop-star-prompt[data-open="true"]',
      '#dsh-desktop-release-guide[data-open="true"]',
    ].join(', ')
    const hasBlockingDialog = [...doc.querySelectorAll(blockingSelector)].some(el => !container.contains(el) && isElementVisible(el, win))
    const hasSettingsOrConversation = Boolean(
      doc.querySelector('[data-shortcut-modal="settings"], [data-chat-flow-kind], [data-message-id], [data-turn-id]')
      || composerHasText(doc),
    )

    if (hasBlockingDialog || hasSettingsOrConversation || !isElementVisible(composerCard, win)) {
      if (rendered) {
        rendered = false
        root.render(null)
      }
      return
    }

    let sidebarRight = 0
    for (const el of doc.querySelectorAll('[data-pane="sidebar"], [class*="sidebarCol"], aside, [data-sidebar]')) {
      if (!isElementVisible(el, win)) continue
      const rect = el.getBoundingClientRect()
      if (rect.left <= 48 && rect.right < composerRect.left + 40) {
        sidebarRight = Math.max(sidebarRight, rect.right)
      }
    }

    let paneRight = win.innerWidth - 16
    for (const el of doc.querySelectorAll('[data-rightbar-col]')) {
      if (!isElementVisible(el, win)) continue
      const rect = el.getBoundingClientRect()
      if (rect.right >= win.innerWidth - 48 && rect.left > sidebarRight + 200) {
        paneRight = Math.min(paneRight, rect.left - 16)
      }
    }

    let topSafe = 84
    for (const el of doc.querySelectorAll('[data-dsh-responsive-part="sidebar-toggle"], [data-dsh-relay-model-entry]')) {
      if (!isElementVisible(el, win)) continue
      const rect = el.getBoundingClientRect()
      if (rect.top < 120 && rect.bottom < composerRect.top - 180) {
        topSafe = Math.max(topSafe, rect.bottom + 12)
      }
    }

    const paneLeft = Math.max(sidebarRight + 16, 16)
    const paneWidth = Math.max(0, paneRight - paneLeft)
    const clearHeight = Math.max(0, composerRect.top - topSafe - 16)

    if (clearHeight < 220 || paneWidth < 520) {
      if (rendered) {
        rendered = false
        root.render(null)
      }
      return
    }

    if (!rendered) {
      rendered = true
      renderCard()
    }
    const wrapper = container.firstElementChild as HTMLElement | null
    if (wrapper) {
      wrapper.style.left = `${Math.round(paneLeft)}px`
      wrapper.style.top = `${topSafe}px`
      wrapper.style.width = `${Math.round(paneWidth)}px`
      wrapper.style.height = `${Math.round(clearHeight)}px`
    }
  }

  const schedulePlacement = () => {
    if (disposed || !active) return
    const win = doc.defaultView
    if (win && typeof win.requestAnimationFrame === 'function') {
      if (!frame) frame = win.requestAnimationFrame(updatePlacement)
    } else {
      updatePlacement()
    }
  }

  function dismiss() {
    try { doc.defaultView?.localStorage?.setItem(FIRST_RUN_DISMISSED_KEY, '1') } catch {}
    active = false
    rendered = false
    if (!disposed) root.render(null)
  }

  const observer = typeof MutationObserver === 'function'
    ? new MutationObserver(schedulePlacement)
    : undefined
  observer?.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'aria-modal', 'data-open', 'open'],
  })
  const win = doc.defaultView
  win?.addEventListener('resize', schedulePlacement)
  doc.addEventListener('input', schedulePlacement, true)

  const readStatus = options.readStatus ?? (() => postRelay<RelayStatusResponse>(RELAY_STATUS_PATH))
  void readStatus().then(status => {
    if (disposed || !status.firstRun || status.configured || status.writable === false) return
    if (doc.querySelector('[data-shortcut-modal="settings"]')) return
    active = true
    updatePlacement()
  }).catch(() => {})

  return () => {
    disposed = true
    active = false
    rendered = false
    if (frame && win && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(frame)
    observer?.disconnect()
    win?.removeEventListener('resize', schedulePlacement)
    doc.removeEventListener('input', schedulePlacement, true)
    root.unmount()
    container.remove()
  }
}
