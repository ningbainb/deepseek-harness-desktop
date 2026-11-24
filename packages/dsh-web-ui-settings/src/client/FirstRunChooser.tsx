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
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLButtonElement>('[data-first-run-primary="true"]')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
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
      <div
        ref={dialogRef}
        className={css.firstRunDialog}
        role="dialog"
        aria-modal="true"
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
      </div>
    </div>
  )
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

  const dismiss = () => {
    try { doc.defaultView?.localStorage?.setItem(FIRST_RUN_DISMISSED_KEY, '1') } catch {}
    if (!disposed) root.render(null)
  }

  const readStatus = options.readStatus ?? (() => postRelay<RelayStatusResponse>(RELAY_STATUS_PATH))
  void readStatus().then(status => {
    if (disposed || !status.firstRun || status.configured || status.writable === false) return
    if (doc.querySelector('[data-shortcut-modal="settings"]')) return
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
          doc.dispatchEvent(new CustomEvent(RELAY_SIGN_IN_REQUIRED_EVENT, { detail: { source: 'first-run-chooser' } }))
        }}
        onLocal={() => {
          dismiss()
          options.openModelsSettings()
        }}
      />,
    )
  }).catch(() => {})

  return () => {
    disposed = true
    root.unmount()
    container.remove()
  }
}
