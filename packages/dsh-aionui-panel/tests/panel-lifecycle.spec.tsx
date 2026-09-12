// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { PanelLayoutController } from '../src/client/layout.ts'
import { createLayoutStore } from '../src/client/store.ts'
import { mountPanels } from '../src/client/mount.tsx'

vi.mock('../src/client/components/ExplorerPanel.tsx', () => ({ ExplorerPanel: () => <button data-explorer-probe>Explorer</button> }))
vi.mock('../src/client/preview/PreviewPanel.tsx', () => ({ PreviewPanel: () => <button data-preview-probe>Preview</button> }))
afterEach(() => { document.body.innerHTML = ''; localStorage.clear(); vi.unstubAllGlobals() })

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
    await vi.waitFor(() => expect(shell.querySelectorAll('[data-explorer-probe]')).toHaveLength(1))
    expect(shell.querySelectorAll('[data-preview-probe]')).toHaveLength(1)
    shell.querySelector('[data-aionui-explorer-col]')!.remove()
    await vi.waitFor(() => expect(shell.querySelectorAll('[data-explorer-probe]')).toHaveLength(1))
    expect(document.querySelectorAll('.aionui-floating-expand')).toHaveLength(1)
  } finally { disposePanels(); layout.dispose() }
  expect(document.querySelector('[data-aionui-explorer-col]')).toBeNull()
  expect(document.querySelector('.aionui-floating-expand')).toBeNull()
})
