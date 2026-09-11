import { afterEach, describe, expect, it, vi } from 'vitest'
import { DialogIndex } from '../src/client/dialog-index.ts'

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

function harness() {
  const index = new DialogIndex(document)
  const observer = new MutationObserver(records => index.update(records))
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true })
  return {
    read() { index.update(observer.takeRecords()); return index.elements() },
    dispose() { observer.disconnect() },
  }
}

describe('incremental dialog candidates', () => {
  it('seeds native and custom dialogs, and tracks added subtrees without rescanning the document', () => {
    document.body.innerHTML = '<dialog open></dialog><div aria-modal="true"></div><div role="dialog"></div>'
    const query = vi.spyOn(document, 'querySelectorAll')
    const index = harness()
    try {
      expect(index.read()).toHaveLength(3)
      const subtree = document.createElement('section')
      subtree.innerHTML = '<div><dialog open></dialog></div>'
      document.body.append(subtree)
      expect(index.read()).toHaveLength(4)
      for (let i = 0; i < 100; i++) {
        subtree.className = `history-${i}`
        subtree.append(document.createTextNode('stream'))
        expect(index.read()).toHaveLength(4)
      }
      expect(query).toHaveBeenCalledTimes(1)
    } finally { index.dispose() }
  })

  it('updates selector attributes, removes detached nodes and preserves moved dialogs', () => {
    document.body.innerHTML = '<section><div></div><dialog></dialog></section><aside></aside>'
    const custom = document.querySelector('div')!, native = document.querySelector('dialog')!
    const index = harness()
    try {
      expect(index.read()).toEqual([])
      custom.setAttribute('role', 'dialog'); native.open = true
      expect(index.read()).toEqual([custom, native])
      custom.removeAttribute('role'); native.open = false
      expect(index.read()).toEqual([])
      custom.setAttribute('aria-modal', 'true')
      expect(index.read()).toEqual([custom])
      document.querySelector('aside')!.append(custom)
      document.querySelector('section')!.remove()
      expect(index.read()).toEqual([custom])
      custom.setAttribute('aria-modal', 'false')
      expect(index.read()).toEqual([])
      native.open = true; document.body.append(native); native.remove()
      expect(index.read()).toEqual([])
    } finally { index.dispose() }
  })
})
