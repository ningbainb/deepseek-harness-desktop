import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ConnectorIcon } from './ConnectorIcon.tsx'
import { ConnectorWizardDialog } from './ConnectorWizardDialog.tsx'
import type { WorkModeLocaleKey } from './locales.ts'
import { officeAppsStore } from './office-apps-store.ts'
import css from './work-mode.module.css'

export interface OfficeAppsModalProps {
  t: (key: WorkModeLocaleKey) => string
  locale: 'zh' | 'en'
  onOpenExtensions: () => void
  onOpenExternalUrl: (url: string) => void
  onRunPrompt: (prompt?: string) => void
}

const CATEGORIES = [
  { id: 'all', key: 'catAll' },
  { id: 'office-suite', key: 'catOffice' },
  { id: 'meeting-docs', key: 'catDocs' },
  { id: 'knowledge-notes', key: 'catNotes' },
] as const

function statusLocaleKey(status: string): WorkModeLocaleKey {
  return `status_${status}` as WorkModeLocaleKey
}

export function OfficeAppsModal({
  t,
  locale,
  onOpenExtensions,
  onOpenExternalUrl,
  onRunPrompt,
}: OfficeAppsModalProps) {
  const store = useSyncExternalStore(officeAppsStore.subscribe, officeAppsStore.getSnapshot, officeAppsStore.getSnapshot)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [category, setCategory] = useState<string>('all')

  const showCatalog = store.catalogOpen && !store.activeConnectorId

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (showCatalog && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    } else if (!showCatalog && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
    }
  }, [showCatalog])

  const items = store.snapshot?.items ?? []
  const visibleItems = category === 'all' ? items : items.filter(item => item.entry.category === category)
  const activeItem = items.find(item => item.entry.id === store.activeConnectorId)

  return <>
    <dialog
      ref={dialogRef}
      className={css.catalogDialog}
      data-dsh-office-apps-modal
      aria-labelledby="dsh-office-apps-title"
      onCancel={(e) => { e.preventDefault(); officeAppsStore.closeCatalog() }}
    >
      <div className={css.modalBody}>
        <header className={css.modalHeader}>
          <div className={css.modalHeaderCopy}>
            <h2 id="dsh-office-apps-title">{t('officeAppsModalTitle')}</h2>
            <p>{t('officeAppsModalSubtitle')}</p>
          </div>
          <div className={css.heroActions}>
            <button type="button" className={css.quietBtn} onClick={() => { officeAppsStore.closeCatalog(); onOpenExtensions() }}>
              {t('customExtensions')}
            </button>
            <button type="button" className={css.iconBtn} aria-label={t('close')} onClick={() => officeAppsStore.closeCatalog()}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </header>

        <div className={css.toolbarRow}>
          <div className={css.filters} role="group" aria-label={t('catalogSection')}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                className={css.filterChip}
                aria-pressed={category === cat.id}
                onClick={() => setCategory(cat.id)}
              >
                {t(cat.key)}
              </button>
            ))}
          </div>
        </div>

        {store.error ? <div className={css.callout} data-tone="error" role="alert">
          <span>{t('loadFailed')}</span>
          <button type="button" className={css.secondaryBtn} onClick={() => void officeAppsStore.refresh()}>{t('retry')}</button>
        </div> : store.snapshot === undefined ? <p className={css.mutedNote}>{t('loadingCatalog')}</p> : <div className={css.cardGrid}>
          {visibleItems.map((item) => {
            const actionKey: WorkModeLocaleKey = item.status === 'connected'
              ? 'manage'
              : item.status === 'installed_unauthenticated'
                ? 'continueAuth'
                : 'connect'
            return <article key={item.entry.id} className={css.card} data-connector-card={item.entry.id}>
              <div className={css.cardIdentity}>
                <div className={css.iconBadge}>
                  <ConnectorIcon id={item.entry.id} />
                </div>
                <div className={css.cardTitleGroup}>
                  <div className={css.cardTitleRow}>
                    <h3 className={css.cardTitle}>{item.entry.name[locale]}</h3>
                    <span className={css.maintainerTag}>
                      {t(item.entry.maintainer === 'official' ? 'officialBadge' : 'communityBadge')}
                    </span>
                  </div>
                  <p className={css.cardSummary}>{item.entry.summary[locale]}</p>
                </div>
              </div>
              <div className={css.cardBottom}>
                <span className={css.statusPill}>
                  <span className={css.statusDot} data-state={item.status} aria-hidden="true" />
                  {t(statusLocaleKey(item.status))}
                </span>
                <button
                  type="button"
                  className={item.status === 'connected' ? css.secondaryBtn : css.primaryBtn}
                  onClick={() => officeAppsStore.openWizard(item.entry.id)}
                >
                  {t(actionKey)}
                </button>
              </div>
            </article>
          })}
        </div>}
      </div>
    </dialog>

    <ConnectorWizardDialog
      item={activeItem}
      locale={locale}
      t={t}
      busy={store.busy}
      envResult={store.envResult}
      installResult={store.installResult}
      loginSession={store.loginSession}
      onClose={() => officeAppsStore.closeWizard()}
      onOpenUrl={onOpenExternalUrl}
      onDetectEnv={id => officeAppsStore.detectEnv(id)}
      onInstall={id => officeAppsStore.install(id)}
      onStartLogin={id => officeAppsStore.startLogin(id, onOpenExternalUrl)}
      onPollLoginStatus={id => officeAppsStore.pollLoginStatus(id, onOpenExternalUrl)}
      onConfigureAndVerify={(id, patch) => officeAppsStore.configureAndVerify(id, patch)}
      onDisconnect={id => officeAppsStore.disconnect(id)}
      onStartExampleTask={(connectorId) => {
        const target = items.find(i => i.entry.id === connectorId)
        officeAppsStore.closeCatalog()
        onRunPrompt(target?.entry.examples[0]?.prompt[locale])
      }}
    />
  </>
}
