import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

type DesktopHost = { dshDesktop?: { onDesktopToolOpen?: unknown } }

/** Desktop keeps preset editing in its official settings owner, not chat. */
export function installDesktopPresetNavigation(slots: Pick<Context['slots'], 'register'>, host: object): () => void {
  if (typeof (host as DesktopHost).dshDesktop?.onDesktopToolOpen !== 'function') return () => {}
  // Shadow this single control only. The official preset registry, settings
  // editor and history header label keep their original owner and state.
  return slots.register({ name: 'conversation.hero.agentPreset', priority: -100 }, () => null)
}
