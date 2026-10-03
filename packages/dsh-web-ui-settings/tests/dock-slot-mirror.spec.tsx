import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotCore, type SlotEntryDef, type SlotSpec, type StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import { DockSettingsOutlet, mirrorDockSlot, remapSlotProps } from '../src/client/dock-slot-mirror.tsx'

type DynamicOptions = StoredEntry['options'] & Omit<StoredEntry, 'component' | 'options'> & { name: string }

function fixture() {
  const core = new SlotCore()
  const register = (options: DynamicOptions, component: unknown = () => null) => (core.register as unknown as (options: DynamicOptions, component: unknown) => () => void)(options, component)
  const slots = {
    register,
    entriesOfSlot: (key: string) => core.entriesOfSlot(key),
    subscribe: (key: string, listener: () => void) => core.onMutate(changed => { if (changed === key) listener() }),
  } as Parameters<typeof mirrorDockSlot>[0]
  const children: Record<string, SlotSpec<SlotEntryDef>> = {
    'settings.section': { kind: 'list', scope: 'root' },
    'plugins.row.config': { kind: 'keyed', scope: 'root' },
  }
  const disposeOfficial = register({ name: 'root', children })
  register({ name: 'root', priority: -100, children: {
    'desktop-dock.settings.section': { kind: 'list', scope: 'root' },
    'desktop-dock.plugins.row.config': { kind: 'keyed', scope: 'root' },
  } })
  return { core, register, slots, disposeOfficial }
}

afterEach(() => {
  cleanup()
  window.history.replaceState({}, '', '/')
})

