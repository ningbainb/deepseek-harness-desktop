import { useEffect, useRef, useState } from 'react'
import css from './work-mode.module.css'
import type { WorkModeLocaleKey } from './locales.ts'

export interface ConnectorWizardItem {
  entry: {
    id: string
    name: { zh: string; en: string }
    summary: { zh: string; en: string }
    maintainer: 'official' | 'community'
    officialUrls: { repo?: string; docs: string; openPlatform?: string }
    drivers: Array<{
      kind: 'cli' | 'mcp-remote' | 'mcp-stdio' | 'skill'
      id: string
      binary?: string
      url?: string
    }>
    auth: {
      mode: string
      quickAuthUrl?: string
      manualUrl?: string
      guideSteps: { zh: string[]; en: string[] }
      requiresEnterpriseAdmin?: boolean
      paidTierNote?: { zh: string; en: string }
      cliLoginCommand?: string[]
      fields?: Array<{
        key: string
        label: { zh: string; en: string }
        fieldType: 'text' | 'password' | 'url'
        required: boolean
        secret: boolean
        placeholder?: { zh: string; en: string }
      }>
    }
  }
  config: {
    enabled: boolean
    selectedDriverId?: string
    customBinaryPath?: string
    activeProfileId: string
    profiles: Record<string, { nonSecretFields?: Record<string, string> }>
    consentAccepted?: boolean
  }
  status: string
  activeDriver: { kind: string; id: string }
  hasSecrets?: Record<string, boolean>
  diagnostic?: {
    friendlyCause?: { zh: string; en: string }
    friendlyFix?: { zh: string; en: string }
    rawError?: string
  }
}

export interface InstallResultState {
  ok: boolean
  skipped?: boolean
  installed: boolean
  binaryPath?: string
  version?: string
  fallbackUrl?: string
  friendlyError?: { zh: string; en: string }
  rawError?: string
}

export interface LoginSessionState {
  connectorId: string
  kind: 'web-token' | 'cli-browser'
  state: 'awaiting_user' | 'pending' | 'succeeded' | 'failed'
  authUrl?: string
  deviceCode?: string
  fallbackUrl?: string
  needsTokenInput?: boolean
  message?: { zh: string; en: string }
  rawOutput?: string
}

export interface ConnectorWizardDialogProps {
  item: ConnectorWizardItem | undefined
  locale: 'zh' | 'en'
  t: (key: WorkModeLocaleKey) => string
  busy: boolean
  envResult?: { installed: boolean; binaryPath?: string; version?: string; note?: string }
  installResult?: InstallResultState
  loginSession?: LoginSessionState
  onClose: () => void
  onOpenUrl: (url: string) => void
  onDetectEnv: (connectorId: string) => Promise<void>
  onInstall: (connectorId: string) => Promise<void>
  onStartLogin: (connectorId: string) => Promise<void>
  onPollLoginStatus: (connectorId: string) => Promise<LoginSessionState | undefined>
  onConfigureAndVerify: (connectorId: string, patch: {
    enabled: boolean
    selectedDriverId: string
    customBinaryPath: string
    nonSecretFields: Record<string, string>
    secretFields: Record<string, string>
    consentAccepted: boolean
  }) => Promise<void>
  onDisconnect: (connectorId: string) => Promise<void>
  onStartExampleTask: (connectorId: string) => void
}

function fmt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/gu, (_, key) => vars[key] ?? '')
}

