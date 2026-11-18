import { expect, it, vi } from 'vitest'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import { installDesktopPresetNavigation } from '../src/client/desktop-preset-navigation.ts'

function fixture(composerInitiallyDeclared = true) {
  const core = new SlotCore()
  const register = (options: unknown, component: unknown = () => null) => (core.register as Function)(options, component)
  const inject = (slot: string, install: () => () => void) => {
    let dispose: (() => void) | undefined
    const sync = () => {
      if (core.specDynamic(slot)) dispose ??= install()
      else { dispose?.(); dispose = undefined }
    }
    const unsubscribe = core.subscribeDeclaration(slot, sync)
    sync()
    return () => { unsubscribe(); dispose?.() }
  }
  register({ name: 'root', children: {
    'conversation.hero.agentPreset': { kind: 'single', scope: 'session-maybe' },
    'conversation.session.header.actions': { kind: 'list', scope: 'session' },
    'settings.section': { kind: 'list', scope: 'root' },
    'fixture.composer.host': { kind: 'single', scope: 'root' },
  } })
  const native = vi.fn(() => 'native picker')
  const lever = vi.fn(() => 'Liangshen lever')
  const other = vi.fn(() => 'Other composer control')
  register({ name: 'conversation.hero.agentPreset' }, native)
  const mountComposer = () => {
    const unmount = register({ name: 'fixture.composer.host', children: {
      'conversation.input.right': { kind: 'list', scope: 'session' },
    } })
    register({ name: 'conversation.input.right', id: 'other', order: 10 }, other)
    return unmount
  }
  if (composerInitiallyDeclared) mountComposer()
  register({ name: 'conversation.session.header.actions', id: 'agent-preset' })
  register({ name: 'settings.section', id: 'agent-presets' })
  return { core, register, mountComposer, native, lever, other, slots: { register, inject } as Parameters<typeof installDesktopPresetNavigation>[0] }
}

it('Desktop suppresses just the Liangshen composer switch, including late registration', () => {
  const { core, register, native, lever, other, slots } = fixture()
  const settings = core.entriesOfSlot('settings.section'), labels = core.entriesOfSlot('conversation.session.header.actions')
  const dispose = installDesktopPresetNavigation(slots, { dshDesktop: { onDesktopToolOpen() {} } })
  register({ name: 'conversation.input.right', id: 'liangshen-lever', order: 20 }, lever)
  expect(core.entriesOfSlot('conversation.hero.agentPreset')[0].component).toBe(native)
  const controls = core.entriesOfSlot('conversation.input.right').map(entry => entry.component)
  expect(controls).toHaveLength(2)
  expect(controls).toContain(other)
  expect(controls).not.toContain(lever)
  expect((controls.find(component => component !== other) as Function)()).toBeNull()
  expect(core.entriesOfSlot('settings.section')).toEqual(settings)
  expect(core.entriesOfSlot('conversation.session.header.actions')).toEqual(labels)
  expect(lever).not.toHaveBeenCalled()
  dispose()
  expect(core.entriesOfSlot('conversation.input.right').map(entry => entry.component)).toContain(lever)
})

it('starts settings before the composer exists and reapplies suppression when the slot returns', () => {
  const { core, register, mountComposer, native, lever, slots } = fixture(false)
  const dispose = installDesktopPresetNavigation(slots, { dshDesktop: { onDesktopToolOpen() {} } })
  expect(core.entriesOfSlot('conversation.input.right')).toEqual([])
  for (let load = 0; load < 2; load++) {
    const unmount = mountComposer()
    register({ name: 'conversation.input.right', id: 'liangshen-lever', order: 20 }, lever)
    expect(core.entriesOfSlot('conversation.input.right').map(entry => entry.component)).not.toContain(lever)
    expect(core.entriesOfSlot('conversation.hero.agentPreset')[0].component).toBe(native)
    unmount()
  }
  dispose()
  mountComposer()
  register({ name: 'conversation.input.right', id: 'liangshen-lever', order: 20 }, lever)
  expect(core.entriesOfSlot('conversation.input.right').map(entry => entry.component)).toContain(lever)
})

it('ordinary Web keeps the same official preset picker, settings and defaults with no Desktop registration', () => {
  const { core, register, native, lever, slots } = fixture()
  register({ name: 'conversation.input.right', id: 'liangshen-lever', order: 20 }, lever)
  const topology = core.snapshot()
  installDesktopPresetNavigation(slots, {})()
  expect(core.snapshot()).toEqual(topology)
  expect(core.entriesOfSlot('conversation.hero.agentPreset')[0].component).toBe(native)
  expect(core.entriesOfSlot('conversation.input.right').map(entry => entry.component)).toContain(lever)
})
