import { afterEach, expect, it, vi } from 'vitest'
import { confirmCustomProviderKey, installCustomProviderKeyPersistence } from '../src/client/custom-provider-key-persistence.ts'

const keyValue = 'synthetic-credential-do-not-display'
let dispose: (() => void) | undefined
afterEach(() => { dispose?.(); dispose = undefined; document.body.replaceChildren() })

function fixture(saveAndConfirm: (ref: string, value: string) => Promise<void>, english = false, dock = false) {
  document.body.innerHTML = `<section ${dock ? 'data-dsh-dock-settings="models"' : 'class="dsh-desktop-settings-window"'}><div id="editor"><input aria-label="Provider ID" value="custom-test"><input aria-label="${english ? 'API key' : 'API 密钥'}"><button><span>${english ? 'Create provider' : '创建提供商'}</span></button></div></section>`
  const route = document.querySelector<HTMLInputElement>('[aria-label="Provider ID"]')!
  const key = document.querySelector<HTMLInputElement>('[aria-label="API 密钥"], [aria-label="API key"]')!
  key.value = keyValue
  const button = document.querySelector('button')!
  vi.spyOn(button, 'getClientRects').mockImplementation(() => (button.closest('[hidden]') ? [] : [{}]) as unknown as DOMRectList)
  const commit = vi.fn()
  button.addEventListener('click', commit)
  dispose = installCustomProviderKeyPersistence(document, { saveAndConfirm, translate: key => key })
  return { route, key, button, commit }
}

it.each([false, true])('waits for durable confirmation before replaying the original create action (English=%s)', async english => {
  let finish!: () => void
  const save = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const state = fixture(save, english)
  state.button.querySelector('span')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  expect(state.commit).not.toHaveBeenCalled()
  await vi.waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith('CUSTOM_TEST_API_KEY', keyValue))
  expect(state.button.getAttribute('aria-busy')).toBe('true')
  finish()
  await vi.waitFor(() => expect(state.commit).toHaveBeenCalledOnce())
  expect(document.querySelector('[data-dsh-provider-key-save]')).toBeNull()
  expect(state.button.hasAttribute('aria-busy')).toBe(false)
})

it('keeps the draft and prevents provider creation on rejection, without leaking the service error; retry works', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error(keyValue)).mockResolvedValue(undefined)
  const state = fixture(save)
  state.button.click()
  await vi.waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toBe('providerKeySaveFailed'))
  expect(state.commit).not.toHaveBeenCalled()
  expect(state.key.value).toBe(keyValue)
  expect(document.body.textContent).not.toContain(keyValue)
  expect(document.body.outerHTML).not.toContain(keyValue)
  state.button.click()
  await vi.waitFor(() => expect(state.commit).toHaveBeenCalledOnce())
  expect(save).toHaveBeenCalledTimes(2)
})

it('coalesces pending duplicate clicks and handles a synchronous refusal', async () => {
  let reject!: (reason: Error) => void
  const save = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail }))
  const state = fixture(save)
  state.button.click(); state.button.click()
  await vi.waitFor(() => expect(save).toHaveBeenCalledOnce())
  reject(new Error('refused'))
  await vi.waitFor(() => expect(document.querySelector('[role="alert"]')).not.toBeNull())
  expect(state.commit).not.toHaveBeenCalled()
})

it.each(['route', 'key'] as const)('does not replay a stale create when the %s changes during saving', async field => {
  let finish!: () => void
  const state = fixture(() => new Promise<void>(resolve => { finish = resolve }))
  state.button.click()
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  state[field].value += '-changed'
  finish()
  await vi.waitFor(() => expect(document.querySelector('[role="status"]')?.textContent).toBe('providerKeyChanged'))
  expect(state.commit).not.toHaveBeenCalled()
})

it.each(['dispose', 'detach', 'disable', 'hide'] as const)('does not replay after %s while the save is pending', async action => {
  let finish!: () => void
  const state = fixture(() => new Promise<void>(resolve => { finish = resolve }))
  state.button.click()
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  if (action === 'dispose') dispose!()
  else if (action === 'detach') state.button.parentElement!.remove()
  else if (action === 'hide') state.button.parentElement!.hidden = true
  else state.button.disabled = true
  finish()
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  expect(state.commit).not.toHaveBeenCalled()
})

it('also guards Dock model creation', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  const state = fixture(save, false, true)
  state.button.click()
  await vi.waitFor(() => expect(state.commit).toHaveBeenCalledOnce())
  expect(save).toHaveBeenCalledExactlyOnceWith('CUSTOM_TEST_API_KEY', keyValue)
})

it('does not let a second click bypass a pending save after the key is cleared', async () => {
  let finish!: () => void
  const state = fixture(() => new Promise<void>(resolve => { finish = resolve }))
  state.button.click()
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  state.key.value = ''
  state.button.click()
  expect(state.commit).not.toHaveBeenCalled()
  finish()
  await vi.waitFor(() => expect(document.querySelector('[role="status"]')?.textContent).toBe('providerKeyChanged'))
  expect(state.commit).not.toHaveBeenCalled()
})

it('does not submit configuration fields changed while saving the key', async () => {
  let finish!: () => void
  const state = fixture(() => new Promise<void>(resolve => { finish = resolve }))
  const endpoint = document.createElement('input')
  endpoint.value = 'https://first.example/v1'
  state.button.parentElement!.append(endpoint)
  state.button.click()
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  endpoint.value = 'https://second.example/v1'
  finish()
  await vi.waitFor(() => expect(document.querySelector('[role="status"]')?.textContent).toBe('providerKeyChanged'))
  expect(state.commit).not.toHaveBeenCalled()
})

it('uses the guarded Host endpoint with a body-only key and no redirects or cache', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true })))
  await confirmCustomProviderKey('NEW_API_KEY', keyValue, fetcher)
  expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/dsh-web-ui-settings/provider-key/preflight', expect.objectContaining({
    method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'same-origin',
    body: JSON.stringify({ ref: 'NEW_API_KEY', value: keyValue }),
  }))
})

it.each([400, 503])('refuses creation when the Host preflight returns %s', async status => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status }))
  await expect(confirmCustomProviderKey('NEW_API_KEY', keyValue, fetcher)).rejects.toThrow(/credential/u)
})

it.each(['blank-key', 'disabled', 'invalid-route', 'other-control', 'outside-desktop'] as const)('preserves the original behavior for %s', async scenario => {
  const save = vi.fn().mockResolvedValue(undefined)
  const state = fixture(save)
  if (scenario === 'blank-key') state.key.value = ''
  else if (scenario === 'disabled') state.button.disabled = true
  else if (scenario === 'invalid-route') state.route.value = 'invalid route'
  else if (scenario === 'other-control') state.button.textContent = '其他设置'
  else state.button.closest('section')!.removeAttribute('class')
  state.button.click()
  await Promise.resolve()
  expect(save).not.toHaveBeenCalled()
  expect(state.commit).toHaveBeenCalledTimes(scenario === 'disabled' ? 0 : 1)
})
