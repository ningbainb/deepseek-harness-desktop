/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FIRST_RUN_DISMISSED_KEY, installFirstRunChooser } from '../src/client/FirstRunChooser.tsx'
import { relayZh, type RelayLocaleKey } from '../src/client/locales.ts'
import { RELAY_SIGN_IN_REQUIRED_EVENT } from '../src/client/relay-send-guard.ts'
import type { RelayStatusResponse } from '../src/relay-protocol.ts'

const translate = (key: RelayLocaleKey) => relayZh[key]
const disposers: Array<() => void> = []

afterEach(() => {
  act(() => { disposers.splice(0).forEach(dispose => dispose()) })
  cleanup()
  localStorage.clear()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

const firstRunStatus: RelayStatusResponse = {
  ok: true,
  configured: false,
  profileConfigured: false,
  credentialConfigured: false,
  writable: true,
  modelCount: 0,
  models: [],
  firstRun: true,
}

describe('FirstRunChooser', () => {
  it('renders 3 provider comparison cards on firstRun and opens relay auth when selected', async () => {
    const openModelsSettings = vi.fn()
    const signIn = vi.fn()
    document.addEventListener(RELAY_SIGN_IN_REQUIRED_EVENT, signIn)
    disposers.push(() => document.removeEventListener(RELAY_SIGN_IN_REQUIRED_EVENT, signIn))

    act(() => {
      disposers.push(installFirstRunChooser(document, translate, {
        openModelsSettings,
        readStatus: async () => firstRunStatus,
      }))
    })

    const dialog = await screen.findByRole('region', { name: translate('firstRunTitle') })
    expect(dialog).toBeTruthy()
    expect(screen.getByText(translate('firstRunOfficialTitle'))).toBeTruthy()
    expect(screen.getByText(translate('firstRunRelayTitle'))).toBeTruthy()
    expect(screen.getByText(translate('firstRunLocalTitle'))).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: translate('firstRunRelayAction') }))
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1))
    expect(localStorage.getItem(FIRST_RUN_DISMISSED_KEY)).toBe('1')
    expect(screen.queryByRole('region', { name: translate('firstRunTitle') })).toBeNull()
    expect(openModelsSettings).not.toHaveBeenCalled()
  })

  it('does not show when not firstRun, already configured, or previously dismissed', async () => {
    const readNotFirstRun = vi.fn(async () => ({ ...firstRunStatus, firstRun: false }))
    act(() => {
      disposers.push(installFirstRunChooser(document, translate, {
        openModelsSettings: vi.fn(),
        readStatus: readNotFirstRun,
      }))
    })
    await waitFor(() => expect(readNotFirstRun).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('region', { name: translate('firstRunTitle') })).toBeNull()

    localStorage.setItem(FIRST_RUN_DISMISSED_KEY, '1')
    const readShouldSkip = vi.fn(async () => firstRunStatus)
    act(() => {
      disposers.push(installFirstRunChooser(document, translate, {
        openModelsSettings: vi.fn(),
        readStatus: readShouldSkip,
      }))
    })
    await Promise.resolve()
    expect(readShouldSkip).not.toHaveBeenCalled()
  })

  it('routes official and local cards to model settings and persists dismissal', async () => {
    const openModelsSettings = vi.fn()
    act(() => {
      disposers.push(installFirstRunChooser(document, translate, {
        openModelsSettings,
        readStatus: async () => firstRunStatus,
      }))
    })
    await screen.findByRole('region', { name: translate('firstRunTitle') })
    fireEvent.click(screen.getByRole('button', { name: translate('firstRunLocalAction') }))
    expect(openModelsSettings).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(FIRST_RUN_DISMISSED_KEY)).toBe('1')
  })
})
