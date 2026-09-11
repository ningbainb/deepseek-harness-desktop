// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { BrowserTabs, NativeBrowserBody, NativeSidebarReturn, nativeBrowserDefinition, openNativeBrowser, registerNativeBrowser, registerNativeSidebarReturn, type NativeBrowserProps } from '../src/client/native-browser.tsx'
import { createPanelStores, type PreviewTabState } from '../src/client/store.ts'
import { PreviewPanel } from '../src/client/preview/PreviewPanel.tsx'
import { setLanguage } from '../src/client/locales.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
afterEach(() => { document.body.innerHTML = ''; localStorage.clear(); setLanguage('zh'); vi.unstubAllGlobals() })
const inputValue = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const frameQueue = () => {
  const frames = new Map<number, FrameRequestCallback>()
  let next = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++next, callback); return next })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })
  return { frames, flush: () => act(() => {
    const callbacks = [...frames.values()]; frames.clear()
    callbacks.forEach(callback => callback(0))
  }) }
}

it('uses the native controller only while no visible native header control exists', async () => {
  const frame = frameQueue()
  const host = document.createElement('div'); document.body.append(host)
  const renderer = createRoot(host)
  const sidebar = { isExpanded: () => false, toggleExpanded: vi.fn() }
  let current = true
  const peer = document.createElement('button')
  peer.dataset.sidebarRightExpand = ''
  peer.getClientRects = () => ({ length: 1 }) as DOMRectList
  try {
    await act(async () => renderer.render(<NativeSidebarReturn getSidebar={() => sidebar} isCurrent={() => current} />))
    expect(host.querySelector('button')).not.toBeNull()
    act(() => host.querySelector('button')!.click())
    expect(sidebar.toggleExpanded).toHaveBeenCalledOnce()
    current = false
    act(() => host.querySelector('button')!.click())
    expect(sidebar.toggleExpanded).toHaveBeenCalledOnce()
    current = true
    await act(async () => { document.body.append(peer) })
    frame.flush()
    expect(host.querySelector('button')).toBeNull()
    await act(async () => { peer.remove() })
    frame.flush()
    expect(host.querySelector('button')).not.toBeNull()
  } finally { act(() => renderer.unmount()); peer.remove() }
})

it('coalesces repeated history mutations and resize notifications into one layout read per frame', async () => {
  const frame = frameQueue()
  let resized: () => void = () => {}
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resized = callback }
    observe() {}
    disconnect = disconnect
  })
  const host = document.createElement('div'), history = document.createElement('div'), peer = document.createElement('button')
  peer.dataset.sidebarRightExpand = ''
  const rectangles = vi.fn(() => ({ length: 1 }) as DOMRectList)
  peer.getClientRects = rectangles
  document.body.append(host, history, peer)
  const renderer = createRoot(host)
  const sidebar = { isExpanded: () => false, toggleExpanded: vi.fn() }
  try {
    await act(async () => renderer.render(<NativeSidebarReturn getSidebar={() => sidebar} isCurrent={() => true} />))
    frame.flush(); rectangles.mockClear()
    for (let index = 0; index < 100; index++) {
      await act(async () => { history.style.width = `${index}px` })
      resized()
    }
    expect(rectangles).not.toHaveBeenCalled()
    expect(frame.frames.size).toBe(1)
    frame.flush()
    expect(rectangles).toHaveBeenCalledOnce()
    expect(host.querySelector('button')).toBeNull()
    resized()
    const stale = [...frame.frames.values()][0]!
    act(() => renderer.unmount())
    expect(disconnect).toHaveBeenCalledOnce()
    expect(frame.frames.size).toBe(0)
    act(() => stale(0))
    window.dispatchEvent(new Event('resize'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(frame.frames.size).toBe(0)
    expect(rectangles).toHaveBeenCalledOnce()
  } finally { act(() => renderer.unmount()); history.remove(); peer.remove() }
})

it('skips native control layout when inactive or expanded and rechecks latest state at paint', async () => {
  const frame = frameQueue()
  const host = document.createElement('div'), peer = document.createElement('button')
  peer.dataset.sidebarRightExpand = ''
  const rectangles = vi.fn(() => ({ length: peer.hidden ? 0 : 1 }) as DOMRectList)
  peer.getClientRects = rectangles
  document.body.append(host, peer)
  let current = false, expanded = false
  const sidebar = { isExpanded: () => expanded, toggleExpanded: vi.fn() }
  const renderer = createRoot(host)
  try {
    await act(async () => renderer.render(<NativeSidebarReturn getSidebar={() => sidebar} isCurrent={() => current} />))
    frame.flush()
    expect(rectangles).not.toHaveBeenCalled()
    current = true; expanded = true
    window.dispatchEvent(new Event('resize')); frame.flush()
    expect(rectangles).not.toHaveBeenCalled()
    expanded = false
    window.dispatchEvent(new Event('resize')); frame.flush()
    expect(rectangles).toHaveBeenCalledOnce()
    expect(host.querySelector('button')).toBeNull()
    await act(async () => { peer.hidden = true })
    frame.flush()
    expect(host.querySelector('button')).not.toBeNull()
    window.dispatchEvent(new Event('resize'))
    current = false
    frame.flush()
    expect(host.querySelector('button')).toBeNull()
    expect(rectangles).toHaveBeenCalledTimes(2)
  } finally { act(() => renderer.unmount()); peer.remove() }
})

