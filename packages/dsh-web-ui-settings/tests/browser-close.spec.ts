import { afterEach, expect, it, vi } from 'vitest'
import { installBrowserClose } from '../src/client/desktop-interactions.tsx'

let dispose: (() => void) | undefined

function browser(): { input: HTMLInputElement; original: HTMLButtonElement; close: HTMLButtonElement } {
  document.body.innerHTML = '<textarea data-slot="conversation"></textarea><div data-dsh-panel-host><div><div><div draggable="true"><button aria-label="关闭">Tab</button></div></div></div><div><div><div><div><input placeholder="输入网址，例如 example.com"></div></div></div></div></div>'
  const input = document.querySelector('input')!
  const original = document.querySelector<HTMLButtonElement>('button')!
  dispose = installBrowserClose(document)
  return { input, original, close: document.querySelector<HTMLButtonElement>('[data-dsh-browser-close]')! }
}

afterEach(() => { dispose?.(); dispose = undefined; document.body.replaceChildren() })

it('resolves the current tab close action after React replaces its button', () => {
  const { original, close } = browser()
  const stale = vi.fn()
  original.addEventListener('click', stale)
  const replacement = original.cloneNode(true) as HTMLButtonElement
  const current = vi.fn()
  replacement.addEventListener('click', current)
  original.replaceWith(replacement)
  close.click()
  expect(stale).not.toHaveBeenCalled()
  expect(current).toHaveBeenCalledTimes(1)
})

it.each(['ctrlKey', 'metaKey'])('handles %s+W only inside the browser', modifier => {
  const { input, original } = browser()
  const clicked = vi.fn()
  original.addEventListener('click', clicked)
  input.focus()
  const event = new KeyboardEvent('keydown', { key: 'w', [modifier]: true, bubbles: true, cancelable: true })
  input.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  expect(clicked).toHaveBeenCalledTimes(1)
  document.querySelector('textarea')!.focus()
  const outside = new KeyboardEvent('keydown', { key: 'w', [modifier]: true, bubbles: true, cancelable: true })
  document.activeElement!.dispatchEvent(outside)
  expect(outside.defaultPrevented).toBe(false)
  expect(clicked).toHaveBeenCalledTimes(1)
})

it.each(['altKey', 'shiftKey', 'isComposing', 'prevented'])('does not steal %s shortcuts', extra => {
  const { input, original } = browser()
  const clicked = vi.fn()
  original.addEventListener('click', clicked)
  input.focus()
  const event = new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, [extra]: true, bubbles: true, cancelable: true })
  if (extra === 'prevented') event.preventDefault()
  input.dispatchEvent(event)
  expect(clicked).not.toHaveBeenCalled()
})

it('removes both its button and keyboard listener on disposal', () => {
  const { input, original } = browser()
  const clicked = vi.fn()
  original.addEventListener('click', clicked)
  dispose!()
  dispose = undefined
  input.focus()
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, bubbles: true }))
  expect(clicked).not.toHaveBeenCalled()
  expect(document.querySelector('[data-dsh-browser-close]')).toBeNull()
})
