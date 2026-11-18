import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'

import { installAccountRelayRecommendation } from '../src/client/account-relay-recommendation.ts'
import { relayEn, relayZh } from '../src/client/locales.ts'
import { installRelayModelEntrances } from '../src/client/relay-model-entrances.tsx'
import { RELAY_CONNECT_PATH, RELAY_STATUS_PATH } from '../src/relay-protocol.ts'

let dispose: (() => void) | undefined
let disposeAccess: (() => void) | undefined
beforeEach(() => {
  Object.defineProperty(window, 'dshDesktop', { configurable: true, value: {} })
  document.body.innerHTML = ''
})
afterEach(() => {
  dispose?.()
  act(() => disposeAccess?.())
  disposeAccess = undefined
  dispose = undefined
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  Reflect.deleteProperty(window, 'dshDesktop')
})

function menu(login = '登录', settings = '设置') {
  document.body.innerHTML = `<button data-signed-out="true" aria-expanded="true" aria-haspopup="menu">账号菜单</button>
    <div role="menu"><div><button role="menuitem"><span>${settings}</span><span aria-hidden="true">Ctrl+,</span></button></div>
    <div><button role="menuitem">意见反馈</button></div><div><button role="menuitem" id="official-login">${login}</button></div></div>`
  return document.getElementById('official-login') as HTMLButtonElement
}

describe('account bai recommendation', () => {
  it.each([['登录', '设置', relayZh], ['Sign in', 'Settings', relayEn], ['Log in', 'Settings', relayEn]])('adds a %s recommendation directly below the unchanged official login', (login, settings, copy) => {
    const official = menu(login, settings)
    const click = vi.fn()
    official.addEventListener('click', click)
    const original = official.outerHTML
    dispose = installAccountRelayRecommendation(document)
    const recommendation = document.querySelector('[data-dsh-account-relay]')
    expect(official.previousElementSibling?.hasAttribute('data-dsh-account-official')).toBe(true)
    expect(official.previousElementSibling?.textContent).toMatch(/DeepSeek/u)
    expect(official.nextElementSibling).toBe(recommendation)
    expect(recommendation?.textContent).toContain(copy.accountRecommendation)
    expect(recommendation?.textContent).toContain(copy.accountConnect)
    expect(official.outerHTML).toBe(original)
    expect(official.hidden).toBe(false)
    fireEvent.click(official)
    expect(click).toHaveBeenCalledOnce()
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(4)
  })

  it('starts the existing browser authorization once directly from the account menu', async () => {
    const official = menu()
    const url = 'https://api.1521003.xyz/dsh-desktop-connect.html#port=12345&state=public-test-state'
    const open = vi.fn().mockResolvedValue(true)
    Object.defineProperty(window, 'dshDesktop', { configurable: true, value: { openExternalUrl: open } })
    const request = vi.fn(async (path: string) => Response.json(path === RELAY_STATUS_PATH
      ? { ok: true, configured: false, writable: true }
      : { ok: true, connection: { phase: 'pending', url } }))
    vi.stubGlobal('fetch', request)
    act(() => { disposeAccess = installRelayModelEntrances(document, key => relayZh[key]) })
    dispose = installAccountRelayRecommendation(document)
    const button = screen.getByRole('menuitem', { name: relayZh.accountConnect })
    expect(request).not.toHaveBeenCalled()
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(open).toHaveBeenCalledExactlyOnceWith(url))
    expect(screen.getByRole('dialog', { name: relayZh.accessTitle })).toBeTruthy()
    expect(request.mock.calls.filter(([path]) => path === RELAY_CONNECT_PATH)).toHaveLength(1)
    expect(official.textContent).toBe('登录')
  })

  it('re-mounts once and retracts its own nodes on sign-in or disposal', async () => {
    menu()
    dispose = installAccountRelayRecommendation(document)
    menu()
    await waitFor(() => expect(document.querySelectorAll('[data-dsh-account-relay]')).toHaveLength(1))
    document.querySelector('[data-signed-out]')?.setAttribute('data-signed-out', 'false')
    await waitFor(() => expect(document.querySelector('[data-dsh-account-relay]')).toBeNull())
    expect(document.querySelector('[data-dsh-account-official]')).toBeNull()
    document.querySelector('[data-signed-out]')?.setAttribute('data-signed-out', 'true')
    await waitFor(() => expect(document.querySelector('[data-dsh-account-relay]')).not.toBeNull())
    dispose()
    menu()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.querySelector('[data-dsh-account-relay]')).toBeNull()
  })

  it('does not augment browser hosts, signed-in menus or unrelated menus', () => {
    menu()
    Reflect.deleteProperty(window, 'dshDesktop')
    dispose = installAccountRelayRecommendation(document)
    expect(document.querySelector('[data-dsh-account-relay]')).toBeNull()
    dispose()
    Object.defineProperty(window, 'dshDesktop', { configurable: true, value: {} })
    menu('退出登录')
    dispose = installAccountRelayRecommendation(document)
    expect(document.querySelector('[data-dsh-account-relay]')).toBeNull()
    dispose()
    menu('登录', 'Other action')
    dispose = installAccountRelayRecommendation(document)
    expect(document.querySelector('[data-dsh-account-relay]')).toBeNull()
  })
})
