import { describe, expect, it } from 'vitest'
import { needsShimPass } from '../src/client/shim-observer.ts'

function element(parent?: Element): Element {
  const result = {
    isConnected: true,
    parent,
    contains(node: unknown): boolean {
      for (let current = node as { parent?: Element } | undefined; current; current = current.parent) {
        if (current === result) return true
      }
      return false
    },
  }
  return result as unknown as Element
}

function record(target: Element, addedNodes: Element[] = [], removedNodes: Element[] = []): MutationRecord {
  return { type: 'childList', target, addedNodes, removedNodes } as unknown as MutationRecord
}

describe('layout shims ignore token rendering but retain shell reconciliation', () => {
  const root = element()
  const sidebar = element(root)
  const center = element(root)
  const details = element(root)
  const columns = [sidebar, center, details]

  it('does not sweep the document for streamed text, markdown, code or tool descendants', () => {
    const message = element(center)
    const token = element(message)
    expect(needsShimPass([record(message, [token]), record(token)], sidebar, columns)).toBe(false)
  })

  it('responds to shell structure, rail state and column identity but not scalar content or center styles', () => {
    for (const target of [root, sidebar]) {
      expect(needsShimPass([record(target)], sidebar, columns)).toBe(true)
    }
    for (const target of [root, sidebar, center, details]) {
      const mutation = { ...record(target), type: 'attributes', attributeName: 'class' } as MutationRecord
      expect(needsShimPass([mutation], sidebar, columns)).toBe(true)
    }
    for (const target of [element(sidebar), center, details]) {
      expect(needsShimPass([record(target)], sidebar, columns)).toBe(false)
      const mutation = { ...record(target), type: 'attributes', attributeName: 'style' } as MutationRecord
      expect(needsShimPass([mutation], sidebar, columns)).toBe(false)
    }
  })

  it('detects moved columns in added and removed subtrees', () => {
    const unrelated = element()
    expect(needsShimPass([record(unrelated, [center])], sidebar, columns)).toBe(true)
    expect(needsShimPass([record(unrelated, [], [details])], sidebar, columns)).toBe(true)
    const newColumn = element()
    Object.assign(newColumn, { matches: () => true })
    expect(needsShimPass([record(unrelated, [newColumn])], sidebar, columns)).toBe(true)
  })

  it('retains footer-action layout repair when a slot mounts or changes style', () => {
    const container = element(sidebar)
    const action = element(container)
    Object.assign(action, { matches: (selector: string) => selector === '[data-slot="sidebar.footer.action"]' })
    expect(needsShimPass([record(container, [action])], sidebar, columns)).toBe(true)
    expect(needsShimPass([{ ...record(action), type: 'attributes', attributeName: 'style' } as MutationRecord], sidebar, columns)).toBe(true)
    expect(needsShimPass([record(action, [element(action)])], sidebar, columns)).toBe(false)
  })

  it('waits for incomplete shell boot and rebinds disconnected columns', () => {
    expect(needsShimPass([], null, [])).toBe(true)
    expect(needsShimPass([record(element(center))], sidebar, [sidebar])).toBe(false)
    expect(needsShimPass([record(element(center))], sidebar, [sidebar, center])).toBe(false)
    const disconnected = element()
    Object.assign(disconnected, { isConnected: false })
    expect(needsShimPass([], sidebar, [sidebar, center, disconnected])).toBe(true)
  })
})
