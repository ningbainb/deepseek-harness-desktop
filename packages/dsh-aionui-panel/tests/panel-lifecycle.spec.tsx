// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { PanelLayoutController } from '../src/client/layout.ts'
import { createLayoutStore } from '../src/client/store.ts'
import { mountPanels } from '../src/client/mount.tsx'

const panelFailure = vi.hoisted(() => ({ explorer: false }))
vi.mock('../src/client/components/ExplorerPanel.tsx', () => ({ ExplorerPanel: () => {
  if (panelFailure.explorer) throw new Error('optional explorer render failed')
  return <button data-explorer-probe>Explorer</button>
} }))
vi.mock('../src/client/preview/PreviewPanel.tsx', () => ({ PreviewPanel: () => <button data-preview-probe>Preview</button> }))
afterEach(() => { panelFailure.explorer = false; document.body.innerHTML = ''; localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('gives an available native sidebar the initial layout without opening tabs or rewriting saved tools', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  const shell = document.createElement('div')
  shell.dataset.dshFrame = ''
  shell.style.gridTemplateColumns = '280px minmax(0, 1fr) 0px'
  shell.getBoundingClientRect = () => ({ width: 1400, height: 800 } as DOMRect)
  document.body.append(shell)
  const store = createLayoutStore()
  store.update(prev => ({ ...prev, root: '/native-default', explorerCollapsed: false, previewOpen: true, explorerWidth: 400, previewWidth: 1000 }))
  const before = { ...store.getSnapshot() }
  const activate = vi.fn()
  const layout = new PanelLayoutController(store, activate)
  // Service injection can precede frame mount. No native navigation is needed.
  layout.setNativeAvailable(true)
  layout.mount()
  const explorer = () => shell.querySelector<HTMLElement>('[data-aionui-explorer-col]')!
  try {
    expect(explorer().dataset.aionuiVisible).toBe('false')
    expect(shell.querySelector<HTMLElement>('[data-aionui-preview-col]')!.style.visibility).toBe('hidden')
    expect(store.getSnapshot()).toMatchObject({ explorerCollapsed: before.explorerCollapsed, previewOpen: before.previewOpen, explorerWidth: before.explorerWidth, previewWidth: before.previewWidth })
    expect(activate).not.toHaveBeenCalled()
    expect((document.querySelector('.aionui-floating-expand') as HTMLElement).style.display).toBe('none')
    layout.toggleExplorer()
    expect(explorer().dataset.aionuiVisible).toBe('false')
    expect(activate).not.toHaveBeenCalled()
    layout.setNativeAvailable(true)
    expect(explorer().dataset.aionuiVisible).toBe('false')
    layout.setNativeAvailable(false)
    expect(explorer().dataset.aionuiVisible).toBe('true')
  } finally { layout.dispose() }
  expect(shell.hasAttribute('data-aionui-instant')).toBe(false)
})

it('caps rc2 native minmax tracks while preserving chat space and the original sidebar preference', async () => {
  let remeasure = () => {}
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { remeasure = callback }
    observe() {}
    disconnect() {}
  })
  let width = 1024
  const shell = document.createElement('div')
  shell.dataset.dshFrame = ''
  const original = '280px minmax(0px, 1fr) minmax(0px, 461px)'
  shell.style.gridTemplateColumns = original
  shell.getBoundingClientRect = () => ({ width, height: 768 } as DOMRect)
  document.body.append(shell)
  const native = document.createElement('div')
  native.dataset.sidebarRightPanel = 'push'
  native.dataset.sidebarRightOpen = ''
  shell.append(native)
  const store = createLayoutStore()
  store.update(previous => ({ ...previous, root: '/native-minmax', explorerWidth: 400, previewWidth: 1000 }))
  const layout = new PanelLayoutController(store, vi.fn())
  layout.setNativeAvailable(true)
  layout.mount()
  try {
    expect(shell.style.gridTemplateColumns).toBe('280px minmax(0, 1fr) minmax(0px, 384px) 0px 0px')
    expect(store.getSnapshot().availableWidth).toBe(360)
    expect(store.getSnapshot()).toMatchObject({ explorerWidth: 400, previewWidth: 1000 })
    native.removeAttribute('data-sidebar-right-open')
    native.setAttribute('aria-hidden', 'true')
    await vi.waitFor(() => expect(shell.style.gridTemplateColumns).toBe('280px minmax(0, 1fr) 0px 0px 0px'))
    expect(store.getSnapshot().availableWidth).toBe(744)
    expect(shell.querySelector<HTMLElement>('[data-aionui-explorer-col]')!.dataset.aionuiVisible).toBe('false')
    shell.style.gridTemplateColumns = '280px minmax(0px, 1fr) minmax(0px, 0px)'
    await vi.waitFor(() => expect(shell.style.gridTemplateColumns).toBe('280px minmax(0, 1fr) 0px 0px 0px'))
    width = 1400
    remeasure()
    layout.activateCompatibility()
    expect(shell.querySelector<HTMLElement>('[data-aionui-explorer-col]')!.dataset.aionuiVisible).toBe('true')
    native.setAttribute('data-sidebar-right-open', '')
    native.setAttribute('aria-hidden', 'false')
    await vi.waitFor(() => expect(shell.style.gridTemplateColumns).toBe('280px minmax(0, 1fr) minmax(0px, 461px) 0px 0px'))
    expect(shell.querySelector<HTMLElement>('[data-aionui-explorer-col]')!.dataset.aionuiVisible).toBe('false')
    width = 1400
    remeasure()
    expect(shell.style.gridTemplateColumns).toBe('280px minmax(0, 1fr) minmax(0px, 461px) 0px 0px')
    expect(store.getSnapshot().availableWidth).toBe(659)
    width = 1024
    remeasure()
    expect(store.getSnapshot().availableWidth).toBe(360)
    expect(store.getSnapshot()).toMatchObject({ explorerWidth: 400, previewWidth: 1000 })
  } finally { layout.dispose() }
  expect(shell.style.gridTemplateColumns).toBe(original)
})

