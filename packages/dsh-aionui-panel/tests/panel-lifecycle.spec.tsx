// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { PanelLayoutController } from '../src/client/layout.ts'
import { createLayoutStore } from '../src/client/store.ts'
import { mountPanels } from '../src/client/mount.tsx'

vi.mock('../src/client/components/ExplorerPanel.tsx', () => ({ ExplorerPanel: () => <button data-explorer-probe>Explorer</button> }))
vi.mock('../src/client/preview/PreviewPanel.tsx', () => ({ PreviewPanel: () => <button data-preview-probe>Preview</button> }))
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals() })

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
