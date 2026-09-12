/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Context } from '@deepseek-ai/cordis'
import type { ModelRouteSelection, ValueModeConfig, ValueModeSettingsSnapshot } from '../../dsh-value-mode/src/core/config.ts'
import type { ValueModeSettingsCardProps } from '../../dsh-value-mode/src/client/ValueModeSettingsCard.tsx'

vi.mock('@deepseek-ai/dsh-client-store', () => ({
  createSnapshotStore: <T,>(initial: T) => {
    let snapshot = { ...initial }
    const listeners = new Set<() => void>()
    const publish = () => { for (const listener of listeners) listener() }
    return {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      set: (next: T) => { snapshot = { ...next }; publish() },
      update: (mutator: (draft: T) => void) => { snapshot = { ...snapshot }; mutator(snapshot); publish() },
    }
  },
}))
vi.mock('../../dsh-value-mode/src/client/telemetry.ts', () => ({ reportValueModeTelemetry: vi.fn() }))

import { createCompatScope, type CompatScopeOptions } from '../src/client/compat-settings-scope.ts'
import { apply, ValueModeSettingsCard, ValueModeHeroOnboarding, ValueModeHeaderStatus } from '../../dsh-value-mode/src/client/index.ts'
import { reportValueModeTelemetry } from '../../dsh-value-mode/src/client/telemetry.ts'
import { zh } from '../../dsh-value-mode/src/client/locales.ts'

afterEach(() => { cleanup(); vi.clearAllMocks() })

async function runtime(initial: ValueModeConfig) {
  let value = initial
  let acceptWrites = false
  const mutations: string[] = []
  const unavailable: ValueModeSettingsSnapshot<ValueModeConfig> = {
    status: 'unavailable', writable: false, value: undefined, base: undefined, user: undefined, revision: undefined, mode: 'host',
  }
  const primary: CompatScopeOptions<ValueModeConfig>['primary'] = {
    getSnapshot: () => unavailable, subscribe: () => () => {}, set: async () => {}, unset: async () => {}, mutate: async () => {},
  }
  const view = () => ({ ns: 'value-mode', revision: 1, value, user: value, base: {} })
  const fetchFn = (async (url, init) => ({
    ok: true, status: 200, json: async () => {
      if (String(url).endsWith('/describe')) return { ok: true, value: { writable: true, namespaces: [view()] } }
      const { ops } = JSON.parse(String(init?.body)) as { ops: Array<{ path: string[]; value: unknown }> }
      mutations.push(...ops.map(op => op.path[0]))
      if (!acceptWrites) return { ok: false, code: 'internal', message: 'write refused' }
      for (const op of ops) value = { ...value, [op.path[0]]: op.value }
      return { ok: true, value: view() }
    },
  })) as typeof fetch
  const scope = createCompatScope({ namespace: 'value-mode', primary, fetchFn })
  await scope.load()
  const defaultSnapshot: ValueModeSettingsSnapshot<ModelRouteSelection> = {
    ...unavailable, status: 'ready', writable: true, value: { provider: 'relay', model: 'expert' },
  }
  const defaultModelScope = { getSnapshot: () => defaultSnapshot, subscribe: () => () => {} }
  let injectSettings!: () => ValueModeSettingsCardProps
  const context = {
    effect: (fn: () => unknown, label: string) => label.includes('blank-session') ? () => {} : fn(),
    locale: { register: () => {}, bind: () => (key: keyof typeof zh) => zh[key] },
    get: (name: string) => name === 'connection' ? { generation: { subscribe: () => () => {} } } : undefined,
    on: () => () => {},
    settingsScope: { bind: ({ namespace }: { namespace: string }) => namespace === 'value-mode' ? scope : defaultModelScope },
    remote: { session: { modelCatalog: vi.fn() }, $on: () => () => {} },
    slots: {
      inject: (_name: string, register: () => void) => register(),
      register: (descriptor: { name: string; inject: () => ValueModeSettingsCardProps }) => {
        if (descriptor.name === 'web-ui.plugin.item') injectSettings = descriptor.inject
      },
    },
  } as unknown as Context
  apply(context)
  return { scope, defaultModelScope, props: injectSettings(), mutations, allowWrites: () => { acceptWrites = true } }
}

const configured: ValueModeConfig = {
  enabled: false,
  expert: { provider: 'relay', model: 'expert' },
  executor: { provider: 'relay', model: 'worker' },
}

it('shows refused writes and records success only after a retry really enables the mode', async () => {
  const app = await runtime(configured)
  render(<ValueModeSettingsCard {...app.props} />)
  await act(async () => { fireEvent.click(screen.getByRole('switch')) })
  expect(app.scope.getSnapshot().value?.enabled).toBe(false)
  expect(screen.getByRole('alert').textContent).toBe(zh.settingsSaveFailed)
  expect(reportValueModeTelemetry).not.toHaveBeenCalledWith(expect.objectContaining({ state: 'enabled' }))
  expect(reportValueModeTelemetry).toHaveBeenCalledWith({ kind: 'state', state: 'failed', source: 'settings' })

  app.allowWrites()
  await act(async () => { fireEvent.click(screen.getByRole('switch')) })
  expect(app.scope.getSnapshot().value?.enabled).toBe(true)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(reportValueModeTelemetry).toHaveBeenCalledWith({ kind: 'state', state: 'enabled', source: 'settings' })
})

it('keeps the guide and model draft after refusal, then closes only after a durable retry', async () => {
  const app = await runtime({ executor: configured.executor })
  const close = vi.fn()
  render(<ValueModeHeroOnboarding
    config={app.props.config} settingsScope={app.scope} defaultModelScope={app.defaultModelScope}
    onChange={app.props.onChange} fetchModels={async () => ({ groups: [] })} onClose={close}
  />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '完成配置并开启' })) })
  expect(screen.getByRole('dialog', { name: '性价比模式配置引导' })).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toBe(zh.settingsSaveFailed)
  expect(screen.getByText('relay / expert')).toBeTruthy()
  expect(screen.getByText('relay / worker')).toBeTruthy()
  expect(close).not.toHaveBeenCalled()
  expect(app.mutations).toEqual(['expert'])
  expect(reportValueModeTelemetry).not.toHaveBeenCalledWith(expect.objectContaining({ outcome: 'completed' }))
  expect(reportValueModeTelemetry).not.toHaveBeenCalledWith(expect.objectContaining({ state: 'enabled' }))

  app.allowWrites()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '完成配置并开启' })) })
  expect(app.scope.getSnapshot().value).toMatchObject({ ...configured, enabled: true, strategy: 'balanced' })
  expect(close).toHaveBeenCalledOnce()
  expect(reportValueModeTelemetry).toHaveBeenCalledWith({ kind: 'onboarding', outcome: 'completed', surface: 'hero' })
})

it('does not record an applied header strategy when the host refuses it', async () => {
  const app = await runtime({ ...configured, enabled: true })
  render(<ValueModeHeaderStatus
    {...app.props} sessionId="test" useSessions={selector => selector({ byId: { test: { agentPreset: 'value-mode' } } })}
  />)
  fireEvent.click(screen.getByRole('button', { name: '性价比模式状态' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '切策略' })) })
  expect(screen.getByRole('alert').textContent).toBe(zh.settingsSaveFailed)
  expect(reportValueModeTelemetry).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'strategy' }))
})
