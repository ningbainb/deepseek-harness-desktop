import { expect, it, vi } from 'vitest'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import { installDesktopPresetNavigation } from '../src/client/desktop-preset-navigation.ts'

function fixture() {
  const core = new SlotCore()
  const register = (options: unknown, component: unknown = () => null) => (core.register as Function)(options, component)
  register({ name: 'root', children: {
    'conversation.hero.agentPreset': { kind: 'single', scope: 'session-maybe' },
    'conversation.input.right': { kind: 'list', scope: 'session' },
    'conversation.session.header.actions': { kind: 'list', scope: 'session' },
    'settings.section': { kind: 'list', scope: 'root' },
  } })
  const native = vi.fn(() => 'native picker')
  const lever = vi.fn(() => 'Liangshen lever')
  const other = vi.fn(() => 'Other composer control')
  register({ name: 'conversation.hero.agentPreset' }, native)
  register({ name: 'conversation.input.right', id: 'other', order: 10 }, other)
  register({ name: 'conversation.session.header.actions', id: 'agent-preset' })
  register({ name: 'settings.section', id: 'agent-presets' })
  return { core, register, native, lever, other, slots: { register } as Parameters<typeof installDesktopPresetNavigation>[0] }
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

it('ordinary Web keeps the same official preset picker, settings and defaults with no Desktop registration', () => {
  const { core, register, native, lever, slots } = fixture()
  register({ name: 'conversation.input.right', id: 'liangshen-lever', order: 20 }, lever)
  const topology = core.snapshot()
  installDesktopPresetNavigation(slots, {})()
  expect(core.snapshot()).toEqual(topology)
  expect(core.entriesOfSlot('conversation.hero.agentPreset')[0].component).toBe(native)
  expect(core.entriesOfSlot('conversation.input.right').map(entry => entry.component)).toContain(lever)
})
