import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SettingsScope, SettingsScopeSpec } from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings-surface SlotMap merge (the definitions that
// name the 'settings.*' holes) and the ctx.settingsScope Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-token-meter/client'
import { LiveStatsSettingsCard, LiveStatsSettingsCardController, type LiveStatsSettings } from './LiveStatsSettingsCard.tsx'
import { TpsLineDockEntry } from './TpsLine.tsx'
import { en, zh, type SettingsCardKey } from './locales.ts'
import { BalanceController } from './balance-controller.ts'
import { mountBalanceSidebarEntry } from './balance-sidebar.ts'
import { mountBalanceView } from './balance-mount.tsx'
import { followBalanceSelection } from './balance-selection.ts'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'

export { TpsLine, formatTokensPerSecond } from './TpsLine.tsx'
export type { LiveStatsSettings, LiveStatsSettingsCardFace, LiveStatsSettingsCardState } from './LiveStatsSettingsCard.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** live-stats settings-card copy. */
    'live-stats': SettingsCardKey
  }

  interface SlotMap {
    /**
     * The child slot the Web UI plugin group declares; this card registers
     * into the group instead of the top-level `settings.plugin.item` list.
     * Spelled here with the same shape so this package can register without
     * depending on the sibling UI package.
     */
    'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: SettingsPluginItemOwnerProps }
  }
}

/** Owner share of a plugin card (the section supplies nothing). */
export interface SettingsPluginItemOwnerProps {
  /** Marker field: card owner props are intentionally empty. */
  children?: never
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * Optional rc.6 compatibility binder provided by dsh-web-ui-settings;
     * absent when that group plugin is not installed, so callers fall back to
     * the official settings scope.
     */
    webUiSettings?: { bind<S>(spec: SettingsScopeSpec<S>): SettingsScope<S> }
  }
}


/** Dictionary namespace owned by this plugin. */
const NS = 'live-stats'

/** Settings namespace the live-stats card edits (the Host plugin registers it). */
const LIVE_STATS_NS = 'live-stats'

/** Services required by this plugin. */
export const inject = ['slots', 'locale', 'connection', 'settingsScope', 'remote']

/**
 * Register the compact statistics supplement, settings and balance center.
 * Native DSH owns cumulative usage and average-speed primary indicators.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'live-stats: dictionaries')

  // Plugin configuration card: one staged form over the `live-stats` settings
  // namespace, contributed to the plugin-configuration section.
  const binder = ctx.get('webUiSettings') ?? ctx.settingsScope
  const liveStatsSettings = new LiveStatsSettingsCardController(
    binder.bind<LiveStatsSettings>({ namespace: LIVE_STATS_NS }),
  )
  ctx.slots.inject('web-ui.plugin.item', () => ctx.slots.register({
    name: 'web-ui.plugin.item',
    id: 'live-stats',
    order: 110,
    locale: NS,
    inject: () => liveStatsSettings.inject(),
  }, LiveStatsSettingsCard))

  // One localized disclosure keeps cost and live estimates accessible without
  // repeating the native primary indicators. No SDK DOM or source is modified.
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'live-stats',
    order: 100,
    locale: NS,
    inject: () => ({}),
  }, TpsLineDockEntry))

  // LLM Balance & Usage Center: sidebar entry + center-column overview.
  ctx.effect(() => {
    const controller = new BalanceController()
    controller.setSelection(null)
    const disposeSelection = ctx.inject(['sessions', 'modelDirectories', 'remote.session'], scope => {
      // The combined host/client type program merges the host SessionStore into
      // Context; resolve the client face explicitly at this browser boundary.
      const sessions = (scope.get as (name: string) => unknown)('sessions') as ISessions
      scope.effect(() => followBalanceSelection(controller, sessions, scope.modelDirectories), 'live-stats: active model')
    })
    const t = ctx.locale.bind(NS)
    const disposeSidebar = mountBalanceSidebarEntry(controller, t)
    const disposeView = mountBalanceView(controller, t)

    return () => {
      void disposeSelection.dispose()
      controller.dispose()
      disposeSidebar?.()
      disposeView?.()
    }
  }, 'live-stats: balance center')
}
