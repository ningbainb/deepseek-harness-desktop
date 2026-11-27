/**
 * Web UI plugin group, browser half. Registers the `web-ui-plugins`
 * dictionaries and one first-level settings section. The section declares the
 * `web-ui.plugin.item` child slot; the dsh-web-ui family plugins register
 * their per-plugin cards there.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { openDesktopSurface } from '@linxin666/dsh-desktop-client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings-surface SlotMap merge (the 'settings.section'
// entry) and the ctx.settingsScope Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: imports the official Models footer extension contract.
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: imports the model options page's additive onboarding slot.
import type {} from '@linxin666/dsh-client-ui-model-preferences/client'
// Type-only: pulls the sidebar footer action slot contract.
import { installParticleThemeClient } from '@linxin666/dsh-particle-theme/src/client/index.ts'
import { WebUiSettingsBinder } from './compat-settings-scope.ts'
import { ChatGptAuthSection } from './ChatGptAuthSection.tsx'
import { WebUIPluginsSection } from './WebUIPluginsCard.tsx'
import { ModelAdvancedEntry } from './ModelAdvancedEntry.tsx'
import { installDesktopNativeSettings, openDesktopNativeSettings } from './desktop-native-settings.tsx'
import { RelayOnboardingCard } from './RelayOnboardingCard.tsx'
import { DesktopExtensionDockEntry, installDesktopManagementRouting, type WorkshopDiscovery } from './desktop-extension-dock.tsx'
import { dockSettingFromUrl } from './DockSettingsPage.tsx'
import { DockSettingsOutlet, mirrorDockSlot } from './dock-slot-mirror.tsx'
import { createPluginOptionsDirectory } from './plugin-options-directory.ts'
import { projectCopy } from './ProjectDialog.tsx'
import { installBrowserClose, installProjectDialog } from './desktop-interactions.tsx'
import { protectDirectoryEditorFocus } from './directory-editor-focus.ts'
import { installDesktopAppearance } from './desktop-appearance.ts'
import { installAccountRelayRecommendation } from './account-relay-recommendation.ts'
import { installDesktopLinkOpening } from './desktop-link-opening.ts'
import { installDesktopSkillsCommand } from './desktop-skills-command.ts'
import { installDesktopUsageNavigation } from './desktop-usage-navigation.ts'
import { installDesktopPresetNavigation } from './desktop-preset-navigation.ts'
import { confirmCustomProviderKey, installCustomProviderKeyPersistence } from './custom-provider-key-persistence.ts'
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
import { installRelayErrorFallback } from './relay-error-fallback.tsx'
import { installFirstRunChooser } from './FirstRunChooser.tsx'
import { installRemoteAccessHintEnhancer } from './remote-access-hint.ts'
import { registerRemoteAccessPluginRows } from './remote-access-plugin-row.ts'
import { installSettingsOnboardingPriority, supportsDesktopSettingsPriority } from './settings-onboarding-priority.tsx'
import { ensureOfficeWorkSession, registerOfficeAppsIntegration, type ConnectionHandle } from './settings-sdk-adapter.ts'
import { OfficeAppsComposerTrigger, OfficeStarterDock } from './work-mode/OfficeAppsComposerBar.tsx'
import { workModeEn, workModeZh } from './work-mode/locales.ts'
import { installSidebarModeSwitcher } from './work-mode/sidebar-mode-switcher.ts'

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
  const nativeDesktopSettings = !dockSetting && supportsDesktopSettingsPriority(window)
  if (nativeDesktopSettings) {
    ctx.effect(() => installSettingsOnboardingPriority(ctx.slots, () => ctx.locale.getSnapshot().active), 'web-ui-settings: settings interaction before automatic onboarding')
    ctx.effect(() => installDesktopNativeSettings(ctx), 'web-ui-settings: native desktop preferences')
  }
  ctx.effect(() => installDesktopAppearance(window), 'web-ui-settings: desktop appearance')
  if (!dockSetting) {
    ctx.effect(() => installDesktopPresetNavigation(ctx.slots, window), 'web-ui-settings: Desktop preset navigation')
    ctx.effect(() => installDesktopUsageNavigation(document, ctx.locale.bind('web-ui-plugins'), nativeDesktopSettings ? () => openDesktopNativeSettings('usage') : undefined), 'web-ui-settings: usage navigation')
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
    ctx.inject?.(['slots', 'locale', 'uiWorkspace', 'sessions'], scope => {
      scope.effect(() => registerOfficeAppsIntegration(scope, {
        zh: workModeZh,
        en: workModeEn,
        OfficeAppsComposerTrigger,
        OfficeStarterDock,
        onOpenExtensions: () => {
          const transport = (window as Window & { dshDesktopTransport?: { openExtensions?(tab?: string): void } }).dshDesktopTransport
          if (transport?.openExtensions) transport.openExtensions('plugins')
          else if (nativeDesktopSettings) openDesktopNativeSettings('plugins')
          else document.querySelector<HTMLButtonElement>('[data-shortcut-trigger="settings"]')?.click()
        },
      }), 'web-ui-settings: unified office apps composer and starter dock')
      scope.effect(
        () => installSidebarModeSwitcher(document, {
          locale: () => scope.locale.getSnapshot().active,
          onEnterOfficeMode: () => ensureOfficeWorkSession(scope),
        }),
        'web-ui-settings: prominent sidebar experience mode switcher',
      )
    })
  }
  ctx.effect(() => ctx.locale.register('desktop-project', projectCopy), 'web-ui-settings: project dictionaries')
  ctx.effect(() => ctx.locale.register('web-ui-plugins', { zh, en }), 'web-ui-settings: dictionaries')
  const desktopHost = window as Window & { dshDesktop?: unknown; dshDesktopTransport?: unknown }
  if (desktopHost.dshDesktop || desktopHost.dshDesktopTransport) {
    ctx.effect(() => installCustomProviderKeyPersistence(document, {
      translate: ctx.locale.bind('web-ui-plugins'),
      saveAndConfirm: confirmCustomProviderKey,
    }), 'web-ui-settings: persist custom provider key before profile creation')
  }
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
  if (!dockSetting) ctx.inject(['sessions', 'modelDirectories'], scope => {
    scope.effect(() => installRelayErrorFallback(scope.sessions, scope.modelDirectories, document, ctx.locale.bind('relay-onboarding')), 'web-ui-settings: bai error fallback')
  })
  if (!dockSetting && (desktopHost.dshDesktop || desktopHost.dshDesktopTransport)) {
    ctx.effect(() => installFirstRunChooser(document, ctx.locale.bind('relay-onboarding'), {
      openModelsSettings: () => {
        if (nativeDesktopSettings) {
          openDesktopNativeSettings('models')
        } else {
          document.querySelector<HTMLButtonElement>('[data-shortcut-trigger="settings"]')?.click()
        }
      },
    }), 'web-ui-settings: first-run onboarding chooser')
  }
  if (!dockSetting) {
    ctx.effect(() => installRemoteAccessHintEnhancer(document, {
      openPluginSettings: () => {
        const navigation = ctx.get('pluginNavigation') as { openBundle?(name: string): void; openList?(): void } | undefined
        if (navigation?.openBundle) {
          navigation.openBundle('@linxin666/dsh-web-all')
          return true
        }
        if (navigation?.openList) {
          navigation.openList()
          return false
        }
        void openDesktopSurface('extensions', { tab: 'plugins' })
        return false
      },
    }), 'web-ui-settings: remote access hint enhancer')
  }
  if (!dockSetting) ctx.effect(
    () => installDesktopManagementRouting(document, ctx.locale.bind('web-ui-plugins'), nativeDesktopSettings ? {
      get panelInfo() { return ctx.get('layout')?.panelInfo },
      get generation() { return (ctx.get('connection') as ConnectionHandle | undefined)?.generation },
      openPlugins() {
        const navigation = ctx.get('pluginNavigation') as { openList(): void } | undefined
        if (!navigation) return false
        navigation.openList()
        return true
      },
      workshopDiscovery() {
        const slots: Pick<SlotCore, 'entriesOfSlot'> = ctx.slots
        const entry = slots.entriesOfSlot('plugins.tab').find(row => row.options.id === 'discover' && row.locale === 'pluginMarket')
        const face = entry?.inject?.() as Partial<WorkshopDiscovery> | undefined
        if (face?.hooks?.discover && face.select && face.reload && face.retry) {
          return { hooks: face.hooks, select: face.select, reload: face.reload, retry: face.retry }
        }
      },
      openSettings: openDesktopNativeSettings,
    } : undefined),
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

  if (!dockSetting) ctx.slots.inject('plugins.row.config', () => registerRemoteAccessPluginRows(ctx.slots))

  if (dockSetting) {
    ctx.slots.inject('web-ui.plugin.item', () => ctx.slots.register({
      name: 'web-ui.plugin.item', id: 'relay', order: 1, locale: 'relay-onboarding',
    }, RelayOnboardingCard))
  } else {
    // The official Models page only exposes a footer extension seat. The page
    // is a flex column, so the card's negative order raises bai into the first
    // screen without modifying or replacing the upstream package.
    const subscribeCodexCredential = (listener: () => void) => ctx.remote.$on('credentials/record-updated', key => {
      if (key === 'llm-pi-ai/openai-codex') listener()
    })
    ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
      name: 'settings.models.footer',
      id: 'bai-onboarding',
      order: -100,
      locale: 'relay-onboarding',
      inject: () => ({
        compact: nativeDesktopSettings,
        ...(nativeDesktopSettings && {
          defaultModelScope: ctx.configForms.get<{ provider?: string; model?: string }>('agent-default-model'),
          subscribeCodexCredential,
        }),
      }),
    }, RelayOnboardingCard))
  }

  if (!dockSetting && !nativeDesktopSettings) ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
    name: 'settings.models.footer', id: 'desktop-model-advanced', order: 100,
  }, ModelAdvancedEntry))

  // Desktop management starts at the Dock. Legacy shortcuts still route to
  // the same canonical settings pages through the public Desktop client.
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
        inject: () => ({ pluginOptions: createPluginOptionsDirectory(ctx.slots) }),
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
