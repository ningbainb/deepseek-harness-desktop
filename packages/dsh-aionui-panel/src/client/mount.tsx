/**
 * DOM mounting: two React roots rendered into the panel columns the layout
 * controller appends to the frame grid. The roots wait for their columns
 * (the shell mounts asynchronously), and everything is wrapped so a DOM
 * failure degrades the panels, never the GUI boot.
 * @module dsh-aionui-panel/client/mount
 */

import { createRoot, type Root } from 'react-dom/client'
import type { PanelStores } from './store.ts'
import { ExplorerPanel } from './components/ExplorerPanel.tsx'
import { PreviewPanel } from './preview/PreviewPanel.tsx'

const EXPLORER_COL_SELECTOR = '[data-aionui-explorer-col]'
const PREVIEW_COL_SELECTOR = '[data-aionui-preview-col]'

/** Wait for one selector (the shell/frame mounts after boot settlement). */
function waitForElement(selector: string, onFound: (el: HTMLElement) => void, onLost: () => void): () => void {
  let current: HTMLElement | null = null
  let disposed = false
  let observer: MutationObserver | undefined
  const tryFind = (): void => {
    if (disposed) return
    const el = document.querySelector<HTMLElement>(selector)
    if (el === current) return
    if (current) onLost()
    current = el
    if (el !== null) onFound(el)
  }
  observer = new MutationObserver(() => { tryFind() })
  observer.observe(document.body, { childList: true, subtree: true })
  tryFind()
  return () => {
    disposed = true
    observer?.disconnect()
    if (current) onLost()
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

  disposers.push(waitForElement(EXPLORER_COL_SELECTOR, (el) => {
    explorerRoot = createRoot(el)
    const render = () => explorerRoot?.render(
      <ExplorerPanel
        stores={stores}
        onToggleCollapse={onToggleExplorer}
        onAddToConversation={onAddToConversation}
        onOpenNative={onOpenNative}
        suspended={el.dataset.aionuiVisible === 'false'}
      />,
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
    previewRoot.render(<PreviewPanel stores={stores} onOpenBrowser={onOpenBrowser} />)
  }, () => { previewRoot?.unmount(); previewRoot = undefined }))

  return () => {
    for (const dispose of disposers) dispose()
    explorerRoot?.unmount()
    previewRoot?.unmount()
  }
}
