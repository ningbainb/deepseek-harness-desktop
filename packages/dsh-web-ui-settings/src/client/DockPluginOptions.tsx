import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { SafePluginBoundary } from './SafePluginBoundary.tsx'
import css from './dock-settings.module.css'

export interface PluginOptionsDirectory {
  keys(): string[]
  subscribe(listener: () => void): () => void
}

export function pluginOptionsKeys(keys: readonly string[], plugin?: string): string[] {
  return [...new Set(keys.filter(key => typeof key === 'string' && key.includes('#') && (!plugin || key.startsWith(`${plugin}#`))))].sort()
}

export function DockPluginOptions({ directory, plugin, renderSlot, t }: {
  directory?: PluginOptionsDirectory
  plugin?: string
} & PropsRenderSlots<'plugins.row.config'> & PropsLocale<'web-ui-plugins'>) {
  const [keys, setKeys] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [visited, setVisited] = useState<string[]>([])
  useEffect(() => {
    const update = () => setKeys(pluginOptionsKeys(directory?.keys() ?? [], plugin))
    update()
    return directory?.subscribe(update)
  }, [directory, plugin])
  const active = keys.includes(selected) ? selected : keys[0]
  useEffect(() => {
    if (active) setVisited(previous => previous.includes(active) ? previous : [...previous, active])
  }, [active])
  return <div>
    <h1 className={css.heading}>{t('dockPluginOptions')}</h1>
    {plugin && <p>{plugin}</p>}
    <p>{t('pluginOptionsDescription')}</p>
    {!active ? <p role="status">{t('pluginOptionsUnavailable')}</p> : <>
      <label>{t('pluginOptionsEntry')} <select value={active} onChange={event => setSelected(event.target.value)}>
        {keys.map(key => <option key={key} value={key}>{key}</option>)}
      </select></label>
      {visited.filter(key => keys.includes(key)).map(key => <section key={key} hidden={key !== active} data-dsh-plugin-options={key}>
        <SafePluginBoundary pluginName={key} fallback={<p role="alert">{t('dockSettingUnavailable')}</p>}>
          {renderSlot('plugins.row.config', { view: 'page' }, { entryKey: key, fallback: <p role="status">{t('pluginOptionsUnavailable')}</p> })}
        </SafePluginBoundary>
      </section>)}
    </>}
  </div>
}
