import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { openDesktopSurface } from '@linxin666/dsh-desktop-client'
import type { PropsRenderSlots } from './settings-sdk-adapter.ts'
import { mirrorDockSlot } from './dock-slot-mirror.tsx'
import { SafePluginBoundary } from './SafePluginBoundary.tsx'
import css from './desktop-native-settings.module.css'

export const PERSONAL_SECTION = 'desktop-personal-preferences'
export const ADVANCED_MODEL_SECTION = 'desktop-model-advanced'
const sections = {
  models: 'models',
  relay: 'models',
  'value-mode': ADVANCED_MODEL_SECTION,
  'describe-image': ADVANCED_MODEL_SECTION,
  'personal-prompt': PERSONAL_SECTION,
  memory: PERSONAL_SECTION,
  usage: 'dsh-usage',
  sessions: 'archived-sessions',
} as const

type Target = keyof typeof sections
type PersonalTab = 'personal-prompt' | 'memory'
type ModelPane = 'value-mode' | 'describe-image'
type OpenSection = (id: string) => void | boolean
type SettingsActions = { openSection?: OpenSection }

const copy = {
  zh: {
    personal: '个人偏好', responses: '回复偏好', memory: '记忆', advancedModels: '高级模型策略',
    valueMode: '性价比模式', image: '图像理解', promptCustomizer: 'Agent 高级提示词 (P2)',
    unavailable: '此设置暂时不可用。', promptCustomizerError: '无法打开高级提示词设置，请重试。',
  },
  en: {
    personal: 'Personal preferences', responses: 'Response preferences', memory: 'Memory', advancedModels: 'Advanced models',
    valueMode: 'Value Mode', image: 'Image understanding', promptCustomizer: 'Advanced agent prompt (P2)',
    unavailable: 'This setting is temporarily unavailable.', promptCustomizerError: 'Could not open advanced prompt settings. Please try again.',
  },
}

type CopyKey = keyof typeof copy.en
type SettingsCopy = { t: (key: CopyKey) => string }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'desktop-native-settings': CopyKey }
  interface SlotMap {
    'desktop-native.settings.personal': { kind: 'list'; scope: 'root'; owner: {} }
    'desktop-native.settings.models': { kind: 'list'; scope: 'root'; owner: {} }
  }
}

const listeners = new Set<() => void>()
let selection: { personal: PersonalTab; model: ModelPane | undefined; revision: number } = {
  personal: 'personal-prompt', model: undefined, revision: 0,
}
let handledModelRevision = 0
let activeShell: OpenSection | undefined
let pendingTarget: Target | undefined

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function snapshot() { return selection }

function select(next: typeof selection) {
  selection = next
  for (const publish of listeners) publish()
}

/** Route Desktop shortcuts to the installed official shell's section action. */
export function openDesktopNativeSettings(target: unknown): boolean {
  if (typeof target !== 'string' || !Object.hasOwn(sections, target)) return false
  const id = target as Target
  if (!activeShell) {
    // The first request may reach the document before the sidebar slot mounts.
    pendingTarget = id
    return true
  }
  if (activeShell(sections[id]) === false) return true
  select({
    personal: id === 'personal-prompt' || id === 'memory' ? id : selection.personal,
    model: id === 'value-mode' || id === 'describe-image' ? id : undefined,
    revision: selection.revision + 1,
  })
  return true
}

/** Draft markers belong to the original editors. Guard their new shell transitions. */
export function canLeaveDesktopNativeSettings(doc: Document): boolean {
  const panel = doc.querySelector('[data-shortcut-modal="settings"]')
  const draft = panel?.querySelector(
    ':is([data-dsh-native-settings], [data-model-advanced-entry]) [data-dock-dirty="true"], [data-relay-onboarding-card][data-dock-dirty="true"]',
  )
  if (!draft) return true
  const english = doc.documentElement.lang.toLowerCase().startsWith('en')
  return doc.defaultView?.confirm(english
    ? 'This page has unsaved changes. Discard them and leave?'
    : '此页有未保存的修改。要放弃修改并离开吗？') ?? false
}

/** Binds the route to the existing Settings shell without replacing its launcher. */
export function useDesktopNativeSettingsNavigation(actions?: SettingsActions): void {
  const openSection = actions?.openSection
  useLayoutEffect(() => {
    if (!openSection) return
    activeShell = openSection
    if (pendingTarget) {
      const target = pendingTarget
      pendingTarget = undefined
      openDesktopNativeSettings(target)
    }
    return () => { if (activeShell === openSection) activeShell = undefined }
  }, [openSection])
}

const personalTabs = ['personal-prompt', 'memory'] as const

