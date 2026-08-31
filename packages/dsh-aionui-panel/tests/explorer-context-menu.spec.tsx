// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ExplorerPanel, workspaceAbsolutePath } from '../src/client/components/ExplorerPanel.tsx'
import type { PanelStores } from '../src/client/store.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function fakeStores(): PanelStores {
  const explorerState = {
    root: 'C:\\work\\demo',
    dirs: {
      '': [{ name: 'readme.md', path: 'docs/readme.md', isDir: false, size: 12, mtime: 1 }],
    },
    expanded: [],
    selected: null,
    loading: [],
    activeTab: 'files' as const,
    search: { query: '', status: 'idle' as const, hits: [], truncated: false },
    version: 0,
  }
  const explorer = {
    getSnapshot: () => explorerState,
    subscribe: () => () => {},
    update: vi.fn(),
    setRoot: vi.fn(),
    setActiveTab: vi.fn(),
    toggleDir: vi.fn(),
    select: vi.fn(),
    reveal: vi.fn(),
    setSearchQuery: vi.fn(),
    cancelSearch: vi.fn(),
    handleFsChange: vi.fn(),
  }
  return {
    layout: {} as never,
    explorer,
    scm: {} as never,
    preview: { openFile: vi.fn() } as never,
  } as unknown as PanelStores
}

describe('Explorer file context menu', () => {
  let host: HTMLDivElement
  const writeText = vi.fn(async () => {})

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    writeText.mockClear()
  })

  afterEach(() => {
    document.querySelectorAll('.aionui-toast').forEach((item) => item.remove())
    host.remove()
  })

  it('copies an absolute path and inserts the relative file path into the active draft', async () => {
    const stores = fakeStores()
    const addToConversation = vi.fn(() => true)
    const toggleCollapse = vi.fn()
    const root = createRoot(host)
    act(() => {
      root.render(
        <ExplorerPanel
          stores={stores}
          onToggleCollapse={toggleCollapse}
          onAddToConversation={addToConversation}
        />,
      )
    })

    const closePanel = host.querySelector('button[aria-label="关闭文件面板"]') as HTMLButtonElement
    expect(closePanel).not.toBeNull()
    act(() => { closePanel.click() })
    expect(toggleCollapse).toHaveBeenCalledTimes(1)

    const file = host.querySelector('[title="docs/readme.md"]') as HTMLElement
    act(() => {
      file.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 50 }))
    })
    expect(document.body.textContent).toContain('复制路径')
    expect(document.body.textContent).toContain('添加到对话框')

    const copy = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.textContent === '复制路径')
    await act(async () => { copy?.click() })
    expect(writeText).toHaveBeenCalledWith('C:\\work\\demo\\docs\\readme.md')

    act(() => {
      file.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 50 }))
    })
    const add = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.textContent === '添加到对话框')
    act(() => { add?.click() })
    expect(addToConversation).toHaveBeenCalledWith('docs/readme.md')

    act(() => { root.unmount() })
  })

  it('normalizes Windows and POSIX roots without changing the relative-path contract', () => {
    expect(workspaceAbsolutePath('C:\\work\\demo\\', 'src/main.ts')).toBe('C:\\work\\demo\\src\\main.ts')
    expect(workspaceAbsolutePath('/work/demo/', 'src/main.ts')).toBe('/work/demo/src/main.ts')
  })
})
