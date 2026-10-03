/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { installRelayModelEntrances, RelayAccessDialog } from '../src/client/relay-model-entrances.tsx'
import { relayZh, type RelayLocaleKey } from '../src/client/locales.ts'
import { RELAY_CONNECT_PATH, RELAY_STATUS_PATH, RELAY_REFRESH_PATH, RELAY_WALLET_URL } from '../src/relay-protocol.ts'

const translate = (key: RelayLocaleKey) => relayZh[key]
const status = { ok: true, configured: false, profileConfigured: false, credentialConfigured: false, writable: true, modelCount: 0, models: [], firstRun: true }
const connectionUrl = 'https://api.1521003.xyz/dsh-desktop-connect.html#port=12345&state=public-test-state'
const disposers: Array<() => void> = []
afterEach(() => {
  act(() => { disposers.splice(0).forEach(dispose => dispose()) })
  cleanup()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function fixture(configured = false) {
  const open = vi.fn(async () => true)
  vi.stubGlobal('dshDesktop', { openExternalUrl: open })
  const requests = vi.fn(async (input: unknown) => {
    if (input === RELAY_STATUS_PATH) return new Response(JSON.stringify({ ...status, configured, firstRun: !configured }))
    if (input === RELAY_CONNECT_PATH) return new Response(JSON.stringify({ ok: true, connection: { phase: 'pending', url: connectionUrl } }))
    return new Response(JSON.stringify({ ok: true, modelCount: 1, models: [{ id: 'available-model', name: 'Available Model' }] }))
  })
  vi.stubGlobal('fetch', requests)
  return { open, requests }
}

it('does not open the browser on passive installation and disposes its document entry', () => {
  const { open, requests } = fixture()
  act(() => { disposers.push(installRelayModelEntrances(document, translate)) })
  expect(open).not.toHaveBeenCalled()
  expect(requests).not.toHaveBeenCalled()
  expect(document.querySelector('[data-dsh-relay-access-root]')).toBeTruthy()
  act(() => { disposers.splice(0).forEach(dispose => dispose()) })
  expect(document.querySelector('[data-dsh-relay-access-root]')).toBeNull()
})

it.each([undefined, 'official', 'third-party'])('a fresh user entering a non-bai picker (%s) is not prompted or probed', async provider => {
  const { open, requests } = fixture()
  const button = document.createElement('button')
  button.dataset.dshRelayModelEntry = 'true'
  if (provider) button.dataset.dshRelayProvider = provider
  button.textContent = '选择模型'
  document.body.append(button)
  const native = vi.fn()
  button.addEventListener('click', native)
  act(() => { disposers.push(installRelayModelEntrances(document, translate)) })
  fireEvent.click(button)
  await act(async () => { await Promise.resolve() })
  expect(native).toHaveBeenCalledOnce()
  expect(requests).not.toHaveBeenCalled()
  expect(open).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('an unauthenticated user choosing bai sees sign-in guidance and uses the trusted browser bridge once', async () => {
  const { open, requests } = fixture()
  const popup = vi.spyOn(window, 'open')
  document.body.innerHTML = '<button data-dsh-relay-model-entry="true" data-dsh-relay-provider="project-relay">选择模型</button>'
  act(() => { disposers.push(installRelayModelEntrances(document, translate)) })
  fireEvent.click(screen.getByText('选择模型'))
  expect(await screen.findByRole('dialog', { name: translate('accessTitle') })).toBeTruthy()
  await waitFor(() => expect(open).toHaveBeenCalledExactlyOnceWith(connectionUrl))
  expect(screen.getByText(translate('waitingBrowser'))).toBeTruthy()
  fireEvent.click(screen.getByText('选择模型'))
  expect(open).toHaveBeenCalledTimes(1)
  expect(popup).not.toHaveBeenCalled()
  expect(requests.mock.calls.filter(([path]) => path === RELAY_CONNECT_PATH)).toHaveLength(1)
})

it('preserves a returning user model interaction without intercepting it', async () => {
  const { open } = fixture(true)
  document.body.innerHTML = '<button data-dsh-relay-model-entry="true" data-dsh-relay-provider="third-party">Custom model</button>'
  const native = vi.fn()
  document.querySelector('button')!.addEventListener('click', native)
  act(() => { disposers.push(installRelayModelEntrances(document, translate)) })
  fireEvent.click(screen.getByText('Custom model'))
  await act(async () => { await Promise.resolve() })
  expect(native).toHaveBeenCalledOnce()
  expect(open).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('lets an unauthenticated bai user open the ordinary chooser to select another provider', async () => {
  const { open, requests } = fixture()
  document.body.innerHTML = '<button aria-haspopup="menu" data-dsh-relay-model-entry="true" data-dsh-relay-provider="project-relay">选择模型</button>'
  const native = vi.fn()
  document.querySelector('button')!.addEventListener('click', native)
  act(() => { disposers.push(installRelayModelEntrances(document, translate)) })
  fireEvent.click(screen.getByText('选择模型'))
  await act(async () => { await Promise.resolve() })
  expect(native).toHaveBeenCalledOnce()
  expect(requests).not.toHaveBeenCalled()
  expect(open).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('shows explicit bai access while configured, with top-up and refresh but no automatic payment or browser', async () => {
  const { open, requests } = fixture(true)
  document.body.innerHTML = '<button data-dsh-relay-connect="true">bai entry</button>'
  act(() => { disposers.push(installRelayModelEntrances(document, translate)) })
  fireEvent.click(screen.getByText('bai entry'))
  expect(await screen.findByText(translate('statusReady'))).toBeTruthy()
  expect(open).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: translate('openWallet') }))
  expect(open).toHaveBeenCalledExactlyOnceWith(RELAY_WALLET_URL)
  fireEvent.click(screen.getByRole('button', { name: translate('refreshModels') }))
  await waitFor(() => expect(requests.mock.calls.some(([path]) => path === RELAY_REFRESH_PATH)).toBe(true))
})

it('does not authorize a read-only surface and reports refusal to open the browser', async () => {
  const { open, requests } = fixture()
  requests.mockImplementation(async () => new Response(JSON.stringify({ ...status, writable: false })))
  render(<RelayAccessDialog t={translate} onClose={() => {}} autoConnect />)
  expect(await screen.findByText(translate('readonly'))).toBeTruthy()
  expect(open).not.toHaveBeenCalled()
  expect(requests.mock.calls.every(([path]) => path === RELAY_STATUS_PATH)).toBe(true)
})

it('runtime AUTH prompts login even when a rejected Key is still stored locally', async () => {
  const { open } = fixture(true)
  render(<RelayAccessDialog t={translate} onClose={() => {}} autoConnect forceAuth />)
  await waitFor(() => expect(open).toHaveBeenCalledExactlyOnceWith(connectionUrl))
  expect(screen.queryByText(translate('statusReady'))).toBeNull()
  expect(screen.getByText(translate('notSignedIn'))).toBeTruthy()
  expect(screen.queryByRole('button', { name: translate('refreshModels') })).toBeNull()
  expect(screen.getByRole('button', { name: translate('openWallet') })).toBeTruthy()
})

it('retains a usable continue link after the system browser rejects the first open', async () => {
  const { open } = fixture()
  open.mockResolvedValue(false)
  render(<RelayAccessDialog t={translate} onClose={() => {}} autoConnect />)
  expect(await screen.findByText(translate('errorOpenBrowser'))).toBeTruthy()
  expect(screen.getByRole('button', { name: translate('continueBrowser') })).toBeTruthy()
  expect(document.body.textContent).not.toContain('private-api-key')
})
