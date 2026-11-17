/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import * as desktop from '@linxin666/dsh-desktop-client'
import { ModelAdvancedEntry } from '../src/client/ModelAdvancedEntry.tsx'
afterEach(() => { cleanup(); vi.restoreAllMocks() })
it('opens the same Value Mode editor as legacy model collaboration links without embedding another form', async () => {
  const open = vi.spyOn(desktop, 'openDesktopSurface').mockResolvedValue(true)
  const { container } = render(<ModelAdvancedEntry />)
  fireEvent.click(container.querySelector('summary')!)
  fireEvent.click(screen.getByRole('button', { name: '性价比模式 (Value Mode)' }))
  await waitFor(() => expect(open).toHaveBeenCalledWith('extensions', { setting: 'value-mode' }))
  expect(container.querySelector('input, textarea, select')).toBeNull()
})
it('keeps a retryable error if the dedicated editor cannot open', async () => {
  const open = vi.spyOn(desktop, 'openDesktopSurface').mockResolvedValue(false)
  const { container } = render(<ModelAdvancedEntry />)
  fireEvent.click(container.querySelector('summary')!)
  fireEvent.click(screen.getByRole('button'))
  await screen.findByRole('alert')
  open.mockResolvedValue(true)
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
})
