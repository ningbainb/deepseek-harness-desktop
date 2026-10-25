import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SlotCore, createSnapshotStore, defineStore, type StoredEntry, type SnapshotSelectorHook } from './settings-sdk-adapter.ts'
import { installSettingsOnboardingPriority, supportsDesktopSettingsPriority, withSettingsOnboardingPriority } from '../src/client/settings-onboarding-priority.tsx'

type DynamicOptions = StoredEntry['options'] & Omit<StoredEntry, 'component' | 'options'> & { name: string }
type ShellProps = Record<string, unknown> & {
  useStore: SnapshotSelectorHook<{ open: boolean; activeId?: string }>
  useOnboardingSteps: SnapshotSelectorHook<Array<{ id: string; order: number }>>
}
const published = readFileSync(resolve('../../node_modules/.pnpm/node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js'), 'utf8')
const start = published.indexOf('function SettingsRoot(props) {')
const end = published.indexOf('\n\t\t//#endregion', start)
if (start < 0 || end < start) throw new Error('The installed official settings shell diagnostic seam has changed')
const OfficialShell = vm.runInNewContext(`(${published.slice(start, end)})`, {
  react: React,
  react_jsx_runtime: jsxRuntime,
  SettingsRoot_module_css_default: {},
  clsx: () => '',
  _deepseek_ai_dsh_client_ui_primitives: { Tooltip: (props: { children: React.ReactNode }) => props.children, ConnectionIndicator: () => null },
  DesktopUpdateIndicator: () => null,
  SettingsPanel: () => <section role="dialog"><input aria-label="provider draft" defaultValue="unsaved provider" /></section>,
  CONNECTING_MIN_VISIBLE_MS: 800,
  RECOVERY_CONFIRMATION_MS: 1600,
  window,
  performance,
  Set,
}) as React.ComponentType<ShellProps>

afterEach(cleanup)

function observable<Value>(initial: Value) {
  const source = createSnapshotStore(initial)
  const hook: SnapshotSelectorHook<Value> = selector => selector(React.useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot))
  return { ...source, hook }
}

function causalFixture({ ready = false, stepsPresent = true, blank = true } = {}) {
  const shell = observable({ open: true, activeId: 'general' as string | undefined })
  const sessions = observable({ phase: ready ? 'ready' : 'loading', byId: { first: { retainedBy: { mainView: 1 }, blank } } })
  const onboarding = [{ id: 'official-onboarding', order: 0 }]
  const steps = observable(stepsPresent ? onboarding : [])
  const actions = {
    close: vi.fn(() => shell.set({ open: false, activeId: undefined })),
    open: () => shell.set({ open: true, activeId: 'general' }),
    openSection: vi.fn(),
    select: vi.fn(),
  }
  const props: ShellProps = {
    useStore: shell.hook, actions, useSessions: sessions.hook, useOnboardingSteps: steps.hook,
    wide: true, reconnect: vi.fn(), useShortcuts: observable([]).hook,
    useSections: observable([{ id: 'general', label: 'General' }]).hook,
    useDesktopUpdate: observable({}).hook, useConnectionState: observable('connected').hook,
    openDesktopUpdate: vi.fn(), t: (key: string) => key,
    renderSlot: (key: string, owner: Record<string, unknown>, options?: { fallback?: React.ReactNode }) => {
      if (key === 'settings.launcher') return <button onClick={() => (owner.openOnboarding as (id: string) => void)('official-onboarding')}>Manual sign-in</button>
      if (key === 'settings.onboarding') return <button onClick={owner.complete as () => void}>Complete onboarding</button>
      return options?.fallback ?? null
    },
  }
  const Component = withSettingsOnboardingPriority(OfficialShell)
  render(<Component {...props} />)
  return { shell, sessions, steps, actions, onboarding }
}

it('exports the Desktop settings priority adapter', () => {
  expect(withSettingsOnboardingPriority).toBeTypeOf('function')
  expect(installSettingsOnboardingPriority).toBeTypeOf('function')
})

it('admits the actual Desktop main preload without a fabricated official protocol marker', () => {
  const exposed = new Map<string, unknown>()
  const preload = readFileSync(resolve('../../apps/dsh-desktop/src/preload-main.cjs'), 'utf8')
  vm.runInNewContext(preload, {
    require: () => ({ contextBridge: { exposeInMainWorld: (name: string, value: unknown) => exposed.set(name, value) },
      ipcRenderer: { on: vi.fn(), invoke: vi.fn() }, webUtils: {} }),
    process: { platform: 'win32' },
  })
  const bridge = exposed.get('dshDesktop')
  expect(bridge).not.toHaveProperty('protocolVersion')
  expect(supportsDesktopSettingsPriority({ dshDesktop: bridge })).toBe(true)
  for (const host of [undefined, null, {}, { dshDesktop: { protocolVersion: 1 } }, { dshDockSettings: bridge },
    { dshDesktop: { getSettingsWindowBounds: () => ({}) } }]) expect(supportsDesktopSettingsPriority(host)).toBe(false)
})

