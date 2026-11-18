import { expect, it, vi } from 'vitest'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import { installDesktopPresetNavigation } from '../src/client/desktop-preset-navigation.ts'

function fixture() {
  const core = new SlotCore()
  const register = (options: unknown, component: unknown = () => null) => (core.register as Function)(options, component)
  register({ name: 'root', children: {
    'conversation.hero.agentPreset': { kind: 'single', scope: 'session-maybe' },
    'conversation.session.header.actions': { kind: 'list', scope: 'session' },
    'settings.section': { kind: 'list', scope: 'root' },
  } })
  const native = vi.fn(() => 'native picker')
  register({ name: 'conversation.hero.agentPreset' }, native)
  register({ name: 'conversation.session.header.actions', id: 'agent-preset' })
  register({ name: 'settings.section', id: 'agent-presets' })
  return { core, native, slots: { register } as Parameters<typeof installDesktopPresetNavigation>[0] }
}

it('Desktop shadows only the official inline preset seat while retaining its settings, history label and original owner', () => {
  const { core, native, slots } = fixture()
  const settings = core.entriesOfSlot('settings.section'), labels = core.entriesOfSlot('conversation.session.header.actions')
  const dispose = installDesktopPresetNavigation(slots, { dshDesktop: { onDesktopToolOpen() {} } })
  const chosen = core.entriesOfSlot('conversation.hero.agentPreset')
  expect(chosen).toHaveLength(1)
  expect(chosen[0].component).not.toBe(native)
  expect((chosen[0].component as Function)()).toBeNull()
  expect(core.entriesOfSlot('settings.section')).toEqual(settings)
  expect(core.entriesOfSlot('conversation.session.header.actions')).toEqual(labels)
  expect(native).not.toHaveBeenCalled()
  dispose()
  expect(core.entriesOfSlot('conversation.hero.agentPreset')[0].component).toBe(native)
})

it('ordinary Web keeps the same official preset picker, settings and defaults with no Desktop registration', () => {
  const { core, native, slots } = fixture()
  const topology = core.snapshot()
  installDesktopPresetNavigation(slots, {})()
  expect(core.snapshot()).toEqual(topology)
  expect(core.entriesOfSlot('conversation.hero.agentPreset')[0].component).toBe(native)
})
