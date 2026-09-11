const DIALOG_SELECTOR = '[role="dialog"], [aria-modal="true"], dialog[open]'
const MEMBERSHIP_ATTRIBUTES = new Set(['role', 'aria-modal', 'open'])

/** Track modal candidates without searching the entire history on every scroll. */
export class DialogIndex {
  private readonly candidates = new Set<Element>()

  constructor(private readonly document: Document) {
    for (const element of document.querySelectorAll(DIALOG_SELECTOR)) this.candidates.add(element)
  }

  update(records: readonly MutationRecord[]): void {
    for (const record of records) {
      if (record.type === 'attributes') {
        if (MEMBERSHIP_ATTRIBUTES.has(record.attributeName ?? '')) this.classify(record.target)
      } else if (record.type === 'childList') {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue
          const element = node as Element
          if (!element.isConnected || element.ownerDocument !== this.document) continue
          this.classify(element)
          if (element.firstElementChild) {
            for (const child of element.querySelectorAll(DIALOG_SELECTOR)) this.candidates.add(child)
          }
        }
      }
    }
  }

  elements(): Element[] {
    for (const element of this.candidates) {
      if (!element.isConnected || element.ownerDocument !== this.document) this.candidates.delete(element)
    }
    return [...this.candidates]
  }

  private classify(node: Node): void {
    if (node.nodeType !== 1) return
    const element = node as Element
    if (element.matches(DIALOG_SELECTOR)) this.candidates.add(element)
    else this.candidates.delete(element)
  }
}
