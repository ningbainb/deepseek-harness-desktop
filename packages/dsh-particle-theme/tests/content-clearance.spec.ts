import { afterEach, expect, it, vi } from 'vitest'
import { MESSAGE_SELECTOR, messageClearanceRects } from '../src/client/content-clearance.ts'

const box = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height } as DOMRect)
const canvas = box(0, 32, 1000, 768)
function message(parent: Element, bounds = box(300, 150, 400, 80)) {
  const element = document.createElement('div')
  element.dataset.chatFlowKind = 'assistant'
  element.getBoundingClientRect = () => bounds
  parent.append(element)
  return element
}
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

it('protects native and legacy messages only within the conversation', () => {
  document.body.innerHTML = '<main data-pane="conversation"></main><aside></aside>'
  const pane = document.querySelector('main')!
  const native = message(pane)
  const legacy = message(pane, box(340, 270, 350, 90))
  delete legacy.dataset.chatFlowKind
  legacy.dataset.messageRole = 'user'
  message(document.querySelector('aside')!)
  const targets = [...document.querySelectorAll(MESSAGE_SELECTOR)]
  expect(targets).toEqual([native, legacy])
  expect(messageClearanceRects(targets, canvas, 500)).toEqual([
    { x: 296, y: 114, width: 408, height: 88 },
    { x: 336, y: 234, width: 358, height: 98 },
  ])
})

it('clips scrolled history at its viewport and above the native draft', () => {
  const scroll = document.createElement('div')
  scroll.style.overflow = 'auto'
  scroll.getBoundingClientRect = () => box(280, 120, 450, 400)
  document.body.append(scroll)
  const history = message(scroll, box(260, -100, 500, 1000))
  expect(messageClearanceRects([history], canvas, 480)).toEqual([
    { x: 280, y: 88, width: 450, height: 360 },
  ])
  scroll.style.display = 'none'
  expect(messageClearanceRects([history], canvas, 480)).toEqual([])
})

it('ignores hidden/offscreen content and deduplicates nested flow markers', () => {
  const outer = message(document.body)
  const inner = message(outer, box(320, 170, 40, 20))
  const offscreen = message(document.body, box(300, 900, 400, 80))
  expect(messageClearanceRects([outer, inner, offscreen], canvas, 500)).toHaveLength(1)
  outer.setAttribute('aria-hidden', 'true')
  expect(messageClearanceRects([outer, inner], canvas, 500)).toEqual([])
})
