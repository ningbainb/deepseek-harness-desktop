import type { Context } from '@deepseek-ai/cordis'
import type { LocaleServiceLike, SlotsServiceLike } from '../core/host-types.ts'
import { ImHubCard } from './ImHubCard.tsx'
import { en, zh } from './locales.ts'

export { ImHubCard } from './ImHubCard.tsx'
export { en, zh } from './locales.ts'

export const inject = ['slots', 'locale'] as const

const NAMESPACE = 'im-hub'

export function apply(ctx: Context): void {
  const accessor = ctx as unknown as {
    get?: (name: string) => unknown
    effect: (cb: () => () => void, label?: string) => void
  }
  const locale = accessor.get?.('locale') as LocaleServiceLike | undefined
  const slots = accessor.get?.('slots') as SlotsServiceLike | undefined
  if (locale?.register) {
    accessor.effect(() => locale.register(NAMESPACE, { zh, en }), 'im-hub: locales')
  }
  if (!slots?.inject || !slots?.register) return

  accessor.effect(() => slots.inject('web-ui.plugin.item', () => slots.register({
    name: 'web-ui.plugin.item',
    id: 'im-hub',
    order: 116,
    locale: NAMESPACE,
    inject: () => ({}),
  }, ImHubCard)), 'im-hub: settings card')
}
