import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { CheckpointSessionCount, CheckpointSessionSection } from './CheckpointSessionSection.tsx'
import { CheckpointTurnTail } from './CheckpointTurnTail.tsx'
import { dictionaries, type CheckpointKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'workspace-checkpoints': CheckpointKey
  }
  interface SlotMap {
    'conversation.session.panel.section': {
      kind: 'list'
      scope: 'session'
      owner: {
        readonly presentation: 'docked' | 'overlay'
        readonly dismissOverlay: () => void
      }
    }
    'conversation.session.panel.section.actions': {
      kind: 'keyed'
      scope: 'session'
    }
  }
}

const NS = 'workspace-checkpoints'
export const inject = ['slots', 'locale']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-checkpoints: dictionaries')
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail', id: NS, locale: NS,
  }, CheckpointTurnTail))
  ctx.slots.inject('conversation.session.panel.section', () => ctx.slots.register({
    name: 'conversation.session.panel.section',
    id: NS,
    order: 35,
    locale: NS,
    label: () => ctx.locale.bind(NS)('title'),
  }, CheckpointSessionSection as never))
  ctx.slots.inject('conversation.session.panel.section.actions', () => ctx.slots.register({
    name: 'conversation.session.panel.section.actions',
    key: NS,
    locale: NS,
  }, CheckpointSessionCount as never))
}
