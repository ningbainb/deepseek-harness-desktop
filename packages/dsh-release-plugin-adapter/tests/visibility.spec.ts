import { describe, expect, it } from 'vitest'
import { companionVisibleInDocument, installVisibility, readVisible, writeVisible, notifyCompanionLifecycle } from '../src/client/visibility.ts'

describe('independent dafeiyu display', () => {
  it('signals effective document policy to the community lifecycle without changing storage', () => {
    const events: CustomEvent[] = []
    const target = { dispatchEvent(event: Event) { events.push(event as CustomEvent); return true } }
    notifyCompanionLifecycle(target, companionVisibleInDocument(true, '?desktop-dock-setting=plugin-options'))
    notifyCompanionLifecycle(target, companionVisibleInDocument(true, ''))
    notifyCompanionLifecycle(target, false)
    expect(events.map(event => [event.type, event.detail])).toEqual([
      ['dsh-dafeiyu-visibility', false], ['dsh-dafeiyu-visibility', true], ['dsh-dafeiyu-visibility', false],
    ])
  })
  it('keeps the shared display preference while suppressing the widget in independent settings documents', () => {
    expect(companionVisibleInDocument(true, '?dsh-desktop-mode=advanced')).toBe(true)
    expect(companionVisibleInDocument(false, '?dsh-desktop-mode=advanced')).toBe(false)
    expect(companionVisibleInDocument(true, '?desktop-dock-setting=plugin-options')).toBe(false)
    expect(companionVisibleInDocument(true, '?desktop-dock-setting=models')).toBe(false)
  })
  it('shows the companion when a Desktop profile has no saved display choice', () => {
    expect(readVisible({ getItem() { return null } })).toBe(true)
  })
  it('keeps explicit visibility choices and fails closed when storage cannot be read', () => {
    expect(readVisible({ getItem() { throw new Error('denied') } })).toBe(false)
    expect(readVisible({ getItem() { return 'true' } })).toBe(true)
    expect(readVisible({ getItem() { return 'false' } })).toBe(false)
    expect(readVisible({ getItem() { return '' } })).toBe(false)
    expect(readVisible({ getItem() { return 'invalid' } })).toBe(false)
  })
  it('writes only the adapter visibility preference, preserving vendor and original pet data', () => {
    const values = new Map([['dfy-role', 'saved'], ['pet', 'original']])
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    writeVisible(storage, false)
    expect(readVisible(storage)).toBe(false)
    expect(values.get('dfy-role')).toBe('saved')
    expect(values.get('pet')).toBe('original')
  })
  it('restores the document attribute on unload without touching other attributes', () => {
    const attrs = new Map([['data-dsh-pet-root', '']])
    const target = { getAttribute: (key: string) => attrs.get(key) ?? null, setAttribute: (key: string, value: string) => { attrs.set(key, value) }, removeAttribute: (key: string) => { attrs.delete(key) } }
    const display = installVisibility(target, false)
    expect(attrs.get('data-desktop-dafeiyu-visible')).toBe('false')
    display.set(true)
    expect(attrs.get('data-desktop-dafeiyu-visible')).toBe('true')
    display.dispose()
    expect(attrs.has('data-desktop-dafeiyu-visible')).toBe(false)
    expect(attrs.has('data-dsh-pet-root')).toBe(true)
  })
})
