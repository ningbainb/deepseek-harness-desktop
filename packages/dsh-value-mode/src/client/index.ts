/**
 * @module @linxin666/dsh-value-mode/client
 * Browser half of the Value Mode (性价比模式) plugin.
 */

import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SettingsScope, SettingsScopeSpec } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'

import type { ModelRouteSelection, ValueModeConfig, ValueModeSettingsScope } from '../core/config.ts'
import { hasExplicitModelRoutes, VALUE_MODE_SETTINGS_NAMESPACE } from '../core/config.ts'
import { zh, en, type ValueModeLocaleKey } from './locales.ts'
import { ValueModeSettingsCard } from './ValueModeSettingsCard.tsx'
import { ValueModeHeaderStatus } from './ValueModeHeaderStatus.tsx'
import { ValueModeHeroOnboarding } from './ValueModeHeroOnboarding.tsx'
import type { ValueModeModelCatalog } from './ModelPicker.tsx'
import { reportValueModeTelemetry } from './telemetry.ts'
import { createModelCatalogLoader } from './model-catalog.ts'
import { createValueModeSettingsWriter } from './settings-write.ts'

export { ValueModeSettingsCard } from './ValueModeSettingsCard.tsx'
export { ValueModeHeaderStatus } from './ValueModeHeaderStatus.tsx'
export { ValueModeHeroOnboarding } from './ValueModeHeroOnboarding.tsx'
// Kept as a public export for existing integrations. It is intentionally not
// injected into the composer: the previous control only changed local UI
// state and never reached the host's expert consultation route.
export { ManualExpertToggle } from './ManualExpertToggle.tsx'
export { ModelPicker } from './ModelPicker.tsx'
export * from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'value-mode': ValueModeLocaleKey
  }

  interface SlotMap {
    'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: SettingsPluginItemOwnerProps }
  }
}

export interface SettingsPluginItemOwnerProps {
  children?: never
}

interface SettingsBinderFace {
  bind<S>(spec: SettingsScopeSpec<S>): SettingsScope<S>
}

function isSettingsBinderFace(value: unknown): value is SettingsBinderFace {
  return typeof value === 'object' && value !== null && typeof (value as { bind?: unknown }).bind === 'function'
}

export const inject = ['slots', 'locale', 'connection', 'settingsScope', 'remote', 'remote.session']

interface HeroOnboardingMountOptions {
  scope: ValueModeSettingsScope<ValueModeConfig>
  defaultModelScope: ValueModeSettingsScope<ModelRouteSelection>
  onChange: (patch: Partial<ValueModeConfig>) => Promise<void>
  fetchModels: () => Promise<ValueModeModelCatalog>
}

function heroPresetButton(): HTMLButtonElement | undefined {
  const candidates = [...document.querySelectorAll<HTMLButtonElement>('button')]
  return candidates.find((button) => {
    const metadata = `${button.getAttribute('title') ?? ''} ${button.getAttribute('aria-label') ?? ''} ${button.dataset.testid ?? ''}`
    return /agent\s*(preset|预设)|agent\s*预设|预设/i.test(metadata)
  })
}

function isValueModeHeroButton(button: HTMLButtonElement): boolean {
  const label = `${button.textContent ?? ''} ${button.getAttribute('aria-label') ?? ''}`
  return /性价比模式|value\s*mode|value-mode/i.test(label)
}

function errorText(reason: unknown): string {
  if (reason instanceof Error && reason.message.trim()) return reason.message.trim()
  if (typeof reason === 'string' && reason.trim()) return reason.trim()
  return '性价比模式自动开启失败，请打开设置重试。'
}

/**
 * The host's blank-session agent-preset seat is a single root slot owned by
 * the official UI. Keep that selector intact and add the setup guide as a
 * document-level surface that follows the selector's rendered state.
 */
