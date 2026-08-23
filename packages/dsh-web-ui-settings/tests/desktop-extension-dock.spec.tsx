/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const desktop = vi.hoisted(() => ({
  dismissDockNudge: vi.fn(),
  getDockEntryState: vi.fn(),
  openDesktopSurface: vi.fn(),
}))

vi.mock('@linxin666/dsh-desktop-client', () => desktop)

import {
  DesktopExtensionDockEntry,
  calculateDockNudgePosition,
} from '../src/client/desktop-extension-dock.tsx'
import { zh } from '../src/client/locales.ts'

const t = ((key: keyof typeof zh) => zh[key]) as never

beforeEach(() => {
  desktop.getDockEntryState.mockResolvedValue({ available: true, showNudge: true })
  desktop.dismissDockNudge.mockResolvedValue(true)
  desktop.openDesktopSurface.mockResolvedValue(true)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Desktop Extension Dock entry', () => {
  it('stays absent on ordinary Web hosts', async () => {
    desktop.getDockEntryState.mockResolvedValue({ available: false, reason: 'unavailable' })
    render(<DesktopExtensionDockEntry wide={true} t={t} />)
    await waitFor(() => expect(desktop.getDockEntryState).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('button', { name: '打开拓展坞' })).toBeNull()
  })

  it('shows the exact lightweight first-three-launch message and closes without blocking', async () => {
    render(<DesktopExtensionDockEntry wide={true} t={t} />)
    const copy = await screen.findByText('插件、技能和桌面核心功能在这里')
    expect(copy.parentElement?.parentElement).toBe(document.body)
    fireEvent.click(screen.getByRole('button', { name: '关闭拓展坞提示' }))
    expect(screen.queryByText('插件、技能和桌面核心功能在这里')).toBeNull()
    expect(desktop.dismissDockNudge).toHaveBeenCalledWith('close')
  })

  it('clamps the portaled hint inside a narrow viewport while pointing at the trigger', () => {
    expect(calculateDockNudgePosition({
      trigger: { left: -8, top: 580, width: 36 },
      viewportWidth: 240,
      viewportHeight: 640,
    })).toEqual({ left: 12, bottom: 70, arrowLeft: 14 })
  })

  it('dismisses with Escape and keeps keyboard focus untouched', async () => {
    render(<DesktopExtensionDockEntry wide={false} t={t} />)
    await screen.findByText('插件、技能和桌面核心功能在这里')
    const trigger = screen.getByRole('button', { name: '打开拓展坞' })
    trigger.focus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('插件、技能和桌面核心功能在这里')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(desktop.dismissDockNudge).toHaveBeenCalledWith('escape')
  })

  it('opens the Dock in one click and reports only a local failure message when unavailable', async () => {
    render(<DesktopExtensionDockEntry wide={true} t={t} />)
    const trigger = await screen.findByRole('button', { name: '打开拓展坞' })
    fireEvent.click(trigger)
    await waitFor(() => expect(desktop.openDesktopSurface).toHaveBeenCalledWith('extensions'))
    expect(desktop.openDesktopSurface).toHaveBeenCalledTimes(1)
    expect(desktop.dismissDockNudge).toHaveBeenCalledWith('clicked')
    expect(screen.queryByText('插件、技能和桌面核心功能在这里')).toBeNull()

    desktop.openDesktopSurface.mockResolvedValueOnce(false)
    fireEvent.click(trigger)
    expect((await screen.findByRole('alert')).textContent).toBe('拓展坞未能打开，请从工具菜单重试。')
  })
})
