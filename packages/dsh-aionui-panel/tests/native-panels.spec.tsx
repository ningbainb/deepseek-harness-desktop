// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { bindNativePanelOwnership, NativePanelBody, nativePanelDefinitions, openNativePanel, registerNativePanels, type NativePanelProps } from '../src/client/native-panels.tsx'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
vi.mock('../src/client/components/ExplorerPanel.tsx', () => ({
  ExplorerPanel: (props: { section: string; onAddToConversation: (path: string) => boolean }) =>
    <button data-section={props.section} onClick={() => props.onAddToConversation('readme.md')}>file action</button>,
}))
afterEach(() => { document.body.innerHTML = '' })

it('binds default ownership to optional SDK service lifetime, including late availability and removal', () => {
  let ready: (scope: { effect: (callback: () => () => void) => void }) => void = () => {}
  let cleanup = () => {}
  const setNativeAvailable = vi.fn()
  const dispose = vi.fn(() => cleanup())
  const inject = vi.fn((_services: string[], callback: typeof ready) => { ready = callback; return { dispose } })
  const release = bindNativePanelOwnership({ inject } as never, { setNativeAvailable })
  expect(inject).toHaveBeenCalledWith(['sidebarRight', 'sidebarRightTabs'], expect.any(Function))
  expect(setNativeAvailable).not.toHaveBeenCalled()
  ready({ effect: callback => { cleanup = callback() } })
  expect(setNativeAvailable.mock.calls).toEqual([[true]])
  release()
  expect(setNativeAvailable.mock.calls).toEqual([[true], [false]])
  expect(dispose).toHaveBeenCalledOnce()
})

it('uses the native tab section without leaking tools into hidden, stale or mismatched sessions', () => {
  const host = document.createElement('div'); document.body.append(host)
  const renderer = createRoot(host)
  const snapshot = { current: 's1', byId: { s1: { cwd: '/a' } } }
  const state = { root: '/a' }
  const store = { getSnapshot: () => state, subscribe: () => () => {} }
  const controller = new AbortController()
  const tab = { visible: true, signal: controller.signal, actions: { close: vi.fn() } }
  const insertPath = vi.fn(() => true)
  const props = {
    stores: { explorer: store, scm: store }, sessionId: 's1', section: 'changes', insertPath,
    useTabInfo: () => ({ tab }), useSessions: (select: (value: typeof snapshot) => unknown) => select(snapshot),
  } as unknown as NativePanelProps
  const render = () => act(() => renderer.render(<NativePanelBody {...props} />))
  try {
    render()
    expect(host.querySelector('[data-section="changes"]')).not.toBeNull()
    act(() => host.querySelector('button')!.click())
    expect(insertPath).toHaveBeenCalledWith('s1', 'readme.md')
    snapshot.current = 's2'
    render()
    expect(host.querySelector('button')).toBeNull()
    expect(host.querySelector('[role="status"]')).not.toBeNull()
    snapshot.current = 's1'; state.root = '/b'
    render()
    expect(host.querySelector('button')).toBeNull()
    state.root = '/a'; tab.visible = false
    render()
    expect(host.innerHTML).toBe('')
    tab.visible = true; controller.abort()
    render()
    expect(host.innerHTML).toBe('')
  } finally { act(() => renderer.unmount()) }
})

it('registers both page definitions and bodies under matching official seat keys and releases the dependency scope', () => {
  const definitions: { id: string; kind: string }[] = []
  const bodies: { key: string; name: string }[] = []
  const cleanups: (() => void)[] = []
  const release = vi.fn()
  const scope = {
    sidebarRightTabs: { register: (definition: typeof definitions[number]) => { definitions.push(definition); return release } },
    slots: { inject: (_name: string, callback: () => unknown) => callback(), register: (entry: typeof bodies[number]) => { bodies.push(entry); return release } },
    effect: (callback: () => () => void) => { cleanups.push(callback()) },
  }
  const dispose = vi.fn(() => { cleanups.reverse().forEach(cleanup => cleanup()) })
  const ctx = { inject: (_services: string[], callback: (context: typeof scope) => void) => { callback(scope); return { dispose } } }
  registerNativePanels(ctx as never, {} as never, () => false)()
  expect(definitions).toHaveLength(2)
  expect(definitions.map(item => item.kind)).toEqual(['dsh-file-tools', 'dsh-git-changes'])
  expect(definitions.every(item => item.kind !== 'files')).toBe(true)
  expect(bodies).toEqual(definitions.map(item => ({ name: 'sidebar.right.pane.tab', key: item.id, locale: 'aionui-panel' })))
  expect(nativePanelDefinitions.every(item => !item.patterns && item.guide?.length === 1)).toBe(true)
  expect(dispose).toHaveBeenCalledOnce()
  expect(release).toHaveBeenCalledTimes(4)
})

it('opens original Files or native Git, falling back only if the service, type or current workspace is unavailable', () => {
  const openTab = vi.fn()
  const snapshot = { current: 's1', byId: { s1: { cwd: '/a' } } }
  let registered = true
  let available = true
  const ctx = {
    sessions: { list: { getSnapshot: () => snapshot } },
    get: (name: string) => !available ? undefined : name === 'sidebarRight' ? { openTab } : { get: () => registered ? {} : undefined },
  }
  expect(openNativePanel(ctx as never, 'files')).toBe(true)
  expect(openTab).toHaveBeenLastCalledWith('files')
  expect(openNativePanel(ctx as never, 'changes')).toBe(true)
  expect(openTab).toHaveBeenLastCalledWith('dsh-git-changes')
  registered = false
  expect(openNativePanel(ctx as never, 'changes')).toBe(false)
  available = false
  expect(openNativePanel(ctx as never, 'files')).toBe(false)
  available = true; registered = true
  openTab.mockImplementation(() => { throw new Error('seat not bound') })
  expect(openNativePanel(ctx as never, 'files')).toBe(false)
  snapshot.current = ''
  expect(openNativePanel(ctx as never, 'files')).toBe(false)
})
