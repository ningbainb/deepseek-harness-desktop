import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

type DesktopHost = { dshDesktop?: { onDesktopToolOpen?: unknown } }

/** The published Liangshen plugin contributes a dedicated composer lever. */
export function installDesktopPresetNavigation(slots: Pick<Context['slots'], 'inject' | 'register'>, host: object): () => void {
  if (typeof (host as DesktopHost).dshDesktop?.onDesktopToolOpen !== 'function') return () => {}
  // A list slot elects its component by id. Leave the native preset chooser
  // and other composer controls owned by their original registrations.
  return slots.inject('conversation.input.right', () =>
    slots.register({ name: 'conversation.input.right', id: 'liangshen-lever', priority: -100 }, () => null),
  )
}
