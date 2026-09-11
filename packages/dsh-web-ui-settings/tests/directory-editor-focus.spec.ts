// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { protectDirectoryEditorFocus } from '../src/client/directory-editor-focus.ts'

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

function fixture() {
  document.body.innerHTML = '<div role="dialog"><input aria-label="编辑路径"><button>inside</button></div><textarea data-composer-input></textarea><button id="outside">outside</button>'
  const input = document.querySelector('input')!
  const composer = document.querySelector('textarea')!
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  const dispose = protectDirectoryEditorFocus(document)
  const cancel = vi.fn()
  input.parentElement!.addEventListener('focusout', cancel)
  input.focus()
  return { input, composer, dispose, cancel }
}

it('restores the native editor and blocks its cancel handler after unsolicited composer focus', async () => {
  const { input, composer, dispose, cancel } = fixture()
  try {
    input.value = 'C:\\unfinished'
    composer.focus()
    await Promise.resolve()
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('C:\\unfinished')
    expect(cancel).not.toHaveBeenCalled()
    dispose()
    composer.focus()
    await Promise.resolve()
    expect(document.activeElement).toBe(composer)
    expect(cancel).toHaveBeenCalledOnce()
  } finally { dispose() }
})

it.each(['pointerdown', 'Tab'])('allows deliberate %s navigation to the composer', async intent => {
  const { composer, dispose, cancel } = fixture()
  try {
    if (intent === 'Tab') document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    else composer.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    composer.focus()
    await Promise.resolve()
    expect(document.activeElement).toBe(composer)
    expect(cancel).toHaveBeenCalledOnce()
  } finally { dispose() }
})

it('does not trap other targets or restore a removed/disposed dialog', async () => {
  const { input, composer, dispose, cancel } = fixture()
  document.querySelector<HTMLButtonElement>('#outside')!.focus()
  expect(cancel).toHaveBeenCalledOnce()
  input.focus()
  composer.focus()
  input.parentElement!.remove()
  dispose()
  await Promise.resolve()
  expect(document.activeElement).toBe(composer)
})

it('does not intervene when the document loses foreground focus', async () => {
  const { composer, dispose, cancel } = fixture()
  vi.mocked(document.hasFocus).mockReturnValue(false)
  composer.focus()
  await Promise.resolve()
  expect(cancel).toHaveBeenCalledOnce()
  expect(document.activeElement).toBe(composer)
  dispose()
})