it('restores compatibility when the optional native service disappears', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  const shell = document.createElement('div')
  shell.dataset.dshFrame = ''
  shell.style.gridTemplateColumns = '280px minmax(0, 1fr) 0px'
  shell.getBoundingClientRect = () => ({ width: 1400, height: 800 } as DOMRect)
  document.body.append(shell)
  const layout = new PanelLayoutController(createLayoutStore(), vi.fn())
  layout.mount()
  try {
    layout.setNativeAvailable(true)
    expect(shell.querySelector<HTMLElement>('[data-aionui-explorer-col]')!.dataset.aionuiVisible).toBe('false')
    layout.setNativeAvailable(false)
    expect(shell.querySelector<HTMLElement>('[data-aionui-explorer-col]')!.dataset.aionuiVisible).toBe('true')
  } finally { layout.dispose() }
})

it('yields explorer space to the native dock and restores it without changing preferences', async () => {
  let remeasure = () => {}
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { remeasure = callback }
    observe() {}
    disconnect() {}
  })
  const shell = document.createElement('div')
  shell.dataset.dshFrame = ''
  shell.style.gridTemplateColumns = '280px minmax(0, 1fr) 0px'
  shell.getBoundingClientRect = () => ({ width: 1280, height: 800 } as DOMRect)
  document.body.append(shell)
  const store = createLayoutStore()
  store.update(prev => ({ ...prev, root: '/project', explorerCollapsed: false, explorerWidth: 260 }))
  const activate = vi.fn(() => { shell.style.gridTemplateColumns = '280px minmax(0, 1fr) 0px' })
  const layout = new PanelLayoutController(store, activate)
  layout.setNativeAvailable(true)
  layout.mount()
  try {
    shell.style.gridTemplateColumns = '280px minmax(0, 1fr) 576px'
    await vi.waitFor(() => expect(shell.querySelector<HTMLElement>('[data-aionui-explorer-col]')!.dataset.aionuiVisible).toBe('false'))
    expect(shell.style.gridTemplateColumns).toMatch(/576px 0px 0px$/u)
    expect(store.getSnapshot().availableWidth).toBe(424)
    remeasure()
    expect(store.getSnapshot().explorerCollapsed).toBe(false)
    expect(store.getSnapshot().explorerWidth).toBe(260)
    store.update(prev => ({ ...prev, previewOpen: true }))
    expect(shell.querySelector<HTMLElement>('[data-aionui-preview-col]')!.style.visibility).toBe('hidden')
    expect(store.getSnapshot().previewOpen).toBe(true)
    store.update(prev => ({ ...prev, previewOpen: false }))
    expect((document.querySelector('.aionui-floating-expand') as HTMLElement).style.display).toBe('none')
    shell.style.gridTemplateColumns = '280px minmax(0, 1fr) 0px'
    await vi.waitFor(() => expect(shell.style.gridTemplateColumns).toMatch(/0px 0px 0px$/u))
    expect(shell.querySelector<HTMLElement>('[data-aionui-explorer-col]')!.dataset.aionuiVisible).toBe('false')
    expect(store.getSnapshot().explorerCollapsed).toBe(false)
    layout.toggleExplorer()
    expect(activate).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(shell.querySelector<HTMLElement>('[data-aionui-explorer-col]')!.dataset.aionuiVisible).toBe('false'))
    expect(store.getSnapshot().explorerCollapsed).toBe(false)
    expect(shell.style.gridTemplateColumns).toMatch(/0px 0px 0px$/u)
    expect(store.getSnapshot().availableWidth).toBe(1000)
  } finally { layout.dispose() }
})

