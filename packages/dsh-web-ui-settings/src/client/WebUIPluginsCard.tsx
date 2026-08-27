/**
 * The Web UI plugins first-level settings section. It renders a static heading
 * and the family plugin cards directly because the settings navigation already
 * selects this section.
 */

import type { ReactNode } from 'react'
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { SafePluginBoundary } from './SafePluginBoundary.tsx'
import { RepairStatusCard } from './RepairStatusCard.tsx'
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

/** Render the family plugin cards under a static settings heading. */
export function WebUIPluginsSection(props: WebUIPluginsSectionProps): ReactNode {
  const { t, renderSlot } = props
  return (
    <div className={css.section}>
      <h2 className={css.heading} title={t('title')}>{t('title')}</h2>
      <p className={css.lede} title={t('description')}>{t('description')}</p>
      <SafePluginBoundary pluginName="repair-status-card">
        <RepairStatusCard t={t} />
      </SafePluginBoundary>
      <ul className={css.subcards}>
        <SafePluginBoundary pluginName="web-ui-plugin-items">
          {renderSlot('web-ui.plugin.item', {})}
        </SafePluginBoundary>
      </ul>
    </div>
  )
}
