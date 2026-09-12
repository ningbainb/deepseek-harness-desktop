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
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: imports the model options page's additive onboarding slot.
import type {} from '@linxin666/dsh-client-ui-model-preferences/client'
// Type-only: pulls the sidebar footer action slot contract.
import { installParticleThemeClient } from '@linxin666/dsh-particle-theme/src/client/index.ts'
import { WebUiSettingsBinder } from './compat-settings-scope.ts'
import { ChatGptAuthSection } from './ChatGptAuthSection.tsx'
import { WebUIPluginsSection } from './WebUIPluginsCard.tsx'
import { RelayOnboardingCard } from './RelayOnboardingCard.tsx'
import { DesktopExtensionDockEntry } from './desktop-extension-dock.tsx'
import { DockSettingsPage, dockSettingFromUrl } from './DockSettingsPage.tsx'
import { projectCopy } from './ProjectDialog.tsx'
import { installBrowserClose, installProjectDialog } from './desktop-interactions.tsx'
import { protectDirectoryEditorFocus } from './directory-editor-focus.ts'
import { installDesktopAppearance } from './desktop-appearance.ts'
import {
  chatGptAuthEn,
  chatGptAuthZh,
  en,
  zh,
  type ChatGptAuthKey,
  type WebUIPluginsKey,
} from './locales.ts'
import { relayEn, relayZh, type RelayLocaleKey } from './locales.ts'

export type { WebUIPluginsSectionProps } from './WebUIPluginsCard.tsx'
export { SafePluginBoundary } from './SafePluginBoundary.tsx'
export type { SafePluginBoundaryProps, SafePluginBoundaryState } from './SafePluginBoundary.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'desktop-project': keyof typeof projectCopy.zh
    /** Web UI plugin group card copy. */
    'web-ui-plugins': WebUIPluginsKey
    /** ChatGPT authorization surface copy. */
    'chatgpt-auth': ChatGptAuthKey
    /** User-owned relay onboarding card copy. */
    'relay-onboarding': RelayLocaleKey
  }

  interface SlotMap {
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
export const inject = ['slots', 'locale', 'connection', 'settingsScope', 'remote']

/**
 * Register the Web UI plugin group.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const dockSetting = dockSettingFromUrl()
  ctx.effect(() => installDesktopAppearance(window), 'web-ui-settings: desktop appearance')
  if (!dockSetting) {
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

  // The rc.6 compatibility binder: family plugins read ctx.get('webUiSettings')
  // and fall back to the official settings scope on hosts that expose their
  // namespaces natively.
  const settingsBinder = new WebUiSettingsBinder(ctx)

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
    inject: () => ({ getPluginIds: () => ctx.slots.entriesOfSlot('web-ui.plugin.item').flatMap(entry => entry.options.id ? [entry.options.id] : []) }),
  }, WebUIPluginsSection))

  if (dockSetting) {
    ctx.slots.inject('web-ui.plugin.item', () => ctx.slots.register({
      name: 'web-ui.plugin.item', id: 'relay', order: 1, locale: 'relay-onboarding',
    }, RelayOnboardingCard))
  } else {
    ctx.slots.inject('model-preferences.onboarding', () => ctx.slots.register({
      name: 'model-preferences.onboarding',
      id: 'bai',
      order: 5,
      locale: 'relay-onboarding',
    }, RelayOnboardingCard))
  }

  // The highest ordered footer action sits immediately before Settings.
  // Ordinary Web hosts receive no button because the component requires the
  // narrow Desktop `extensions.open` capability before rendering.
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
    ctx.slots.inject('root', () => ctx.slots.register({
      name: 'root',
      priority: -100,
      locale: 'web-ui-plugins',
      children: { 'web-ui.plugin.item': { kind: 'list', scope: 'root' }, 'settings.section': { kind: 'list', scope: 'root' } },
    }, DockSettingsPage))
  }
}
