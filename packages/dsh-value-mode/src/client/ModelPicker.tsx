import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ModelCatalogFailure, ModelProviderGroup } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelRouteSelection } from '../core/config.ts'
import styles from './value-mode.module.css'
import layout from './value-mode-polish.module.css'
import picker from './value-mode-picker.module.css'

export interface ValueModeModelCatalog {
  /** Models exposed by currently registered provider routes. */
  groups: readonly ModelProviderGroup[]
  /** Provider-local lookup failures; successful groups remain selectable. */
  failures?: readonly ModelCatalogFailure[]
}

export interface ModelPickerProps {
  title: string
  current?: ModelRouteSelection
  onSelect: (selection: ModelRouteSelection) => void
  onClose: () => void
  fetchModels?: () => Promise<ValueModeModelCatalog>
}

function errorText(reason: unknown): string {
  if (reason instanceof Error && reason.message.trim()) return reason.message.trim()
  if (typeof reason === 'string' && reason.trim()) return reason.trim()
  return '模型目录加载失败，请稍后重试。'
}

export const ModelPicker: React.FC<ModelPickerProps> = ({ title, current, onSelect, onClose, fetchModels }) => {
  const [groups, setGroups] = useState<readonly ModelProviderGroup[]>([])
  const [failures, setFailures] = useState<readonly ModelCatalogFailure[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])')?.focus()
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setGroups([])
    setFailures([])

    if (!fetchModels) {
      setError('模型目录服务未连接，请更新或重启 DeepSeek Harness 后重试。')
      setLoading(false)
      return () => { active = false }
    }

    void fetchModels().then((result) => {
      if (!active) return
      setGroups(result.groups ?? [])
      setFailures(result.failures ?? [])
      setLoading(false)
    }, (reason) => {
      if (!active) return
      setError(errorText(reason))
      setLoading(false)
    })
    return () => { active = false }
  }, [fetchModels, reloadToken])

  const choiceCount = groups.reduce((count, group) => count + group.models.length, 0)
  const hasFailures = failures.length > 0

  const pickerContent = (
    <div className={`${styles.modalBackdrop} ${layout.modalBackdrop}`} role="presentation" data-value-mode-model-picker="true" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`${styles.modalContent} ${layout.modalContent}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <div className={styles.title}>{title}</div>
            <div className={`${styles.desc} ${picker.subtitle}`}>仅显示已配置并可访问的供应商模型，不会读取或填写 API Key。</div>
          </div>
          <button type="button" className={styles.button} aria-label="关闭模型选择器" onClick={onClose}>×</button>
        </div>

        {loading && <div className={styles.desc} role="status">加载已配置模型列表中...</div>}

        {error && (
          <div className={picker.errorPanel} role="alert">
            <div className={picker.errorMessage}>{error}</div>
            <button type="button" className={styles.button} onClick={() => setReloadToken((value) => value + 1)}>重试</button>
          </div>
        )}

        {!loading && hasFailures && (
          <div className={picker.failurePanel} role="status">
            <div className={picker.failureTitle}>
              {choiceCount > 0 ? '部分供应商暂时无法读取模型，已成功加载的模型仍可选择。' : '已配置供应商暂时无法读取模型。'}
            </div>
            {failures.map((failure) => (
              <div className={picker.failureItem} key={`${failure.id}:${failure.message}`}>
                <span className={picker.failureProvider}>{failure.name || failure.id}</span>
                <span>{failure.message.trim() || '模型列表读取失败。'}</span>
              </div>
            ))}
          </div>
        )}

        {!loading && groups.length === 0 && !error && !hasFailures && (
          <div className={styles.desc} role="status">暂无已配置的模型。请先在 DeepSeek Harness 设置中添加并启用供应商。</div>
        )}

        <div className={`${styles.modelList} ${layout.modelList}`}>
          {groups.map((group) => (
            <div key={group.id}>
              <div className={`${styles.providerGroup} ${picker.providerLabel}`}>
                <span>{group.name || group.id}</span>
                <span className={picker.providerCount}>{group.models.length} 个模型</span>
              </div>
              {group.models.map((model) => {
                const selected = current?.provider === group.id && current?.model === model.id
                const reasoningDefault = model.reasoning?.defaultEffort
                return (
                  <button
                    type="button"
                    key={`${group.id}:${model.id}`}
                    className={`${styles.modelOption} ${picker.optionButton} ${selected ? styles.modelOptionSelected : ''}`}
                    aria-pressed={selected}
                    data-model-provider={group.id}
                    data-model-id={model.id}
                    data-testid={`value-mode-model-${model.id}`}
                    onClick={() => {
                      onSelect({
                        provider: group.id,
                        model: model.id,
                        ...(reasoningDefault ? { reasoningEffort: reasoningDefault } : {}),
                      })
                      onClose()
                    }}
                  >
                    <span className={picker.modelLine}>
                      <span className={picker.modelName}>{model.name || model.id}</span>
                      {selected && <span className={picker.selectedBadge}>当前</span>}
                    </span>
                    <span className={picker.modelId}>{group.id} / {model.id}</span>
                    {model.description && <span className={picker.modelDescription}>{model.description}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className={picker.footer}>
          <span className={picker.footerHint}>{choiceCount > 0 ? `${choiceCount} 个可用模型` : '模型来自当前运行时目录'}</span>
          <button type="button" className={styles.button} onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )

  return typeof document === 'undefined' ? pickerContent : createPortal(pickerContent, document.body)
}
