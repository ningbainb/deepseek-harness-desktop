import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ISessions, SessionBinding, SessionEventSource } from '@deepseek-ai/dsh-api-session-controller/client'
import {
  RELAY_PREFERRED_MODEL_ID,
  RELAY_PROVIDER_ID,
  RELAY_STATUS_PATH,
  type RelayStatusResponse,
} from '../relay-protocol.ts'
import type { RelayLocaleKey } from './locales.ts'
import { postRelay } from './relay-client.ts'
import { RELAY_SIGN_IN_REQUIRED_EVENT } from './relay-send-guard.ts'
import css from './relay-onboarding.module.css'

export type FallbackErrorKind = 'rate-limit' | 'quota' | 'timeout'

export interface FallbackErrorLike {
  code?: string
  status?: number
  message?: string
}

export interface FallbackDirectoryTarget {
  select(selection: { provider: string; model: string }): Promise<unknown>
}

export interface FallbackModelDirectories {
  directoryFor(sessionId: SessionBinding['sessionId']): FallbackDirectoryTarget
}

type Translate = (key: RelayLocaleKey) => string

const QUOTA_PATTERN = /insufficient|quota|balance|credit|billing|额度|余额/iu

export function classifyFallbackError(error: FallbackErrorLike | undefined): FallbackErrorKind | null {
  if (!error) return null
  if (error.status === 429 || error.code === 'RATE_LIMIT') return 'rate-limit'
  if (error.status === 402 || (typeof error.message === 'string' && QUOTA_PATTERN.test(error.message))) {
    return 'quota'
  }
  if (
    error.code === 'TIMEOUT'
    || error.code === 'SERVER'
    || error.status === 502
    || error.status === 503
    || error.status === 504
  ) {
    return 'timeout'
  }
  return null
}

function messageKeyFor(kind: FallbackErrorKind): RelayLocaleKey {
  switch (kind) {
    case 'rate-limit': return 'fallbackRateLimit'
    case 'quota': return 'fallbackQuota'
    case 'timeout': return 'fallbackTimeout'
  }
}

interface BannerState {
  sessionId: SessionBinding['sessionId']
  kind: FallbackErrorKind
  switched: boolean
}

function RelayErrorFallbackBanner({
  banner,
  t,
  busy,
  onSwitch,
  onDismiss,
}: {
  banner: BannerState
  t: Translate
  busy: boolean
  onSwitch: () => void
  onDismiss: () => void
}) {
  return (
    <div className={css.fallbackBanner} data-dsh-relay-fallback="true" role="status" aria-live="polite">
      <p className={css.fallbackCopy}>
        {banner.switched ? t('fallbackSwitched') : t(messageKeyFor(banner.kind))}
      </p>
      <div className={css.fallbackActions}>
        {!banner.switched && (
          <button type="button" className={css.primary} disabled={busy} onClick={onSwitch}>
            {t('fallbackAction')}
          </button>
        )}
        <button
          type="button"
          className={css.fallbackDismiss}
          aria-label={t('fallbackDismiss')}
          title={t('fallbackDismiss')}
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
    </div>
  )
}

function watchSessionErrors(
  source: SessionEventSource,
  onMatch: (kind: FallbackErrorKind) => void,
): () => void {
  let watermark = -1
  let provider: string | undefined
  const read = (notify: boolean) => {
    for (const entry of source.getSnapshot().entries) {
      if (entry.type !== 'event' || entry.event.seq <= watermark) continue
      const event = entry.event
      watermark = event.seq
      if (event.type === 'request/context') provider = event.data.provider
      if (event.type === 'request/header') provider = event.data.header.config.provider
      if (notify && provider && provider !== RELAY_PROVIDER_ID && event.type === 'turn/end' && event.data.reason.kind === 'error') {
        const kind = classifyFallbackError(event.data.reason.error as FallbackErrorLike)
        if (kind !== null) onMatch(kind)
      }
    }
  }
  read(false)
  return source.subscribe(() => read(true))
}