it('retains the original dialog and unsaved draft when an empty session becomes ready', () => {
  const fixture = causalFixture()
  const original = screen.getByRole('dialog')
  const draft = screen.getByLabelText('provider draft')
  fireEvent.change(draft, { target: { value: 'edited without saving' } })
  act(() => fixture.sessions.set({ ...fixture.sessions.getSnapshot(), phase: 'ready' }))
  expect(fixture.actions.close).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBe(original)
  expect((screen.getByLabelText('provider draft') as HTMLInputElement).value).toBe('edited without saving')
  expect(screen.queryByRole('button', { name: 'Complete onboarding' })).toBeNull()
  act(() => fixture.actions.close())
  expect(screen.getByRole('button', { name: 'Complete onboarding' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Complete onboarding' }))
  expect(screen.queryByRole('button', { name: 'Complete onboarding' })).toBeNull()
})

it('defers late onboarding registration until settings closes without marking it completed', () => {
  const fixture = causalFixture({ ready: true, stepsPresent: false })
  const original = screen.getByRole('dialog')
  act(() => fixture.steps.set(fixture.onboarding))
  expect(fixture.actions.close).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBe(original)
  expect(screen.queryByRole('button', { name: 'Complete onboarding' })).toBeNull()
  act(() => fixture.actions.close())
  expect(screen.getByRole('button', { name: 'Complete onboarding' })).toBeTruthy()
})

it('retains explicitly requested sign-in and the official complete callback', () => {
  const fixture = causalFixture({ ready: true })
  expect(screen.queryByRole('button', { name: 'Complete onboarding' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Manual sign-in' }))
  expect(fixture.actions.close).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Complete onboarding' }))
  expect(screen.queryByRole('button', { name: 'Complete onboarding' })).toBeNull()
})

it('does not fabricate automatic onboarding for a nonblank session', () => {
  const fixture = causalFixture({ blank: false })
  act(() => fixture.sessions.set({ ...fixture.sessions.getSnapshot(), phase: 'ready' }))
  act(() => fixture.actions.close())
  expect(screen.queryByRole('button', { name: 'Complete onboarding' })).toBeNull()
})

function registryFixture() {
  const core = new SlotCore()
  const register = (options: DynamicOptions, component: unknown = () => null) => (core.register as unknown as (options: DynamicOptions, component: unknown) => () => void)(options, component)
  register({ name: 'root', children: { 'sidebar.settings': { kind: 'single', scope: 'root' } } })
  const listeners = new Map<string, Set<() => void>>()
  const offMutation = core.onMutate(key => { for (const listener of [...listeners.get(key) ?? []]) listener() })
  const slots = {
    entries: (key: string) => core.entries(key), register,
    subscribe: (key: string, listener: () => void) => {
      const group = listeners.get(key) ?? new Set()
      listeners.set(key, group)
      group.add(listener)
      return () => { group.delete(listener); if (group.size === 0) listeners.delete(key) }
    },
    entriesOfSlot: (key: string) => core.entriesOfSlot(key),
  }
  const store = defineStore({ init: () => ({ open: false }), actions: { close: draft => { draft.open = false } } })
  const create = vi.spyOn(store, 'create')
  const inject = vi.fn(() => ({ hooks: { onboardingSteps: observable([]) } }))
  const mount = (component: unknown = OfficialShell) => register({ name: 'sidebar.settings', store, inject, locale: 'settings', registrant: 'ui-settings-general', children: {
    'settings.onboarding': { kind: 'list', scope: 'root' },
    'settings.section': { kind: 'list', scope: 'root' },
  } }, component)
  return { core, slots, register, mount, store, create, inject, listeners, offMutation }
}

it('preserves the real SDK declarations, store and injection while aliasing authorized child rendering', () => {
  const fixture = registryFixture()
  const unmount = fixture.mount()
  const original = fixture.core.entriesOfSlot('sidebar.settings')[0]!
  const topology = fixture.core.snapshot('settings.onboarding')
  const dispose = installSettingsOnboardingPriority(fixture.slots as unknown as Parameters<typeof installSettingsOnboardingPriority>[0])
  const selected = fixture.core.entriesOfSlot('sidebar.settings')[0]!
  expect(selected).not.toBe(original)
  expect(fixture.core.entries('sidebar.settings')).toContain(original)
  expect(fixture.core.snapshot('settings.onboarding')).toEqual(topology)
  expect(selected.store).toBe(original.store)
  expect(selected.inject).toBe(original.inject)
  expect(selected.locale).toBe(original.locale)
  expect(fixture.create).not.toHaveBeenCalled()
  expect(fixture.inject).not.toHaveBeenCalled()
  expect(Object.keys(selected.children ?? {})).toHaveLength(2)
  expect(selected.children).not.toHaveProperty('settings.onboarding')
  dispose()
  dispose()
  expect(fixture.core.entriesOfSlot('sidebar.settings')).toEqual([original])
  expect(fixture.listeners.size).toBe(0)
  unmount()
  fixture.offMutation()
})

it.each([-1, -100])('follows late SDK registration, unload and reload without altering a custom settings shell at priority %s', priority => {
  const fixture = registryFixture()
  const dispose = installSettingsOnboardingPriority(fixture.slots as unknown as Parameters<typeof installSettingsOnboardingPriority>[0])
  const unmount = fixture.mount()
  expect(fixture.core.entries('sidebar.settings')).toHaveLength(2)
  unmount()
  expect(fixture.core.entries('sidebar.settings')).toHaveLength(0)
  const unmountAgain = fixture.mount()
  expect(fixture.core.entries('sidebar.settings')).toHaveLength(2)
  const custom = () => null
  const removeCustom = fixture.register({ name: 'sidebar.settings', priority }, custom)
  expect(fixture.core.entriesOfSlot('sidebar.settings')[0]?.component).toBe(custom)
  expect(fixture.core.entries('sidebar.settings')).toHaveLength(2)
  removeCustom()
  expect(fixture.core.entries('sidebar.settings')).toHaveLength(2)
  dispose()
  unmountAgain()
  fixture.offMutation()
})

it('preserves child dispatch owners and options and mirrors late onboarding without redeclaration', () => {
  const fixture = registryFixture()
  const owner = { close: vi.fn() }
  const options = { only: 'general' }
  const unmount = fixture.mount((props: { renderSlot: (key: string, owner: unknown, options: unknown) => React.ReactNode }) => props.renderSlot('settings.section', owner, options))
  const dispose = installSettingsOnboardingPriority(fixture.slots as unknown as Parameters<typeof installSettingsOnboardingPriority>[0])
  const selected = fixture.core.entriesOfSlot('sidebar.settings')[0]!
  const sectionAlias = Object.keys(selected.children!).find(key => key.endsWith('.settings.section'))!
  const onboardingAlias = Object.keys(selected.children!).find(key => key.endsWith('.settings.onboarding'))!
  const dispatch = vi.fn(() => null)
  render(React.createElement(selected.component as React.ComponentType<Record<string, unknown>>, {
    renderSlot: dispatch, useStore: observable({ open: true }).hook, useOnboardingSteps: observable([]).hook,
  }))
  expect(dispatch).toHaveBeenCalledWith(sectionAlias, owner, options)
  const removeStep = fixture.register({ name: 'settings.onboarding', id: 'late-official', order: 5 }, () => null)
  expect(fixture.core.entriesOfSlot(onboardingAlias).map(entry => entry.options.id)).toEqual(['late-official'])
  removeStep()
  expect(fixture.core.entriesOfSlot(onboardingAlias)).toHaveLength(0)
  dispose()
  expect(fixture.core.specDynamic(onboardingAlias)).toBeUndefined()
  unmount()
  fixture.offMutation()
})

it('rolls back its own contribution and subscriptions if child mirroring fails', () => {
  const fixture = registryFixture()
  const unmount = fixture.mount()
  fixture.register({ name: 'settings.onboarding', id: 'first' })
  const original = fixture.core.entriesOfSlot('sidebar.settings')[0]!
  const register = fixture.slots.register
  fixture.slots.register = (options, component) => {
    if (options.name.startsWith('desktop-settings.priority.')) throw new Error('mirror unavailable')
    return register(options, component)
  }
  expect(() => installSettingsOnboardingPriority(fixture.slots as unknown as Parameters<typeof installSettingsOnboardingPriority>[0])).toThrow('mirror unavailable')
  expect(fixture.core.entriesOfSlot('sidebar.settings')).toEqual([original])
  expect(fixture.core.entries('sidebar.settings')).toHaveLength(1)
  expect(fixture.listeners.size).toBe(0)
  unmount()
  fixture.offMutation()
})
