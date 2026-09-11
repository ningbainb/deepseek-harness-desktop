// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  currentTurnIndex,
  findScrollRoot,
  getUserMessages,
  hasNativeTurnNavigator,
  hasNativeBottomAction,
  installTurnNavigator,
  mountTurnNavigator,
  positionNavigator,
  scrollToTurn,
} from '../src/client/turn-navigator.ts'

function dimension(element: HTMLElement, name: 'clientHeight' | 'clientTop' | 'scrollHeight', value: number): void {
  Object.defineProperty(element, name, { configurable: true, value })
}

function rect(top: number, height: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    bottom: top + height,
    left: 0,
    right: 600,
    width: 600,
    height,
    toJSON: () => ({}),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('conversation turn navigator', () => {
  it('never overlays a Desktop conversation, model menu or narrow native rail', async () => {
    vi.stubGlobal('dshDesktop', { shellContext: { mode: 'advanced' } })
    document.body.innerHTML = '<main data-pane="conversation"><section data-conversation-scroll><div data-chat-flow-kind="user"></div></section><nav aria-label="轮次导航" hidden><button>1</button><button>2</button></nav></main>'
    const pane = document.querySelector<HTMLElement>('main')!
    const dispose = installTurnNavigator()
    try {
      expect(pane.querySelector('[data-dsh-turn-navigator]')).toBeNull()
      pane.insertAdjacentHTML('beforeend', '<div role="menu">Models</div>')
      window.dispatchEvent(new Event('resize'))
      await Promise.resolve()
      expect(pane.querySelector('[data-dsh-turn-navigator]')).toBeNull()
      expect(pane.querySelector('nav')!.querySelectorAll('button')).toHaveLength(2)
    } finally { dispose() }
  })

  it('yields only the bottom control to a visible enabled native action and restores it when unavailable', async () => {
    document.body.innerHTML = '<main data-pane="conversation"><section data-conversation-scroll><div data-chat-flow-kind="user"></div></section><aside><button aria-label="回到底部"></button></aside></main>'
    const pane = document.querySelector<HTMLElement>('main')!
    const scroll = pane.querySelector<HTMLElement>('section')!
    const wrapper = pane.querySelector<HTMLElement>('aside')!
    const native = wrapper.querySelector('button')!
    dimension(scroll, 'clientHeight', 300)
    dimension(scroll, 'scrollHeight', 900)
    const dispose = installTurnNavigator()
    try {
      const bottom = pane.querySelector<HTMLButtonElement>('[data-role="bottom"]')!
      expect(hasNativeBottomAction(pane)).toBe(true)
      expect(bottom.hidden).toBe(true)
      expect(getComputedStyle(bottom).display).toBe('none')
      expect(pane.querySelector('[data-role="next"]')).not.toBeNull()
      native.setAttribute('aria-label', 'Back to bottom')
      await Promise.resolve()
      expect(bottom.hidden).toBe(true)
      for (const change of ['style', 'hidden', 'disabled', 'inert'] as const) {
        if (change === 'style') wrapper.style.display = 'none'
        else if (change === 'disabled') native.disabled = true
        else wrapper.setAttribute(change, '')
        await vi.waitFor(() => expect(bottom.hidden).toBe(false))
        wrapper.removeAttribute('style')
        wrapper.removeAttribute('hidden')
        wrapper.removeAttribute('inert')
        native.disabled = false
        await vi.waitFor(() => expect(bottom.hidden).toBe(true))
      }
      native.remove()
      await vi.waitFor(() => expect(bottom.hidden).toBe(false))
      scroll.scrollTop = 600
      scroll.dispatchEvent(new Event('scroll'))
      expect(bottom.hidden).toBe(true)
      expect(bottom.disabled).toBe(true)
    } finally { dispose() }
  })

  it('does not yield to an action in transcript content or a different conversation', () => {
    document.body.innerHTML = '<main><section data-chat-flow><button aria-label="Back to bottom"></button></section></main><aside><button aria-label="回到底部"></button></aside>'
    expect(hasNativeBottomAction(document.querySelector('main')!)).toBe(false)
  })

  it('restores a removed fallback in the same pane and cleans up on a session pane replacement', async () => {
    document.body.innerHTML = '<main data-pane="conversation"><div data-chat-flow-kind="user"></div></main>'
    const pane = document.querySelector<HTMLElement>('main')!
    const dispose = installTurnNavigator()
    try {
      const first = pane.querySelector('[data-dsh-turn-navigator]')!
      first.remove()
      await vi.waitFor(() => expect(pane.querySelectorAll('[data-dsh-turn-navigator]')).toHaveLength(1))
      expect(pane.querySelector('[data-dsh-turn-navigator]')).not.toBe(first)
      const empty = document.createElement('main')
      empty.setAttribute('data-pane', 'conversation')
      pane.replaceWith(empty)
      await vi.waitFor(() => expect(pane.querySelector('[data-dsh-turn-navigator]')).toBeNull())
      expect(empty.querySelector('[data-dsh-turn-navigator]')).toBeNull()
    } finally { dispose() }
  })
  it('does not mount empty controls and follows content changes without replacing the pane', async () => {
    document.body.innerHTML = '<main data-pane="conversation"><section data-conversation-scroll></section></main>'
    const pane = document.querySelector<HTMLElement>('main')!
    const scroll = pane.querySelector<HTMLElement>('section')!
    const dispose = installTurnNavigator()
    try {
      expect(pane.querySelector('[data-dsh-turn-navigator]')).toBeNull()
      scroll.innerHTML = '<div data-chat-flow-kind="user">First turn</div>'
      await vi.waitFor(() => expect(pane.querySelectorAll('[data-dsh-turn-navigator]')).toHaveLength(1))
      scroll.replaceChildren()
      await vi.waitFor(() => expect(pane.querySelector('[data-dsh-turn-navigator]')).toBeNull())
      // Imported assistant-only content still needs a usable route to its bottom.
      dimension(scroll, 'clientHeight', 300)
      dimension(scroll, 'scrollHeight', 900)
      scroll.innerHTML = '<div data-chat-flow-kind="assistant">Long restored output</div>'
      await vi.waitFor(() => expect(pane.querySelectorAll('[data-dsh-turn-navigator]')).toHaveLength(1))
      expect(pane.querySelector<HTMLButtonElement>('[data-role="bottom"]')!.disabled).toBe(false)
    } finally { dispose() }
  })

  it('releases pending scroll callbacks and preserves the pane owner positioning', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<main style="position:relative"><section data-conversation-scroll><div data-chat-flow-kind="user"></div></section></main>'
    const pane = document.querySelector<HTMLElement>('main')!
    const scroll = pane.querySelector<HTMLElement>('section')!
    dimension(scroll, 'scrollHeight', 900)
    dimension(scroll, 'clientHeight', 300)
    scroll.scrollTo = vi.fn()
    const dispose = mountTurnNavigator(pane)
    pane.querySelector<HTMLButtonElement>('[data-role="bottom"]')!.click()
    expect(vi.getTimerCount()).toBe(1)
    dispose()
    expect(vi.getTimerCount()).toBe(0)
    expect(pane.style.position).toBe('relative')
  })

  it('deduplicates long histories through ancestry instead of pairwise turn comparisons', () => {
    const pane = document.createElement('main')
    pane.innerHTML = '<section>' + '<article data-chat-flow-kind="user"><div data-message-role="user"></div></article>'.repeat(1_000) + '</section>'
    document.body.append(pane)
    const contains = vi.spyOn(Node.prototype, 'contains')
    try {
      const turns = getUserMessages(pane)
      expect(turns).toHaveLength(1_000)
      expect(turns.every(turn => turn.tagName === 'ARTICLE')).toBe(true)
      expect(contains.mock.calls.length).toBeLessThanOrEqual(2_000)
    } finally { contains.mockRestore() }
  })

  it('yields to native navigation and restores fallback if the native surface disappears', async () => {
    document.body.innerHTML = '<main data-pane="conversation"><section data-conversation-scroll><div data-chat-flow-kind="user"></div></section></main>'
    const pane = document.querySelector<HTMLElement>('main')!
    const dispose = installTurnNavigator()
    try {
      expect(pane.querySelectorAll('[data-dsh-turn-navigator]')).toHaveLength(1)
      const native = document.createElement('nav')
      native.setAttribute('aria-label', '轮次导航')
      native.innerHTML = '<button>1</button><button>2</button>'
      pane.append(native)
      await vi.waitFor(() => expect(pane.querySelector('[data-dsh-turn-navigator]')).toBeNull())
      expect(hasNativeTurnNavigator(pane)).toBe(true)
      native.setAttribute('aria-label', 'Turn navigation')
      await Promise.resolve()
      expect(pane.querySelector('[data-dsh-turn-navigator]')).toBeNull()
      native.hidden = true
      await vi.waitFor(() => expect(pane.querySelectorAll('[data-dsh-turn-navigator]')).toHaveLength(1))
      native.hidden = false
      await vi.waitFor(() => expect(pane.querySelector('[data-dsh-turn-navigator]')).toBeNull())
      native.remove()
      await vi.waitFor(() => expect(pane.querySelectorAll('[data-dsh-turn-navigator]')).toHaveLength(1))
    } finally { dispose() }
    expect(pane.querySelector('[data-dsh-turn-navigator]')).toBeNull()
  })

  it('does not mistake unrelated or incomplete navigation for a usable native rail', () => {
    document.body.innerHTML = '<main><nav aria-label="Files"><button>1</button><button>2</button></nav><nav aria-label="Turn navigation"><button>1</button></nav></main>'
    expect(hasNativeTurnNavigator(document.querySelector('main')!)).toBe(false)
  })

  it('keeps narrow-layout fallback until the native rail becomes visible on resize', async () => {
    document.body.innerHTML = '<main data-pane="conversation"><div data-chat-flow-kind="user"></div><section style="display:none"><nav aria-label="Turn navigation"><button>1</button><button>2</button></nav></section></main>'
    const pane = document.querySelector<HTMLElement>('main')!
    const section = pane.querySelector<HTMLElement>('section')!
    const dispose = installTurnNavigator()
    try {
      expect(hasNativeTurnNavigator(pane)).toBe(false)
      expect(pane.querySelectorAll('[data-dsh-turn-navigator]')).toHaveLength(1)
      section.style.display = 'block'
      window.dispatchEvent(new Event('resize'))
      await vi.waitFor(() => expect(pane.querySelector('[data-dsh-turn-navigator]')).toBeNull())
      section.style.display = 'none'
      window.dispatchEvent(new Event('resize'))
      await vi.waitFor(() => expect(pane.querySelectorAll('[data-dsh-turn-navigator]')).toHaveLength(1))
    } finally { dispose() }
  })

  it('places one navigation row above the composer instead of over its controls', () => {
    document.body.innerHTML = '<main data-pane="conversation"><section data-conversation-scroll></section><footer data-composer-seat></footer><div data-nav></div></main>'
    const pane = document.querySelector<HTMLElement>('main')!
    const scroll = pane.querySelector<HTMLElement>('section')!
    const composer = pane.querySelector<HTMLElement>('footer')!
    const nav = pane.querySelector<HTMLElement>('[data-nav]')!
    pane.getBoundingClientRect = () => rect(32, 650)
    scroll.getBoundingClientRect = () => rect(100, 470)
    composer.getBoundingClientRect = () => rect(570, 112)
    positionNavigator(nav, scroll, pane)
    expect(nav.style.bottom).toBe('124px')
    composer.getBoundingClientRect = () => rect(480, 202)
    positionNavigator(nav, scroll, pane)
    expect(nav.style.bottom).toBe('214px')
  })
  it('uses the official scrollport and user-node contracts, then lands on the next turn', () => {
    document.body.innerHTML = `
      <main data-pane="conversation">
        <div style="overflow-y:auto" data-decoy><div style="height:2000px"></div></div>
        <section data-conversation-scroll style="overflow-y:auto">
          <div data-chat-flow-kind="user"><div data-message-role="user"></div></div>
          <div data-chat-flow-kind="assistant"></div>
          <div data-chat-flow-kind="user"></div>
          <div data-chat-flow-kind="assistant"></div>
          <div data-chat-flow-kind="user"></div>
        </section>
      </main>`
    const pane = document.querySelector<HTMLElement>('[data-pane="conversation"]')!
    const scrollport = pane.querySelector<HTMLElement>('[data-conversation-scroll]')!
    const turns = getUserMessages(pane)
    const contentTops = [20, 400, 800]
    dimension(scrollport, 'clientHeight', 500)
    dimension(scrollport, 'clientTop', 2)
    dimension(scrollport, 'scrollHeight', 1_200)
    scrollport.scrollTop = 0
    scrollport.getBoundingClientRect = () => rect(100, 500)
    turns.forEach((turn, index) => {
      turn.getBoundingClientRect = () => rect(102 + contentTops[index]! - scrollport.scrollTop, 80)
    })
    scrollport.scrollTo = vi.fn(({ top }: ScrollToOptions) => {
      scrollport.scrollTop = Number(top)
      scrollport.dispatchEvent(new Event('scroll'))
    })

    expect(turns).toHaveLength(3)
    expect(findScrollRoot(pane)).toBe(scrollport)
    expect(currentTurnIndex(scrollport, turns)).toBe(0)
    scrollToTurn(scrollport, turns[1]!)
    expect(scrollport.scrollTop).toBe(340)
    expect(turns[1]!.getBoundingClientRect().top).toBe(162)

    scrollport.scrollTop = 0
    const dispose = mountTurnNavigator(pane)
    expect(pane.querySelector('[data-role="counter"]')?.textContent).toBe('1/3')
    pane.querySelector<HTMLButtonElement>('[data-role="next"]')!.click()
    expect(scrollport.scrollTop).toBe(340)
    expect(pane.querySelector('[data-role="counter"]')?.textContent).toBe('2/3')

    scrollport.scrollTop = 700
    scrollport.dispatchEvent(new Event('scroll'))
    expect(pane.querySelector('[data-role="counter"]')?.textContent).toBe('3/3')
    expect(pane.querySelector<HTMLButtonElement>('[data-role="bottom"]')?.disabled).toBe(true)
    dispose()
  })

  it('falls back to the narrowest scrollable ancestor containing every turn', () => {
    document.body.innerHTML = `
      <main data-pane="conversation" style="overflow-y:auto">
        <div data-transcript style="overflow-y:auto">
          <div data-chat-flow-kind="user"></div>
          <div data-chat-flow-kind="user"></div>
          <pre style="overflow-y:auto"><code>nested decoy</code></pre>
        </div>
      </main>`
    const pane = document.querySelector<HTMLElement>('[data-pane="conversation"]')!
    const transcript = pane.querySelector<HTMLElement>('[data-transcript]')!
    dimension(pane, 'clientHeight', 600)
    dimension(pane, 'scrollHeight', 900)
    dimension(transcript, 'clientHeight', 500)
    dimension(transcript, 'scrollHeight', 1_000)

    expect(findScrollRoot(pane)).toBe(transcript)
  })
})
