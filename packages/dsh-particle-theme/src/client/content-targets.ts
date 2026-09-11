import { MESSAGE_SELECTOR } from './content-clearance.ts'

const COMPOSER_SELECTOR = '[data-composer-seat], [data-dsh-file-attachments]:has([data-state])'
export const CONTENT_TARGET_ATTRIBUTES = ['data-composer-seat', 'data-dsh-file-attachments', 'data-state', 'data-pane', 'data-chat-flow-kind', 'data-message-role']
const CANDIDATE_SELECTOR = CONTENT_TARGET_ATTRIBUTES.map(attribute => `[${attribute}]`).join(',')

/** Cache membership only. Visibility and geometry are always measured live. */
export class ContentTargets {
  private dirty = true
  private value: { composers: Element[]; messages: Element[] } = { composers: [], messages: [] }

  constructor(private readonly document: Document) {}

  update(records: readonly MutationRecord[]): void {
    if (this.dirty) return
    for (const record of records) {
      if (record.type === 'attributes' && CONTENT_TARGET_ATTRIBUTES.includes(record.attributeName ?? '')) {
        this.dirty = true
        return
      }
      if (record.type !== 'childList') continue
      for (const node of [...record.addedNodes, ...record.removedNodes]) {
        if (node.nodeType !== 1) continue
        const element = node as Element
        if (element.matches(CANDIDATE_SELECTOR) || element.firstElementChild && element.querySelector(CANDIDATE_SELECTOR)) {
          this.dirty = true
          return
        }
      }
    }
  }

  read(): { composers: Element[]; messages: Element[] } {
    if (this.dirty) {
      // Query only when membership can change, retaining native DOM order and
      // ancestor/:has semantics rather than keeping a differently ordered set.
      this.value = { composers: [...this.document.querySelectorAll(COMPOSER_SELECTOR)],
        messages: [...this.document.querySelectorAll(MESSAGE_SELECTOR)] }
      this.dirty = false
    }
    return this.value
  }
}
