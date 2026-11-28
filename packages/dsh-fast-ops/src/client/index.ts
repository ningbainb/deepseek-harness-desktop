import type { Context } from '@deepseek-ai/cordis'
import type { LocaleServiceLike, SlotsServiceLike } from '../core/host-types.ts'
import { FastOpsCard } from './FastOpsCard.tsx'
import { FastOpsDockBadge } from './FastOpsDockBadge.tsx'
import { en, zh } from './locales.ts'

export { FastOpsCard } from './FastOpsCard.tsx'
export { FastOpsDockBadge, formatCompactTokens, summarizeFastOpsBadge } from './FastOpsDockBadge.tsx'
export { en, zh } from './locales.ts'

export const inject = ['slots', 'locale'] as const

const NAMESPACE = 'fast-ops'

export function apply(ctx: Context): void {
  const accessor = ctx as unknown as {
    get?: (name: string) => unknown
    effect: (cb: () => () => void, label?: string) => void
  }
  const locale = accessor.get?.('locale') as LocaleServiceLike | undefined
  const slots = accessor.get?.('slots') as SlotsServiceLike | undefined
  if (locale?.register) {
    accessor.effect(() => locale.register(NAMESPACE, { zh, en }), 'fast-ops: locales')
  }
  if (!slots?.inject || !slots?.register) return

  accessor.effect(() => slots.inject('web-ui.plugin.item', () => slots.register({
    name: 'web-ui.plugin.item',
    id: 'fast-ops',
    order: 117,
    locale: NAMESPACE,
    inject: () => ({}),
  }, FastOpsCard)), 'fast-ops: settings card')

  accessor.effect(() => slots.inject('conversation.composer.dock', () => slots.register({
    name: 'conversation.composer.dock',
    id: 'fast-ops-dock',
    order: 105,
    locale: NAMESPACE,
    inject: () => ({}),
  }, FastOpsDockBadge)), 'fast-ops: composer dock badge')
}
