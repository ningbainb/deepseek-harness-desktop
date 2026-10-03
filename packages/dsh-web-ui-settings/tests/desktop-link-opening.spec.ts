import { afterEach, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { installDesktopLinkOpening } from '../src/client/desktop-link-opening.ts'

const { installNavigationPolicy } = createRequire(import.meta.url)('../../../apps/dsh-desktop/src/navigation-policy.mjs') as {
  installNavigationPolicy: (options: unknown) => void
}

let dispose: (() => void) | undefined

function fixture(destination: 'sidebar' | 'new-tab' = 'sidebar', browserAvailable = true) {
  document.body.innerHTML = '<section data-slot="conversation.view"><a href="https://example.com/message">Message</a></section><a href="https://example.com/outside">Outside</a>'
  const anchor = document.querySelector('a')!
  const original = vi.fn((event: Event) => { event.preventDefault() })
  anchor.addEventListener('click', original)
  let value = destination
  let available = browserAvailable
  const get = vi.fn((namespace: string) => {
    expect(namespace).toBe('ui-chat')
    return { getSnapshot: () => ({ value: { linkOpening: value } }) }
  })
  const ctx = { configForms: { get }, get: () => ({ get: () => available ? {} : undefined }) }
  dispose = installDesktopLinkOpening(ctx as never, document)
  return { anchor, original, ctx, select: (next: typeof destination) => { value = next }, setAvailable: (next: boolean) => { available = next } }
}

afterEach(() => { dispose?.(); dispose = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('retains the built-in browser default and observes the real saved choice on subsequent clicks', () => {
  const open = vi.fn().mockResolvedValue(true)
  vi.stubGlobal('dshDesktop', { openExternalUrl: open })
  const state = fixture()
  state.anchor.click()
  expect(state.original).toHaveBeenCalledTimes(1)
  expect(open).not.toHaveBeenCalled()
  state.select('new-tab')
  state.anchor.click()
  expect(open).toHaveBeenCalledExactlyOnceWith('https://example.com/message')
  expect(state.original).toHaveBeenCalledTimes(1)
  state.select('sidebar')
  state.anchor.click()
  expect(state.original).toHaveBeenCalledTimes(2)
  expect(open).toHaveBeenCalledTimes(1)
})

it('uses the trusted fallback when the built-in browser becomes unavailable', () => {
  const open = vi.fn().mockResolvedValue(true)
  vi.stubGlobal('dshDesktop', { openExternalUrl: open })
  const state = fixture()
  state.setAvailable(false)
  state.anchor.click()
  expect(open).toHaveBeenCalledTimes(1)
  expect(state.original).not.toHaveBeenCalled()
})

it.each(['ctrlKey', 'metaKey', 'shiftKey', 'altKey'])('preserves an explicit %s browser gesture through the bridge', modifier => {
  const open = vi.fn().mockResolvedValue(true)
  vi.stubGlobal('dshDesktop', { openExternalUrl: open })
  const state = fixture()
  state.anchor.dispatchEvent(new MouseEvent('click', { button: 0, [modifier]: true, bubbles: true, cancelable: true }))
  expect(open).toHaveBeenCalledTimes(1)
  expect(state.original).not.toHaveBeenCalled()
})

it('does not take over non-chat links, downloads, local navigation or dangerous protocols', () => {
  const open = vi.fn().mockResolvedValue(true)
  vi.stubGlobal('dshDesktop', { openExternalUrl: open })
  const state = fixture('new-tab')
  document.querySelectorAll<HTMLAnchorElement>('a')[1]!.click()
  for (const href of ['javascript:alert(1)', 'file:///C:/test', 'mailto:user@example.com', 'https://user:secret@example.com', docOrigin()]) {
    state.anchor.href = href
    state.anchor.click()
  }
  state.anchor.href = 'https://example.com/file'
  state.anchor.setAttribute('download', '')
  state.anchor.click()
  expect(open).not.toHaveBeenCalled()
})

function docOrigin(): string { return new URL('/session/1', document.location.href).href }

it('leaves browser hosts untouched and removes its capture on disposal', () => {
  const state = fixture('new-tab')
  state.anchor.click()
  expect(state.original).toHaveBeenCalledTimes(1)
  expect(state.ctx.configForms.get).not.toHaveBeenCalled()
  dispose!()
  vi.stubGlobal('dshDesktop', { openExternalUrl: vi.fn().mockResolvedValue(true) })
  dispose = installDesktopLinkOpening(state.ctx as never, document)
  dispose()
  dispose = undefined
  state.anchor.click()
  expect(state.original).toHaveBeenCalledTimes(2)
})

it('runs the selected message link through the trusted main-frame handler without promoting arbitrary popups', async () => {
  const handlers = new Map<string, (event: unknown, url: string) => Promise<boolean>>()
  const mainFrame = { url: 'dsh-runtime://app/session/1' }
  const openExternal = vi.fn().mockResolvedValue(undefined)
  let popup: (request: { url: string }) => unknown = () => undefined
  installNavigationPolicy({ webContents: { mainFrame, ipc: { handle: (name: string, handler: (event: unknown, url: string) => Promise<boolean>) => handlers.set(name, handler) }, on() {}, setWindowOpenHandler: (handler: typeof popup) => { popup = handler } },
    getRuntimeOrigin: () => 'dsh-runtime://app', openExternal })
  const invoke = vi.fn((url: string) => handlers.get('desktop:external-url-open')!({ senderFrame: mainFrame }, url))
  vi.stubGlobal('dshDesktop', { openExternalUrl: invoke })
  const windowOpen = vi.spyOn(window, 'open')
  fixture('new-tab').anchor.click()
  await vi.waitFor(() => expect(openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com/message'))
  expect(windowOpen).not.toHaveBeenCalled()
  expect(popup({ url: 'https://example.com/arbitrary' })).toEqual({ action: 'deny' })
  expect(openExternal).toHaveBeenCalledTimes(1)
})
