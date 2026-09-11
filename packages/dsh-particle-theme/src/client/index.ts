import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SettingsScope, SettingsScopeSpec } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { ParticleThemeController } from './controller.ts'
import {
  ParticleThemeSettingsCard,
  ParticleThemeSettingsCardController,
  type ParticleThemeSettings as CardSettings,
} from './ParticleThemeSettingsCard.tsx'
import { en, zh, type SettingsCardKey } from './locales.ts'
import { PARTICLE_THEME_NAMESPACE, ParticleThemeRegistry, type ParticleThemeSettings } from './theme.ts'
import { WHALE_THEME_DEFINITION } from './whale.ts'

export * from './controller.ts'
export * from './theme.ts'
export * from './whale.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'particle-theme': SettingsCardKey
  }
  interface SlotMap {
    'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: { children?: never } }
  }
}

export const inject = ['slots', 'locale', 'settingsScope']

interface SettingsBinderFace {
  bind<S>(spec: SettingsScopeSpec<S>): SettingsScope<S>
}

function isSettingsBinderFace(value: unknown): value is SettingsBinderFace {
  return typeof value === 'object' && value !== null && typeof (value as { bind?: unknown }).bind === 'function'
}

export function createDefaultParticleThemeRegistry(): ParticleThemeRegistry {
  const registry = new ParticleThemeRegistry()
  registry.register(WHALE_THEME_DEFINITION)
  return registry
}

type ParticleThemeGlobal = typeof globalThis & {
  __dshParticleThemeClientInstalled?: boolean
}

/**
 * Install the browser theme exactly once in this document. The compatibility
 * settings bundle calls this for older aggregate releases; newer aggregates
 * can still mount the standalone particle row without creating two canvases.
 */
export function installParticleThemeClient(ctx: ClientContext, binderOverride?: SettingsBinderFace): void {
  const globalState = globalThis as ParticleThemeGlobal
  if (globalState.__dshParticleThemeClientInstalled === true) return
  globalState.__dshParticleThemeClientInstalled = true

  ctx.effect(() => ctx.locale.register(PARTICLE_THEME_NAMESPACE, { zh, en }), 'particle-theme: dictionaries')
  const compatibilityBinder = binderOverride ?? (ctx.get as (name: string) => unknown)('webUiSettings')
  const binder = isSettingsBinderFace(compatibilityBinder) ? compatibilityBinder : ctx.settingsScope
  const scope = binder.bind<ParticleThemeSettings>({ namespace: PARTICLE_THEME_NAMESPACE })
  const controller = new ParticleThemeController({
    scope,
    registry: createDefaultParticleThemeRegistry(),
    document,
    window,
  })
  ctx.effect(() => {
    controller.start()
    return () => { controller.dispose() }
  }, 'particle-theme: global canvas')

  const card = new ParticleThemeSettingsCardController(scope as SettingsScope<CardSettings>)
  ctx.slots.inject('web-ui.plugin.item', () => ctx.slots.register({
    name: 'web-ui.plugin.item',
    id: 'particle-theme',
    order: 115,
    locale: PARTICLE_THEME_NAMESPACE,
    inject: () => card.inject(),
  }, ParticleThemeSettingsCard))
}

export function apply(ctx: ClientContext): void {
  installParticleThemeClient(ctx)
}
