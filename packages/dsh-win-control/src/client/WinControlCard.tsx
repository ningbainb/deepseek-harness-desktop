import { useCallback, useEffect, useState } from 'react'
import {
  EXCLUDABLE_TOOLS,
  MIRROR_IDS,
  SCREENSHOT_BACKENDS,
  SCREENSHOT_SCALES,
  defaultSettings,
  type ExcludableTool,
  type MirrorChoice,
  type ScreenshotBackend,
  type ScreenshotScale,
  type WinControlSettings,
} from '../core/settings.ts'
import {
  cancelWinControlInstall,
  fetchWinControlState,
  probeWinControlMirrors,
  runWinControlDoctor,
  saveWinControlSettings,
  startWinControlInstall,
  type MirrorStatus,
  type WinControlStateResponse,
} from './api.ts'
import type { WinControlLocaleKey } from './locales.ts'
import css from './WinControl.module.css'

export interface WinControlCardProps {
  t: (key: WinControlLocaleKey) => string
}

function formatSpeed(bps?: number): string {
  if (!bps || bps <= 0) return '—'
  return bps >= 1024 * 1024
    ? `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
    : `${Math.max(1, Math.round(bps / 1024))} KB/s`
}

export function WinControlCard({ t }: WinControlCardProps) {
  const [state, setState] = useState<WinControlStateResponse | null>(null)
  const [draft, setDraft] = useState<WinControlSettings>(defaultSettings)
  const [mirrors, setMirrors] = useState<MirrorStatus[]>([])
  const [doctorReport, setDoctorReport] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await fetchWinControlState()
      setState(next)
      setDraft(next.settings)
      if (next.mirrors.length > 0) setMirrors(next.mirrors)
    } catch {
      setFeedback({ kind: 'err', text: t('saveError') })
    }
  }, [t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const running = state?.installer.state === 'probing' || state?.installer.state === 'installing'
    if (!running) return
    const timer = setInterval(() => {
      void fetchWinControlState().then((next) => {
        setState(next)
        if (next.installer.mirrors.length > 0) setMirrors(next.installer.mirrors)
      }).catch(() => {})
    }, 1000)
    return () => clearInterval(timer)
  }, [state?.installer.state])

  async function handleProbeMirrors() {
    setBusyAction('probe')
    setFeedback(null)
    try {
      const res = await probeWinControlMirrors()
      setMirrors(res.mirrors)
    } catch {
      setFeedback({ kind: 'err', text: t('saveError') })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleInstall() {
    setBusyAction('install')
    setFeedback(null)
    try {
      const res = await startWinControlInstall()
      setState(prev => (prev ? { ...prev, installer: res.installer } : prev))
    } catch {
      setFeedback({ kind: 'err', text: t('saveError') })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleCancelInstall() {
    try {
      const res = await cancelWinControlInstall()
      setState(prev => (prev ? { ...prev, installer: res.installer } : prev))
    } catch {}
  }

  async function handleDoctor() {
    setBusyAction('doctor')
    try {
      const res = await runWinControlDoctor()
      setDoctorReport(res.report)
    } catch {
      setFeedback({ kind: 'err', text: t('saveError') })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleSave() {
    setBusyAction('save')
    setFeedback(null)
    try {
      const res = await saveWinControlSettings(draft)
      setDraft(res.settings)
      setFeedback({ kind: 'ok', text: t('savedNotice') })
    } catch {
      setFeedback({ kind: 'err', text: t('saveError') })
    } finally {
      setBusyAction(null)
    }
  }

  function toggleExcludedTool(tool: ExcludableTool) {
    setDraft((prev) => {
      const exists = prev.bridge.excludeTools.includes(tool)
      const excludeTools = exists
        ? prev.bridge.excludeTools.filter(item => item !== tool)
        : [...prev.bridge.excludeTools, tool]
      return { ...prev, bridge: { ...prev.bridge, excludeTools } }
    })
  }

  const installing = state?.installer.state === 'probing' || state?.installer.state === 'installing'
  const ready = (state?.bridgedToolCount ?? 0) > 0
  const installed = (state?.installedVersions.length ?? 0) > 0
  const statusLabel = ready
    ? `${t('statusReady')} · ${state?.bridgedToolCount ?? 0} ${t('toolsMountedSuffix')}`
    : state && state.platform !== 'win32'
      ? t('statusNonWindows')
      : installed
        ? t('statusInstalledRestart')
        : t('statusNotInstalled')

  return (
    <section className={css.card} data-win-control-settings>
      <header className={css.header}>
        <div>
          <h3 className={css.title}>{t('cardTitle')}</h3>
          <p className={css.description}>{t('cardDescription')}</p>
        </div>
        <span className={css.statusPill} data-ready={ready ? 'true' : 'false'}>{statusLabel}</span>
      </header>

      <div className={css.toolbar}>
        {installing ? (
          <button type="button" className={css.btn} onClick={() => void handleCancelInstall()}>
            {t('cancelInstall')}
          </button>
        ) : (
          <button
            type="button"
            className={css.primaryBtn}
            disabled={busyAction !== null || (state !== null && state.platform !== 'win32')}
            onClick={() => void handleInstall()}
          >
            {installed ? t('reinstallAction') : t('installAction')}
          </button>
        )}
        <button type="button" className={css.btn} disabled={busyAction !== null} onClick={() => void handleProbeMirrors()}>
          {t('probeMirrors')}
        </button>
        <button type="button" className={css.btn} disabled={busyAction !== null} onClick={() => void handleDoctor()}>
          {t('runDoctor')}
        </button>
        <button type="button" className={css.btn} disabled={busyAction !== null} onClick={() => void refresh()}>
          {t('refresh')}
        </button>
      </div>

      {state?.installer.message && (
        <div className={css.box}>
          <strong>{state.installer.message}</strong>
          {state.installer.logs.length > 0 && (
            <pre className={css.pre}>{state.installer.logs.slice(-10).join('\n')}</pre>
          )}
        </div>
      )}

      {mirrors.length > 0 && (
        <div className={css.box}>
          <strong>{t('mirrorsTitle')}</strong>
          <pre className={css.pre}>
            {mirrors.map(m => (m.ok
              ? `${m.label}: ${formatSpeed(m.speedBps)} (${m.indexMs ?? '?'}ms, v${m.version ?? '?'})`
              : `${m.label}: 不可用 (${m.error ?? 'error'})`)).join('\n')}
          </pre>
        </div>
      )}

      {doctorReport && (
        <div className={css.box}>
          <strong>{t('doctorTitle')}</strong>
          <pre className={css.pre}>{doctorReport}</pre>
        </div>
      )}

      <div className={css.grid}>
        <label className={css.field}>
          <span>{t('preferredMirror')}</span>
          <select
            className={css.select}
            value={draft.plugin.preferredMirror}
            onChange={e => setDraft(prev => ({
              ...prev,
              plugin: { ...prev.plugin, preferredMirror: e.target.value as MirrorChoice },
            }))}
          >
            {MIRROR_IDS.map(id => (
              <option key={id} value={id}>{id === 'auto' ? t('mirrorAuto') : id}</option>
            ))}
          </select>
        </label>

        <label className={css.field}>
          <span>{t('screenshotScale')}</span>
          <select
            className={css.select}
            value={String(draft.bridge.screenshotScale)}
            onChange={e => setDraft(prev => ({
              ...prev,
              bridge: { ...prev.bridge, screenshotScale: Number(e.target.value) as ScreenshotScale },
            }))}
          >
            {SCREENSHOT_SCALES.map(scale => (
              <option key={scale} value={String(scale)}>{`${Math.round(scale * 100)}%`}</option>
            ))}
          </select>
        </label>

        <label className={css.field}>
          <span>{t('screenshotBackend')}</span>
          <select
            className={css.select}
            value={draft.bridge.screenshotBackend}
            onChange={e => setDraft(prev => ({
              ...prev,
              bridge: { ...prev.bridge, screenshotBackend: e.target.value as ScreenshotBackend },
            }))}
          >
            {SCREENSHOT_BACKENDS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>

        <label className={css.field}>
          <span>{t('timeoutLabel')}</span>
          <input
            type="number"
            className={css.input}
            min={5000}
            max={600000}
            step={5000}
            value={draft.bridge.toolCallTimeoutMs}
            onChange={e => setDraft(prev => ({
              ...prev,
              bridge: { ...prev.bridge, toolCallTimeoutMs: Number(e.target.value) },
            }))}
          />
        </label>
      </div>

      <div className={css.excludeGroup}>
        <span>{t('excludeToolsLabel')}:</span>
        {EXCLUDABLE_TOOLS.map(tool => (
          <label key={tool} className={css.checkRow}>
            <input
              type="checkbox"
              checked={draft.bridge.excludeTools.includes(tool)}
              onChange={() => toggleExcludedTool(tool)}
            />
            <span>{tool}</span>
          </label>
        ))}
      </div>

      <label className={css.checkRow}>
        <input
          type="checkbox"
          checked={draft.bridge.disableFlash}
          onChange={e => setDraft(prev => ({ ...prev, bridge: { ...prev.bridge, disableFlash: e.target.checked } }))}
        />
        <span>{t('disableFlash')}</span>
      </label>

      <label className={css.checkRow}>
        <input
          type="checkbox"
          checked={draft.plugin.lazyTools}
          onChange={e => setDraft(prev => ({ ...prev, plugin: { ...prev.plugin, lazyTools: e.target.checked } }))}
        />
        <span>{t('lazyTools')}</span>
      </label>

      <label className={css.checkRow}>
        <input
          type="checkbox"
          checked={draft.plugin.defaultGrant}
          onChange={e => setDraft(prev => ({ ...prev, plugin: { ...prev.plugin, defaultGrant: e.target.checked } }))}
        />
        <span>{t('defaultGrant')}</span>
      </label>

      <footer className={css.footer}>
        <div>
          {feedback && (
            <span className={feedback.kind === 'ok' ? css.notice : css.error}>{feedback.text}</span>
          )}
        </div>
        <button type="button" className={css.primaryBtn} disabled={busyAction !== null} onClick={() => void handleSave()}>
          {busyAction === 'save' ? t('saving') : t('saveSettings')}
        </button>
      </footer>
    </section>
  )
}
