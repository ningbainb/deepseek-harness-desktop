/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { ValueModeSettingsCard } from '../src/client/ValueModeSettingsCard.tsx'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const roots: Root[] = []

afterEach(() => {
  roots.splice(0).forEach(root => act(() => root.unmount()))
  document.body.innerHTML = ''
  document.documentElement.lang = ''
  window.history.replaceState({}, '', '/')
})

function mount() {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  const onChange = vi.fn(async () => {})
  act(() => root.render(<ValueModeSettingsCard config={{ expert: { provider: 'fixture', model: 'planner' },
    executor: { provider: 'fixture', model: 'worker' } }} onChange={onChange} />))
  return { onChange, card: container.querySelector('[data-value-mode-card]')! }
}

it('distinguishes cost-aware collaboration from the page title and keeps its settings directly operable', async () => {
  window.history.replaceState({}, '', '/?desktop-dock-setting=value-mode')
  const { card, onChange } = mount()
  expect(card.firstElementChild!.textContent).toContain('性价比模式')
  expect(card.firstElementChild!.textContent).not.toContain('模型协作')
  const details = card.querySelector<HTMLDetailsElement>('[data-value-mode-details]')
  expect(details).not.toBeNull()
  expect(details!.open).toBe(false)
  expect(details!.textContent).toContain('使用已有供应商配置')
  expect(details!.textContent).toContain('负责规划任务与最终交付')
  expect(details!.textContent).toContain('接收主控分派的任务')
  const control = card.querySelector<HTMLButtonElement>('[role="switch"]')!
  expect(control.disabled).toBe(false)
  expect(details!.contains(control)).toBe(false)
  expect(details!.contains(card.querySelector('[aria-label="更换专家主控模型"]'))).toBe(false)
  act(() => details!.querySelector('summary')!.click())
  expect(details!.open).toBe(true)
  await act(async () => control.click())
  expect(onChange).toHaveBeenCalledWith({ enabled: true })
})

it('localizes the new Dock disclosure without changing the ordinary settings presentation', () => {
  window.history.replaceState({}, '', '/?desktop-dock-setting=value-mode')
  document.documentElement.lang = 'en'
  const { card } = mount()
  expect(card.querySelector('[data-value-mode-details] > summary')?.textContent).toBe('Details')
  window.history.replaceState({}, '', '/')
  const ordinary = mount().card
  expect(ordinary.querySelector('[data-value-mode-details]')).toBeNull()
  expect(ordinary.textContent).toContain('不需要重新填写 API Key')
})
