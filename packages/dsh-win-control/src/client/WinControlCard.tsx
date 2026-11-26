import { useCallback, useEffect, useMemo, useState } from 'react'
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

interface ParsedDoctor {
  metrics: Array<{ key: string; value: string }>
  notes: string[]
}

function formatSpeed(bps?: number): string {
  if (!bps || bps <= 0) return '—'
  return bps >= 1024 * 1024
    ? `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
    : `${Math.max(1, Math.round(bps / 1024))} KB/s`
}

function parseDoctorReport(raw: string): ParsedDoctor {
  const metrics: Array<{ key: string; value: string }> = []
  const notes: string[] = []
  let inNotes = false
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed === '诊断提示:' || trimmed === 'Diagnostics:') {
      inNotes = true
      continue
    }
    if (inNotes || trimmed.startsWith('- ')) {
      notes.push(trimmed.replace(/^-\s*/, ''))
      continue
    }
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx > 0) {
      metrics.push({
        key: trimmed.slice(0, colonIdx).trim(),
        value: trimmed.slice(colonIdx + 1).trim(),
      })
    } else {
      notes.push(trimmed)
    }
  }
  return { metrics, notes }
}

function scaleLabel(scale: ScreenshotScale, t: (key: WinControlLocaleKey) => string): string {
  switch (scale) {
    case 0.25: return t('scale25')
    case 0.5: return t('scale50')
    case 0.75: return t('scale75')
    case 1: return t('scale100')
  }
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
    setFeedback(null)
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
      setState(prev => (prev ? { ...prev, settings: res.settings } : prev))
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
  const statusState = ready ? 'ready' : installed ? 'installed' : 'pending'
  const statusLabel = ready
    ? `${t('statusReady')} · ${state?.bridgedToolCount ?? 0} ${t('toolsMountedSuffix')}`
    : state && state.platform !== 'win32'
      ? t('statusNonWindows')
      : installed
        ? t('statusInstalledRestart')
        : t('statusNotInstalled')

  const isDirty = state !== null && JSON.stringify(draft) !== JSON.stringify(state.settings)
  const parsedDoctor = useMemo(() => (doctorReport ? parseDoctorReport(doctorReport) : null), [doctorReport])
  const okMirrors = useMemo(() => mirrors.filter(m => m.ok), [mirrors])
  const failedMirrors = useMemo(() => mirrors.filter(m => !m.ok), [mirrors])
  const fastestMirrorId = okMirrors[0]?.id

  return (
    <section className={css.card} data-win-control-settings>
      <header className={css.hero}>
        <div className={css.heroText}>
          <div className={css.titleRow}>
            <h3 className={css.title}>{t('cardTitle')}</h3>
            <span className={css.statusPill} data-state={statusState} data-ready={ready ? 'true' : 'false'}>
              <span className={css.statusDot} aria-hidden="true" />
              <span>{statusLabel}</span>
            </span>
          </div>
          <p className={css.description}>{t('cardDescription')}</p>
        </div>

        <div className={css.heroActions}>
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
        </div>
      </header>

      <div className={css.stepsRail}>
        <div className={css.stepItem} data-done={installed || ready ? 'true' : 'false'}>
          <span className={css.stepTitle}>{t('step1Title')}</span>
          <span className={css.stepDesc}>{t('step1Desc')}</span>
        </div>
        <div className={css.stepItem} data-done={doctorReport ? 'true' : 'false'}>
          <span className={css.stepTitle}>{t('step2Title')}</span>
          <span className={css.stepDesc}>{t('step2Desc')}</span>
        </div>
        <div className={css.stepItem} data-done={ready ? 'true' : 'false'}>
          <span className={css.stepTitle}>{t('step3Title')}</span>
          <span className={css.stepDesc}>{t('step3Desc')}</span>
        </div>
      </div>

      <div className={css.actionStrip}>
        <button type="button" className={css.btn} disabled={busyAction !== null} onClick={() => void handleDoctor()}>
          {t('runDoctor')}
        </button>
        <button type="button" className={css.btn} disabled={busyAction !== null} onClick={() => void handleProbeMirrors()}>
          {t('probeMirrors')}
        </button>
        <button type="button" className={css.btn} disabled={busyAction !== null} onClick={() => void refresh()}>
          {t('refresh')}
        </button>
      </div>

      {state?.installer.message && (
        <div className={css.panelBox}>
          <div className={css.panelHeader}><span>{state.installer.message}</span></div>
          {state.installer.logs.length > 0 && (
            <pre className={css.pre}>{state.installer.logs.slice(-8).join('\n')}</pre>
          )}
        </div>
      )}

      {mirrors.length > 0 && (
        <div className={css.panelBox}>
          <div className={css.panelHeader}><span>{t('mirrorsTitle')}</span></div>
          <div className={css.mirrorTable}>
            {okMirrors.map(m => (
              <div key={m.id} className={css.mirrorRow} data-fastest={m.id === fastestMirrorId ? 'true' : 'false'}>
                <span className={css.mirrorName}>
                  <span>{m.label}</span>
                  {m.id === fastestMirrorId && <span className={css.fastestTag}>{t('fastestBadge')}</span>}
                </span>
                <span className={css.mirrorMeta}>v{m.version ?? '?'}</span>
                <span className={css.mirrorMeta}>{m.indexMs ?? '?'}ms</span>
                <span className={css.mirrorSpeed}>{formatSpeed(m.speedBps)}</span>
              </div>
            ))}
          </div>
          {failedMirrors.length > 0 && (
            <div className={css.mirrorMuted}>
              {t('unavailableLabel')}: {failedMirrors.map(m => m.label).join(' / ')}
            </div>
          )}
        </div>
      )}

      {doctorReport && parsedDoctor && (
        <div className={css.panelBox} data-win-control-doctor>
          <div className={css.panelHeader}><span>{t('doctorTitle')}</span></div>
          <div className={css.doctorGrid}>
            {parsedDoctor.metrics.map(item => (
              <div key={item.key} className={css.doctorMetric}>
                <div className={css.doctorKey}>{item.key}</div>
                <div className={css.doctorVal}>{item.value}</div>
              </div>
            ))}
          </div>
          {parsedDoctor.notes.length > 0 && (
            <div className={css.calloutAmber}>
              {parsedDoctor.notes.map((note, idx) => <div key={idx}>{note}</div>)}
            </div>
          )}
          <pre className={css.pre} hidden>{doctorReport}</pre>
        </div>
      )}

      <div className={css.sectionBlock}>
        <div className={css.sectionHeading}>{t('coreSectionTitle')}</div>

        <div className={css.settingRowColumn}>
          <div className={css.rowText}>
            <div className={css.rowTitle}>{t('screenshotScale')}</div>
            <div className={css.rowDesc}>{t('screenshotScaleDesc')}</div>
          </div>
          <div className={css.segmented} role="group" aria-label={t('screenshotScale')}>
            {SCREENSHOT_SCALES.map(scale => (
              <button
                key={scale}
                type="button"
                className={css.segBtn}
                data-win-scale={String(scale)}
                aria-pressed={draft.bridge.screenshotScale === scale}
                onClick={() => setDraft(prev => ({
                  ...prev,
                  bridge: { ...prev.bridge, screenshotScale: scale },
                }))}
              >
                {scaleLabel(scale, t)}
              </button>
            ))}
          </div>
        </div>

        <div className={css.settingRow}>
          <div className={css.rowText}>
            <div className={css.rowTitle}>{t('lazyTools')}</div>
            <div className={css.rowDesc}>{t('lazyToolsDesc')}</div>
          </div>
          <label className={css.switchControl}>
            <input
              type="checkbox"
              role="switch"
              aria-label={t('lazyTools')}
              className={css.switchInput}
              checked={draft.plugin.lazyTools}
              onChange={e => setDraft(prev => ({ ...prev, plugin: { ...prev.plugin, lazyTools: e.target.checked } }))}
            />
            <span className={css.switchTrack} aria-hidden="true" />
          </label>
        </div>

        <div className={css.settingRow}>
          <div className={css.rowText}>
            <div className={css.rowTitle}>{t('disableFlash')}</div>
            <div className={css.rowDesc}>{t('disableFlashDesc')}</div>
          </div>
          <label className={css.switchControl}>
            <input
              type="checkbox"
              role="switch"
              aria-label={t('disableFlash')}
              className={css.switchInput}
              checked={draft.bridge.disableFlash}
              onChange={e => setDraft(prev => ({ ...prev, bridge: { ...prev.bridge, disableFlash: e.target.checked } }))}
            />
            <span className={css.switchTrack} aria-hidden="true" />
          </label>
        </div>

        <div className={css.settingRow}>
          <div className={css.rowText}>
            <div className={css.rowTitle}>{t('defaultGrant')}</div>
            <div className={css.rowDesc}>{t('defaultGrantDesc')}</div>
          </div>
          <label className={css.switchControl}>
            <input
              type="checkbox"
              role="switch"
              aria-label={t('defaultGrant')}
              className={css.switchInput}
              checked={draft.plugin.defaultGrant}
              onChange={e => setDraft(prev => ({ ...prev, plugin: { ...prev.plugin, defaultGrant: e.target.checked } }))}
            />
            <span className={css.switchTrack} aria-hidden="true" />
          </label>
        </div>
      </div>

      <details className={css.disclosure}>
        <summary className={css.disclosureSummary}>{t('advancedSectionTitle')}</summary>
        <div className={css.disclosureBody}>
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

          <div className={css.chipGroup}>
            <span>{t('excludeToolsLabel')}:</span>
            {EXCLUDABLE_TOOLS.map(tool => (
              <label key={tool} className={css.chipLabel}>
                <input
                  type="checkbox"
                  checked={draft.bridge.excludeTools.includes(tool)}
                  onChange={() => toggleExcludedTool(tool)}
                />
                <span>{tool}</span>
              </label>
            ))}
          </div>
        </div>
      </details>

      <footer className={css.footer}>
        <div className={css.feedbackArea}>
          {feedback ? (
            <span className={feedback.kind === 'ok' ? css.notice : css.error}>{feedback.text}</span>
          ) : isDirty ? (
            <span className={css.dirty}>{t('dirtyNotice')}</span>
          ) : null}
        </div>
        <button type="button" className={css.primaryBtn} disabled={busyAction !== null} onClick={() => void handleSave()}>
          {busyAction === 'save' ? t('saving') : t('saveSettings')}
        </button>
      </footer>
    </section>
  )
}