it('registers an official composer entry without redeclaring the native header owner', () => {
  const register = vi.fn(() => () => {})
  const cleanups: (() => void)[] = []
  const scope = {
    slots: { inject: (_key: string, callback: () => unknown) => callback(), register },
    effect: (callback: () => () => void) => cleanups.push(callback()),
  }
  const dispose = vi.fn(() => cleanups.forEach(cleanup => cleanup()))
  const ctx = { inject: (_services: string[], callback: (value: typeof scope) => void) => { callback(scope); return { dispose } } }
  registerNativeSidebarReturn(ctx as never)()
  expect(register).toHaveBeenCalledWith({ name: 'conversation.input.left', id: 'aionui-native-sidebar-return', order: 90 }, expect.any(Function))
  expect(dispose).toHaveBeenCalledOnce()
})

it('browser records retain committed and draft addresses across hides/remounts without sharing tabs', () => {
  const host = document.createElement('div'); document.body.append(host)
  const renderer = createRoot(host)
  const browsers = new BrowserTabs()
  const controller = new AbortController()
  const close = vi.fn()
  const tab = { id: 'browser-1', signal: controller.signal, visible: true, actions: { close } }
  const props = { browsers, useTabInfo: () => ({ tab }) } as unknown as NativeBrowserProps
  const render = () => act(() => renderer.render(<NativeBrowserBody {...props} />))
  try {
    render()
    act(() => inputValue(host.querySelector('input')!, 'example.com/docs'))
    act(() => host.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(host.querySelector('iframe')!.getAttribute('src')).toBe('https://example.com/docs')
    expect(host.querySelector('iframe')!.getAttribute('sandbox')).toBe('allow-scripts allow-forms')
    expect(host.querySelector('iframe')!.getAttribute('allow')!.split(';').map(value => value.trim())).toContain('fullscreen')
    expect(host.querySelector('iframe')!.hasAttribute('allowfullscreen')).toBe(false)
    expect(host.querySelector('[data-dsh-browser-close]')).toBeNull()
    act(() => inputValue(host.querySelector('input')!, 'not submitted'))
    tab.visible = false; render()
    expect(host.querySelector('iframe')).toBeNull()
    act(() => renderer.render(null))
    tab.visible = true; render()
    expect(host.querySelector('input')!.value).toBe('not submitted')
    expect(host.querySelector('iframe')!.getAttribute('src')).toBe('https://example.com/docs')
    act(() => host.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(host.querySelector('input')!.value).toBe('example.com/docs')
    const frame = host.querySelector('iframe')
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="刷新"]')!.click())
    expect(host.querySelector('iframe')).not.toBe(frame)
    for (const modifier of ['ctrlKey', 'metaKey']) {
      const event = new KeyboardEvent('keydown', { key: 'w', [modifier]: true, bubbles: true, cancelable: true })
      act(() => host.querySelector('input')!.dispatchEvent(event))
      expect(event.defaultPrevented).toBe(true)
    }
    expect(close).toHaveBeenCalledTimes(2)
    expect(browsers.for(new AbortController().signal).getSnapshot().address).toBe('')
    controller.abort()
    act(() => host.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, bubbles: true })))
    expect(close).toHaveBeenCalledTimes(2)
    render()
    expect(host.innerHTML).toBe('')
  } finally { act(() => renderer.unmount()) }
})

it('registers the browser definition and content with matching native keys and releases them', () => {
  const release = vi.fn()
  const register = vi.fn((_entry: unknown) => release)
  const cleanups: (() => void)[] = []
  const scope = {
    sidebarRightTabs: { register },
    slots: { inject: (_name: string, callback: () => unknown) => callback(), register },
    effect: (callback: () => () => void) => cleanups.push(callback()),
  }
  const ctx = { inject: (_services: string[], callback: (value: typeof scope) => void) => {
    callback(scope); return { dispose: () => cleanups.reverse().forEach(cleanup => cleanup()) }
  } }
  registerNativeBrowser(ctx as never)()
  expect(register).toHaveBeenNthCalledWith(1, nativeBrowserDefinition)
  expect(register.mock.calls[1]![0]).toEqual({ name: 'sidebar.right.pane.tab', key: nativeBrowserDefinition.id, locale: 'aionui-panel' })
  expect(release).toHaveBeenCalledTimes(2)
  expect(nativeBrowserDefinition.canOpen!('dsh-resource://desktop-browser/tab-1')).toBe(true)
  for (const address of ['https://example.com', 'dsh-resource://file/session/x/a', 'dsh-resource://desktop-browser/../x']) {
    expect(nativeBrowserDefinition.canOpen!(address)).toBe(false)
  }
})

