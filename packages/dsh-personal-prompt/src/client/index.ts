import type { ClientContext, SettingsScope, SettingsScopeSpec } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import {
  PERSONAL_PROMPT_SETTINGS_NAMESPACE,
  normalizePersonalPrompt,
  type PersonalPromptConfig,
} from '../core/config.ts'
import { PersonalPromptCard } from './PersonalPromptCard.tsx'
import { en, zh, type PersonalPromptLocaleKey } from './locales.ts'

export * from './locales.ts'
export { PersonalPromptCard } from './PersonalPromptCard.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'personal-prompt': PersonalPromptLocaleKey
  }

  interface SlotMap {
    'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: { children?: never } }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    webUiSettings?: { bind<S>(spec: SettingsScopeSpec<S>): SettingsScope<S> }
  }
}

export const inject = ['slots', 'locale', 'settingsScope']

function settingsBinder(ctx: ClientContext): { bind<S>(spec: SettingsScopeSpec<S>): SettingsScope<S> } {
  const compatibility = ctx.get('webUiSettings') as { bind?: unknown } | undefined
  if (compatibility !== undefined && typeof compatibility.bind === 'function') return compatibility as { bind<S>(spec: SettingsScopeSpec<S>): SettingsScope<S> }
  return ctx.settingsScope
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('personal-prompt', { zh, en }), 'personal-prompt: dictionaries')
  const settingsScope = settingsBinder(ctx).bind<PersonalPromptConfig>({
    namespace: PERSONAL_PROMPT_SETTINGS_NAMESPACE,
    decode: value => {
      try { return normalizePersonalPrompt(value) } catch { return undefined }
    },
  })
  ctx.inject(['slots'], scope => {
    scope.slots.inject('web-ui.plugin.item', () => scope.slots.register({
      name: 'web-ui.plugin.item',
      id: 'personal-prompt',
      order: 117,
      locale: 'personal-prompt',
      inject: () => ({ config: normalizePersonalPrompt(settingsScope.getSnapshot().value), settingsScope }),
    }, PersonalPromptCard))
  })
}
