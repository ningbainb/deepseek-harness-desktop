import React, { useEffect, useRef, useState } from 'react'
import type { ModelRouteSelection, ValueModeConfig, ValueModeSettingsScope, ValueModeStrategy } from '../core/config.ts'
import { isCompleteModelRoute, resolveResolvedConfig } from '../core/config.ts'
import { ModelPicker, type ValueModeModelCatalog } from './ModelPicker.tsx'
import { useSettingsValue, useValueModeConfig } from './useValueModeConfig.ts'
import styles from './value-mode.module.css'
import headerStyles from './value-mode-header.module.css'
import { reportValueModeTelemetry } from './telemetry.ts'

export interface ValueModeHeroOnboardingProps {
  config: ValueModeConfig
  settingsScope: ValueModeSettingsScope<ValueModeConfig>
  defaultModelScope: ValueModeSettingsScope<ModelRouteSelection>
  onChange: (patch: Partial<ValueModeConfig>) => Promise<void> | void
  fetchModels: () => Promise<ValueModeModelCatalog>
  onClose: () => void
  initialError?: string | null
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

function errorText(reason: unknown, fallback: string): string {
  if (reason instanceof Error && reason.message.trim()) return reason.message.trim()
  if (typeof reason === 'string' && reason.trim()) return reason.trim()
  return fallback
}

/**
 * Configuration guide for the blank-session hero. The official agent-preset
 * selector is a single root slot, so this guide is mounted as an additive
 * document-level surface rather than replacing the host selector.
 */
export const ValueModeHeroOnboarding: React.FC<ValueModeHeroOnboardingProps> = ({
  config,
  settingsScope,
  defaultModelScope,
  onChange,
  fetchModels,
  onClose,
  initialError = null,
}) => {
  const liveConfig = useValueModeConfig(settingsScope, config)
  const defaultExpert = useSettingsValue<ModelRouteSelection | undefined>(defaultModelScope, undefined)
  const resolved = resolveResolvedConfig(liveConfig, defaultExpert)
  const [draft, setDraft] = useState<SetupDraft>(() => ({
    executor: { ...resolved.executor },
    expert: { ...resolved.expert },
    strategy: resolved.strategy,
  }))
  const [pickingTarget, setPickingTarget] = useState<PickerTarget | null>(null)
  const [error, setError] = useState<string | null>(initialError)
  const [saving, setSaving] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const completedRef = useRef(false)

  const closeWithDismiss = () => {
    if (!completedRef.current) reportValueModeTelemetry({ kind: 'onboarding', outcome: 'dismissed', surface: 'hero' })
    onClose()
  }

  const defaultExpertKey = `${defaultExpert?.provider ?? ''}:${defaultExpert?.model ?? ''}:${defaultExpert?.reasoningEffort ?? ''}`
  useEffect(() => {
    setDraft((current) => ({
      ...current,
      expert: isCompleteModelRoute(current.expert) ? current.expert : { ...resolved.expert },
    }))
  }, [defaultExpertKey, resolved.expert.provider, resolved.expert.model, resolved.expert.reasoningEffort])

  useEffect(() => {
    setError(initialError ?? null)
  }, [initialError])

  const loadModels = async (): Promise<ValueModeModelCatalog> => {
    const catalog = await fetchModels()
    if (isCompleteModelRoute(defaultExpert)) {
      const defaultExists = catalog.groups.some((group) => (
        group.id === defaultExpert.provider && group.models.some((model) => model.id === defaultExpert.model)
      ))
      if (!defaultExists) {
        throw new Error(`当前默认模型 ${formatModel(defaultExpert)} 不在可用模型目录中，请先在模型设置中选择可用模型。`)
      }
    }
    return catalog
  }

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')?.focus()

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (dialogRef.current?.contains(target)) return
      if (pickingTarget) return
      closeWithDismiss()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (pickingTarget) {
        setPickingTarget(null)
        return
      }
      closeWithDismiss()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, pickingTarget])

  const handleModelSelect = (selection: ModelRouteSelection) => {
    if (!pickingTarget) return
    setDraft((current) => ({ ...current, [pickingTarget]: selection }))
    setPickingTarget(null)
  }

  const handleComplete = async () => {
    if (!isCompleteModelRoute(draft.expert) || !isCompleteModelRoute(draft.executor)) {
      setError('请先选择专家主控模型和副模型 / 子代理执行模型。')
      return
    }

    setSaving(true)
    setError(null)
    try {
      // Model roles and strategy must be durable before the final enabled write.
      await onChange({
        expert: draft.expert,
        executor: draft.executor,
      })
      await onChange({ strategy: draft.strategy })
      await onChange({ enabled: true })
      completedRef.current = true
      reportValueModeTelemetry({ kind: 'onboarding', outcome: 'completed', surface: 'hero' })
      reportValueModeTelemetry({ kind: 'state', state: 'enabled', source: 'onboarding' })
      onClose()
    } catch (reason) {
      reportValueModeTelemetry({ kind: 'onboarding', outcome: 'failed', surface: 'hero' })
      setError(errorText(reason, '配置写入失败，请重试。'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div
        ref={dialogRef}
        className={`${styles.popover} ${headerStyles.popover} ${headerStyles.onboardingPopover} ${headerStyles.heroOnboardingPopover}`}
        role="dialog"
        aria-modal="false"
        aria-label="性价比模式配置引导"
        data-value-mode-onboarding="true"
        data-value-mode-hero-onboarding="true"
      >
        <div className={headerStyles.setupHeader}>
          <div>
            <div className={headerStyles.setupEyebrow}>新会话设置 · 约 30 秒</div>
            <h2 className={headerStyles.setupTitle}>性价比模式</h2>
          </div>
          <button type="button" className={headerStyles.setupClose} aria-label="关闭性价比模式引导" onClick={closeWithDismiss}>×</button>
        </div>

        <p className={headerStyles.setupLead}>
          专家模型负责主控、拆解和最终交付，副模型只执行主控派发的子任务。先确认两种角色，完成后即可开启。
        </p>

        <div className={headerStyles.setupSteps}>
          <div className={`${headerStyles.setupStep} ${isCompleteModelRoute(draft.expert) ? headerStyles.setupStepReady : ''}`}>
            <span className={headerStyles.setupStepNumber}>01</span>
            <div className={headerStyles.setupStepBody}>
              <div className={headerStyles.setupStepHeading}>专家主控模型</div>
              <div className={headerStyles.setupStepValue}>{formatModel(draft.expert)}</div>
              {!isCompleteModelRoute(liveConfig.expert) && isCompleteModelRoute(defaultExpert) && (
                <div className={headerStyles.setupDefaultNote}>已预选当前默认模型，确认后会保存到性价比模式</div>
              )}
            </div>
            <button type="button" className={`${styles.button} ${headerStyles.setupModelButton}`} onClick={() => setPickingTarget('expert')}>
              {isCompleteModelRoute(draft.expert) ? '更换' : '选择'}
            </button>
          </div>

          <div className={`${headerStyles.setupStep} ${isCompleteModelRoute(draft.executor) ? headerStyles.setupStepReady : ''}`}>
            <span className={headerStyles.setupStepNumber}>02</span>
            <div className={headerStyles.setupStepBody}>
              <div className={headerStyles.setupStepHeading}>副模型 / 子代理执行模型</div>
              <div className={headerStyles.setupStepValue}>{formatModel(draft.executor)}</div>
              <div className={headerStyles.setupDefaultNote}>用于并行调查、局部实现和重复性工作</div>
            </div>
            <button type="button" className={`${styles.button} ${headerStyles.setupModelButton}`} onClick={() => setPickingTarget('executor')}>
              {isCompleteModelRoute(draft.executor) ? '更换' : '选择'}
            </button>
          </div>
        </div>

        <div className={headerStyles.setupStrategy}>
          <div className={headerStyles.setupStrategyLabel}>03 · 运行策略</div>
          <div className={styles.strategyGroup}>
            {(['saver', 'balanced', 'powerful'] as const).map((strategy) => (
              <button
                type="button"
                key={strategy}
                aria-pressed={draft.strategy === strategy}
                className={`${styles.strategyItem} ${draft.strategy === strategy ? styles.strategyItemSelected : ''}`}
                onClick={() => {
                  setDraft((current) => ({ ...current, strategy }))
                  reportValueModeTelemetry({ kind: 'strategy', strategy })
                }}
              >
                <span className={styles.strategyTitle}>{strategy === 'saver' ? '更省' : strategy === 'powerful' ? '更强' : '平衡'}</span>
                <span className={styles.strategyDesc}>{strategy === 'saver' ? '少派发，控制调用量' : strategy === 'powerful' ? '积极并行，优先质量' : '按任务复杂度派发'}</span>
              </button>
            ))}
          </div>
        </div>

        {error && <div className={headerStyles.setupError} role="alert">{error}</div>}

        <div className={headerStyles.setupFooter}>
          <span className={headerStyles.setupHint}>配置保存在全局默认中，可在完整设置里调整</span>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary} ${headerStyles.setupSubmit}`}
            disabled={saving || !isCompleteModelRoute(draft.expert) || !isCompleteModelRoute(draft.executor)}
            onClick={() => void handleComplete()}
          >
            {saving ? '保存并开启中…' : '完成配置并开启'}
          </button>
        </div>
      </div>

      {pickingTarget && (
        <ModelPicker
          title={pickingTarget === 'executor' ? '选择副模型 / 子代理执行模型' : '选择专家主控模型'}
          current={draft[pickingTarget]}
          onSelect={handleModelSelect}
          onClose={() => setPickingTarget(null)}
          fetchModels={loadModels}
        />
      )}
    </>
  )
}
