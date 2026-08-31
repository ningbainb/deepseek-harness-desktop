// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PreviewTabs } from '../src/client/preview/PreviewTabs.tsx'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class TestResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

describe('PreviewTabs panel close control', () => {
  let host: HTMLDivElement

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    Object.defineProperty(globalThis, 'ResizeObserver', {
      value: TestResizeObserver,
      configurable: true,
    })
  })

  afterEach(() => {
    host.remove()
  })

  it('exposes an accessible X action that closes the preview panel', () => {
    const closePanel = vi.fn()
    const root = createRoot(host)
    act(() => {
      root.render(
        <PreviewTabs
          tabs={[]}
          activeTabId={null}
          onSwitch={() => {}}
          onClose={() => {}}
          onContextMenu={() => {}}
          onNewUrlTab={() => {}}
          onClosePanel={closePanel}
        />,
      )
    })

    const button = host.querySelector('[role="button"][aria-label="关闭预览面板"]') as HTMLElement
    expect(button).not.toBeNull()
    act(() => { button.click() })
    expect(closePanel).toHaveBeenCalledTimes(1)
    act(() => { root.unmount() })
  })
})