function mountHeroOnboarding({ scope, defaultModelScope, onChange, fetchModels }: HeroOnboardingMountOptions): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined' || !document.body) return () => {}

  const container = document.createElement('div')
  container.dataset.dshValueModeHeroOnboardingRoot = ''
  document.body.appendChild(container)
  let root: Root | undefined = createRoot(container)
  let preset: 'value-mode' | 'other' | undefined
  let open = false
  let dismissed = false
  let enableRequested = false
  let setupError: string | null = null
  let scanQueued = false

  const render = (): void => {
    root?.render(open ? createElement(ValueModeHeroOnboarding, {
      config: scope.getSnapshot().value ?? {},
      settingsScope: scope,
      defaultModelScope,
      onChange,
      fetchModels,
      initialError: setupError,
      onClose: () => {
        open = false
        dismissed = true
        root?.render(null)
      },
    }) : null)
  }

  const enableConfiguredMode = (): void => {
    if (enableRequested) return
    enableRequested = true
    void Promise.resolve()
      .then(() => onChange({ enabled: true }))
      .then(() => reportValueModeTelemetry({ kind: 'state', state: 'enabled', source: 'auto' }))
      .catch((reason) => {
        enableRequested = false
        setupError = errorText(reason)
        reportValueModeTelemetry({ kind: 'state', state: 'failed', source: 'auto' })
        open = true
        dismissed = false
        render()
      })
  }

  const syncPreset = (next: 'value-mode' | 'other'): void => {
    const entered = preset !== 'value-mode' && next === 'value-mode'
    if (next !== 'value-mode') {
      preset = next
      open = false
      dismissed = false
      enableRequested = false
      setupError = null
      render()
      return
    }

    preset = next
    if (entered) {
      dismissed = false
      setupError = null
      enableRequested = false
      reportValueModeTelemetry({
        kind: 'entry',
        source: 'hero',
        configured: hasExplicitModelRoutes(scope.getSnapshot().value ?? {}),
      }, 'value-mode-entry')
    }
    if (dismissed || open) return

    const config = scope.getSnapshot().value ?? {}
    if (hasExplicitModelRoutes(config)) {
      if (config.enabled !== true) enableConfiguredMode()
      return
    }

    open = true
    reportValueModeTelemetry({ kind: 'onboarding', outcome: 'shown', surface: 'hero' }, 'value-mode-onboarding-shown:hero')
    render()
  }

  const scan = (): void => {
    scanQueued = false
    const button = heroPresetButton()
    if (!button) return
    syncPreset(isValueModeHeroButton(button) ? 'value-mode' : 'other')
  }

  const onPresetMenuClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null
    const item = target?.closest<HTMLElement>('[role="menuitem"]')
    if (!item || !/性价比模式|value\s*mode|value-mode/i.test(item.textContent ?? '')) return
    // Selecting the already-staged preset is still an explicit request to
    // continue setup after the user dismissed the guide with Esc/outside.
    dismissed = false
    setupError = null
    syncPreset('value-mode')
  }

  const observer = new MutationObserver(() => {
    if (scanQueued) return
    scanQueued = true
    queueMicrotask(scan)
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['title', 'aria-label'],
  })
  document.addEventListener('click', onPresetMenuClick)
  scan()

  return () => {
    observer.disconnect()
    document.removeEventListener('click', onPresetMenuClick)
    root?.unmount()
    root = undefined
    container.remove()
  }
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('value-mode', { zh, en }), 'value-mode: locales')

  const compatibilityBinder = (ctx.get as (name: string) => unknown)('webUiSettings')
  const binder = isSettingsBinderFace(compatibilityBinder) ? compatibilityBinder : ctx.settingsScope
  const scope = binder.bind<ValueModeConfig>({ namespace: VALUE_MODE_SETTINGS_NAMESPACE as string })
  const defaultModelScope = binder.bind<ModelRouteSelection>({ namespace: 'agent-default-model' })

  const fetchModels = createModelCatalogLoader(ctx, ctx.locale.bind('value-mode'))

  const onChange = createValueModeSettingsWriter(scope, ctx.locale.bind('value-mode'))

  ctx.effect(
    () => mountHeroOnboarding({
      scope,
      defaultModelScope: defaultModelScope as ValueModeSettingsScope<ModelRouteSelection>,
      onChange,
      fetchModels,
    }),
    'value-mode: blank-session onboarding',
  )

  ctx.slots.inject('web-ui.plugin.item', () =>
    ctx.slots.register(
      {
        name: 'web-ui.plugin.item',
        id: 'value-mode',
        order: 115,
        locale: 'value-mode',
        inject: () => {
          const snapshot = scope.getSnapshot()
          const config = snapshot.value ?? {}
          return {
            config,
            settingsScope: scope,
            defaultModelScope: defaultModelScope as ValueModeSettingsScope<ModelRouteSelection>,
            onChange,
            fetchModels,
          }
        },
      },
      ValueModeSettingsCard,
    ),
  )

  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register(
      {
        name: 'conversation.session.header.actions',
        id: 'value-mode-status',
        order: -8,
        inject: () => {
          const snapshot = scope.getSnapshot()
          const config = snapshot.value ?? {}
          return {
            config,
            settingsScope: scope,
            defaultModelScope: defaultModelScope as ValueModeSettingsScope<ModelRouteSelection>,
            onChange,
            fetchModels,
          }
        },
      },
      ValueModeHeaderStatus,
    ),
  )
}
