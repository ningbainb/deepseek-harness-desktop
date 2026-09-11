/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { FileAttachmentRail } from '../src/client/drag/FileAttachmentRail.tsx'

let root: Root | undefined
let container: HTMLDivElement
afterEach(() => {
  if (root) act(() => root!.unmount())
  root = undefined
  container?.remove()
  vi.unstubAllGlobals()
})

it.each(['pending', 'failed', 'ready'])('protects both composer generations when attachment state is %s', state => {
  const entries = [{ id: 'file', name: 'sample.bin', size: 3, state }]
  const queue = { subscribe: () => () => {}, snapshot: () => entries }
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root!.render(<div data-slot="conversation">
    <textarea />
    <div data-composer-input contentEditable suppressContentEditableWarning><span>draft</span></div>
    <input aria-label="unrelated input" />
    <button type="button" aria-label="发送消息"><span>send</span></button>
    <button type="button" aria-label="Send message"><span>send</span></button>
    <button type="submit">legacy submit</button>
    <FileAttachmentRail queue={queue as never} addImages={vi.fn()} />
  </div>))
  const allowed = state === 'ready'
  for (const selector of ['textarea', '[data-composer-input] span']) {
    const target = container.querySelector(selector)!
    expect(target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))).toBe(allowed)
    expect(target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }))).toBe(true)
    expect(target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }))).toBe(true)
  }
  expect(container.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))).toBe(true)
  for (const selector of ['button[aria-label="发送消息"] span', 'button[aria-label="Send message"] span', 'button[type="submit"]']) {
    expect(container.querySelector(selector)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).toBe(allowed)
  }
})
