import React, { useState } from 'react'
import type { ModelRouteSelection, ValueModeConfig, ValueModeSettingsScope } from '../core/config.ts'
import { isConfigured, resolveResolvedConfig } from '../core/config.ts'
import { ModelPicker, type ValueModeModelCatalog } from './ModelPicker.tsx'
import { useSettingsValue, useValueModeConfig } from './useValueModeConfig.ts'
import styles from './value-mode.module.css'
import layout from './value-mode-polish.module.css'
import a11y from './value-mode-a11y.module.css'
import { reportValueModeTelemetry } from './telemetry.ts'

export interface ValueModeSettingsCardProps {
  config: ValueModeConfig
  settingsScope?: ValueModeSettingsScope<ValueModeConfig>
  defaultModelScope?: ValueModeSettingsScope<ModelRouteSelection>
  onChange: (patch: Partial<ValueModeConfig>) => Promise<void> | void
  fetchModels?: () => Promise<ValueModeModelCatalog>
}

export const ValueModeSettingsCard: React.FC<ValueModeSettingsCardProps> = ({
  config,
  settingsScope,
  defaultModelScope,
  onChange,
  fetchModels,
}) => {
  const liveConfig = useValueModeConfig(settingsScope, config)
  const defaultExpert = useSettingsValue<ModelRouteSelection | undefined>(defaultModelScope, undefined)
  const resolved = resolveResolvedConfig(liveConfig, defaultExpert)
  const configured = isConfigured(liveConfig, defaultExpert)
  const [pickingTarget, setPickingTarget] = useState<'executor' | 'expert' | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const persist = (patch: Partial<ValueModeConfig>): void => {
    setSaveError(null)
    void Promise.resolve()
      .then(() => onChange(patch))
      .then(() => {
        if (typeof patch.enabled === 'boolean') {
          reportValueModeTelemetry({ kind: 'state', state: patch.enabled ? 'enabled' : 'disabled', source: 'settings' })
        }
        if (patch.strategy !== undefined) reportValueModeTelemetry({ kind: 'strategy', strategy: patch.strategy })
      })
      .catch((reason) => {
        setSaveError(reason instanceof Error ? reason.message : '配置写入失败，请重试。')
        if (typeof patch.enabled === 'boolean') reportValueModeTelemetry({ kind: 'state', state: 'failed', source: 'settings' })
      })
  }

  const handleToggleEnable = () => {
    if (!configured && !resolved.enabled) return
    persist({ enabled: !resolved.enabled })
  }

  const handleModelSelected = (selection: ModelRouteSelection) => {
    persist(pickingTarget === 'executor' ? { executor: selection } : { expert: selection })
    setPickingTarget(null)
  }

  const formatModelLabel = (route?: { provider?: string; model?: string }) => {
    if (!route?.provider || !route?.model) return '未配置'
    return `${route.provider} / ${route.model}`
  }

  const statusClass = resolved.enabled
    ? configured ? styles.badgeActive : styles.badgeDegraded
    : styles.badgeInactive

  return (
    <div className={`${styles.card} ${layout.card}`} data-value-mode-card="true">
      <div className={`${styles.header} ${layout.header}`}>
        <div className={`${styles.titleArea} ${layout.titleArea}`}>
          <div className={`${styles.titleRow} ${layout.titleRow}`}>
            <span className={`${styles.title} ${layout.title}`}>性价比模式 (Value Mode)</span>
            <span className={`${styles.badge} ${statusClass}`}>
              {resolved.enabled ? configured ? '已开启' : '配置不完整' : '已关闭'}
            </span>
          </div>
          <div className={styles.desc}>
            由专家主控模型理解和拆解任务，再按需派发副模型子代理完成并行调查、文件处理和局部实现，在交付质量与模型成本之间取得平衡。
          </div>
          <div className={`${styles.desc} ${a11y.mutedNote}`}>
            模型直接从你已经配置好的供应商中选择，不需要重新填写 API Key。
          </div>
        </div>
        <div className={`${styles.switchArea} ${layout.switchArea}`}>
          <button
            type="button"
            role="switch"
            aria-checked={resolved.enabled}
            aria-label="开启性价比模式"
            className={`${styles.toggleSwitch} ${resolved.enabled ? styles.toggleSwitchChecked : ''} ${a11y.toggleButton}`}
            onClick={handleToggleEnable}
            disabled={!configured && !resolved.enabled}
            title={!configured && !resolved.enabled ? '请先配置专家主控模型和副模型' : resolved.enabled ? '点击关闭' : '点击开启'}
          >
            <span className={styles.toggleKnob} />
          </button>
        </div>
      </div>

      {saveError && <div className={a11y.error} role="alert">{saveError}</div>}

      {!configured && (
        <div className={a11y.onboarding}>
          <div className={a11y.onboardingTitle}>首次使用指引</div>
          <div className={a11y.onboardingText}>
            1. 确认【专家主控模型】（默认使用当前默认模型）；<br />
            2. 选择【副模型 / 子代理执行模型】；<br />
            3. 选择运行策略并开启，主控会按任务需要派发子代理。
          </div>
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>模型配置</div>

        <div className={`${styles.modelRow} ${layout.modelRow}`}>
          <div className={`${styles.modelInfo} ${layout.modelInfo}`}>
            <div className={styles.modelRole}>专家主控模型 (Expert Controller)</div>
            <div className={`${styles.modelValue} ${layout.modelValue}`}>{formatModelLabel(resolved.expert)}</div>
            <div className={`${styles.modelDesc} ${layout.modelDesc}`}>负责理解任务、拆分工作、汇总子代理结果并完成最终交付。</div>
          </div>
          <button
            type="button"
            className={`${styles.button} ${layout.interactiveButton} ${layout.modelAction}`}
            aria-label="更换专家主控模型"
            onClick={() => setPickingTarget('expert')}
          >
            更换
          </button>
        </div>

        <div className={`${styles.modelRow} ${layout.modelRow}`}>
          <div className={`${styles.modelInfo} ${layout.modelInfo}`}>
            <div className={styles.modelRole}>副模型 / 子代理执行模型 (Subagent Worker)</div>
            <div className={`${styles.modelValue} ${layout.modelValue}`}>{formatModelLabel(resolved.executor)}</div>
            <div className={`${styles.modelDesc} ${layout.modelDesc}`}>只执行主控派发的单项任务，适合并行调查、局部实现和重复性工作。</div>
          </div>
          <button
            type="button"
            className={`${styles.button} ${layout.interactiveButton} ${layout.modelAction}`}
            aria-label="更换副模型子代理执行模型"
            onClick={() => setPickingTarget('executor')}
          >
            更换
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>运行策略</div>
        <div className={`${styles.strategyGroup} ${layout.strategyGroup}`}>
          <button
            type="button"
            aria-pressed={resolved.strategy === 'saver'}
            className={`${styles.strategyItem} ${a11y.strategyButton} ${resolved.strategy === 'saver' ? styles.strategyItemSelected : ''}`}
            onClick={() => persist({ strategy: 'saver' })}
          >
            <span className={styles.strategyTitle}>更省</span>
            <span className={styles.strategyDesc}>优先由主控直接处理，只在需要并行或明确拆分时派发子代理。</span>
          </button>

          <button
            type="button"
            aria-pressed={resolved.strategy === 'balanced'}
            className={`${styles.strategyItem} ${a11y.strategyButton} ${resolved.strategy === 'balanced' ? styles.strategyItemSelected : ''}`}
            onClick={() => persist({ strategy: 'balanced' })}
          >
            <span className={styles.strategyTitle}>智能平衡 (默认)</span>
            <span className={styles.strategyDesc}>复杂设计、疑难问题和重要改动按需派发副模型并由主控复核。</span>
          </button>

          <button
            type="button"
            aria-pressed={resolved.strategy === 'powerful'}
            className={`${styles.strategyItem} ${a11y.strategyButton} ${resolved.strategy === 'powerful' ? styles.strategyItemSelected : ''}`}
            onClick={() => persist({ strategy: 'powerful' })}
          >
            <span className={styles.strategyTitle}>更强</span>
            <span className={styles.strategyDesc}>更积极地派发并行子任务，主控统一审查结果和风险。</span>
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <label className={styles.checkboxRow}>
          <input type="checkbox" checked={resolved.allowReview} onChange={(event) => persist({ allowReview: event.target.checked })} />
          <span>重要改动完成后保留主控复核</span>
        </label>
        <label className={styles.checkboxRow}>
          <input type="checkbox" checked={resolved.showExpertActivity} onChange={(event) => persist({ showExpertActivity: event.target.checked })} />
          <span>显式显示主控与子代理活动</span>
        </label>
      </div>

      <div className={styles.accordion}>
        <button
          type="button"
          className={`${styles.accordionHeader} ${a11y.accordionToggle}`}
          aria-expanded={showAdvanced}
          onClick={() => setShowAdvanced((value) => !value)}
        >
          <span>高级成本护栏 (Advanced Guardrails)</span>
          <span aria-hidden="true">{showAdvanced ? '▲' : '▼'}</span>
        </button>
        {showAdvanced && (
          <div className={styles.accordionBody}>
            <label className={styles.fieldRow}>
              <span className={styles.fieldLabel}>主控最大输出 Token:</span>
              <input type="number" aria-label="主控最大输出 Token" className={`${styles.inputNumber} ${a11y.fieldValue}`} value={resolved.maxOutputTokens} min={256} max={16384} step={256} onChange={(event) => persist({ maxOutputTokens: Number.parseInt(event.target.value, 10) || 4096 })} />
            </label>
            <label className={styles.fieldRow}>
              <span className={styles.fieldLabel}>主控上下文最大字符数:</span>
              <input type="number" aria-label="主控上下文最大字符数" className={`${styles.inputNumber} ${a11y.fieldValue}`} value={resolved.maxContextChars} min={1000} max={64000} step={1000} onChange={(event) => persist({ maxContextChars: Number.parseInt(event.target.value, 10) || 16000 })} />
            </label>
            <label className={styles.fieldRow}>
              <span className={styles.fieldLabel}>子代理最大深度:</span>
              <input type="number" aria-label="子代理最大深度" className={`${styles.inputNumber} ${a11y.fieldValue}`} value={resolved.maxDepth} min={1} max={2} onChange={(event) => persist({ maxDepth: Number.parseInt(event.target.value, 10) || 1 })} />
            </label>
            <label className={styles.fieldRow}>
              <span className={styles.fieldLabel}>连续失败升级阈值:</span>
              <input type="number" aria-label="连续失败升级阈值" className={`${styles.inputNumber} ${a11y.fieldValue}`} value={resolved.consecutiveFailuresThreshold} min={1} max={10} step={1} onChange={(event) => persist({ consecutiveFailuresThreshold: Number.parseInt(event.target.value, 10) || 2 })} />
            </label>
            <label className={styles.fieldRow}>
              <span className={styles.fieldLabel}>每轮最大专家调用数:</span>
              <input type="number" aria-label="每轮最大专家调用数" className={`${styles.inputNumber} ${a11y.fieldValue}`} value={resolved.maxExpertCallsPerTurn} min={1} max={10} step={1} onChange={(event) => persist({ maxExpertCallsPerTurn: Number.parseInt(event.target.value, 10) || 3 })} />
            </label>
          </div>
        )}
      </div>

      {pickingTarget && (
        <ModelPicker
          title={pickingTarget === 'executor' ? '选择副模型 / 子代理执行模型' : '选择专家主控模型'}
          current={pickingTarget === 'executor' ? resolved.executor : resolved.expert}
          onSelect={handleModelSelected}
          onClose={() => setPickingTarget(null)}
          fetchModels={fetchModels}
        />
      )}
    </div>
  )
}
