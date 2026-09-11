import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContentTargets, CONTENT_TARGET_ATTRIBUTES } from '../src/client/content-targets.ts'
import { MESSAGE_SELECTOR } from '../src/client/content-clearance.ts'

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

function fixture() {
  const targets = new ContentTargets(document)
  const observer = new MutationObserver(records => targets.update(records))
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['class', 'style', 'hidden', ...CONTENT_TARGET_ATTRIBUTES] })
  return { read() { targets.update(observer.takeRecords()); return targets.read() }, dispose: () => observer.disconnect() }
}

describe('particle content target membership cache', () => {
  it('keeps DOM order and avoids full scans for layout, text and unrelated controls', () => {
    document.body.innerHTML = '<main data-pane="conversation"><article data-chat-flow-kind="user"></article><div data-composer-seat></div></main>'
    const article = document.querySelector('article')!
    const query = vi.spyOn(document, 'querySelectorAll')
    const f = fixture()
    try {
      const initial = f.read()
      expect(initial.messages).toEqual([article])
      expect(initial.composers).toHaveLength(1)
      for (let i = 0; i < 100; i++) {
        article.className = `row-${i}`
        article.append(document.createTextNode('stream'))
        const button = document.createElement('button'); button.innerHTML = '<span>control</span>'
        document.body.append(button)
        expect(f.read()).toBe(initial)
        button.remove()
        expect(f.read()).toBe(initial)
      }
      expect(query).toHaveBeenCalledTimes(2)
      const previous = document.createElement('article')
      previous.dataset.chatFlowKind = 'assistant'
      article.before(previous)
      expect(f.read().messages).toEqual([previous, article])
      expect(query).toHaveBeenCalledTimes(4)
    } finally { f.dispose() }
  })

  it('invalidates for added/removed wrappers, pane membership and native/legacy marker changes', () => {
    document.body.innerHTML = '<main data-pane="conversation"></main><aside><section><article data-message-role="user"></article></section></aside>'
    const main = document.querySelector('main')!, aside = document.querySelector('aside')!
    const wrapper = document.querySelector('section')!, article = document.querySelector('article')!
    const f = fixture()
    const compare = () => expect(f.read().messages).toEqual([...document.querySelectorAll(MESSAGE_SELECTOR)])
    try {
      compare(); expect(f.read().messages).toEqual([])
      main.append(wrapper); compare(); expect(f.read().messages).toEqual([article])
      main.setAttribute('data-pane', 'other'); compare(); expect(f.read().messages).toEqual([])
      main.setAttribute('data-pane', 'conversation'); compare()
      article.removeAttribute('data-message-role'); compare(); expect(f.read().messages).toEqual([])
      article.setAttribute('data-chat-flow-kind', 'assistant'); compare()
      aside.append(wrapper); compare(); expect(f.read().messages).toEqual([])
      main.append(wrapper); compare()
      wrapper.remove(); compare(); expect(f.read().messages).toEqual([])
    } finally { f.dispose() }
  })

  it('tracks native composer replacement and legacy descendant :has membership', () => {
    document.body.innerHTML = '<div data-composer-seat></div><section data-dsh-file-attachments><span></span></section>'
    const composer = document.querySelector('div')!, rail = document.querySelector('section')!, state = document.querySelector('span')!
    const f = fixture()
    try {
      expect(f.read().composers).toEqual([composer])
      state.setAttribute('data-state', 'ready')
      expect(f.read().composers).toEqual([composer, rail])
      state.removeAttribute('data-state')
      expect(f.read().composers).toEqual([composer])
      state.setAttribute('data-state', 'ready'); expect(f.read().composers).toEqual([composer, rail])
      state.remove(); expect(f.read().composers).toEqual([composer])
      rail.append(state); expect(f.read().composers).toEqual([composer, rail])
      composer.remove(); expect(f.read().composers).toEqual([rail])
      rail.removeAttribute('data-dsh-file-attachments'); expect(f.read().composers).toEqual([])
      rail.setAttribute('data-composer-seat', ''); expect(f.read().composers).toEqual([rail])
    } finally { f.dispose() }
  })
})
