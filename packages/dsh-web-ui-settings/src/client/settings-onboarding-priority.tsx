import { createElement, type ComponentType } from 'react'
import type { SnapshotSelectorHook, SlotEntryDef, SlotSpec, StoredEntry, SlotRegistry } from './settings-sdk-adapter.ts'
import { mirrorDockSlot, remapSlotProps } from './dock-slot-mirror.tsx'

type OnboardingStep = { id: string; order: number }
type SettingsProps = {
  useStore: SnapshotSelectorHook<{ open: boolean }>
  useOnboardingSteps: SnapshotSelectorHook<OnboardingStep[]>
}
type DynamicOptions = StoredEntry['options'] & Omit<StoredEntry, 'component' | 'options'> & { name: string }
type Registry = Pick<SlotRegistry, 'entries' | 'entriesOfSlot' | 'register' | 'subscribe'>
const deferredSteps: OnboardingStep[] = []
let nextAliasId = 0

export function supportsDesktopSettingsPriority(host: unknown): boolean {
  const bridge = (host as { dshDesktop?: { getSettingsWindowBounds?: unknown; setSettingsWindowBounds?: unknown } } | null)?.dshDesktop
  return typeof bridge?.getSettingsWindowBounds === 'function' && typeof bridge.setSettingsWindowBounds === 'function'
}

export function withSettingsOnboardingPriority<Props extends SettingsProps>(Component: ComponentType<Props>): ComponentType<Props> {
  return function SettingsOnboardingPriority(props: Props) {
    const settingsOpen = props.useStore(state => state.open)
    const useOnboardingSteps: SettingsProps['useOnboardingSteps'] = (select, equal) => props.useOnboardingSteps(
      steps => select(settingsOpen ? deferredSteps : steps), equal,
    )
    return createElement(Component, { ...props, useOnboardingSteps })
  }
}

export function installSettingsOnboardingPriority(slots: Registry): () => void {
  const key = 'sidebar.settings' as Parameters<Registry['entries']>[0]
  const register = (options: DynamicOptions, component: unknown) => (slots.register as unknown as (options: DynamicOptions, component: unknown) => () => void)(options, component)
  const components = new Set<unknown>()
  let active: { source: StoredEntry; dispose(): void } | undefined
  let stopped = false
  let updating = false
  let dirty = false
  let unsubscribe = () => {}

  const decorate = (source: StoredEntry) => {
    const priority = source.options.priority ?? 0
    const aliases: Record<string, string> = {}
    const children: Record<string, SlotSpec<SlotEntryDef>> = {}
    for (const [child, spec] of Object.entries(source.children ?? {})) {
      const alias = `desktop-settings.priority.${++nextAliasId}.${child}`
      aliases[child] = alias
      children[alias] = spec
    }
    const Original = withSettingsOnboardingPriority(source.component as ComponentType<SettingsProps>)
    const Component = (props: SettingsProps & Parameters<typeof remapSlotProps>[0]) => createElement(Original, remapSlotProps(props, aliases))
    components.add(Component)
    const cleanups: Array<() => void> = []
    try {
      cleanups.push(register({
        ...source.options, name: key, priority: priority - Math.max(1, Math.abs(priority)) * Number.EPSILON,
        inject: source.inject, store: source.store, select: source.select, locale: source.locale,
        children,
      }, Component))
      for (const [child, alias] of Object.entries(aliases)) cleanups.push(mirrorDockSlot(slots, child, alias))
    } catch (error) {
      for (const cleanup of cleanups.reverse()) cleanup()
      components.delete(Component)
      throw error
    }
    return {
      source,
      dispose() {
        for (const cleanup of [...cleanups].reverse()) cleanup()
        components.delete(Component)
      },
    }
  }

  const update = () => {
    if (stopped) return
    if (updating) { dirty = true; return }
    updating = true
    try {
      do {
        dirty = false
        const source = slots.entries(key).find(entry => !components.has(entry.component))
        if (active?.source === source) continue
        const previous = active
        active = undefined
        previous?.dispose()
        if (source?.store && source.children?.['settings.onboarding'] && source.children['settings.section']) active = decorate(source)
      } while (dirty && !stopped)
    } finally {
      updating = false
    }
  }
  const dispose = () => {
    if (stopped) return
    stopped = true
    unsubscribe()
    active?.dispose()
    active = undefined
  }
  try {
    unsubscribe = slots.subscribe(key, update)
    update()
  } catch (error) {
    dispose()
    throw error
  }
  return dispose
}
