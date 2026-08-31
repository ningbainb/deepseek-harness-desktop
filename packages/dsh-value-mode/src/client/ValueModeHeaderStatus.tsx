import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ValueModeConfig, ValueModeStrategy, SessionOverrideConfig, ModelRouteSelection, ValueModeSettingsScope } from '../core/config.ts'
import {
  hasExplicitModelRoutes,
  isCompleteModelRoute,
  isConfigured,
  resolveResolvedConfig,
  resolveSessionConfig,
} from '../core/config.ts'
import { ModelPicker, type ValueModeModelCatalog } from './ModelPicker.tsx'
import { useSettingsValue, useValueModeConfig } from './useValueModeConfig.ts'
import styles from './value-mode.module.css'
import headerStyles from './value-mode-header.module.css'
import { reportValueModeTelemetry } from './telemetry.ts'

export interface ConsultationHistoryItem {
  id: string
  timestamp: number
  purpose: string
  question: string
  summary: string
  tokens?: {
    inputTokens: number
    outputTokens: number
  }
}

export interface ValueModeHeaderStatusProps {
  config: ValueModeConfig
  sessionId: string
  useSessions: <T>(selector: (state: { byId: Record<string, { agentPreset?: string }> }) => T) => T
  settingsScope?: ValueModeSettingsScope<ValueModeConfig>
  defaultModelScope?: ValueModeSettingsScope<ModelRouteSelection>
  sessionMetrics?: {
    controllerCalls?: number
    subagentCalls?: number
    expertCalls: number
    executorCalls: number
    inputTokens?: number
    outputTokens?: number
    estimatedSavingsPercent?: number
    consultations?: ConsultationHistoryItem[]
  }
  sessionOverride?: SessionOverrideConfig
  onChange: (patch: Partial<ValueModeConfig>) => Promise<void> | void
  onSessionOverrideChange?: (override?: SessionOverrideConfig) => void
  fetchModels?: () => Promise<ValueModeModelCatalog>
  onOpenSettings?: () => void
}

type PickerTarget = 'executor' | 'expert'

interface SetupDraft {
  executor: ModelRouteSelection
  expert: ModelRouteSelection
  strategy: ValueModeStrategy
}

function formatModel(route?: ModelRouteSelection): string {
  if (!isCompleteModelRoute(route)) return '未配置'
  return `${route.provider} / ${route.model}`
}

function renderPortal(node: React.ReactNode): React.ReactNode {
  return typeof document === 'undefined' ? node : createPortal(node, document.body)
}

