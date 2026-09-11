/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RelayOnboardingCard } from '../src/client/RelayOnboardingCard.tsx'
import { relayEn, type RelayLocaleKey } from '../src/client/locales.ts'
import { RELAY_KEYS_URL, RELAY_SIGN_UP_URL, RELAY_WALLET_URL } from '../src/relay-protocol.ts'

afterEach(cleanup)

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
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('triggers openExternalUrl when clicking the action links', () => {
    const fakePopup = { location: { href: '' } } as unknown as Window
    const windowOpen = vi.spyOn(window, 'open').mockReturnValue(fakePopup)

    const props = { t } as Parameters<typeof RelayOnboardingCard>[0]
    render(<RelayOnboardingCard {...props} />)

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
})
