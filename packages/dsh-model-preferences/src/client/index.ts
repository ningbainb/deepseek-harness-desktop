/**
 * Browser half of model preferences. The official ModelDirectory remains the
 * state machine and Host transport; this package only supplies a preference
 * projection inside the official Models page and a preference-aware composer seat.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SettingsScope, SettingsScopeSpec } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { CommandDecoration, CommandUiContract, CommandUiSpec } from '@deepseek-ai/dsh-client-ui-commands/client'
import type { ModelDirectoryResolver } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { ModelCatalogFailure, ModelProviderGroup } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'

import {
  MODEL_PREFERENCES_SETTINGS_NAMESPACE,
  normalizeModelPreferences,
  type ModelPreferencesConfig,
} from '../core/config.ts'
import { ModelPreferencesCard, type ModelPreferenceCatalog } from './ModelPreferencesCard.tsx'
import { ModelSelect } from './ModelSelect.tsx'
import { commandOptions, selectionFromOptionId, selectModelWithPreferences } from './model-projection.ts'
import { en, zh, type ModelPreferencesLocaleKey } from './locales.ts'

export * from './locales.ts'
export { ModelPreferencesCard } from './ModelPreferencesCard.tsx'
export { ModelSelect } from './ModelSelect.tsx'
export * from './model-projection.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'model-preferences': ModelPreferencesLocaleKey
  }

  interface SlotMap {
    /** Additive onboarding content rendered at the top of model preferences. */
    'model-preferences.onboarding': {
      kind: 'list'
      scope: 'root'
      owner: ModelPreferencesOnboardingOwnerProps
    }
  }

}

export interface ModelPreferencesOnboardingOwnerProps {
  children?: never
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional compatibility binder supplied by dsh-web-ui-settings. */
    webUiSettings?: { bind<S>(spec: SettingsScopeSpec<S>): SettingsScope<S> }
  }
}

// The nested composer/command injections inherit `sessions` from this
// package fiber while resolving the official model directory service.
export const inject = ['slots', 'locale', 'connection', 'settingsScope', 'remote', 'remote.session', 'sessions']

const EMPTY_CONFIG: ModelPreferencesConfig = {
  version: 1,
  pinnedModels: [],
  providerOrder: [],
  disabledProviders: [],
  recentModels: [],
}

function settingsBinder(ctx: ClientContext): { bind<S>(spec: SettingsScopeSpec<S>): SettingsScope<S> } {
  const compatibility = (ctx.get as (name: string) => unknown)('webUiSettings')
  if (typeof compatibility === 'object' && compatibility !== null && typeof (compatibility as { bind?: unknown }).bind === 'function') {
    return compatibility as { bind<S>(spec: SettingsScopeSpec<S>): SettingsScope<S> }
  }
  return ctx.settingsScope
}

function currentConfig(scope: SettingsScope<ModelPreferencesConfig>): ModelPreferencesConfig {
  try {
    return normalizeModelPreferences(scope.getSnapshot().value)
  } catch {
    return { ...EMPTY_CONFIG }
  }
}

function catalogLoader(ctx: ClientContext): () => Promise<ModelPreferenceCatalog> {
  return async () => {
    // DSH 0.1.5 exposes the shared Host-generation catalog through the typed
    // Remote service, the same public seam used by the official model picker.
    const response = await ctx.remote.session.modelCatalog()
    if (!response.ok) throw new Error(response.error?.message || 'model catalog request failed')
    return {
      groups: response.value.groups ?? [],
      failures: response.value.failures ?? [],
    }
  }
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('model-preferences', { zh, en }), 'model-preferences: dictionaries')

  const binder = settingsBinder(ctx)
  const settingsScope = binder.bind<ModelPreferencesConfig>({
    namespace: MODEL_PREFERENCES_SETTINGS_NAMESPACE,
    decode: value => {
      try {
        return normalizeModelPreferences(value)
      } catch {
        return undefined
      }
    },
  })
  const loadCatalog = catalogLoader(ctx)

  ctx.inject(['slots'], scope => {
    // The official Models page owns this extension slot.
    scope.slots.inject('settings.models.footer', () => scope.slots.register({
      name: 'settings.models.footer',
      id: 'model-preferences',
      order: 10,
      locale: 'model-preferences',
      children: { 'model-preferences.onboarding': { kind: 'list', scope: 'root' } },
      inject: () => ({
        config: currentConfig(settingsScope),
        settingsScope,
        loadCatalog,
      }),
    }, ModelPreferencesCard))
  })

  // This injection waits for the official command and ModelDirectory services.
  // The public command seam can decorate a Host command. It cannot replace a
  // same-name client contribution, and the current official model-selection
  // plugin registers `/model` as exactly such a contribution.
  ctx.inject(['commandUi', 'modelDirectories', 'remote.session'], (scope) => {
    const command = scope.get('commandUi') as CommandUiContract
    const models = scope.modelDirectories as ModelDirectoryResolver
    const sessions = scope.sessions
    const translate = ctx.locale.bind('model-preferences')

    const available: CommandDecoration['available'] = session => sessions.subagentAddress(session.sessionId) === undefined
    const ui: CommandUiSpec = {
      kind: 'popupSelect' as const,
      options: async (session, signal) => {
        if (signal.aborted || sessions.subagentAddress(session.sessionId) !== undefined) return []
        const directory = models.directoryFor(session.sessionId)
        await directory.load()
        if (signal.aborted) return []
        return commandOptions(directory.store.getSnapshot(), currentConfig(settingsScope), (key, params) => translate(key as ModelPreferencesLocaleKey, params))
      },
      onSelect: async (option, session) => {
        if (sessions.subagentAddress(session.sessionId) !== undefined) throw new Error('model selection is unavailable for addressed subagent sessions')
        const directory = models.directoryFor(session.sessionId)
        const selection = selectionFromOptionId(directory.store.getSnapshot(), option.id, currentConfig(settingsScope))
        if (selection === undefined) throw new Error('the selected model is no longer available')
        await selectModelWithPreferences(directory, settingsScope, selection)
      },
    }

    scope.effect(() => {
      // Do not register a same-name contribution or inspect/mutate the
      // command runtime's private live registry. On SDK versions where
      // `/model` is a Host command this public decoration takes effect; on
      // current versions it is inert because `/model` is a client
      // contribution. The official command remains untouched until the SDK
      // exposes a public contribution-replacement seam.
      return command.decorate({ name: 'model', available, ui })
    }, 'model-preferences: decorate /model when supported')
  })

  ctx.inject(['slots', 'modelDirectories', 'remote.session'], (scope) => {
    const models = scope.modelDirectories as ModelDirectoryResolver
    const sessions = scope.sessions
    scope.slots.inject('conversation.input.model', () => scope.slots.register({
      name: 'conversation.input.model',
      priority: -10,
      locale: 'model-preferences',
      inject: (sessionId) => {
        const directory = models.directoryFor(sessionId)
        const available = sessions.subagentAddress(sessionId) === undefined
        return {
          available,
          modelSessionId: String(sessionId),
          directory: directory.store,
          settingsScope,
          load: () => {
            if (available) directory.load().catch(() => {})
          },
          select: selection => available
            ? selectModelWithPreferences(directory, settingsScope, selection).then(() => true, () => false)
            : Promise.resolve(false),
        }
      },
    }, ModelSelect))
  })
}
