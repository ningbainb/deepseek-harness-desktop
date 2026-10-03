import { createElement, type ComponentType, type ReactNode } from 'react'
import type { PropsRenderSlots, SlotEntryDef, SlotSpec, StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { DockSettingsPage } from './DockSettingsPage.tsx'

export const DOCK_NATIVE_SLOTS = {
  'settings.section': 'desktop-dock.settings.section',
  'plugins.row.config': 'desktop-dock.plugins.row.config',
} as const

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'desktop-dock.settings.section': { kind: 'list'; scope: 'root'; owner: { close(): void } }
    'desktop-dock.plugins.row.config': { kind: 'keyed'; scope: 'root'; owner: { view: 'summary' | 'page' } }
  }
}

type SlotDispatch = (key: string, owner: unknown, options?: unknown) => ReactNode
type RenderFace = { renderSlot?: SlotDispatch; renderSlotChain?: SlotDispatch }
type DynamicOptions = StoredEntry['options'] & Omit<StoredEntry, 'component' | 'options'> & { name: string }
type MirrorRegistry = Pick<SlotRegistry, 'entriesOfSlot' | 'subscribe' | 'register'>

let nextMirrorId = 0

export function remapSlotProps<Props extends RenderFace>(props: Props, aliases: Readonly<Record<string, string>>): Props {
  const remap = (dispatch: SlotDispatch | undefined) => dispatch && ((key: string, owner: unknown, options?: unknown) => dispatch(aliases[key] ?? key, owner, options))
  return { ...props, renderSlot: remap(props.renderSlot), renderSlotChain: remap(props.renderSlotChain) }
}

export function DockSettingsOutlet(props: Omit<Parameters<typeof DockSettingsPage>[0], 'renderSlot' | '__renders'> & PropsRenderSlots<'web-ui.plugin.item' | 'desktop-dock.settings.section' | 'desktop-dock.plugins.row.config'>) {
  const mapped = remapSlotProps(props as unknown as RenderFace, DOCK_NATIVE_SLOTS)
  return <DockSettingsPage t={props.t} pluginOptions={props.pluginOptions} renderSlot={mapped.renderSlot as Parameters<typeof DockSettingsPage>[0]['renderSlot']} />
}

export function mirrorDockSlot(slots: MirrorRegistry, source: string, destination: string): () => void {
  const register = (options: DynamicOptions, component: unknown) => (slots.register as unknown as (options: DynamicOptions, component: unknown) => () => void)(options, component)
  const records = new Map<StoredEntry, () => void>()
  let stopped = false
  let updating = false
  let dirty = false
  let unsubscribe = () => {}
  const dispose = () => {
    if (stopped) return
    stopped = true
    unsubscribe()
    for (const cleanup of [...records.values()].reverse()) cleanup()
    records.clear()
  }
  const copyEntry = (entry: StoredEntry): (() => void) => {
    const aliases: Record<string, string> = {}
    const children: Record<string, SlotSpec<SlotEntryDef>> = {}
    for (const [child, spec] of Object.entries(entry.children ?? {})) {
      const alias = `desktop-dock.mirror.${++nextMirrorId}.${child}`
      aliases[child] = alias
      children[alias] = spec
    }
    const Component = entry.component as ComponentType<Record<string, unknown>>
    const component = Object.keys(children).length
      ? (props: Record<string, unknown> & RenderFace) => createElement(Component, remapSlotProps(props, aliases))
      : entry.component
    const cleanupEntry = register({
      ...entry.options,
      name: destination,
      inject: entry.inject,
      select: entry.select,
      store: entry.store,
      locale: entry.locale,
      registrant: entry.registrant,
      children: Object.keys(children).length ? children : undefined,
    }, component)
    const cleanups: Array<() => void> = [cleanupEntry]
    try {
      for (const [child, alias] of Object.entries(aliases)) cleanups.push(mirrorDockSlot(slots, child, alias))
    } catch (error) {
      for (const cleanup of cleanups.reverse()) cleanup()
      throw error
    }
    return () => {
      for (const cleanup of [...cleanups].reverse()) cleanup()
    }
  }
  const update = () => {
    if (stopped) return
    if (updating) {
      dirty = true
      return
    }
    updating = true
    try {
      do {
        dirty = false
        const winners = slots.entriesOfSlot(source as Parameters<SlotRegistry['entriesOfSlot']>[0])
        for (const [entry, cleanup] of records) {
          if (winners.includes(entry)) continue
          records.delete(entry)
          cleanup()
        }
        for (const entry of winners) {
          if (!records.has(entry)) records.set(entry, copyEntry(entry))
        }
      } while (dirty && !stopped)
    } finally {
      updating = false
    }
  }
  try {
    unsubscribe = slots.subscribe(source as Parameters<SlotRegistry['subscribe']>[0], update)
    update()
  } catch (error) {
    dispose()
    throw error
  }
  return dispose
}
