/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BrowserComponentCard } from '../src/client/BrowserComponentCard.tsx'
const status = (phase: string) => ({ phase, receivedBytes: 1048576, totalBytes: 2097152, version: '44.7.0' })
const response = (phase: string) => ({ ok: true, json: async () => status(phase) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
it('shows total bytes and cancel/retry while waiting for actual activation readiness', async () => {
  let phase = 'downloading'
  const fetch = vi.fn(async (url: string, options: RequestInit) => {
    if (url.endsWith('/cancel')) phase = 'cancelled'
    if (url.endsWith('/prepare')) phase = 'activating'
    expect(options.credentials).toBe('same-origin')
    return response(phase)
  })
  vi.stubGlobal('fetch', fetch)
  render(<BrowserComponentCard />)
  await screen.findByText('组件大小：2.0 MB；已接收 1.0 MB')
  expect(screen.getByRole('progressbar').getAttribute('value')).toBe('1048576')
  expect(screen.queryByText('可用 (44.7.0)')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '取消下载' }))
  await screen.findByRole('button', { name: '重试下载' })
  expect(fetch).toHaveBeenCalledWith('/api/desktop/browser-component/cancel', expect.objectContaining({ method: 'POST' }))
  fireEvent.click(screen.getByRole('button', { name: '重试下载' }))
  await screen.findByText('正在激活 (44.7.0)')
  expect(fetch).toHaveBeenCalledWith('/api/desktop/browser-component/prepare', expect.objectContaining({ method: 'POST' }))
  expect(screen.queryByText('可用 (44.7.0)')).toBeNull()
  phase = 'ready'
  await waitFor(() => expect(screen.getByText('可用 (44.7.0)')).toBeTruthy(), { timeout: 2000 })
  expect(screen.queryByRole('button', { name: '取消下载' })).toBeNull()
})
it('reports request failures and reuses the original browser permission editor', async () => {
  const fetch = vi.fn(async () => response('idle'))
  vi.stubGlobal('fetch', fetch)
  const plugin: unknown[] = [], setting: unknown[] = []
  const onPlugin = (event: Event) => plugin.push((event as CustomEvent).detail)
  const onSetting = (event: Event) => setting.push((event as CustomEvent).detail)
  window.addEventListener('dsh:dock-plugin', onPlugin)
  window.addEventListener('dsh:dock-setting', onSetting)
  try {
    render(<BrowserComponentCard />)
    await screen.findByText('尚未准备 (44.7.0)')
    fetch.mockRejectedValueOnce(new Error('offline'))
    fireEvent.click(screen.getByRole('button', { name: '准备浏览器组件' }))
    expect((await screen.findByRole('alert')).textContent).toBe('offline')
    expect(screen.queryByText('可用 (44.7.0)')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '浏览器设置与动作权限' }))
    expect(plugin).toEqual(['dsh-builtin-browser'])
    expect(setting).toEqual(['plugin-options'])
  } finally {
    window.removeEventListener('dsh:dock-plugin', onPlugin)
    window.removeEventListener('dsh:dock-setting', onSetting)
  }
})
it('does not poll or prepare while its retained settings form is inactive', async () => {
  const fetch = vi.fn(async () => response('ready'))
  vi.stubGlobal('fetch', fetch)
  render(<BrowserComponentCard active={false} />)
  await Promise.resolve()
  expect(fetch).not.toHaveBeenCalled()
})
