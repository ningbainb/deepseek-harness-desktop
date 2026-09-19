/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RelayOnboardingCard } from '../src/client/RelayOnboardingCard.tsx'
import { relayEn, type RelayLocaleKey } from '../src/client/locales.ts'
import { RELAY_KEYS_URL, RELAY_SIGN_UP_URL, RELAY_WALLET_URL } from '../src/relay-protocol.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const t = (key: string): string => relayEn[key as RelayLocaleKey] ?? key

describe('RelayOnboardingCard external links', () => {
  it('collapses only relay content and preserves the connection form draft', () => {
    render(<RelayOnboardingCard t={t} />)
    const field = screen.getByLabelText(t('keyLabel')) as HTMLInputElement
    const collapse = screen.getByRole('button', { name: t('collapseRelay') })
    expect(collapse.parentElement?.firstElementChild).toBe(collapse)
    expect(collapse.getAttribute('aria-expanded')).toBe('true')
    expect(collapse.querySelector('path')?.getAttribute('d')).toBe('M4 10l4-4 4 4')
    fireEvent.change(field, { target: { value: 'local-draft-only' } })
    fireEvent.click(screen.getByRole('button', { name: t('collapseRelay') }))
    expect(document.getElementById('dsh-relay-content')?.hidden).toBe(true)
    expect(collapse.querySelector('path')?.getAttribute('d')).toBe('M4 6l4 4 4-4')
    expect(collapse.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('heading', { name: t('title') })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('expandRelay') }))
    expect(document.getElementById('dsh-relay-content')?.hidden).toBe(false)
    expect(field.value).toBe('local-draft-only')
  })
  it('triggers openExternalUrl when clicking the action links', () => {
    const fakePopup = { location: { href: '' } } as unknown as Window
    const windowOpen = vi.spyOn(window, 'open').mockReturnValue(fakePopup)

    const props = { t } as Parameters<typeof RelayOnboardingCard>[0]
    render(<RelayOnboardingCard {...props} />)

    fireEvent.click(screen.getByText(t('accountTools')))
    const keysLink = screen.getByRole('link', { name: t('openKeys') })
    expect(keysLink).toBeTruthy()
    expect(keysLink.getAttribute('href')).toBe(RELAY_KEYS_URL)

    fireEvent.click(keysLink)
    expect(windowOpen).toHaveBeenCalledWith('about:blank', '_blank')
    expect(fakePopup.location.href).toBe(RELAY_KEYS_URL)

    const walletLink = screen.getByRole('link', { name: t('openWallet') })
    fireEvent.click(walletLink)
    expect(fakePopup.location.href).toBe(RELAY_WALLET_URL)

    const signUpLink = screen.getByRole('link', { name: t('openRegister') })
    fireEvent.click(signUpLink)
    expect(fakePopup.location.href).toBe(RELAY_SIGN_UP_URL)
  })

  it('keeps one primary first-run path and reports only fixed acquisition stages', async () => {
    const telemetry = vi.fn()
    vi.stubGlobal('dshDockSettings', { recordBaiAcquisitionEvent: telemetry })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input)
      const value = path.includes('connect/status')
        ? { ok: true, connection: { phase: 'idle' } }
        : path.endsWith('/connect')
          ? { ok: true, connection: { phase: 'starting' } }
          : { ok: true, configured: false, profileConfigured: false, credentialConfigured: false, writable: true, modelCount: 0, models: [] }
      return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    render(<RelayOnboardingCard t={t} />)
    const primary = await screen.findByRole('button', { name: t('connect') })
    await waitFor(() => expect((primary as HTMLButtonElement).disabled).toBe(false))
    const wallet = screen.getByRole('link', { name: t('openWallet') })
    expect((wallet.closest('details') as HTMLDetailsElement | null)?.open).toBe(false)
    expect(screen.getByText(t('benefitSync'))).toBeTruthy()
    expect(telemetry).toHaveBeenCalledWith('viewed', 'entry')

    fireEvent.click(primary)
    await waitFor(() => expect(telemetry).toHaveBeenCalledWith('started', 'browser'))
  })

  it('collapses a completed onboarding while keeping model selection one click away', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const value = String(input).includes('connect/status')
        ? { ok: true, connection: { phase: 'idle' } }
        : { ok: true, configured: true, profileConfigured: true, credentialConfigured: true, writable: true, modelCount: 2, models: [{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }] }
      return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    render(<RelayOnboardingCard t={t} />)
    await screen.findByText(t('statusReady'))
    await waitFor(() => expect(document.getElementById('dsh-relay-content')?.hidden).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: t('expandRelay') }))
    expect(screen.getByRole('button', { name: t('chooseModel') })).toBeTruthy()
    expect(screen.queryByText(t('benefitSync'))).toBeNull()
  })
})
