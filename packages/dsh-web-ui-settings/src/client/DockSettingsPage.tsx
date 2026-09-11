import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { SafePluginBoundary } from './SafePluginBoundary.tsx'
import css from './dock-settings.module.css'

export const DOCK_SETTINGS = ['relay', 'value-mode', 'personal-prompt', 'memory', 'particle-theme', 'describe-image'] as const
export type DockSetting = typeof DOCK_SETTINGS[number]

export function isDockSetting(value: unknown): value is DockSetting {
  return typeof value === 'string' && DOCK_SETTINGS.includes(value as DockSetting)
}

export function dockSettingFromUrl(): DockSetting | undefined {
  if (typeof window === 'undefined') return undefined
  const value = new URLSearchParams(window.location.search).get('desktop-dock-setting')
  return isDockSetting(value) ? value : undefined
}

/** Dedicated runtime document in the Dock; all forms keep their official slot bindings. */
export function DockSettingsPage({ renderSlot, t }: PropsRenderSlots<'web-ui.plugin.item'> & PropsLocale<'web-ui-plugins'>) {
  const [selected, setSelected] = useState<DockSetting>(() => dockSettingFromUrl() ?? 'value-mode')
  const [theme, setTheme] = useState(() => new URLSearchParams(window.location.search).get('desktop-dock-theme') === 'dark' ? 'dark' : 'light')
  const [visited, setVisited] = useState<DockSetting[]>([selected])
  const navigateTo = (next: DockSetting) => {
    setSelected(next)
    setVisited(previous => previous.includes(next) ? previous : [...previous, next])
  }
  useEffect(() => {
    const navigate = (event: Event) => {
      const next = (event as CustomEvent).detail
      if (!isDockSetting(next)) return
      navigateTo(next)
    }
    window.addEventListener('dsh:dock-setting', navigate)
    const syncTheme = (event: Event) => setTheme((event as CustomEvent).detail === 'dark' ? 'dark' : 'light')
    window.addEventListener('dsh:dock-theme', syncTheme)
    return () => {
      window.removeEventListener('dsh:dock-setting', navigate)
      window.removeEventListener('dsh:dock-theme', syncTheme)
    }
  }, [])
  const personal = selected === 'personal-prompt' || selected === 'memory'
  return <main className={css.page} data-theme={theme} data-dsh-dock-settings={selected}>
    <p className={css.breadcrumb}>{t(selected === 'particle-theme' ? 'dockDesktopGroup' : 'dockAiGroup')} / {t(personal ? 'dockPersonal' : selected === 'relay' ? 'dockModels' : selected === 'value-mode' ? 'dockCollaboration' : selected === 'particle-theme' ? 'dockAppearance' : 'dockVision')}</p>
    {personal && <>
      <h1 className={css.heading}>{t('dockPersonal')}</h1>
      <div className={css.tabs} role="tablist" aria-label={t('dockPersonal')}>
        {(['personal-prompt', 'memory'] as const).map(id => <button key={id} id={`${id}-tab`} type="button" role="tab" aria-selected={selected === id} aria-controls={`dock-form-${id}`} tabIndex={selected === id ? 0 : -1} onClick={() => navigateTo(id)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const next = event.key === 'Home' ? 'personal-prompt' : event.key === 'End' ? 'memory' : selected === 'memory' ? 'personal-prompt' : 'memory'
          navigateTo(next)
          document.getElementById(`${next}-tab`)?.focus()
        }}>{id === 'personal-prompt' ? t('dockResponsePreferences') : t('dockMemory')}</button>)}
      </div>
    </>}
    {visited.map(id => <section key={id} id={`dock-form-${id}`} hidden={id !== selected} className={css.content} role={id === 'memory' || id === 'personal-prompt' ? 'tabpanel' : undefined} aria-labelledby={id === 'memory' || id === 'personal-prompt' ? `${id}-tab` : undefined}>
      <SafePluginBoundary pluginName={id} fallback={<p role="alert">{t('dockSettingUnavailable')}</p>}>
        {renderSlot('web-ui.plugin.item', {}, { only: id, fallback: <p role="status">{t('dockSettingUnavailable')}</p> })}
      </SafePluginBoundary>
    </section>)}
  </main>
}
