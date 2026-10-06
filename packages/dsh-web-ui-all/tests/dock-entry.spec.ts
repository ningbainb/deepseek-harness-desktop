// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { ENTRY_SELECTOR, FOOTER_ENTRY_SELECTOR, mountDockEntry } from '../src/client/dock-entry.ts'

let dispose: (() => void) | undefined

function shell(nested = true): void {
  document.body.innerHTML = `<aside data-pane="sidebar"><div>${nested
    ? '<div class="shell_logoRow"><button class="shell_newSession">New session</button></div>'
    : '<button>New session</button>'}<button data-dsh-taskboard-entry>Tasks</button><button data-dsh-ssh-entry>SSH</button><div data-browser>Workspace</div></div></aside>`
}

function entry(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(ENTRY_SELECTOR)!
}

afterEach(() => {
  dispose?.()
  dispose = undefined
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('sidebar Dock bridge', () => {
  it('retains only the footer Dock when it is already mounted', () => {
    shell()
    const footer = document.createElement('div')
    footer.dataset.dshExtensionDockEntry = ''
    const button = document.createElement('button')
    const open = vi.fn()
    button.addEventListener('click', open)
    footer.append(button)
    document.querySelector('[data-browser]')!.after(footer)
    dispose = mountDockEntry()
    expect(document.querySelector(ENTRY_SELECTOR)).toBeNull()
    expect(document.querySelector(FOOTER_ENTRY_SELECTOR)).toBe(button)
    button.click()
    expect(open).toHaveBeenCalledTimes(1)
    dispose()
    dispose = undefined
    expect(button.isConnected).toBe(true)
  })

  it('deduplicates a late footer and restores the fallback only when the footer disappears', async () => {
    shell()
    dispose = mountDockEntry()
    const fallback = entry()
    const footer = document.createElement('div')
    footer.dataset.dshExtensionDockEntry = ''
    footer.innerHTML = '<button>Footer Dock</button>'
    document.querySelector('[data-browser]')!.after(footer)
    await vi.waitFor(() => expect(document.querySelector(ENTRY_SELECTOR)).toBeNull())
    expect(document.querySelector(FOOTER_ENTRY_SELECTOR)).not.toBeNull()
    footer.remove()
    await vi.waitFor(() => expect(entry()).toBe(fallback))
    shell()
    document.querySelector('[data-browser]')!.after(footer)
    await vi.waitFor(() => expect(document.querySelector(ENTRY_SELECTOR)).toBeNull())
    expect(document.querySelectorAll(FOOTER_ENTRY_SELECTOR)).toHaveLength(1)
  })

  it('waits for a usable footer button rather than an empty footer wrapper', async () => {
    shell()
    const footer = document.createElement('div')
    footer.dataset.dshExtensionDockEntry = ''
    document.querySelector('[data-browser]')!.after(footer)
    dispose = mountDockEntry()
    expect(entry()).not.toBeNull()
    footer.append(document.createElement('button'))
    await vi.waitFor(() => expect(document.querySelector(ENTRY_SELECTOR)).toBeNull())
    expect(document.querySelectorAll(FOOTER_ENTRY_SELECTOR)).toHaveLength(1)
  })

  it('opens through the actual main-window preload with its receiver intact', () => {
    shell()
    const desktop = { openExtensionDock: vi.fn(function (this: unknown) {
      expect(this).toBe(desktop)
      return Promise.resolve(true)
    }) }
    vi.stubGlobal('dshDesktop', desktop)
    dispose = mountDockEntry()
    entry().click()
    expect(desktop.openExtensionDock).toHaveBeenCalledExactlyOnceWith()
    expect(entry().getAttribute('aria-label')).toBe('扩展坞')
  })

  it('falls back to the legacy runtime transport when main has no Dock method', () => {
    shell(false)
    const transport = { openExtensions: vi.fn().mockResolvedValue(true) }
    vi.stubGlobal('dshDesktop', {})
    vi.stubGlobal('dshDesktopTransport', transport)
    dispose = mountDockEntry()
    entry().click()
    expect(transport.openExtensions).toHaveBeenCalledExactlyOnceWith()
  })

  it('prefers main and never duplicates a rejected request through legacy transport', async () => {
    shell()
    const main = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(true)
    const legacy = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('dshDesktop', { openExtensionDock: main })
    vi.stubGlobal('dshDesktopTransport', { openExtensions: legacy })
    dispose = mountDockEntry()
    entry().click()
    await vi.waitFor(() => expect(entry().title).toBe('无法打开扩展坞，请重试'))
    expect(legacy).not.toHaveBeenCalled()
    entry().click()
    await Promise.resolve()
    expect(main).toHaveBeenCalledTimes(2)
    expect(entry().title).toBe('打开扩展坞')
  })

  it.each(['missing', 'throws', 'refused'])('reports an unavailable %s bridge without hiding the entry', async kind => {
    shell()
    if (kind === 'throws') vi.stubGlobal('dshDesktop', { openExtensionDock: () => { throw new Error('offline') } })
    if (kind === 'refused') vi.stubGlobal('dshDesktop', { openExtensionDock: vi.fn().mockResolvedValue(false) })
    dispose = mountDockEntry()
    entry().click()
    await vi.waitFor(() => expect(entry().title).toBe('无法打开扩展坞，请重试'))
    expect(entry().isConnected).toBe(true)
  })

  it.each([true, false])('keeps existing sidebar actions in order on nested=%s shells', nested => {
    shell(nested)
    dispose = mountDockEntry()
    expect(entry().previousElementSibling?.hasAttribute('data-dsh-ssh-entry')).toBe(true)
    expect(entry().nextElementSibling?.hasAttribute('data-browser')).toBe(true)
    const duplicateDispose = mountDockEntry()
    duplicateDispose()
    expect(document.querySelectorAll(ENTRY_SELECTOR)).toHaveLength(1)
  })

  it('waits for the shell and survives both row removal and root replacement', async () => {
    dispose = mountDockEntry()
    shell()
    await vi.waitFor(() => expect(entry()).not.toBeNull())
    const mounted = entry()
    mounted.remove()
    await vi.waitFor(() => expect(entry()).toBe(mounted))
    shell(false)
    await vi.waitFor(() => expect(entry()).toBe(mounted))
    dispose()
    dispose = undefined
    shell()
    await Promise.resolve()
    expect(document.querySelector(ENTRY_SELECTOR)).toBeNull()
  })
})