function PersonalPreferences({ t, renderSlot }: SettingsCopy & PropsRenderSlots<'desktop-native.settings.personal'>) {
  const { personal: active } = useSyncExternalStore(subscribe, snapshot)
  const [visited, setVisited] = useState<readonly PersonalTab[]>([active])
  useLayoutEffect(() => { setVisited(previous => previous.includes(active) ? previous : [...previous, active]) }, [active])
  const changeTab = (id: PersonalTab) => select({ ...selection, personal: id })
  return <section className={css.section} data-dsh-native-settings="personal">
    <h2 className={css.title}>{t('personal')}</h2>
    <div role="tablist" aria-label={t('personal')} className={css.tabs}>
      {personalTabs.map(id => <button key={id} id={`desktop-native-${id}-tab`} type="button" role="tab"
        aria-selected={active === id} aria-controls={`desktop-native-${id}`} tabIndex={active === id ? 0 : -1}
        onClick={() => changeTab(id)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const next = event.key === 'Home' ? 'personal-prompt' : event.key === 'End' ? 'memory' : id === 'memory' ? 'personal-prompt' : 'memory'
          changeTab(next)
          event.currentTarget.parentElement?.querySelector<HTMLElement>(`#desktop-native-${next}-tab`)?.focus()
        }}>{t(id === 'memory' ? 'memory' : 'responses')}</button>)}
    </div>
    {personalTabs.map(id => <section key={id} id={`desktop-native-${id}`} role="tabpanel" aria-labelledby={`desktop-native-${id}-tab`} hidden={id !== active}>
      {(id === active || visited.includes(id)) && <SafePluginBoundary pluginName={id}>
        {renderSlot('desktop-native.settings.personal', {}, { only: id, fallback: <p role="status">{t('unavailable')}</p> })}
        {id === 'personal-prompt' && <AdvancedPrompt t={t} />}
      </SafePluginBoundary>}
    </section>)}
  </section>
}

function AdvancedPrompt({ t }: SettingsCopy) {
  const [promptError, setPromptError] = useState(false)
  const [openingPrompt, setOpeningPrompt] = useState(false)
  const openPrompt = async () => {
    setOpeningPrompt(true)
    setPromptError(false)
    try { setPromptError(!await openDesktopSurface('extensions', { setting: 'prompt-customizer' })) }
    catch { setPromptError(true) }
    finally { setOpeningPrompt(false) }
  }
  return <>
    <button type="button" className={css.button} disabled={openingPrompt} onClick={() => { void openPrompt() }}>{t('promptCustomizer')}</button>
    {promptError && <p role="alert" className={css.error}>{t('promptCustomizerError')}</p>}
  </>
}

function AdvancedModels({ t, renderSlot }: SettingsCopy & PropsRenderSlots<'desktop-native.settings.models'>) {
  const { model, revision } = useSyncExternalStore(subscribe, snapshot)
  const valueMode = useRef<HTMLDetailsElement>(null)
  const image = useRef<HTMLDetailsElement>(null)
  useLayoutEffect(() => {
    if (!model || handledModelRevision === revision) return
    const pane = model === 'value-mode' ? valueMode.current : image.current
    if (!pane) return
    handledModelRevision = revision
    pane.open = true
    pane.scrollIntoView?.({ block: 'nearest' })
  }, [model, revision])
  const renderItem = (id: ModelPane) => <SafePluginBoundary pluginName={id}>
    {renderSlot('desktop-native.settings.models', {}, { only: id, fallback: <p role="status">{t('unavailable')}</p> })}
  </SafePluginBoundary>
  return <section className={css.section} data-model-advanced-entry>
    <h2 className={css.title}>{t('advancedModels')}</h2>
    <details ref={valueMode} className={css.advancedItem} data-dsh-native-model-pane="value-mode">
      <summary>{t('valueMode')}</summary>
      <ModelPaneContent render={() => renderItem('value-mode')} />
    </details>
    <details ref={image} className={css.advancedItem} data-dsh-native-model-pane="describe-image">
      <summary>{t('image')}</summary>
      <ModelPaneContent render={() => renderItem('describe-image')} />
    </details>
  </section>
}

function ModelPaneContent({ render }: { render: () => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visited, setVisited] = useState(false)
  useLayoutEffect(() => {
    const pane = ref.current?.closest('details')
    if (!pane) return
    const load = () => { if (pane.open) setVisited(true) }
    pane.addEventListener('toggle', load)
    load()
    return () => pane.removeEventListener('toggle', load)
  }, [])
  return <div className={css.form} ref={ref}>{visited && render()}</div>
}

/** Registers only the new layout seats. Each editor keeps its original plugin and store. */
export function installDesktopNativeSettings(ctx: Context): () => void {
  const locale = 'desktop-native-settings'
  const declareCards = (destination: 'desktop-native.settings.personal' | 'desktop-native.settings.models', ids: readonly Target[], dispose: () => void) => {
    try {
      const mirror = mirrorDockSlot(ctx.slots, 'web-ui.plugin.item', destination, entry => ids.some(id => entry.options.id === id))
      return () => { mirror(); dispose() }
    } catch (error) {
      dispose()
      throw error
    }
  }
  const dictionary = ctx.locale.register(locale, copy)
  const personal = ctx.slots.inject('settings.section', () => declareCards('desktop-native.settings.personal', personalTabs, ctx.slots.register({
    name: 'settings.section', id: PERSONAL_SECTION, order: 55, locale,
    children: { 'desktop-native.settings.personal': { kind: 'list', scope: 'root' } },
    label: () => ctx.locale.bind(locale)('personal'),
  }, PersonalPreferences)))
  const models = ctx.slots.inject('settings.section', () => declareCards('desktop-native.settings.models', ['value-mode', 'describe-image'], ctx.slots.register({
    name: 'settings.section', id: ADVANCED_MODEL_SECTION, order: 56, locale,
    label: () => ctx.locale.bind(locale)('advancedModels'),
    children: { 'desktop-native.settings.models': { kind: 'list', scope: 'root' } },
  }, AdvancedModels)))
  return () => { models(); personal(); dictionary() }
}