export function installRelayErrorFallback(
  sessions: ISessions,
  modelDirectories: FallbackModelDirectories,
  doc: Document,
  translate: Translate,
  readStatus: () => Promise<RelayStatusResponse> = () => postRelay<RelayStatusResponse>(RELAY_STATUS_PATH),
): () => void {
  if (!doc.body) return () => {}
  const container = doc.createElement('div')
  container.dataset.dshRelayFallbackRoot = 'true'
  doc.body.append(container)
  const root = createRoot(container)

  let disposed = false
  let current: BannerState | null = null
  let busy = false
  let autoHideTimer: ReturnType<typeof setTimeout> | undefined
  const dismissedSessions = new Set<string>()
  const watching = new Map<string, { binding: SessionBinding; dispose(): void }>()

  const clearTimer = () => {
    if (autoHideTimer !== undefined) {
      clearTimeout(autoHideTimer)
      autoHideTimer = undefined
    }
  }

  const renderBanner = () => {
    if (disposed) return
    if (current === null) {
      root.render(null)
      return
    }
    root.render(
      <FallbackController
        banner={current}
        t={translate}
        busy={busy}
        onSwitch={handleSwitch}
        onDismiss={handleDismiss}
      />,
    )
  }

  const handleDismiss = () => {
    clearTimer()
    if (current !== null) dismissedSessions.add(String(current.sessionId))
    current = null
    busy = false
    renderBanner()
  }

  const handleSwitch = () => {
    if (disposed || busy || current === null) return
    const targetSessionId = current.sessionId
    busy = true
    renderBanner()
    void readStatus().then(async status => {
      if (disposed) return
      if (status.configured && status.sync?.error !== 'relay-auth' && status.models.length > 0) {
        const preferred = status.models.find(model => model.id === RELAY_PREFERRED_MODEL_ID) ?? status.models[0]
        await modelDirectories.directoryFor(targetSessionId).select({
          provider: RELAY_PROVIDER_ID,
          model: preferred.id,
        })
        if (disposed) return
        current = { sessionId: targetSessionId, kind: current?.kind ?? 'rate-limit', switched: true }
        busy = false
        renderBanner()
        clearTimer()
        autoHideTimer = setTimeout(() => {
          if (!disposed) {
            current = null
            renderBanner()
          }
        }, 4000)
        return
      }
      current = null
      busy = false
      renderBanner()
      doc.dispatchEvent(new CustomEvent(RELAY_SIGN_IN_REQUIRED_EVENT, { detail: { source: 'error-fallback' } }))
    }).catch(() => {
      if (disposed) return
      current = null
      busy = false
      renderBanner()
      doc.dispatchEvent(new CustomEvent(RELAY_SIGN_IN_REQUIRED_EVENT, { detail: { source: 'error-fallback' } }))
    })
  }

  const reconcile = () => {
    const state = sessions.list.getSnapshot()
    for (const [id, watch] of watching) {
      if (!state.byId[id as SessionBinding['sessionId']] || sessions.binding(watch.binding.sessionId) !== watch.binding) {
        watch.dispose()
        watching.delete(id)
      }
    }
    for (const summary of Object.values(state.byId)) {
      const key = String(summary.id)
      const binding = sessions.binding(summary.id)
      if (binding && !watching.has(key)) {
        watching.set(key, {
          binding,
          dispose: watchSessionErrors(binding.eventSource, kind => {
            if (disposed || dismissedSessions.has(key)) return
            clearTimer()
            busy = false
            current = { sessionId: summary.id, kind, switched: false }
            renderBanner()
          }),
        })
      }
    }
  }

  reconcile()
  const unsubscribe = sessions.list.subscribe(reconcile)

  return () => {
    disposed = true
    clearTimer()
    unsubscribe()
    for (const watch of watching.values()) watch.dispose()
    watching.clear()
    root.unmount()
    container.remove()
  }
}

function FallbackController(props: {
  banner: BannerState
  t: Translate
  busy: boolean
  onSwitch: () => void
  onDismiss: () => void
}) {
  const [, setMounted] = useState(true)
  useEffect(() => () => setMounted(false), [])
  return <RelayErrorFallbackBanner {...props} />
}
