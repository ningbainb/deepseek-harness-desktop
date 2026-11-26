import type { Context } from '@deepseek-ai/cordis'
import type { LocaleServiceLike, SlotsServiceLike } from '../core/host-types.ts'
import { WinControlCard } from './WinControlCard.tsx'
import { WinControlPill } from './WinControlPill.tsx'
import { en, zh } from './locales.ts'

export { WinControlCard } from './WinControlCard.tsx'
export { WinControlPill } from './WinControlPill.tsx'
export { en, zh } from './locales.ts'

export const inject = ['slots', 'locale'] as const

const NAMESPACE = 'win-control'

export function apply(ctx: Context): void {
  const accessor = ctx as unknown as {
    get?: (name: string) => unknown
    effect: (cb: () => () => void, label?: string) => void
  }
  const locale = accessor.get?.('locale') as LocaleServiceLike | undefined
  const slots = accessor.get?.('slots') as SlotsServiceLike | undefined
  if (locale?.register) {
    accessor.effect(() => locale.register(NAMESPACE, { zh, en }), 'win-control: locales')
  }
  if (!slots?.inject || !slots?.register) return

  accessor.effect(() => slots.inject('conversation.input.left', () => slots.register({
    name: 'conversation.input.left',
    id: 'win-control-pill',
    order: 95,
    locale: NAMESPACE,
    inject: (sessionId?: string) => ({ sessionId }),
  }, WinControlPill)), 'win-control: composer pill')

  accessor.effect(() => slots.inject('web-ui.plugin.item', () => slots.register({
    name: 'web-ui.plugin.item',
    id: 'win-control',
    order: 118,
    locale: NAMESPACE,
    inject: () => ({}),
  }, WinControlCard)), 'win-control: settings card')
}
