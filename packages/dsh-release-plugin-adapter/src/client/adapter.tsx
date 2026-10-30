/** Desktop settings links and an independent companion display preference. */
import type { Context } from '@deepseek-ai/cordis'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { useState, useSyncExternalStore } from 'react'
import { NS, zh, en, type LocaleKey } from './locales.ts'
import { VISIBILITY_KEY, readVisible, writeVisible, installVisibility, companionVisibleInDocument, notifyCompanionLifecycle } from './visibility.ts'
import { openPluginSettings } from './settings-navigation.ts'
import css from './adapter.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'release-plugin-adapter': LocaleKey }
}
interface DisplayPreference {
  getSnapshot(): boolean
  subscribe(listener: () => void): () => void
  set(value: boolean): boolean
}
type PanelProps = PropsLocale<typeof NS> & { preference: DisplayPreference }

/** The existing suggestion marker controls CSS visibility within this session. */
function PredictionShortcut({ t }: PropsLocale<typeof NS>) {
  return <span className={css.predictionHint} data-dsh-prompt-shortcut="" role="note">{t('predictionShortcut')}</span>
}

export function ReleasePluginsPanel({ t, preference }: PanelProps) {
  const visible = useSyncExternalStore(preference.subscribe, preference.getSnapshot)
  const [savingError, setSavingError] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const open = async (owner: '@local/dsh-prompt-pilot' | 'dsh-builtin-browser') => {
    try { await openPluginSettings(owner, window); setUnavailable(false) }
    catch { setUnavailable(true) }
  }
  return <div className={css.panel}>
    <div className={css.actions}>
      <button type="button" onClick={() => { void open('@local/dsh-prompt-pilot') }}>{t('prompt')}</button>
      <button type="button" onClick={() => { void open('dsh-builtin-browser') }}>{t('browser')}</button>
    </div>
    <p className={css.notice}>{t('predictionHelp')}</p>
    {unavailable && <p role="alert">{t('unavailable')}</p>}
    <section className={css.section}><h3>{t('fish')}</h3>
      <label className={css.control}><input type="checkbox" checked={visible} onChange={event => setSavingError(!preference.set(event.currentTarget.checked))} />{t('visible')}</label>
      <p className={css.notice}>{t('displayHelp')}</p><p className={css.notice}>{t('hiddenHelp')}</p>
      {savingError && <p role="alert">{t('storageError')}</p>}
    </section>
  </div>
}

export const inject = ['slots', 'locale']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'release plugins: dictionaries')
  const storage = {
    getItem: (key: string) => window.localStorage.getItem(key),
    setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
  }
  let visible = readVisible(storage)
  const display = installVisibility(document.documentElement, companionVisibleInDocument(visible, window.location.search))
  notifyCompanionLifecycle(window, companionVisibleInDocument(visible, window.location.search))
  const listeners = new Set<() => void>()
  const update = (next: boolean) => {
    visible = next
    const active = companionVisibleInDocument(next, window.location.search)
    display.set(active)
    notifyCompanionLifecycle(window, active)
    for (const listener of listeners) listener()
  }
  const preference: DisplayPreference = {
    getSnapshot: () => visible,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    set(next) { update(next); return writeVisible(storage, next) },
  }
  ctx.effect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === VISIBILITY_KEY || event.key === null) update(readVisible(storage)) }
    window.addEventListener('storage', onStorage)
    return () => { window.removeEventListener('storage', onStorage); notifyCompanionLifecycle(window, false); display.dispose(); listeners.clear() }
  }, 'release plugins: companion display')
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'release-plugin-adapter', order: 63, locale: NS,
    label: () => ctx.locale.bind(NS)('title'), inject: () => ({ preference }),
  }, ReleasePluginsPanel))
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock', id: 'release-prediction-shortcut', order: 90, locale: NS,
  }, PredictionShortcut))
}
