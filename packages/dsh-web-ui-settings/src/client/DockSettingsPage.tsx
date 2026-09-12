import { useEffect, useState, type CSSProperties } from 'react'
import type { DesktopPalette } from './desktop-appearance.ts'
import type { PropsLocale, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { SafePluginBoundary } from './SafePluginBoundary.tsx'
import css from './dock-settings.module.css'

export const DOCK_SETTINGS = ['relay', 'value-mode', 'personal-prompt', 'memory', 'particle-theme', 'describe-image', 'appearance', 'models', 'usage', 'sessions'] as const
export type DockSetting = typeof DOCK_SETTINGS[number]

export const DOCK_SECTIONS = { appearance: 'skin-center', models: 'models', usage: 'dsh-usage', sessions: 'dsh-session-archive' } as const
function sectionFor(id: DockSetting): string | undefined { return DOCK_SECTIONS[id as keyof typeof DOCK_SECTIONS] }

export function isDockSetting(value: unknown): value is DockSetting {
  return typeof value === 'string' && DOCK_SETTINGS.includes(value as DockSetting)
}

/** Preserve old Dock links while presenting one combined model destination. */
export function canonicalDockSetting(value: DockSetting): DockSetting {
  return value === 'relay' ? 'models' : value
}

export function dockSettingFromUrl(): DockSetting | undefined {
  if (typeof window === 'undefined') return undefined
  const value = new URLSearchParams(window.location.search).get('desktop-dock-setting')
  return isDockSetting(value) ? canonicalDockSetting(value) : undefined
}

/** Dedicated runtime document in the Dock; all forms keep their official slot bindings. */
export function DockSettingsPage({ renderSlot, t }: PropsRenderSlots<'web-ui.plugin.item' | 'settings.section'> & PropsLocale<'web-ui-plugins'>) {
  const [selected, setSelected] = useState<DockSetting>(() => dockSettingFromUrl() ?? 'value-mode')
  const [theme, setTheme] = useState(() => new URLSearchParams(window.location.search).get('desktop-dock-theme') === 'dark' ? 'dark' : 'light')
  const [visited, setVisited] = useState<DockSetting[]>([selected])
  const [palette, setPalette] = useState<DesktopPalette | null>(null)
  const navigateTo = (next: DockSetting) => {
    const canonical = canonicalDockSetting(next)
    setSelected(canonical)
    setVisited(previous => previous.includes(canonical) ? previous : [...previous, canonical])
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
    const syncPalette = (event: Event) => setPalette((event as CustomEvent<DesktopPalette | null>).detail)
    window.addEventListener('dsh:dock-palette', syncPalette)
    return () => {
      window.removeEventListener('dsh:dock-setting', navigate)
      window.removeEventListener('dsh:dock-theme', syncTheme)
      window.removeEventListener('dsh:dock-palette', syncPalette)
    }
  }, [])
  const personal = selected === 'personal-prompt' || selected === 'memory'
  const sectionTitles = { appearance: 'dockSkins', models: 'dockModelCapabilities', usage: 'dockUsage', sessions: 'dockSessions' } as const
  const sectionTitle = sectionTitles[selected as keyof typeof sectionTitles]
  const paletteStyle = palette ? {
    '--dsw-alias-bg-layer-1': palette.background, '--dsw-alias-bg-layer-2': palette.background, '--dsw-alias-bg-layer-3': palette.background,
    '--dsw-alias-label-primary': palette.foreground, '--dsw-alias-label-secondary': palette.foreground,
    '--dsw-alias-brand-primary': palette.accent, '--dsw-alias-border-l2': palette.border,
  } as CSSProperties : undefined
  return <main className={css.page} style={paletteStyle} data-theme={theme} data-dsh-dock-settings={selected}>
    <p className={css.breadcrumb}>{t(selected === 'particle-theme' || selected === 'appearance' ? 'dockDesktopGroup' : 'dockAiGroup')} / {t(sectionTitle ?? (personal ? 'dockPersonal' : selected === 'value-mode' ? 'dockCollaboration' : selected === 'particle-theme' ? 'dockAppearance' : 'dockVision'))}</p>
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
        {sectionFor(id)
          ? <>{id === 'models' && renderSlot('web-ui.plugin.item', {}, { only: 'relay', fallback: <p role="status">{t('dockSettingUnavailable')}</p> })}
            {renderSlot('settings.section', { close: () => {} }, { only: sectionFor(id), fallback: <p role="status">{t('dockSettingUnavailable')}</p> })}</>
          : renderSlot('web-ui.plugin.item', {}, { only: id, fallback: <p role="status">{t('dockSettingUnavailable')}</p> })}
      </SafePluginBoundary>
    </section>)}
  </main>
}
