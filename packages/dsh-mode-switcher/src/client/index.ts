import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { ModeSwitcher } from './ModeSwitcher.tsx'
import { ModeSwitcherController } from './mode-controller.ts'
import { modeSwitcherDependencies } from './runtime-adapter.ts'

export const inject = ['slots', 'sessions', 'workspaces', 'connection', 'conversation']

export function apply(ctx: ClientContext): void {
  if (typeof (ctx.sessions as unknown as { noteAgentPreset?: unknown }).noteAgentPreset === 'function') {
    mount(ctx)
  } else {
    // Remote namespaces are separate Cordis services; their methods must be
    // called from a scope that declares them, after they become available.
    ctx.inject(['remote.agentPresets', 'remote.session'], scope => mount(scope, true))
  }
}

function mount(ctx: ClientContext, nativePresetLabel = false): void {
  const controller = new ModeSwitcherController(modeSwitcherDependencies(ctx))
  const injected = () => ({
    nativePresetLabel,
    loadModes: () => controller.list(),
    switchMode: (sessionId: string, preset: string) => controller.switch(sessionId, preset),
  })
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'mode-switcher',
    order: -9,
    inject: injected,
  }, ModeSwitcher))
}
