/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RelayOnboardingCard } from '../src/client/RelayOnboardingCard.tsx'
import { relayEn, type RelayLocaleKey } from '../src/client/locales.ts'
import { RELAY_KEYS_URL, RELAY_SIGN_UP_URL, RELAY_WALLET_URL } from '../src/relay-protocol.ts'

afterEach(cleanup)

const t = (key: RelayLocaleKey): string => relayEn[key] ?? key

describe('RelayOnboardingCard external links', () => {
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