export function ConnectorWizardDialog({
  item,
  locale,
  t,
  busy,
  envResult,
  installResult,
  loginSession,
  onClose,
  onOpenUrl,
  onDetectEnv,
  onInstall,
  onStartLogin,
  onPollLoginStatus,
  onConfigureAndVerify,
  onDisconnect,
  onStartExampleTask,
}: ConnectorWizardDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [driverId, setDriverId] = useState('')
  const [customPath, setCustomPath] = useState('')
  const [consentAccepted, setConsentAccepted] = useState(true)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [copiedCmd, setCopiedCmd] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (item && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    } else if (!item && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
    }
  }, [item])

  useEffect(() => {
    if (!item) return
    setDriverId(item.config.selectedDriverId ?? item.entry.drivers[0]?.id ?? '')
    setCustomPath(item.config.customBinaryPath ?? '')
    setConsentAccepted(item.config.consentAccepted ?? true)
    const profile = item.config.profiles?.[item.config.activeProfileId || 'default']
    setFieldValues({ ...(profile?.nonSecretFields ?? {}) })
    setCopiedCmd(false)
    setCopiedCode(false)
    const firstDriver = item.entry.drivers.find(d => d.id === item.config.selectedDriverId) ?? item.entry.drivers[0]
    if (firstDriver?.kind !== 'mcp-remote') {
      void onDetectEnv(item.entry.id)
    }
  }, [item?.entry.id])

  useEffect(() => {
    if (!item || loginSession?.connectorId !== item.entry.id || loginSession.state !== 'pending') return
    const timer = setInterval(() => {
      void onPollLoginStatus(item.entry.id)
    }, 1500)
    return () => clearInterval(timer)
  }, [item?.entry.id, loginSession?.connectorId, loginSession?.state])

  if (!item) return <dialog ref={dialogRef} className={css.wizardDialog} />

  const lang = locale === 'zh' ? 'zh' : 'en'
  const name = item.entry.name[lang]
  const selectedDriver = item.entry.drivers.find(d => d.id === driverId) ?? item.entry.drivers[0]
  const isRemote = selectedDriver?.kind === 'mcp-remote'
  const loginCommand = item.entry.auth.cliLoginCommand?.join(' ')

  const isInstalled = isRemote || Boolean(envResult?.installed || installResult?.installed)
  const isConnected = item.status === 'connected'
  const currentStep: 'install' | 'auth' | 'ready' = isConnected
    ? 'ready'
    : !isInstalled
      ? 'install'
      : 'auth'

  const nonSecretFields: Record<string, string> = {}
  const secretFields: Record<string, string> = {}
  for (const field of item.entry.auth.fields ?? []) {
    const val = fieldValues[field.key]
    if (typeof val !== 'string') continue
    if (field.secret) {
      if (val.trim().length > 0) secretFields[field.key] = val.trim()
    } else {
      nonSecretFields[field.key] = val
    }
  }

  const missingRequiredField = (item.entry.auth.fields ?? []).some((field) => {
    if (!field.required) return false
    const typed = fieldValues[field.key]?.trim()
    if (typed) return false
    if (field.secret && item.hasSecrets?.[field.key]) return false
    return true
  })

  return <dialog ref={dialogRef} className={css.wizardDialog} aria-labelledby="work-mode-wizard-title" onCancel={(e) => { e.preventDefault(); onClose() }}>
    <div className={css.wizardBody}>
      <div className={css.wizardHeader}>
        <div className={css.wizardTitleCopy}>
          <h2 id="work-mode-wizard-title">{name}</h2>
          <p className={css.cardSummary}>{item.entry.summary[lang]}</p>
        </div>
        <button type="button" className={css.iconBtn} aria-label={t('close')} onClick={onClose}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className={css.stepper} aria-label={name}>
        {!isRemote && <>
          <div className={css.stepItem} data-step-state={currentStep === 'install' ? 'active' : 'done'}>
            <span className={css.stepNum}>{currentStep === 'install' ? '1' : 'ok'}</span>
            <span>{t('stepLabelInstall')}</span>
          </div>
          <span className={css.stepSep} aria-hidden="true" />
        </>}
        <div className={css.stepItem} data-step-state={currentStep === 'auth' ? 'active' : currentStep === 'ready' ? 'done' : 'pending'}>
          <span className={css.stepNum}>{isRemote ? '1' : '2'}</span>
          <span>{t('stepLabelAuth')}</span>
        </div>
        <span className={css.stepSep} aria-hidden="true" />
        <div className={css.stepItem} data-step-state={currentStep === 'ready' ? 'active' : 'pending'}>
          <span className={css.stepNum}>{isRemote ? '2' : '3'}</span>
          <span>{t('stepLabelReady')}</span>
        </div>
      </div>

      {currentStep === 'install' && <div className={css.stepPanel}>
        <p>{fmt(t('installPrompt'), { name })}</p>
        {installResult?.friendlyError && <div className={css.callout} data-tone="warn" role="alert">
          <span>{installResult.friendlyError[lang]}</span>
        </div>}
        <div className={css.heroActions}>
          <button
            type="button"
            className={css.primaryBtn}
            disabled={busy}
            onClick={() => void onInstall(item.entry.id)}
          >
            {busy ? t('installingComponent') : t('oneClickInstall')}
          </button>
          {installResult?.fallbackUrl && <>
            <button type="button" className={css.secondaryBtn} onClick={() => onOpenUrl(installResult.fallbackUrl!)}>
              {t('openDownloadPage')}
            </button>
            <button type="button" className={css.quietBtn} disabled={busy} onClick={() => void onDetectEnv(item.entry.id)}>
              {t('recheckEnv')}
            </button>
          </>}
        </div>
        {installResult?.rawError && <details className={css.rawDetails}>
          <summary>{t('rawLogLabel')}</summary>
          <pre className={css.rawLog}>{installResult.rawError}</pre>
        </details>}
      </div>}

      {currentStep === 'auth' && <div className={css.stepPanel}>
        {!isRemote && <div className={css.callout} data-tone="success">
          <span>{t('envReady')}{envResult?.version ? ` (${envResult.version})` : ''}</span>
        </div>}
        <p>{fmt(t(item.entry.auth.mode === 'cli-native' ? 'authPromptCli' : 'authPromptWeb'), { name })}</p>

        {item.entry.auth.requiresEnterpriseAdmin && <div className={css.callout} data-tone="warn">
          <span>{t('adminRequired')}</span>
        </div>}

        {item.entry.auth.paidTierNote && <div className={css.callout}>
          <span>{item.entry.auth.paidTierNote[lang]}</span>
        </div>}

        <div className={css.heroActions}>
          <button
            type="button"
            className={css.primaryBtn}
            disabled={busy}
            onClick={() => void onStartLogin(item.entry.id)}
          >
            {fmt(t(loginSession?.authUrl ? 'reopenWebLogin' : 'openWebLogin'), { name })}
          </button>
          {item.entry.auth.manualUrl && <button type="button" className={css.quietBtn} onClick={() => onOpenUrl(item.entry.auth.manualUrl!)}>
            {t('openManualPage')}
          </button>}
        </div>

        {loginSession?.state === 'pending' && <div className={css.callout}>
          <span>{t('waitingWebLogin')}</span>
          {loginSession.authUrl && <button type="button" className={css.quietBtn} style={{ justifySelf: 'start', padding: '0 4px' }} onClick={() => onOpenUrl(loginSession.authUrl!)}>
            {t('reopenWebLogin')}
          </button>}
        </div>}

        {loginSession?.state === 'awaiting_user' && <div className={css.callout}>
          <span>{loginSession.message?.[lang] ?? t('waitingWebLogin')}</span>
          {loginSession.authUrl && <button type="button" className={css.quietBtn} style={{ justifySelf: 'start', padding: '0 4px' }} onClick={() => onOpenUrl(loginSession.authUrl!)}>
            {t('reopenWebLogin')}
          </button>}
        </div>}

        {loginSession?.state === 'failed' && <div className={css.callout} data-tone="error" role="alert">
          <span>{loginSession.message?.[lang] ?? t('troubleshootingCause')}</span>
          {loginSession.fallbackUrl && <button type="button" className={css.quietBtn} style={{ justifySelf: 'start', padding: '0 4px' }} onClick={() => onOpenUrl(loginSession.fallbackUrl!)}>
            {t('openManualPage')}
          </button>}
          {loginSession.rawOutput && <details className={css.rawDetails}>
            <summary>{t('rawLogLabel')}</summary>
            <pre className={css.rawLog}>{loginSession.rawOutput}</pre>
          </details>}
        </div>}

        {loginSession?.deviceCode && <div className={css.codeBadgeRow}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>{t('deviceCodeLabel')}</div>
            <code className={css.deviceCode}>{loginSession.deviceCode}</code>
          </div>
          <button type="button" className={css.secondaryBtn} onClick={() => {
            void navigator.clipboard?.writeText(loginSession.deviceCode!).then(() => setCopiedCode(true)).catch(() => {})
          }}>{copiedCode ? t('copied') : t('copyCode')}</button>
        </div>}

        {(item.entry.auth.fields ?? []).map(field => <label key={field.key} className={css.field}>
          <span>{field.label[lang]}{field.required ? ' *' : ''}</span>
          <input
            type={field.fieldType}
            value={fieldValues[field.key] ?? ''}
            placeholder={field.secret && item.hasSecrets?.[field.key] ? t('savedSecretHint') : (field.placeholder?.[lang] ?? (field.secret ? t('tokenInputPlaceholder') : undefined))}
            onChange={e => setFieldValues(prev => ({ ...prev, [field.key]: e.target.value }))}
          />
        </label>)}

        {item.diagnostic?.friendlyCause && <div className={css.callout} data-tone="error" role="alert">
          <strong>{t('troubleshootingCause')}: {item.diagnostic.friendlyCause[lang]}</strong>
          {item.diagnostic.friendlyFix && <span>{t('troubleshootingFix')}: {item.diagnostic.friendlyFix[lang]}</span>}
        </div>}

        <label className={css.consentRow}>
          <input type="checkbox" checked={consentAccepted} onChange={e => setConsentAccepted(e.target.checked)} />
          <span>{t('privacyNotice')} {t('privacyConsent')}</span>
        </label>

        {(item.entry.auth.fields?.length || item.entry.auth.mode !== 'cli-native') && <div>
          <button
            type="button"
            className={css.secondaryBtn}
            disabled={busy || !consentAccepted || missingRequiredField}
            onClick={() => void onConfigureAndVerify(item.entry.id, {
              enabled: true,
              selectedDriverId: driverId,
              customBinaryPath: customPath,
              nonSecretFields,
              secretFields,
              consentAccepted,
            })}
          >
            {busy ? t('checking') : t('saveAndEnable')}
          </button>
        </div>}
      </div>}

      {currentStep === 'ready' && <div className={css.stepPanel}>
        <div className={css.callout} data-tone="success">
          <strong>{fmt(t('readyHeadline'), { name })}</strong>
          <span>{t('readyHint')}</span>
        </div>
        <div className={css.heroActions}>
          <button type="button" className={css.primaryBtn} onClick={() => onStartExampleTask(item.entry.id)}>
            {fmt(t('startTaskWithService'), { name })}
          </button>
          <button type="button" className={css.secondaryBtn} disabled={busy} onClick={() => void onDisconnect(item.entry.id)}>
            {t('disconnect')}
          </button>
        </div>
      </div>}

      <details className={css.advancedBox}>
        <summary className={css.advancedSummary}>
          <span>{t('advancedTitle')}</span>
          <svg className={css.chevron} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </summary>
        <div className={css.advancedContent}>
          {loginCommand && <div className={css.commandBar}>
            <code className={css.commandCode}>$ {loginCommand}</code>
            <button type="button" className={css.quietBtn} onClick={() => {
              void navigator.clipboard?.writeText(loginCommand).then(() => setCopiedCmd(true)).catch(() => {})
            }}>{copiedCmd ? t('copied') : t('copyCommand')}</button>
          </div>}
          {item.entry.drivers.length > 1 && <label className={css.field}>
            <span>{t('driverLabel')}</span>
            <select value={driverId} onChange={e => setDriverId(e.target.value)}>
              {item.entry.drivers.map(d => <option key={d.id} value={d.id}>{d.kind}: {d.id}</option>)}
            </select>
          </label>}
          {!isRemote && <label className={css.field}>
            <span>{t('binaryPathLabel')}</span>
            <input value={customPath} placeholder={t('binaryPathPlaceholder')} onChange={e => setCustomPath(e.target.value)} />
          </label>}
          <div className={css.heroActions}>
            {!isRemote && <button type="button" className={css.secondaryBtn} disabled={busy} onClick={() => void onDetectEnv(item.entry.id)}>
              {t('recheckEnv')}
            </button>}
            {item.entry.officialUrls.repo && <button type="button" className={css.quietBtn} onClick={() => onOpenUrl(item.entry.officialUrls.repo!)}>
              {t('openRepo')}
            </button>}
          </div>
          {(item.diagnostic?.rawError || (currentStep !== 'install' && installResult?.rawError) || (loginSession?.state !== 'failed' && loginSession?.rawOutput)) && <details className={css.rawDetails}>
            <summary>{t('rawLogLabel')}</summary>
            <pre className={css.rawLog}>{item.diagnostic?.rawError || (currentStep !== 'install' ? installResult?.rawError : undefined) || loginSession?.rawOutput}</pre>
          </details>}
        </div>
      </details>

      <div className={css.wizardFooter}>
        <div>
          {(item.config.enabled || item.status === 'connected') && currentStep !== 'ready' && (
            <button type="button" className={css.quietBtn} disabled={busy} onClick={() => void onDisconnect(item.entry.id)}>{t('disconnect')}</button>
          )}
        </div>
        <button type="button" className={css.secondaryBtn} onClick={onClose}>{t('close')}</button>
      </div>
    </div>
  </dialog>
}
