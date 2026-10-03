import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, waitFor } from '@testing-library/react'

const desktop = vi.hoisted(() => ({ openDesktopSurface: vi.fn() }))
vi.mock('@linxin666/dsh-desktop-client', () => desktop)
import { installAccountRelayRecommendation } from '../src/client/account-relay-recommendation.ts'
import { relayEn, relayZh } from '../src/client/locales.ts'

let dispose: (() => void) | undefined
beforeEach(() => {
  desktop.openDesktopSurface.mockReset().mockResolvedValue(true)
  Object.defineProperty(window, 'dshDesktop', { configurable: true, value: {} })
  document.body.innerHTML = ''
})
afterEach(() => {
  dispose?.()
  dispose = undefined
  document.body.innerHTML = ''
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
    expect(official.nextElementSibling).toBe(recommendation)
    expect(recommendation?.textContent).toContain(copy.accountRecommendation)
    expect(recommendation?.textContent).toContain(copy.accountConnect)
    expect(official.outerHTML).toBe(original)
    expect(official.hidden).toBe(false)
    fireEvent.click(official)
    expect(click).toHaveBeenCalledOnce()
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(4)
  })

  it('opens existing bai setup and reports failure without changing official handlers', async () => {
    const official = menu()
    dispose = installAccountRelayRecommendation(document)
    const button = document.querySelector('[data-dsh-account-relay] button') as HTMLButtonElement
    desktop.openDesktopSurface.mockResolvedValue(false)
    fireEvent.click(button)
    expect(desktop.openDesktopSurface).toHaveBeenCalledWith('extensions', { setting: 'models' })
    await waitFor(() => expect(document.querySelector('[data-dsh-account-relay]')?.textContent).toContain(relayZh.accountOpenFailed))
    expect(button.disabled).toBe(false)
    expect(official.textContent).toBe('登录')
  })

  it('re-mounts once and retracts its own nodes on sign-in or disposal', async () => {
    menu()
    dispose = installAccountRelayRecommendation(document)
    menu()
    await waitFor(() => expect(document.querySelectorAll('[data-dsh-account-relay]')).toHaveLength(1))
    document.querySelector('[data-signed-out]')?.setAttribute('data-signed-out', 'false')
    await waitFor(() => expect(document.querySelector('[data-dsh-account-relay]')).toBeNull())
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
