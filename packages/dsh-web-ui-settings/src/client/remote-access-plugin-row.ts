import { createElement, type ComponentType, type ReactNode } from 'react'
import type { StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { REMOTE_ACCESS_ROW_IDS } from './remote-access-hint.ts'

type Slots = Pick<SlotRegistry, 'entriesOfSlot' | 'subscribe' | 'register'>
type RowOptions = Pick<StoredEntry, 'inject' | 'locale' | 'store' | 'select' | 'registrant'> & {
  name: 'plugins.row.config'
  key: string
}

export function registerRemoteAccessPluginRows(slots: Slots): () => void {
  let current: StoredEntry | undefined
  let disposeRows: Array<() => void> = []
  const clearRows = () => { disposeRows.splice(0).forEach(dispose => dispose()) }
  const reconcile = () => {
    const entry = slots.entriesOfSlot('web-ui.plugin.item').find(item => item.options.id === 'remote-web-ui')
    if (entry === current) return
    clearRows()
    current = entry
    if (!entry) return

    // Both published and workspace builds contribute the same settings card.
    // Reuse its bindings so the native row edits that card's existing form.
    const Card = entry.component as ComponentType<Record<string, unknown>>
    const { inject, locale, store, select, registrant } = entry
    const Component = ({ view, ...props }: Record<string, unknown>): ReactNode => view === 'page' ? createElement(Card, props) : null
    for (const id of REMOTE_ACCESS_ROW_IDS) {
      const dispose = (slots.register as unknown as (options: RowOptions, component: typeof Component) => () => void)({
        name: 'plugins.row.config', key: `@linxin666/dsh-web-all#${id}`, inject, locale, store, select, registrant,
      }, Component)
      disposeRows.push(dispose)
    }
  }
  const unsubscribe = slots.subscribe('web-ui.plugin.item', reconcile)
  try {
    reconcile()
  } catch (error) {
    unsubscribe()
    clearRows()
    throw error
  }
  return () => {
    unsubscribe()
    clearRows()
  }
}