describe('Dock slot aliases using the official rc.2 SlotCore', () => {
  it('reproduces duplicate declarations and preserves the official registration and ownership tree', () => {
    const { core, register, slots } = fixture()
    expect(() => register({ name: 'root', priority: -200, children: { 'settings.section': { kind: 'list', scope: 'root' } } })).toThrow(/already declared/)
    const disposePlugin = register({ name: 'settings.section', id: 'models' })
    const original = core.entriesOfSlot('settings.section')[0]
    const topology = core.snapshot('settings.section')
    const dispose = mirrorDockSlot(slots, 'settings.section', 'desktop-dock.settings.section')
    expect(core.entriesOfSlot('settings.section')[0]).toBe(original)
    expect(core.snapshot('settings.section')).toEqual(topology)
    expect(core.entriesOfSlot('desktop-dock.settings.section')).toHaveLength(1)
    dispose()
    dispose()
    expect(core.entriesOfSlot('desktop-dock.settings.section')).toHaveLength(0)
    expect(core.entriesOfSlot('settings.section')[0]).toBe(original)
    disposePlugin()
  })

  it('retains the original component, injected business face, locale, store and keyed identity', () => {
    const { core, register, slots } = fixture()
    const component = vi.fn(() => null)
    const inject = vi.fn(() => ({ save: vi.fn(), hooks: { settings: { getSnapshot: () => ({ engine: 'bing' }), subscribe: () => () => {} } } }))
    const store = defineStore({ init: () => ({}), actions: {} })
    register({ name: 'plugins.row.config', key: 'dsh-free-search#web-search-free', locale: 'free-search', store, inject, registrant: 'upstream-plugin' }, component)
    const dispose = mirrorDockSlot(slots, 'plugins.row.config', 'desktop-dock.plugins.row.config')
    const copy = core.entriesOfSlot('desktop-dock.plugins.row.config')[0]!
    const original = core.entriesOfSlot('plugins.row.config')[0]!
    expect(copy.component).toBe(original.component)
    expect(copy.inject).toBe(original.inject)
    expect(copy.store).toBe(original.store)
    expect(copy.locale).toBe('free-search')
    expect(copy.registrant).toBe('upstream-plugin')
    expect(copy.options).toEqual(original.options)
    expect(inject).not.toHaveBeenCalled()
    dispose()
  })

  it('tracks late load, reload and unload without remounting another plugin draft', () => {
    const { core, register, slots } = fixture()
    const dispose = mirrorDockSlot(slots, 'settings.section', 'desktop-dock.settings.section')
    const disposeModels = register({ name: 'settings.section', id: 'models', order: 3, label: () => 'Models' })
    const models = core.entriesOfSlot('desktop-dock.settings.section')[0]
    const disposeUsage = register({ name: 'settings.section', id: 'usage', order: 4 })
    expect(core.entriesOfSlot('desktop-dock.settings.section')).toHaveLength(2)
    expect(core.entriesOfSlot('desktop-dock.settings.section').find(entry => entry.options.id === 'models')).toBe(models)
    disposeUsage()
    expect(core.entriesOfSlot('desktop-dock.settings.section')).toEqual([models])
    register({ name: 'settings.section', id: 'usage', order: 5 })
    expect(core.entriesOfSlot('desktop-dock.settings.section').find(entry => entry.options.id === 'models')).toBe(models)
    disposeModels()
    expect(core.entriesOfSlot('desktop-dock.settings.section').map(entry => entry.options.id)).toEqual(['usage'])
    dispose()
    register({ name: 'settings.section', id: 'late' })
    expect(core.entriesOfSlot('desktop-dock.settings.section')).toHaveLength(0)
  })

  it('mirrors only the active shadowing winner and restores its fallback on disposal', () => {
    const { core, register, slots } = fixture()
    const fallback = () => null
    const override = () => null
    register({ name: 'plugins.row.config', key: 'search#entry' }, fallback)
    const dispose = mirrorDockSlot(slots, 'plugins.row.config', 'desktop-dock.plugins.row.config')
    const disposeOverride = register({ name: 'plugins.row.config', key: 'search#entry', priority: -1 }, override)
    expect(core.entriesOfSlot('desktop-dock.plugins.row.config').map(entry => entry.component)).toEqual([override])
    disposeOverride()
    expect(core.entriesOfSlot('desktop-dock.plugins.row.config').map(entry => entry.component)).toEqual([fallback])
    dispose()
  })

  it('recursively aliases child declarations and preserves scope, chain selection and slot-level injection', () => {
    const { core, register, slots } = fixture()
    const slotInject = { hooks: { settings: { getSnapshot: () => 'native', subscribe: () => () => {} } } }
    const childSpec = { kind: 'list', scope: 'session-maybe', inject: slotInject } as SlotSpec<SlotEntryDef>
    register({ name: 'settings.section', id: 'complex', children: { 'native.form': childSpec } })
    register({ name: 'native.form', id: 'section', children: { 'native.chain': { kind: 'chain', scope: 'session-maybe' } } })
    const select = vi.fn(() => ({ result: 'matched' }))
    const disposeLeaf = register({ name: 'native.chain', priority: 2, select })
    const nativeTopology = core.snapshot('settings.section')
    const dispose = mirrorDockSlot(slots, 'settings.section', 'desktop-dock.settings.section')
    const parent = core.entriesOfSlot('desktop-dock.settings.section')[0]!
    const childAlias = Object.keys(parent.children!)[0]!
    expect(childAlias).not.toBe('native.form')
    expect(parent.children![childAlias]).toBe(childSpec)
    const child = core.entriesOfSlot(childAlias)[0]!
    const chainAlias = Object.keys(child.children!)[0]!
    expect(core.entriesOfSlot(chainAlias)[0]!.select).toBe(select)
    expect(core.snapshot('settings.section')).toEqual(nativeTopology)
    disposeLeaf()
    expect(core.entriesOfSlot(chainAlias)).toHaveLength(0)
    dispose()
    expect(core.specDynamic(childAlias)).toBeUndefined()
    expect(core.specDynamic(chainAlias)).toBeUndefined()
    expect(core.entriesOfSlot('native.form')).toHaveLength(1)
  })

  it('redirects both rendering capabilities without losing owner, options or standard-kit props', () => {
    const dispatch = vi.fn((_key: string, _owner: unknown, _options?: unknown) => 'native')
    const props = { renderSlot: dispatch, renderSlotChain: dispatch, t: vi.fn(), SessionProvider: vi.fn(), renderFactorySlot: vi.fn(), useSettings: vi.fn() }
    const mapped = remapSlotProps(props, { 'native.form': 'desktop-dock.form' })
    const owner = { close: vi.fn() }
    const options = { entryKey: 'search#entry' }
    expect(mapped.renderSlot('native.form', owner, options)).toBe('native')
    expect(mapped.renderSlotChain('native.form', owner, options)).toBe('native')
    expect(dispatch.mock.calls).toEqual([['desktop-dock.form', owner, options], ['desktop-dock.form', owner, options]])
    expect(mapped.t).toBe(props.t)
    expect(mapped.SessionProvider).toBe(props.SessionProvider)
    expect(mapped.renderFactorySlot).toBe(props.renderFactorySlot)
    expect(mapped.useSettings).toBe(props.useSettings)
    mapped.renderSlot('undeclared', owner)
    expect(dispatch).toHaveBeenLastCalledWith('undeclared', owner, undefined)
  })

  it('renders nested original components with authority only for their declared aliases', () => {
    const { core, register, slots } = fixture()
    register({ name: 'settings.section', id: 'complex', children: { 'native.form': { kind: 'list', scope: 'root' } } }, ({ renderSlot }: { renderSlot: (key: string, owner: unknown) => unknown }) => renderSlot('native.form', { close: 'original' }))
    register({ name: 'native.form', id: 'child' }, () => null)
    const dispose = mirrorDockSlot(slots, 'settings.section', 'desktop-dock.settings.section')
    const entry = core.entriesOfSlot('desktop-dock.settings.section')[0]!
    const Component = entry.component as (props: { renderSlot: (key: string, owner: unknown) => React.ReactNode }) => React.ReactNode
    const dispatch = vi.fn((key: string) => {
      expect(entry.children).toHaveProperty(key)
      return <input aria-label="original form" />
    })
    render(<Component renderSlot={dispatch} />)
    expect(screen.getByLabelText('original form')).toBeTruthy()
    expect(dispatch).toHaveBeenCalledWith(Object.keys(entry.children!)[0], { close: 'original' }, undefined)
    dispose()
  })

  it('retires mirrored descendants when the original declarer unloads', () => {
    const { core, register, slots, disposeOfficial } = fixture()
    register({ name: 'settings.section', id: 'nested', children: { 'native.form': { kind: 'list', scope: 'root' } } })
    const dispose = mirrorDockSlot(slots, 'settings.section', 'desktop-dock.settings.section')
    const alias = Object.keys(core.entriesOfSlot('desktop-dock.settings.section')[0]!.children!)[0]!
    disposeOfficial()
    expect(core.entriesOfSlot('desktop-dock.settings.section')).toHaveLength(0)
    expect(core.specDynamic(alias)).toBeUndefined()
    dispose()
  })

  it('keeps native form drafts mounted through models to usage to models using owned aliases', () => {
    window.history.replaceState({}, '', '/?desktop-dock-setting=models')
    const dispatch = vi.fn((key: string, _owner: unknown, options: { only?: string }) => options.only === 'models' ? <input aria-label="model draft" /> : <span>{key}</span>)
    render(<DockSettingsOutlet renderSlot={dispatch as never} t={((key: string) => key) as never} />)
    const draft = screen.getByLabelText('model draft')
    fireEvent.change(draft, { target: { value: 'unsaved provider' } })
    fireEvent(window, new CustomEvent('dsh:dock-setting', { detail: 'usage' }))
    fireEvent(window, new CustomEvent('dsh:dock-setting', { detail: 'models' }))
    expect(screen.getByLabelText('model draft')).toBe(draft)
    expect((draft as HTMLInputElement).value).toBe('unsaved provider')
    expect(dispatch.mock.calls.filter(([key]) => key !== 'web-ui.plugin.item').every(([key]) => key === 'desktop-dock.settings.section')).toBe(true)
  })
})
