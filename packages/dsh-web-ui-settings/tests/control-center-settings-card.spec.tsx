/** @vitest-environment jsdom */

import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ControlCenterSettingsCard } from '../src/client/ControlCenterSettingsCard.tsx'

const ready = {
  browser: { enabled: false, provider: 'playwright', state: 'ready' as const, browsers: [{ id: 'edge', label: 'Microsoft Edge' }] },
  computer: { enabled: false, provider: 'cua-native', state: 'ready' as const, platform: 'win32' },
}

afterEach(() => {
  cleanup()
  delete (window as unknown as { dshDockSettings?: unknown }).dshDockSettings
})

it('reports restart phases and always releases the Computer Use switch after failure', async () => {
  let progress: ((value: { kind: 'computer'; phase: 'starting' }) => void) | undefined
  let rejectSet: ((reason: Error) => void) | undefined
  const setComputerUseEnabled = vi.fn(() => new Promise<typeof ready>((_resolve, reject) => { rejectSet = reject }))
  ;(window as unknown as { dshDockSettings: unknown }).dshDockSettings = {
    getControlCenterState: vi.fn(async () => ready),
    setBrowserUseEnabled: vi.fn(async () => ready),
    setComputerUseEnabled,
    testControlProvider: vi.fn(async () => ({ state: 'ready' })),
    openControlPermissionSettings: vi.fn(async () => true),
    onControlCenterProgress(listener: (value: { kind: 'computer'; phase: 'starting' }) => void) { progress = listener; return () => {} },
  }
  render(<ControlCenterSettingsCard />)
  const toggle = await screen.findByRole('switch', { name: 'Computer Use' })
  await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(toggle)
  progress?.({ kind: 'computer', phase: 'starting' })
  expect(await screen.findByText('正在重启 DeepSeek Harness')).toBeTruthy()
  rejectSet?.(new Error('provider startup failed'))
  await waitFor(() => expect(screen.getByText('provider startup failed')).toBeTruthy())
  expect((toggle as HTMLButtonElement).disabled).toBe(false)
  expect(toggle.getAttribute('aria-checked')).toBe('false')
  expect(setComputerUseEnabled).toHaveBeenCalledWith(true, 'cua-native')
})

it('keeps both control switches locked until the initial state read completes', async () => {
  let resolve: ((value: typeof ready) => void) | undefined
  const pending = new Promise<typeof ready>(done => { resolve = done })
  ;(window as unknown as { dshDockSettings: unknown }).dshDockSettings = {
    getControlCenterState: () => pending,
    setBrowserUseEnabled: vi.fn(), setComputerUseEnabled: vi.fn(), testControlProvider: vi.fn(),
    openControlPermissionSettings: vi.fn(),
  }
  render(<ControlCenterSettingsCard />)
  expect((screen.getByRole('switch', { name: 'Browser Use' }) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByRole('switch', { name: 'Computer Use' }) as HTMLButtonElement).disabled).toBe(true)
  resolve!(ready)
  await waitFor(() => expect((screen.getByRole('switch', { name: 'Computer Use' }) as HTMLButtonElement).disabled).toBe(false))
})

it('lets the user choose Agent WSL permission separately from Computer Use', async () => {
  const setAgentShellPolicy = vi.fn(async () => ({ mode: 'allow' as const, valid: true }))
  ;(window as unknown as { dshDockSettings: unknown }).dshDockSettings = {
    getControlCenterState: vi.fn(async () => ready),
    setBrowserUseEnabled: vi.fn(async () => ready),
    setComputerUseEnabled: vi.fn(async () => ready),
    testControlProvider: vi.fn(async () => ({ state: 'ready' })),
    openControlPermissionSettings: vi.fn(async () => true),
    getAgentShellPolicy: vi.fn(async () => ({ mode: 'ask', valid: true })),
    setAgentShellPolicy,
  }
  render(<ControlCenterSettingsCard />)
  const selector = await screen.findByRole('combobox', { name: 'Agent WSL 权限' })
  await waitFor(() => expect((selector as HTMLSelectElement).disabled).toBe(false))
  fireEvent.change(selector, { target: { value: 'allow' } })
  await waitFor(() => expect(setAgentShellPolicy).toHaveBeenCalledWith('allow'))
  await waitFor(() => expect((selector as HTMLSelectElement).value).toBe('allow'))
})
