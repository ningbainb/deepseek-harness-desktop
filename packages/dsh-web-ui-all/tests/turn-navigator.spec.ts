// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  currentTurnIndex,
  findScrollRoot,
  getUserMessages,
  mountTurnNavigator,
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
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('conversation turn navigator', () => {
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
