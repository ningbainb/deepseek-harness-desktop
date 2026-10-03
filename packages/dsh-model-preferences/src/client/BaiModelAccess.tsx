import { useEffect, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import styles from './model-preferences.module.css'

export function BaiModelAccess({ t: translate, className, compact = true }: PropsLocale<'model-preferences'> & { className?: string; compact?: boolean }) {
  const present = () => typeof document !== 'undefined' && document.querySelector('[data-dsh-relay-access-root]') !== null
  const [available, setAvailable] = useState(present)
  useEffect(() => {
    const update = () => setAvailable(present())
    document.addEventListener('dsh-relay-access-changed', update)
    update()
    return () => document.removeEventListener('dsh-relay-access-changed', update)
  }, [])
  if (!available) return null
  return <button type="button" className={className ?? styles.smallButton} data-dsh-relay-connect="true" aria-label={translate('action.bai')} title={translate('action.bai')}>{translate(compact ? 'action.baiCompact' : 'action.bai')}</button>
}
