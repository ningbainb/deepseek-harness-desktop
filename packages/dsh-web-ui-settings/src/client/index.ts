/**
 * Web UI plugin group, browser half. Registers the `web-ui-plugins`
 * dictionaries and one first-level settings section. The section declares the
 * `web-ui.plugin.item` child slot; the dsh-web-ui family plugins register
 * their per-plugin cards there.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings-surface SlotMap merge (the 'settings.section'
// entry) and the ctx.settingsScope Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: imports the official Models footer extension contract.
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
// Type-only: imports the model options page's additive onboarding slot.
import type {} from '@linxin666/dsh-client-ui-model-preferences/client'
// Type-only: pulls the sidebar footer action slot contract.
import { installParticleThemeClient } from '@linxin666/dsh-particle-theme/src/client/index.ts'
import { WebUiSettingsBinder } from './compat-settings-scope.ts'
import { ChatGptAuthSection } from './ChatGptAuthSection.tsx'
import { WebUIPluginsSection } from './WebUIPluginsCard.tsx'
import { RelayOnboardingCard } from './RelayOnboardingCard.tsx'
import { DesktopCollaborationEntry, DesktopExtensionDockEntry, DesktopSmartControlEntry, installDesktopManagementRouting } from './desktop-extension-dock.tsx'
import { dockSettingFromUrl } from './DockSettingsPage.tsx'
import { DockSettingsOutlet, mirrorDockSlot } from './dock-slot-mirror.tsx'
import { projectCopy } from './ProjectDialog.tsx'
import { installBrowserClose, installProjectDialog } from './desktop-interactions.tsx'
import { protectDirectoryEditorFocus } from './directory-editor-focus.ts'
import { installDesktopAppearance } from './desktop-appearance.ts'
import { installAccountRelayRecommendation } from './account-relay-recommendation.ts'
import { installDesktopLinkOpening } from './desktop-link-opening.ts'
import { installDesktopSkillsCommand } from './desktop-skills-command.ts'
import { installDesktopUsageNavigation } from './desktop-usage-navigation.ts'
import { CommunityPluginsSettingsCard } from './CommunityPluginsSettingsCard.tsx'
import {
  chatGptAuthEn,
  chatGptAuthZh,
  en,
  zh,
  communityPluginsZh,
  communityPluginsEn,
  type CommunityPluginKey,
  type ChatGptAuthKey,
  type WebUIPluginsKey,
} from './locales.ts'
import { relayEn, relayZh, type RelayLocaleKey } from './locales.ts'
import { installRelayModelEntrances } from './relay-model-entrances.tsx'
import { installRelaySendGuard } from './relay-send-guard.ts'
import { installRelayAuthFailures } from './relay-auth-failures.ts'

export type { WebUIPluginsSectionProps } from './WebUIPluginsCard.tsx'
export { SafePluginBoundary } from './SafePluginBoundary.tsx'
export type { SafePluginBoundaryProps, SafePluginBoundaryState } from './SafePluginBoundary.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'community-plugins': CommunityPluginKey
    'desktop-project': keyof typeof projectCopy.zh
    /** Web UI plugin group card copy. */
    'web-ui-plugins': WebUIPluginsKey
    /** ChatGPT authorization surface copy. */
    'chatgpt-auth': ChatGptAuthKey
    /** User-owned relay onboarding card copy. */
    'relay-onboarding': RelayLocaleKey
  }

  interface SlotMap {
    'plugins.row.config': { kind: 'keyed'; scope: 'root'; owner: { view: 'summary' | 'page' } }
    /**
     * The child slot one family plugin card registers into, declared by the
     * group section.
     */
    'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: SettingsPluginItemOwnerProps }
    /** Optional Desktop actions rendered immediately before Settings. */
    'sidebar.footer.action': { kind: 'list'; scope: 'root'; owner: SidebarFooterActionOwnerProps }
  }
}

/** Owner share of a plugin card (the group card supplies nothing). */
export interface SettingsPluginItemOwnerProps {
  /** Marker field: card owner props are intentionally empty. */
  children?: never
}

/** Sidebar-owned display state supplied to each footer action. */
export interface SidebarFooterActionOwnerProps {
  wide: boolean
}

/** Required services. */
export const inject = ['slots', 'locale', 'connection', 'configForms', 'remote']