it('explicit new browser tabs get independent native identities and unavailable native services fall back', () => {
  const openResource = vi.fn()
  let available = true
  const ctx = {
    sessions: { list: { getSnapshot: () => ({ current: 's1' }) } },
    get: (name: string) => !available ? undefined : name === 'sidebarRight' ? { openResource } : { get: () => nativeBrowserDefinition },
  }
  expect(openNativeBrowser(ctx as never)).toBe(true)
  expect(openNativeBrowser(ctx as never)).toBe(true)
  const addresses = openResource.mock.calls.map(([address]) => address)
  expect(new Set(addresses).size).toBe(2)
  expect(addresses.every(address => nativeBrowserDefinition.canOpen!(address))).toBe(true)
  available = false
  expect(openNativeBrowser(ctx as never)).toBe(false)
  available = true; openResource.mockImplementation(() => { throw new Error('unbound seat') })
  expect(openNativeBrowser(ctx as never)).toBe(false)
})

it('legacy URL navigation restores addresses without dirty files or filesystem reads', () => {
  const read = vi.fn()
  const stores = createPanelStores({ read } as never)
  stores.preview.setRoot('/a')
  const tab = { id: 'url:1', root: '/a', path: 'url:1', contentType: 'url', title: 'Browser', content: '', dirty: false, savedAt: 0 } as PreviewTabState
  stores.preview.update(prev => ({ ...prev, tabs: [tab], activeTabId: tab.id, open: true }))
  stores.preview.navigateUrl(tab.id, 'https://example.com')
  expect(stores.preview.getSnapshot().tabs[0]!.dirty).toBe(false)
  stores.preview.setRoot('/b'); stores.preview.setRoot('/a')
  expect(stores.preview.getSnapshot().tabs[0]!.content).toBe('https://example.com')
  expect(read).not.toHaveBeenCalled()
  localStorage.setItem('preview-ui:/old', JSON.stringify({ tabs: [{ ...tab, root: '/old', address: undefined }] }))
  stores.preview.setRoot('/old')
  expect(stores.preview.getSnapshot().tabs[0]!.content).toBe('')
  expect(read).not.toHaveBeenCalled()
})

it('legacy browser addresses are not evicted with large file payloads', async () => {
  const stores = createPanelStores({ read: async () => ({ ok: true, value: { content: 'file body' } }) } as never)
  stores.preview.setRoot('/a')
  const browser = { id: 'url:1', root: '/a', path: 'url:1', contentType: 'url', title: 'Browser', content: 'https://example.com', dirty: false, savedAt: 0 } as PreviewTabState
  stores.preview.update(prev => ({ ...prev, tabs: [browser] }))
  for (let index = 0; index < 10; index++) {
    stores.preview.openFile('/a', `file-${index}.txt`)
    await vi.waitFor(() => expect(stores.preview.getSnapshot().tabs.at(-1)?.content).toBe('file body'))
  }
  expect(stores.preview.getSnapshot().tabs[0]!.content).toBe(browser.content)
  stores.flushNow()
})

it('preview plus uses native browser first while preserving the compatibility fallback and file buffer', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  const host = document.createElement('div'); document.body.append(host)
  const renderer = createRoot(host)
  const stores = createPanelStores({} as never)
  const file = { id: 'file:1', root: '/a', path: 'readme.md', contentType: 'markdown', title: 'readme.md', content: 'unsaved draft', dirty: true, savedAt: 0 } as PreviewTabState
  stores.preview.update(prev => ({ ...prev, tabs: [file], activeTabId: file.id, open: true }))
  const onOpenBrowser = vi.fn(() => true)
  try {
    act(() => renderer.render(<PreviewPanel stores={stores} onOpenBrowser={onOpenBrowser} />))
    const plus = () => host.querySelector<HTMLButtonElement>('[title="新建 URL 预览"]')!.click()
    act(plus)
    expect(onOpenBrowser).toHaveBeenCalledOnce()
    expect(stores.preview.getSnapshot().tabs).toEqual([file])
    onOpenBrowser.mockReturnValue(false)
    act(plus)
    expect(stores.preview.getSnapshot().tabs[1]!.contentType).toBe('url')
    expect(stores.preview.getSnapshot().tabs[0]).toEqual(file)
    expect(host.querySelector('iframe')).not.toBeNull()
    expect(host.querySelector('[data-dsh-browser-close]')).not.toBeNull()
    act(() => host.querySelector<HTMLButtonElement>('[data-dsh-browser-close]')!.click())
    expect(stores.preview.getSnapshot().tabs).toEqual([file])
  } finally { act(() => renderer.unmount()) }
})
