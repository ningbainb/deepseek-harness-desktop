/**
 * The Web UI plugins first-level settings section. It renders a static heading
 * and the family plugin cards directly because the settings navigation already
 * selects this section.
 */

import { Fragment, useEffect, useState, type ReactNode } from 'react'
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { getDockEntryState, openDesktopSurface } from '@linxin666/dsh-desktop-client'
import { isDockSetting } from './DockSettingsPage.tsx'
import { SafePluginBoundary } from './SafePluginBoundary.tsx'
import { RepairStatusCard } from './RepairStatusCard.tsx'
import type { WebUIPluginsKey } from './locales.ts'
import css from './web-ui-settings.module.css'

/** Owner share of a family-plugin card. */
export interface SettingsPluginItemOwnerProps {
  /** Marker field: card owner props are intentionally empty. */
  children?: never
}

/** Props the first-level settings section binds. */
export type WebUIPluginsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'web-ui-plugins'>
  & PropsRenderSlots<'web-ui.plugin.item'>
  & { getPluginIds?: () => string[] }

/** Render the family plugin cards under a static settings heading. */
export function WebUIPluginsSection(props: WebUIPluginsSectionProps): ReactNode {
  const { t, renderSlot } = props
  const [desktop, setDesktop] = useState(false)
  const [openError, setOpenError] = useState(false)
  useEffect(() => {
    let active = true
    void getDockEntryState().then(state => { if (active) setDesktop(state.available) }).catch(() => {})
    return () => { active = false }
  }, [])
  const handleOpenDock = (): void => {
    setOpenError(false)
    void openDesktopSurface('extensions').then(result => {
      if (!result) setOpenError(true)
    }).catch(() => setOpenError(true))
  }

  return (
    <div className={css.section}>
      <h2 className={css.heading} title={t('title')}>{t('title')}</h2>
      <p className={css.lede} title={t('description')}>{t('description')}</p>
      {desktop && <div className={css.dockBanner} data-testid="desktop-dock-banner">
        <div className={css.dockBannerIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
            <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
            <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
            <path d="M17 13.5v7M13.5 17h7" />
          </svg>
        </div>
        <div className={css.dockBannerContent}>
          <div className={css.dockBannerTitle}>{t('dockBannerTitle' as WebUIPluginsKey)}</div>
          <div className={css.dockBannerDesc}>{t('dockBannerDesc' as WebUIPluginsKey)}</div>
        </div>
        <button
          type="button"
          className={css.dockBannerAction}
          onClick={handleOpenDock}
        >
          {t('dockBannerAction' as WebUIPluginsKey)}
        </button>
      </div>}
      {openError && <p role="alert">{t('dockOpenFailed')}</p>}
      <SafePluginBoundary pluginName="repair-status-card">
        <RepairStatusCard t={t} />
      </SafePluginBoundary>
      <ul className={css.subcards}>
        <SafePluginBoundary pluginName="web-ui-plugin-items">
          {desktop && props.getPluginIds
            ? props.getPluginIds().filter(id => !isDockSetting(id)).map(id =>
              <Fragment key={id}>{renderSlot('web-ui.plugin.item', {}, { only: id })}</Fragment>)
            : renderSlot('web-ui.plugin.item', {})}
        </SafePluginBoundary>
      </ul>
    </div>
  )
}
