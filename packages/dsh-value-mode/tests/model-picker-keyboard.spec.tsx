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
