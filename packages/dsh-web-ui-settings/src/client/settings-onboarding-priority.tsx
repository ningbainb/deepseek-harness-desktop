import { createElement, useCallback, useMemo, type ComponentType } from 'react'
import type { SnapshotSelectorHook, SlotEntryDef, SlotSpec, StoredEntry, SlotRegistry } from './settings-sdk-adapter.ts'
import { mirrorDockSlot, remapSlotProps } from './dock-slot-mirror.tsx'
import { canLeaveDesktopNativeSettings, useDesktopNativeSettingsNavigation } from './desktop-native-settings.tsx'
import { DesktopSettingsGroup, groupDesktopSettings, type SettingsSection } from './desktop-settings-groups.tsx'

type OnboardingStep = { id: string; order: number }
type SettingsProps = {
  useStore: SnapshotSelectorHook<{ open: boolean; activeId?: string }>
  useOnboardingSteps: SnapshotSelectorHook<OnboardingStep[]>
  useSections?: SnapshotSelectorHook<readonly SettingsSection[]>
  renderSlot?: unknown
  actions?: { openSection?: (id: string) => void; select?: (id: string) => void; close?: () => void }
}
type DynamicOptions = StoredEntry['options'] & Omit<StoredEntry, 'component' | 'options'> & { name: string }
type Registry = Pick<SlotRegistry, 'entries' | 'entriesOfSlot' | 'register' | 'subscribe'>
const deferredSteps: OnboardingStep[] = []
let nextAliasId = 0

export function supportsDesktopSettingsPriority(host: unknown): boolean {
  const bridge = (host as { dshDesktop?: { getSettingsWindowBounds?: unknown; setSettingsWindowBounds?: unknown } } | null)?.dshDesktop
  return typeof bridge?.getSettingsWindowBounds === 'function' && typeof bridge.setSettingsWindowBounds === 'function'
}

export function withSettingsOnboardingPriority<Props extends SettingsProps>(Component: ComponentType<Props>,
  getLanguage = () => document.documentElement.lang): ComponentType<Props> {
  return function SettingsOnboardingPriority(props: Props) {
    const nativeState = props.useStore(state => state)
    const { open: settingsOpen, activeId } = nativeState
    const rows = props.useSections?.(sections => sections)
    const language = getLanguage()
    const groups = useMemo(() => groupDesktopSettings(rows ?? [], language), [rows, language])
    const activeGroup = groups.find(group => group.sections.some(section => section.id === activeId))
    const selectSection = (id: string) => {
      if (id === activeId) return true
      if (!canLeaveDesktopNativeSettings(document)) return false
      props.actions?.select?.(id)
      return true
    }
    const nativeOpen = props.actions?.openSection
    const openSection = useCallback((id: string) => {
      if (id !== activeId && !canLeaveDesktopNativeSettings(document)) return false
      nativeOpen?.(id)
      return true
    }, [activeId, nativeOpen])
    useDesktopNativeSettingsNavigation(nativeOpen ? { openSection } : undefined)
    const useOnboardingSteps: SettingsProps['useOnboardingSteps'] = (select, equal) => props.useOnboardingSteps(
      steps => select(settingsOpen ? deferredSteps : steps), equal,
    )
    const renderNative = props.renderSlot as Parameters<typeof remapSlotProps>[0]['renderSlot']
    const grouped = rows !== undefined && typeof renderNative === 'function'
    const useSections: SettingsProps['useSections'] = select => select(groups)
    const useStore: SettingsProps['useStore'] = select => select({
      ...nativeState, activeId: activeGroup?.id ?? activeId,
    })
    const renderSlot: NonNullable<typeof renderNative> = (key, owner, options) => {
      const only = (options as { only?: string } | undefined)?.only
      const group = key === 'settings.section' && groups.find(item => item.id === only)
      if (!group) return renderNative?.(key, owner, options)
      return <DesktopSettingsGroup key={group.id} group={group} activeId={activeId} onSelect={selectSection}
        renderSection={id => renderNative?.(key, owner, { ...options as object, only: id })} />
    }
    const actions = props.actions && {
      ...props.actions,
      openSection,
      select: (id: string) => {
        const group = grouped && groups.find(item => item.id === id)
        if (!group || group.id !== activeGroup?.id) selectSection(group ? group.sections[0]?.id ?? id : id)
      },
      close: () => { if (canLeaveDesktopNativeSettings(document)) props.actions?.close?.() },
    }
    return createElement(Component, { ...props, actions, useOnboardingSteps, ...(grouped && { useStore, useSections, renderSlot }) })
  }
}

export function installSettingsOnboardingPriority(slots: Registry, getLanguage?: () => string): () => void {
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
    const Original = withSettingsOnboardingPriority(source.component as ComponentType<SettingsProps>, getLanguage)
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
