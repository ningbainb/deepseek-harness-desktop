/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { ModelPicker } from '../src/client/ModelPicker.tsx'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const roots: Root[] = []
afterEach(() => {
  roots.splice(0).forEach(root => act(() => root.unmount()))
  document.body.innerHTML = ''
  vi.useRealTimers()
})

function mount(container: HTMLElement, onClose = vi.fn()) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<ModelPicker title="Models" onClose={onClose} onSelect={() => {}} />))
  return root
}

it('closes with Escape and restores focus to the trigger', () => {
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  const onClose = vi.fn()
  const container = document.createElement('div')
  document.body.append(container)
  const root = mount(container, onClose)
  const dialog = document.querySelector('[role="dialog"]')!
  expect(dialog.contains(document.activeElement)).toBe(true)
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(onClose).toHaveBeenCalledOnce()
  act(() => root.unmount())
  roots.splice(roots.indexOf(root), 1)
  expect(document.activeElement).toBe(trigger)
  trigger.remove()
})

it('keeps Dock dialogs inside their form and theme boundary', () => {
  const pane = document.createElement('main')
  pane.dataset.dshDockSettings = 'value-mode'
  document.body.append(pane)
  mount(pane)
  expect(pane.contains(document.querySelector('[role="dialog"]'))).toBe(true)
})

it('settles a stalled public loader, retries successfully and ignores the older completion', async () => {
  vi.useFakeTimers()
  let finishOld!: (value: unknown) => void
  const fetchModels = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
    .mockResolvedValue({ groups: [{ id: 'relay', models: [{ id: 'new-model', name: 'New Model' }] }] })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container); roots.push(root)
  await act(async () => root.render(<ModelPicker title="Models" onClose={() => {}} onSelect={() => {}} fetchModels={fetchModels} />))
  await act(async () => { await vi.advanceTimersByTimeAsync(12_000) })
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('超时')
  expect(document.body.textContent).not.toContain('加载已配置模型列表中')
  const retry = [...document.querySelectorAll('button')].find(button => button.textContent === '重试')!
  await act(async () => retry.click())
  expect(document.querySelector('[data-model-id="new-model"]')).toBeTruthy()
  await act(async () => finishOld({ groups: [{ id: 'old', models: [{ id: 'old-model', name: 'Old Model' }] }] }))
  expect(document.querySelector('[data-model-id="old-model"]')).toBeNull()
  expect(document.querySelector('[data-model-id="new-model"]')).toBeTruthy()
  expect(vi.getTimerCount()).toBe(0)
})

it('turns a synchronous loader exception into a recoverable alert', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container); roots.push(root)
  await act(async () => root.render(<ModelPicker title="Models" onClose={() => {}} onSelect={() => {}} fetchModels={() => { throw new Error('not ready') }} />))
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('not ready')
  expect(document.body.textContent).not.toContain('加载已配置模型列表中')
})