export const ValueModeHeaderStatus: React.FC<ValueModeHeaderStatusProps> = ({
  config,
  sessionId,
  useSessions,
  settingsScope,
  defaultModelScope,
  sessionMetrics,
  sessionOverride,
  onChange,
  onSessionOverrideChange,
  fetchModels,
  onOpenSettings,
}) => {
  const [open, setOpen] = useState(false)
  const [onboarding, setOnboarding] = useState(false)
  const [pickingTarget, setPickingTarget] = useState<PickerTarget | null>(null)
  const [scope, setScope] = useState<'session' | 'global'>('global')
  const [showHistory, setShowHistory] = useState(false)
  const [setupDraft, setSetupDraft] = useState<SetupDraft>({
    executor: {},
    expert: {},
    strategy: 'balanced',
  })
  const [setupError, setSetupError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const handledEntryRef = useRef<string | null>(null)

  const activePreset = useSessions((state) => state.byId[sessionId]?.agentPreset)
  const liveConfig = useValueModeConfig(settingsScope, config)
  const defaultExpert = useSettingsValue<ModelRouteSelection | undefined>(defaultModelScope, undefined)
  const activeConfig = resolveSessionConfig(liveConfig, sessionOverride)
  const resolved = resolveResolvedConfig(activeConfig, defaultExpert)
  const configured = isConfigured(activeConfig, defaultExpert)
  const explicitlyConfigured = hasExplicitModelRoutes(activeConfig)

  const strategyLabels: Record<ValueModeStrategy, string> = {
    saver: '更省',
    balanced: '平衡',
    powerful: '更强',
  }

  const label = !configured
    ? '性价比 · 待配置'
    : !resolved.enabled
      ? '性价比 · 已关闭'
      : `性价比 · ${strategyLabels[resolved.strategy] || '平衡'}`

  const startOnboarding = () => {
    setSetupDraft({
      executor: { ...resolved.executor },
      expert: { ...resolved.expert },
      strategy: resolved.strategy,
    })
    setScope('global')
    setSetupError(null)
    setOnboarding(true)
    setOpen(true)
    reportValueModeTelemetry({ kind: 'onboarding', outcome: 'shown', surface: 'header' }, `value-mode-onboarding-shown:header:${sessionId}`)
  }

  const dismissOnboarding = () => {
    if (onboarding) reportValueModeTelemetry({ kind: 'onboarding', outcome: 'dismissed', surface: 'header' })
    setOpen(false)
    setOnboarding(false)
  }

  const reportSetupError = (reason: unknown, fallback: string): void => {
    setSetupError(reason instanceof Error ? reason.message : fallback)
    setOpen(true)
  }

  const persistGlobalPatch = (patch: Partial<ValueModeConfig>, fallback: string): void => {
    void Promise.resolve()
      .then(() => onChange(patch))
      .catch((reason) => reportSetupError(reason, fallback))
  }

  const enableCurrentScope = async (source: 'auto' | 'manual' = 'manual') => {
    try {
      if (scope === 'session' && onSessionOverrideChange) {
        onSessionOverrideChange({ ...sessionOverride, enabled: true })
      } else {
        await onChange({ enabled: true })
      }
      reportValueModeTelemetry({ kind: 'state', state: 'enabled', source })
    } catch (reason) {
      reportValueModeTelemetry({ kind: 'state', state: 'failed', source })
      reportSetupError(reason, '性价比模式开启失败，请重试。')
    }
  }

  useEffect(() => {
    if (activePreset !== 'value-mode') {
      setOpen(false)
      setOnboarding(false)
      setPickingTarget(null)
      setShowHistory(false)
      handledEntryRef.current = null
      return
    }

    const entryKey = `${sessionId}:value-mode`
    if (handledEntryRef.current === entryKey) return
    handledEntryRef.current = entryKey
    reportValueModeTelemetry({ kind: 'entry', configured: explicitlyConfigured }, 'value-mode-entry')

    if (explicitlyConfigured) {
      if (!resolved.enabled) void enableCurrentScope('auto')
    } else {
      startOnboarding()
    }
  }, [activePreset, sessionId, explicitlyConfigured])

  // The default-model service may finish hydrating after the session header
  // mounts. Fill only an unconfigured draft so a deliberate expert choice is
  // never overwritten while the guide is open.
  useEffect(() => {
    if (!onboarding) return
    setSetupDraft((draft) => ({
      ...draft,
      expert: isCompleteModelRoute(draft.expert) ? draft.expert : { ...resolved.expert },
    }))
  }, [onboarding, defaultExpert?.provider, defaultExpert?.model, defaultExpert?.reasoningEffort, resolved.expert.provider, resolved.expert.model, resolved.expert.reasoningEffort])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return
      // The model picker is portaled separately. Let its own backdrop handle
      // outside clicks while it is open instead of closing the setup panel on
      // the picker's initial mousedown.
      if (pickingTarget) return
       dismissOnboarding()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (pickingTarget) {
          setPickingTarget(null)
          return
        }
         dismissOnboarding()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onboarding, pickingTarget])

  useEffect(() => {
    if (!open) {
      triggerRef.current?.focus()
      return
    }

    const dialog = pickingTarget
      ? document.querySelector<HTMLElement>('[data-value-mode-model-picker="true"] [role="dialog"]')
      : panelRef.current
    dialog?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')?.focus()
  }, [open, onboarding, pickingTarget])

  const handleStrategyChange = (nextStrategy: ValueModeStrategy) => {
    if (onboarding) {
      setSetupDraft((draft) => ({ ...draft, strategy: nextStrategy }))
      reportValueModeTelemetry({ kind: 'strategy', strategy: nextStrategy })
      return
    }
    if (scope === 'session' && onSessionOverrideChange) {
      onSessionOverrideChange({ ...sessionOverride, strategy: nextStrategy })
    } else {
      persistGlobalPatch({ strategy: nextStrategy }, '策略保存失败，请重试。')
    }
    reportValueModeTelemetry({ kind: 'strategy', strategy: nextStrategy })
  }

  const handleModelSelect = (selection: ModelRouteSelection) => {
    if (onboarding) {
      setSetupDraft((draft) => ({ ...draft, [pickingTarget as PickerTarget]: selection }))
    } else if (pickingTarget === 'executor') {
      persistGlobalPatch({ executor: selection }, '副模型保存失败，请重试。')
    } else if (pickingTarget === 'expert') {
      if (scope === 'session' && onSessionOverrideChange) {
        onSessionOverrideChange({ ...sessionOverride, expert: selection })
      } else {
        persistGlobalPatch({ expert: selection }, '专家主控模型保存失败，请重试。')
      }
    }
    setPickingTarget(null)
  }

  const handleCompleteSetup = async () => {
    if (!isCompleteModelRoute(setupDraft.expert) || !isCompleteModelRoute(setupDraft.executor)) {
      setSetupError('请先选择专家主控模型和副模型 / 子代理执行模型。')
      return
    }

    setSaving(true)
    setSetupError(null)
    try {
      // Keep enabled as a separate last write so a partial configuration can
      // never become active.
      await onChange({
        expert: setupDraft.expert,
        executor: setupDraft.executor,
      })
      await onChange({ strategy: setupDraft.strategy })
      await onChange({ enabled: true })
      setOnboarding(false)
      setOpen(false)
      reportValueModeTelemetry({ kind: 'onboarding', outcome: 'completed', surface: 'header' })
      reportValueModeTelemetry({ kind: 'state', state: 'enabled', source: 'onboarding' })
    } catch (reason) {
      reportValueModeTelemetry({ kind: 'onboarding', outcome: 'failed', surface: 'header' })
      setSetupError(reason instanceof Error ? reason.message : '配置写入失败，请重试。')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (): Promise<void> => {
    const nextEnabled = !resolved.enabled
    try {
      if (scope === 'session' && onSessionOverrideChange) {
        onSessionOverrideChange({ ...sessionOverride, enabled: nextEnabled })
      } else {
        await onChange({ enabled: nextEnabled })
      }
      reportValueModeTelemetry({ kind: 'state', state: nextEnabled ? 'enabled' : 'disabled', source: 'manual' })
    } catch (reason) {
      reportValueModeTelemetry({ kind: 'state', state: 'failed', source: 'manual' })
      reportSetupError(reason, nextEnabled ? '性价比模式开启失败，请重试。' : '性价比模式关闭失败，请重试。')
    }
  }

  if (activePreset !== 'value-mode') return null

  const controllerCalls = sessionMetrics?.controllerCalls ?? sessionMetrics?.expertCalls ?? 0
  const subagentCalls = sessionMetrics?.subagentCalls ?? sessionMetrics?.executorCalls ?? 0
  const statusClass = !configured
    ? styles.badgeDegraded
    : resolved.enabled
      ? styles.badgeActive
      : styles.badgeInactive

  const quickPopover = (
    <>
      <div className={headerStyles.popoverHeader}>
        <span className={styles.title}>性价比模式</span>
        <span className={`${styles.badge} ${statusClass}`}>
          {resolved.enabled ? configured ? '已开启' : '配置不完整' : configured ? '已关闭' : '待配置'}
        </span>
      </div>

      {setupError && <div className={headerStyles.setupError} role="alert">{setupError}</div>}

      {onSessionOverrideChange && (
        <div className={styles.scopeSwitcher} role="group" aria-label="生效范围">
          <button type="button" className={`${styles.scopeButton} ${scope === 'global' ? styles.scopeButtonActive : ''}`} onClick={() => setScope('global')}>
            全局默认
          </button>
          <button type="button" className={`${styles.scopeButton} ${scope === 'session' ? styles.scopeButtonActive : ''}`} onClick={() => setScope('session')}>
            仅本会话 {sessionOverride ? '(已覆写)' : ''}
          </button>
        </div>
      )}

      <div className={styles.roleSummary}>
        <div className={styles.popoverItem}>
          <span className={styles.popoverItemLabel}>专家主控:</span>
          <span className={styles.popoverItemValue}>{formatModel(resolved.expert)}</span>
        </div>
        <div className={styles.popoverItem}>
          <span className={styles.popoverItemLabel}>副模型子代理:</span>
          <span className={styles.popoverItemValue}>{formatModel(resolved.executor)}</span>
        </div>
        <div className={styles.popoverItem}>
          <span className={styles.popoverItemLabel}>当前策略:</span>
          <span className={styles.popoverItemValue}>{resolved.strategy === 'saver' ? '更省' : resolved.strategy === 'powerful' ? '更强' : '智能平衡'}</span>
        </div>
      </div>

      <div className={styles.statsCard}>
        <div className={styles.statItem}>
          <span className={styles.statItemLabel}>专家主控调用</span>
          <span className={styles.statItemValue}>{controllerCalls} 次</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statItemLabel}>副模型子代理调用</span>
          <span className={styles.statItemValue}>{subagentCalls} 次</span>
        </div>
        <div className={styles.statSavingsHighlight}>
          <span>副模型调用占比</span>
          <span className={headerStyles.savingsValue}>{sessionMetrics?.estimatedSavingsPercent ?? 0}%</span>
        </div>
      </div>

      {sessionMetrics?.consultations && sessionMetrics.consultations.length > 0 && (
        <div>
          <button type="button" className={headerStyles.historyToggle} aria-expanded={showHistory} onClick={() => setShowHistory((value) => !value)}>
            <span>历史专家咨询 ({sessionMetrics.consultations.length})</span>
            <span>{showHistory ? '收起' : '展开'}</span>
          </button>
          {showHistory && (
            <div className={styles.historyBox}>
              {sessionMetrics.consultations.map((item) => (
                <div key={item.id} className={styles.historyItem}>
                  <div className={styles.historyHeader}>
                    <span>{item.purpose}</span>
                    <span className={headerStyles.historyTime}>{new Date(item.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className={styles.historySummary}>{item.question || item.summary}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={headerStyles.actionStack}>
        <div className={headerStyles.actionRow}>
          <button type="button" className={`${styles.button} ${headerStyles.actionButton}`} onClick={() => setPickingTarget('executor')}>换副模型</button>
          <button type="button" className={`${styles.button} ${headerStyles.actionButton}`} onClick={() => setPickingTarget('expert')}>换专家主控</button>
          <button type="button" className={`${styles.button} ${headerStyles.actionButton}`} onClick={() => {
            const nextStrategy: ValueModeStrategy = resolved.strategy === 'saver' ? 'balanced' : resolved.strategy === 'balanced' ? 'powerful' : 'saver'
            handleStrategyChange(nextStrategy)
          }}>切策略</button>
        </div>
        <div className={headerStyles.actionRow}>
          <button
            type="button"
            className={`${styles.button} ${headerStyles.actionButton} ${resolved.enabled ? '' : styles.buttonPrimary}`}
            disabled={!configured && !resolved.enabled}
            onClick={() => void handleToggle()}
          >
            {resolved.enabled ? '关闭模式' : '开启模式'}
          </button>
          {onOpenSettings && (
            <button type="button" className={`${styles.button} ${headerStyles.actionButton}`} onClick={() => { setOpen(false); onOpenSettings() }}>
              完整设置
            </button>
          )}
        </div>
      </div>
    </>
  )

  const onboardingPopover = (
    <>
      <div className={headerStyles.setupHeader}>
        <div>
          <div className={headerStyles.setupEyebrow}>首次设置 · 约 30 秒</div>
          <h2 className={headerStyles.setupTitle}>性价比模式</h2>
        </div>
        <button type="button" className={headerStyles.setupClose} aria-label="关闭性价比模式引导" onClick={dismissOnboarding}>×</button>
      </div>
      <p className={headerStyles.setupLead}>
        专家模型负责主控和最终交付，副模型只执行主控派发的子任务。先确认两种角色，完成后即可开启。
      </p>

      <div className={headerStyles.setupSteps}>
        <div className={`${headerStyles.setupStep} ${isCompleteModelRoute(setupDraft.expert) ? headerStyles.setupStepReady : ''}`}>
          <span className={headerStyles.setupStepNumber}>01</span>
          <div className={headerStyles.setupStepBody}>
            <div className={headerStyles.setupStepHeading}>专家主控模型</div>
            <div className={headerStyles.setupStepValue}>{formatModel(setupDraft.expert)}</div>
            {!isCompleteModelRoute(liveConfig.expert) && isCompleteModelRoute(defaultExpert) && (
              <div className={headerStyles.setupDefaultNote}>已预选当前默认模型，确认后会保存到性价比模式</div>
            )}
          </div>
          <button type="button" className={`${styles.button} ${headerStyles.setupModelButton}`} onClick={() => setPickingTarget('expert')}>
            {isCompleteModelRoute(setupDraft.expert) ? '更换' : '选择'}
          </button>
        </div>

        <div className={`${headerStyles.setupStep} ${isCompleteModelRoute(setupDraft.executor) ? headerStyles.setupStepReady : ''}`}>
          <span className={headerStyles.setupStepNumber}>02</span>
          <div className={headerStyles.setupStepBody}>
            <div className={headerStyles.setupStepHeading}>副模型 / 子代理执行模型</div>
            <div className={headerStyles.setupStepValue}>{formatModel(setupDraft.executor)}</div>
            <div className={headerStyles.setupDefaultNote}>用于并行调查、局部实现和重复性工作</div>
          </div>
          <button type="button" className={`${styles.button} ${headerStyles.setupModelButton}`} onClick={() => setPickingTarget('executor')}>
            {isCompleteModelRoute(setupDraft.executor) ? '更换' : '选择'}
          </button>
        </div>
      </div>

      <div className={headerStyles.setupStrategy}>
        <div className={headerStyles.setupStrategyLabel}>运行策略</div>
        <div className={styles.strategyGroup}>
          {(['saver', 'balanced', 'powerful'] as const).map((strategy) => (
            <button
              type="button"
              key={strategy}
              aria-pressed={setupDraft.strategy === strategy}
              className={`${styles.strategyItem} ${setupDraft.strategy === strategy ? styles.strategyItemSelected : ''}`}
              onClick={() => handleStrategyChange(strategy)}
            >
              <span className={styles.strategyTitle}>{strategy === 'saver' ? '更省' : strategy === 'powerful' ? '更强' : '平衡'}</span>
              <span className={styles.strategyDesc}>{strategy === 'saver' ? '少派发，控制调用量' : strategy === 'powerful' ? '积极并行，优先质量' : '按任务复杂度派发'}</span>
            </button>
          ))}
        </div>
      </div>

      {setupError && <div className={headerStyles.setupError} role="alert">{setupError}</div>}

      <div className={headerStyles.setupFooter}>
        <span className={headerStyles.setupHint}>配置保存在全局默认中，可在完整设置里调整</span>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary} ${headerStyles.setupSubmit}`}
          disabled={saving || !isCompleteModelRoute(setupDraft.expert) || !isCompleteModelRoute(setupDraft.executor)}
          onClick={() => void handleCompleteSetup()}
        >
          {saving ? '保存并开启中…' : '完成配置并开启'}
        </button>
      </div>
    </>
  )

  const popover = (
    <div
      ref={panelRef}
      className={`${styles.popover} ${headerStyles.popover} ${onboarding ? headerStyles.onboardingPopover : ''}`}
      role="dialog"
      aria-modal="false"
      aria-label={onboarding ? '性价比模式配置引导' : '性价比模式快捷设置'}
      data-value-mode-onboarding={onboarding ? 'true' : 'false'}
    >
      {onboarding ? onboardingPopover : quickPopover}
    </div>
  )

  return (
    <div className={headerStyles.root} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`${styles.headerChip} ${!resolved.enabled ? styles.headerChipDisabled : ''}`}
        aria-expanded={open}
        aria-label="性价比模式状态"
        onClick={() => {
          if (!open && !explicitlyConfigured) startOnboarding()
          else setOpen((value) => !value)
        }}
        title="性价比模式状态与快捷设置"
      >
        <span aria-hidden="true">V</span>
        <span>{label}</span>
      </button>

      {open && renderPortal(popover)}

      {pickingTarget && (
        <ModelPicker
          title={pickingTarget === 'executor' ? '选择副模型 / 子代理执行模型' : '选择专家主控模型'}
          current={onboarding ? setupDraft[pickingTarget] : pickingTarget === 'executor' ? resolved.executor : resolved.expert}
          onSelect={handleModelSelect}
          onClose={() => setPickingTarget(null)}
          fetchModels={fetchModels}
        />
      )}
    </div>
  )
}
