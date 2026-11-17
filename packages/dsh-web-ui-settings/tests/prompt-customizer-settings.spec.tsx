/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PromptCustomizerSettingsCard } from '../src/client/PromptCustomizerSettingsCard.tsx'

afterEach(() => { cleanup(); delete (window as unknown as { dshDockSettings?: unknown }).dshDockSettings })

it('shows P2 storage and P1 distinction, then waits for healthy activation before showing enabled', async () => {
  let complete!: (value: { available: boolean; enabled: boolean }) => void
  const setPromptCustomizerEnabled = vi.fn(() => new Promise(resolve => { complete = resolve }))
  Object.defineProperty(window, 'dshDockSettings', { configurable: true, value: {
    getPromptCustomizerStatus: async () => ({ available: true, enabled: false, version: '2.2.0' }), setPromptCustomizerEnabled,
    onPromptCustomizerProgress: () => () => {},
  } })
  render(<PromptCustomizerSettingsCard />)
  const control = await screen.findByRole('switch', { name: 'Agent 高级提示词 (P2)' })
  await waitFor(() => expect((control as HTMLButtonElement).disabled).toBe(false))
  expect(screen.getByText(/SQLite/u)).toBeTruthy()
  expect(screen.getByText(/普通回复偏好.*P1/u)).toBeTruthy()
  fireEvent.click(control)
  expect(setPromptCustomizerEnabled).toHaveBeenCalledWith(true)
  expect(control.getAttribute('aria-checked')).toBe('false')
  expect((control as HTMLButtonElement).disabled).toBe(true)
  complete({ available: true, enabled: true })
  await waitFor(() => expect(control.getAttribute('aria-checked')).toBe('true'))
  expect(screen.getByText(/能力.*提示词/u)).toBeTruthy()
})

it('keeps P2 disabled and exposes recovery error after an unhealthy restart', async () => {
  Object.defineProperty(window, 'dshDockSettings', { configurable: true, value: {
    getPromptCustomizerStatus: async () => ({ available: true, enabled: false }),
    setPromptCustomizerEnabled: async () => { throw new Error('P2 health failed; previous profile restored') },
    onPromptCustomizerProgress: () => () => {},
  } })
  render(<PromptCustomizerSettingsCard />)
  const control = await screen.findByRole('switch', { name: 'Agent 高级提示词 (P2)' })
  await waitFor(() => expect((control as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(control)
  expect((await screen.findByRole('alert')).textContent).toContain('P2 health failed')
  expect(control.getAttribute('aria-checked')).toBe('false')
  expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
})