/**
 * Register the Web UI plugin group.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const dockSetting = dockSettingFromUrl()
  ctx.effect(() => installDesktopAppearance(window), 'web-ui-settings: desktop appearance')
  if (!dockSetting) {
    ctx.effect(() => installDesktopUsageNavigation(document, ctx.locale.bind('web-ui-plugins')), 'web-ui-settings: usage navigation')
    ctx.inject(['commandUi'], scope => {
      scope.effect(() => installDesktopSkillsCommand(scope, document), 'web-ui-settings: native skills command')
    })
    ctx.effect(() => installDesktopLinkOpening(ctx, document), 'web-ui-settings: desktop link destination')
    ctx.effect(() => installAccountRelayRecommendation(document), 'web-ui-settings: account relay recommendation')
    ctx.effect(() => protectDirectoryEditorFocus(document), 'web-ui-settings: native directory editor focus')
    ctx.effect(() => installBrowserClose(document), 'web-ui-settings: browser close action')
    ctx.inject?.(['workspaces', 'sessions', 'uiWorkspace'], scope => {
      scope.effect(() => installProjectDialog(scope as ClientContext), 'web-ui-settings: project dialog')
    })
  }
  ctx.effect(() => ctx.locale.register('desktop-project', projectCopy), 'web-ui-settings: project dictionaries')
  ctx.effect(() => ctx.locale.register('web-ui-plugins', { zh, en }), 'web-ui-settings: dictionaries')
  ctx.effect(() => ctx.locale.register('chatgpt-auth', { zh: chatGptAuthZh, en: chatGptAuthEn }), 'web-ui-settings: ChatGPT dictionaries')
  ctx.effect(() => ctx.locale.register('relay-onboarding', { zh: relayZh, en: relayEn }), 'web-ui-settings: relay dictionaries')
  ctx.effect(() => installRelayModelEntrances(document, ctx.locale.bind('relay-onboarding')), 'web-ui-settings: relay model entrances')
  if (!dockSetting) ctx.inject(['conversation', 'modelDirectories'], scope => {
    scope.effect(() => installRelaySendGuard(scope.conversation, document, () => scope.locale.bind('relay-onboarding')('notSignedIn'), undefined, async session => {
      const directory = scope.modelDirectories.directoryFor(session.sessionId)
      if (directory.store.getSnapshot().current === null) await directory.load()
      return directory.store.getSnapshot().current
    }), 'web-ui-settings: selected bai access')
  })
  if (!dockSetting) ctx.inject(['sessions'], scope => {
    scope.effect(() => installRelayAuthFailures(scope.sessions, document), 'web-ui-settings: bai runtime authorization failures')
  })
  if (!dockSetting) ctx.effect(
    () => installDesktopManagementRouting(document, ctx.locale.bind('web-ui-plugins')),
    'web-ui-settings: unified Desktop management routing',
  )

  // The rc.6 compatibility binder: family plugins read ctx.get('webUiSettings')
  // and fall back to the official settings scope on hosts that expose their
  // namespaces natively.
  const settingsBinder = new WebUiSettingsBinder(ctx)
  ctx.effect(() => ctx.locale.register('community-plugins', { zh: communityPluginsZh, en: communityPluginsEn }), 'web-ui-settings: community dictionaries')
  const communityScope = settingsBinder.bind<{ enabled?: boolean }>({ namespace: 'community-plugins' })
  ctx.slots.inject('web-ui.plugin.item', () => ctx.slots.register({
    name: 'web-ui.plugin.item', id: 'community-plugins', order: 129, locale: 'community-plugins',
    inject: () => ({ settingsScope: communityScope }),
  }, CommunityPluginsSettingsCard))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'chatgpt-auth',
    order: 20,
    label: () => ctx.locale.bind('chatgpt-auth')('title'),
    locale: 'chatgpt-auth',
  }, ChatGptAuthSection))

  if (!dockSetting) ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'web-ui-plugins',
    order: 110,
    label: () => ctx.locale.bind('web-ui-plugins')('title'),
    locale: 'web-ui-plugins',
    children: { 'web-ui.plugin.item': { kind: 'list', scope: 'root' } },
  }, WebUIPluginsSection))

  if (dockSetting) {
    ctx.slots.inject('web-ui.plugin.item', () => ctx.slots.register({
      name: 'web-ui.plugin.item', id: 'relay', order: 1, locale: 'relay-onboarding',
    }, RelayOnboardingCard))
  } else {
    // The official Models page only exposes a footer extension seat. The page
    // is a flex column, so the card's negative order raises bai into the first
    // screen without modifying or replacing the upstream package.
    ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
      name: 'settings.models.footer',
      id: 'bai-onboarding',
      order: -100,
      locale: 'relay-onboarding',
    }, RelayOnboardingCard))
  }

  // The highest ordered footer action sits immediately before Settings.
  // Ordinary Web hosts receive no button because the component requires the
  // narrow Desktop `extensions.open` capability before rendering.
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'desktop-smart-control',
    order: 98,
    locale: 'web-ui-plugins',
  }, DesktopSmartControlEntry))

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'desktop-model-collaboration',
    order: 99,
    locale: 'web-ui-plugins',
  }, DesktopCollaborationEntry))

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'desktop-extension-dock',
    order: 100,
    locale: 'web-ui-plugins',
  }, DesktopExtensionDockEntry))

  // Desktop's pinned aggregate predates the standalone particle loader row.
  // The particle installer is document-idempotent, so newer aggregates that
  // do carry that row still end up with exactly one canvas and settings card.
  installParticleThemeClient(ctx, settingsBinder)

  // Only the isolated Dock settings document replaces the root. The main
  // conversation document continues to use the official application frame.
  if (dockSetting) {
    ctx.slots.inject('root', () => {
      const disposePage = ctx.slots.register({
        name: 'root',
        priority: -100,
        locale: 'web-ui-plugins',
        children: { 'web-ui.plugin.item': { kind: 'list', scope: 'root' }, 'desktop-dock.settings.section': { kind: 'list', scope: 'root' }, 'desktop-dock.plugins.row.config': { kind: 'keyed', scope: 'root' } },
        inject: () => ({ pluginOptions: {
          keys: () => ctx.slots.entriesOfSlot('plugins.row.config').flatMap(entry => typeof entry.options.key === 'string' ? [entry.options.key] : []),
          subscribe: (listener: () => void) => ctx.slots.subscribe('plugins.row.config', listener),
        } }),
      }, DockSettingsOutlet)
      const cleanups: Array<() => void> = [disposePage]
      try {
        cleanups.push(mirrorDockSlot(ctx.slots, 'settings.section', 'desktop-dock.settings.section'))
        cleanups.push(mirrorDockSlot(ctx.slots, 'plugins.row.config', 'desktop-dock.plugins.row.config'))
      } catch (error) {
        for (const cleanup of cleanups.reverse()) cleanup()
        throw error
      }
      return () => {
        for (const cleanup of [...cleanups].reverse()) cleanup()
      }
    })
  }
}
