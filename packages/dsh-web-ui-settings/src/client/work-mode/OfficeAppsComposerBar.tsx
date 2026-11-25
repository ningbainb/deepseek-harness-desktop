import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { BriefcaseIcon } from './ConnectorIcon.tsx'
import { OfficeAppsModal } from './OfficeAppsModal.tsx'
import type { WorkModeLocaleKey } from './locales.ts'
import { officeAppsStore } from './office-apps-store.ts'
import css from './work-mode.module.css'

export interface OfficeAppsComposerTriggerProps {
  t: (key: WorkModeLocaleKey) => string
  locale: 'zh' | 'en'
  isBlankSession?: boolean
  onOpenExtensions: () => void
  onOpenExternalUrl: (url: string) => void
  onRunPrompt: (prompt?: string) => void
}

export function OfficeAppsComposerTrigger({
  t,
  locale,
  isBlankSession = true,
  onOpenExtensions,
  onOpenExternalUrl,
  onRunPrompt,
}: OfficeAppsComposerTriggerProps) {
  const store = useSyncExternalStore(officeAppsStore.subscribe, officeAppsStore.getSnapshot, officeAppsStore.getSnapshot)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [dockTarget, setDockTarget] = useState<Element | null>(null)

  useEffect(() => {
    officeAppsStore.ensureLoaded()
  }, [])

  useLayoutEffect(() => {
    const btn = triggerRef.current
    if (!btn) return
    const root = btn.closest('[data-composer-card]')?.parentElement
    const dock = root?.querySelector(':scope > [data-composer-dock]') ?? root?.querySelector('[data-composer-dock]') ?? null
    if (dock !== dockTarget) setDockTarget(dock)
  })

  const connected = (store.snapshot?.items ?? []).filter(i => i.config.enabled && i.status === 'connected')
  const firstName = connected[0]?.entry.name[locale]
  const label = connected.length === 0
    ? t('officeAppsButton')
    : connected.length === 1
      ? t('officeAppsConnectedOne').replace('{name}', firstName!)
      : t('officeAppsConnectedMany')
          .replace('{name}', firstName!)
          .replace('{more}', String(connected.length - 1))
          .replace('{total}', String(connected.length))

  const starterNode = (
    <OfficeStarterDock
      t={t}
      locale={locale}
      isBlankSession={isBlankSession}
      onRunPrompt={onRunPrompt}
    />
  )

  return <>
    <button
      ref={triggerRef}
      type="button"
      className={css.composerTriggerBtn}
      data-dsh-office-apps-trigger
      data-connected={connected.length > 0 ? 'true' : undefined}
      title={connected.length > 0 ? connected.map(c => c.entry.name[locale]).join(' / ') : t('officeAppsModalSubtitle')}
      onClick={() => officeAppsStore.openCatalog()}
    >
      {connected.length > 0
        ? <span className={css.statusDot} data-state="connected" aria-hidden="true" />
        : <BriefcaseIcon size={14} />}
      <span>{label}</span>
    </button>

    {dockTarget ? createPortal(starterNode, dockTarget) : null}

    <OfficeAppsModal
      t={t}
      locale={locale}
      onOpenExtensions={onOpenExtensions}
      onOpenExternalUrl={onOpenExternalUrl}
      onRunPrompt={onRunPrompt}
    />
  </>
}

export interface OfficeStarterDockProps {
  t: (key: WorkModeLocaleKey) => string
  locale: 'zh' | 'en'
  isBlankSession: boolean
  onRunPrompt: (prompt?: string) => void
}

export function OfficeStarterDock({
  t,
  locale,
  isBlankSession,
  onRunPrompt,
}: OfficeStarterDockProps) {
  const store = useSyncExternalStore(officeAppsStore.subscribe, officeAppsStore.getSnapshot, officeAppsStore.getSnapshot)

  useEffect(() => {
    if (isBlankSession && store.experienceMode === 'office') {
      officeAppsStore.ensureLoaded()
    }
  }, [isBlankSession, store.experienceMode])

  if (!isBlankSession || store.experienceMode !== 'office') return null

  const items = (store.snapshot?.items ?? []).filter(i => i.entry.examples.length > 0).slice(0, 4)

  return <div className={css.starterDock} data-dsh-office-starter-dock>
    {items.map((item) => {
      const example = item.entry.examples[0]
      const ready = item.config.enabled && item.status === 'connected'
      return <button
        key={item.entry.id}
        type="button"
        className={css.starterPill}
        data-starter-connector={item.entry.id}
        onClick={() => ready ? onRunPrompt(example.prompt[locale]) : officeAppsStore.openWizard(item.entry.id)}
      >
        <span className={css.statusDot} data-state={ready ? 'connected' : 'not_installed'} aria-hidden="true" />
        <span>{example.title[locale]}</span>
        {!ready && <span className={css.starterMeta}>({item.entry.name[locale]})</span>}
      </button>
    })}
    <button
      type="button"
      className={css.starterPill}
      onClick={() => officeAppsStore.openCatalog()}
    >
      <BriefcaseIcon size={13} />
      <span>{t('manageOfficeAppsChip')}</span>
    </button>
  </div>
}
