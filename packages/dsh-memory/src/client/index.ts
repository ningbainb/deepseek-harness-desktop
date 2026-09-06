import type { ClientContext, SettingsScope, SettingsScopeSpec } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { normalizeMemoryConfig, type MemoryConfig } from '../core/config.ts'
import { MEMORY_SETTINGS_NAMESPACE } from '../core/schema.ts'
import { MemorySettingsCard } from './MemorySettingsCard.tsx'
import { en, zh, type MemoryLocaleKey } from './locales.ts'

export * from './locales.ts'
export { MemorySettingsCard } from './MemorySettingsCard.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    memory: MemoryLocaleKey
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
  if (compatibility !== undefined && typeof compatibility.bind === 'function') {
    return compatibility as { bind<S>(spec: SettingsScopeSpec<S>): SettingsScope<S> }
  }
  return ctx.settingsScope
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('memory', { zh, en }), 'memory: dictionaries')
  const settingsScope = settingsBinder(ctx).bind<MemoryConfig>({
    namespace: MEMORY_SETTINGS_NAMESPACE,
    decode: value => {
      try { return normalizeMemoryConfig(value) } catch { return undefined }
    },
  })
  ctx.inject(['slots'], scope => {
    scope.slots.inject('web-ui.plugin.item', () => scope.slots.register({
      name: 'web-ui.plugin.item',
      id: 'memory',
      order: 118,
      locale: 'memory',
      inject: () => ({
        config: normalizeMemoryConfig(settingsScope.getSnapshot().value),
        settingsScope,
      }),
    }, MemorySettingsCard))
  })
}

export type { PropsLocale, PropsRuntime }

