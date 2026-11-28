import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import { BriefcaseIcon } from './ConnectorIcon.tsx'
import { OfficeAppsModal } from './OfficeAppsModal.tsx'
import type { WorkModeLocaleKey } from './locales.ts'
import { officeAppsStore } from './office-apps-store.ts'
import css from './work-mode.module.css'

type StarterSession = Pick<SessionSnapshot, 'blank' | 'running' | 'awaitingFirstTurn'>
const useNoSession = () => undefined

export interface OfficeAppsComposerTriggerProps {
  t: (key: WorkModeLocaleKey) => string
  locale: 'zh' | 'en'
  isBlankSession?: boolean
  useSession?: (select: (session: StarterSession) => boolean) => boolean | undefined
  onOpenExtensions: () => void
  onOpenExternalUrl: (url: string) => void
  onRunPrompt: (prompt?: string) => void
}

export function OfficeAppsComposerTrigger({
  t,
  locale,
  isBlankSession = true,
  useSession = useNoSession,
  onOpenExtensions,
  onOpenExternalUrl,
  onRunPrompt,
}: OfficeAppsComposerTriggerProps) {
  const store = useSyncExternalStore(officeAppsStore.subscribe, officeAppsStore.getSnapshot, officeAppsStore.getSnapshot)
  const inOffice = store.experienceMode === 'office'
  const showStarters = useSession(session => session.blank && !session.running && !session.awaitingFirstTurn) ?? isBlankSession
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [dockTarget, setDockTarget] = useState<Element | null>(null)

  useEffect(() => {
    if (inOffice) officeAppsStore.ensureLoaded()
  }, [inOffice])

  useLayoutEffect(() => {
    const btn = triggerRef.current
    const root = btn?.closest('[data-composer-card]')?.parentElement
    const dock = root?.querySelector(':scope > [data-composer-dock]') ?? root?.querySelector('[data-composer-dock]') ?? null
    if (dock !== dockTarget) setDockTarget(dock)
  })

  if (!inOffice) return null

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

  const accessibleName = connected.length ? `${t('officeAppsButton')} · ${label}` : label

  const starterNode = (
    <OfficeStarterDock
      t={t}
      locale={locale}
      isBlankSession={showStarters}
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
      aria-label={accessibleName}
      aria-haspopup="dialog"
      title={connected.length > 1 ? `${t('officeAppsButton')} · ${connected.map(c => c.entry.name[locale]).join(' / ')}` : accessibleName}
      onClick={() => officeAppsStore.openCatalog()}
    >
      <BriefcaseIcon size={14} />
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

  const connectedItems = (store.snapshot?.items ?? [])
    .filter(i => i.config.enabled && i.status === 'connected' && i.entry.examples.length > 0)
    .slice(0, 3)

  return <div className={css.starterDock} data-dsh-office-starter-dock>
    {connectedItems.map((item) => {
      const example = item.entry.examples[0]
      return <button
        key={item.entry.id}
        type="button"
        className={css.starterPill}
        data-starter-connector={item.entry.id}
        onClick={() => onRunPrompt(example.prompt[locale])}
      >
        <span className={css.statusDot} data-state="connected" aria-hidden="true" />
        <span>{example.title[locale]}</span>
      </button>
    })}
    <button
      type="button"
      className={css.starterPill}
      data-starter-local-doc="true"
      onClick={() => onRunPrompt(t('localDocStarterPrompt'))}
    >
      <span>{t('localDocStarterChip')}</span>
    </button>
    <button
      type="button"
      className={css.starterPill}
      data-starter-manage-office="true"
      onClick={() => officeAppsStore.openCatalog()}
    >
      <BriefcaseIcon size={13} />
      <span>{connectedItems.length > 0 ? t('manageOfficeAppsChip') : t('connectOfficeAppsChip')}</span>
    </button>
  </div>
}
