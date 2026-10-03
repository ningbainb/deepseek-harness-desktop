/**
 * DOM mounting: two React roots rendered into the panel columns the layout
 * controller appends to the frame grid. The roots wait for their columns
 * (the shell mounts asynchronously), and everything is wrapped so a DOM
 * failure degrades the panels, never the GUI boot.
 * @module dsh-aionui-panel/client/mount
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { PanelStores } from './store.ts'
import { ExplorerPanel } from './components/ExplorerPanel.tsx'
import { PreviewPanel } from './preview/PreviewPanel.tsx'

const EXPLORER_COL_SELECTOR = '[data-aionui-explorer-col]'
const PREVIEW_COL_SELECTOR = '[data-aionui-preview-col]'

class PanelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } { return { failed: true } }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[dsh-aionui-panel] optional panel render failed:', error, info.componentStack)
  }

  render(): ReactNode {
    return this.state.failed
      ? <div role="status" data-aionui-panel-unavailable>{document.documentElement.lang?.startsWith('zh') ? '面板暂不可用' : 'Panel unavailable'}</div>
      : this.props.children
  }
}

/** Wait for one selector (the shell/frame mounts after boot settlement). */
function waitForElement(selector: string, onFound: (el: HTMLElement) => void, onLost: () => void): () => void {
  let current: HTMLElement | null = null
  let disposed = false
  let observer: MutationObserver | undefined
  const tryFind = (): void => {
    if (disposed) return
    const el = document.querySelector<HTMLElement>(selector)
    if (el === current) return
    if (current) {
      try { onLost() } catch (error) { console.error('[dsh-aionui-panel] optional panel cleanup failed:', error) }
    }
    current = el
    if (el !== null) {
      try { onFound(el) } catch (error) {
        console.error('[dsh-aionui-panel] optional panel mount failed:', error)
        try { onLost() } catch (cleanupError) {
          console.error('[dsh-aionui-panel] optional panel cleanup failed:', cleanupError)
        }
      }
    }
  }
  observer = new MutationObserver(() => { tryFind() })
  try {
    observer.observe(document.body, { childList: true, subtree: true })
    tryFind()
  } catch (error) {
    observer.disconnect()
    throw error
  }
  return () => {
    disposed = true
    observer?.disconnect()
    if (current) {
      try { onLost() } catch (error) { console.error('[dsh-aionui-panel] optional panel cleanup failed:', error) }
    }
    current = null
  }
}

/**
 * Mount both panel roots.
 * @param stores - the panel store bundle.
 * @param onToggleExplorer - collapse toggle (owned by the layout controller).
 * @returns a disposer unmounting both trees.
 */
export function mountPanels(
  stores: PanelStores,
  onToggleExplorer: () => void,
  onAddToConversation: (path: string) => boolean,
  onOpenNative?: (section: 'files' | 'changes') => boolean,
  onOpenBrowser?: () => boolean,
): () => void {
  let explorerRoot: Root | undefined
  let previewRoot: Root | undefined
  let explorerVisibility: MutationObserver | undefined
  const disposers: Array<() => void> = []

  try {
    disposers.push(waitForElement(EXPLORER_COL_SELECTOR, (el) => {
      explorerRoot = createRoot(el)
      const render = () => explorerRoot?.render(
        <PanelErrorBoundary>
          <ExplorerPanel
            stores={stores}
            onToggleCollapse={onToggleExplorer}
            onAddToConversation={onAddToConversation}
            onOpenNative={onOpenNative}
            suspended={el.dataset.aionuiVisible === 'false'}
          />
        </PanelErrorBoundary>,
      )
      render()
      explorerVisibility = new MutationObserver(render)
      explorerVisibility.observe(el, { attributes: true, attributeFilter: ['data-aionui-visible'] })
    }, () => {
      explorerVisibility?.disconnect(); explorerVisibility = undefined
      explorerRoot?.unmount(); explorerRoot = undefined
    }))
    disposers.push(waitForElement(PREVIEW_COL_SELECTOR, (el) => {
      previewRoot = createRoot(el)
      previewRoot.render(<PanelErrorBoundary><PreviewPanel stores={stores} onOpenBrowser={onOpenBrowser} /></PanelErrorBoundary>)
    }, () => { previewRoot?.unmount(); previewRoot = undefined }))
  } catch (error) {
    for (const dispose of disposers) dispose()
    throw error
  }

  return () => {
    for (const dispose of disposers) dispose()
    explorerRoot?.unmount()
    previewRoot?.unmount()
  }
}