it('remounts both panels after the shell replaces its frame or removes injected columns', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  const frame = () => {
    const element = document.createElement('div')
    element.dataset.dshFrame = ''
    element.style.gridTemplateColumns = '280px minmax(0, 1fr) 0px'
    element.getBoundingClientRect = () => ({ width: 1400, height: 800 } as DOMRect)
    return element
  }
  let shell = frame(); document.body.append(shell)
  const layout = new PanelLayoutController(createLayoutStore())
  layout.mount()
  const disposePanels = mountPanels({} as never, vi.fn(), () => true)
  try {
    await vi.waitFor(() => expect(document.querySelectorAll('[data-explorer-probe]')).toHaveLength(1))
    const next = frame(); shell.replaceWith(next); shell = next
    await vi.waitFor(() => {
      expect(shell.querySelectorAll('[data-explorer-probe]')).toHaveLength(1)
      expect(shell.querySelectorAll('[data-preview-probe]')).toHaveLength(1)
    })
    shell.querySelector('[data-aionui-explorer-col]')!.remove()
    await vi.waitFor(() => expect(shell.querySelectorAll('[data-explorer-probe]')).toHaveLength(1))
    expect(document.querySelectorAll('.aionui-floating-expand')).toHaveLength(1)
  } finally { disposePanels(); layout.dispose() }
  expect(document.querySelector('[data-aionui-explorer-col]')).toBeNull()
  expect(document.querySelector('.aionui-floating-expand')).toBeNull()
})

it('isolates an AionUI render failure without blocking the conversation or the other panel', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const shell = document.createElement('div')
  shell.dataset.dshFrame = ''
  shell.style.gridTemplateColumns = '280px minmax(0, 1fr) 0px'
  shell.getBoundingClientRect = () => ({ width: 1400, height: 800 } as DOMRect)
  const send = document.createElement('button')
  send.textContent = 'Send'
  const onSend = vi.fn()
  send.addEventListener('click', onSend)
  document.body.append(shell, send)
  const layout = new PanelLayoutController(createLayoutStore())
  layout.mount()
  panelFailure.explorer = true
  const disposePanels = mountPanels({} as never, vi.fn(), () => true)
  try {
    // The explorer error boundary and the independent preview root schedule separately.
    // Wait for the complete isolation outcome instead of observing their transient order.
    await vi.waitFor(() => {
      expect(shell.querySelectorAll('[data-aionui-panel-unavailable]')).toHaveLength(1)
      expect(shell.querySelectorAll('[data-preview-probe]')).toHaveLength(1)
    })
    send.click()
    expect(onSend).toHaveBeenCalledOnce()
  } finally { disposePanels(); layout.dispose() }
})
