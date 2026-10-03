import { useCallback, useState, useSyncExternalStore } from 'react'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { CommunityPluginsCard } from './CommunityPluginsCard.tsx'
import type { CommunityPluginKey } from './locales.ts'

export function CommunityPluginsSettingsCard({ settingsScope, t }: {
  settingsScope: ConfigForm<{ enabled?: boolean }>
  t: (key: CommunityPluginKey) => string
}) {
  const subscribe = useCallback((listener: () => void) => settingsScope.subscribe(listener), [settingsScope])
  const getSnapshot = useCallback(() => settingsScope.getSnapshot(), [settingsScope])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const enabled = snapshot.status === 'ready' && snapshot.value?.enabled !== false
  const changeEnabled = async (value: boolean) => {
    setFailed(false)
    setSaving(true)
    try {
      if (!await settingsScope.set('enabled', value)) setFailed(true)
    } catch { setFailed(true) }
    finally { setSaving(false) }
  }
  return <div data-dsh-community-settings>
    <label><input type="checkbox" checked={enabled} disabled={snapshot.status !== 'ready' || !snapshot.writable || saving}
      onChange={event => { void changeEnabled(event.target.checked) }} />{t('enabled')}</label>
    {snapshot.status !== 'ready' && <p role="status">{t('unavailable')}</p>}
    {snapshot.status === 'ready' && !snapshot.writable && <p role="status">{t('readonly')}</p>}
    {failed && <p role="alert">{t('saveFailed')}</p>}
    <CommunityPluginsCard t={t} enabled={enabled} />
  </div>
}
