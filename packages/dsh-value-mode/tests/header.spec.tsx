/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ValueModeConfig, ModelRouteSelection, ValueModeSettingsScope } from '../src/core/config.ts'
import { ValueModeHeaderStatus } from '../src/client/ValueModeHeaderStatus.tsx'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount())
  }
  document.body.innerHTML = ''
})

function scope<T>(value: T): ValueModeSettingsScope<T> {
  const snapshot = {
    status: 'ready' as const,
    value,
    base: value,
    user: value,
    revision: 1,
    writable: true,
    mode: 'memory' as const,
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
  }
}

function renderHeader(config: ValueModeConfig, options: {
  defaultExpert?: ModelRouteSelection
  fetchModels?: () => Promise<unknown>
  onChange?: ReturnType<typeof vi.fn>
} = {}) {
  const onChange = options.onChange ?? vi.fn().mockResolvedValue(undefined)
  const session = { byId: { 'session-1': { agentPreset: 'value-mode' } } }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => {
    root.render(
      <ValueModeHeaderStatus
        config={config}
        sessionId="session-1"
        useSessions={(selector) => selector(session)}
        settingsScope={undefined}
        defaultModelScope={scope(options.defaultExpert)}
        sessionMetrics={{ expertCalls: 0, executorCalls: 0 }}
        onChange={onChange}
        fetchModels={options.fetchModels as never}
      />,
    )
  })
  return onChange
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  })
}

async function findDialog(label: string): Promise<HTMLDivElement> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const dialog = document.querySelector<HTMLDivElement>(`[role="dialog"][aria-label="${label}"]`)
    if (dialog) return dialog
    await settle()
  }
  throw new Error(`dialog not found: ${label}`)
}

function clickButton(name: string): void {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === name)
  if (!button) throw new Error(`button not found: ${name}`)
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('ValueModeHeaderStatus onboarding', () => {
  it('opens setup immediately and preselects the host default expert model', async () => {
    renderHeader({
      enabled: false,
      executor: undefined,
    }, {
      defaultExpert: { provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' },
    })

    const dialog = await findDialog('性价比模式配置引导')
    expect(dialog.textContent).toContain('专家主控模型')
    expect(dialog.textContent).toContain('deepseek / deepseek-reasoner')
    expect(dialog.textContent).toContain('已预选当前默认模型')
    expect([...dialog.querySelectorAll('button')].some((button) => button.textContent?.includes('专家分析'))).toBe(false)
  })

  it('commits both model roles before enabling the mode', async () => {
    const onChange = renderHeader({
      enabled: false,
    }, {
      defaultExpert: { provider: 'deepseek', model: 'deepseek-reasoner' },
      fetchModels: async () => ({
        groups: [{
          id: 'deepseek',
          name: 'DeepSeek',
          models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }],
        }],
      }),
    })

    await findDialog('性价比模式配置引导')
    clickButton('选择')
    await findDialog('选择副模型 / 子代理执行模型')
    let modelButton: HTMLButtonElement | null = null
    for (let attempt = 0; attempt < 40 && !modelButton; attempt++) {
      modelButton = document.querySelector<HTMLButtonElement>('[data-testid="value-mode-model-deepseek-chat"]')
      if (!modelButton) await settle()
    }
    expect(modelButton).toBeTruthy()
    act(() => modelButton?.click())
    clickButton('完成配置并开启')

    for (let attempt = 0; attempt < 40 && onChange.mock.calls.length < 3; attempt++) await settle()
    expect(onChange).toHaveBeenCalledTimes(3)
    expect(onChange.mock.calls[0][0]).toMatchObject({
      expert: { provider: 'deepseek', model: 'deepseek-reasoner' },
      executor: { provider: 'deepseek', model: 'deepseek-chat' },
    })
    expect(onChange.mock.calls[1][0]).toEqual({ strategy: 'balanced' })
    expect(onChange.mock.calls[2][0]).toEqual({ enabled: true })
  })

  it('automatically enables an already configured mode on entry', async () => {
    const onChange = renderHeader({
      enabled: false,
      executor: { provider: 'deepseek', model: 'deepseek-chat' },
      expert: { provider: 'deepseek', model: 'deepseek-reasoner' },
    })

    for (let attempt = 0; attempt < 40 && onChange.mock.calls.length < 1; attempt++) await settle()
    expect(onChange).toHaveBeenCalledWith({ enabled: true })
    expect(document.querySelector('[role="dialog"][aria-label="性价比模式配置引导"]')).toBeNull()
  })
})
