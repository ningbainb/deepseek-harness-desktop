// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSidebarEntry, SURFACE_NAVIGATION_EVENT } from '../src/client/sidebar-entry.ts'

function shell(): HTMLButtonElement {
  document.body.innerHTML = '<aside data-pane="sidebar"><div><div class="logoRow"><button class="newSession">New</button></div><button class="workspaceRow">Workspace</button></div></aside>'
  return document.querySelector<HTMLButtonElement>('.workspaceRow')!
}

describe('SSH sidebar navigation', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('closes the panel when an original sidebar destination is clicked', () => {
    const original = shell()
    const controller = {
      toggle: vi.fn(),
      close: vi.fn(),
      subscribe: () => () => {},
      getSnapshot: () => ({ panelOpen: true }),
    }
    const dispose = mountSidebarEntry(controller as never)

    original.click()

    expect(controller.close).toHaveBeenCalledOnce()
    dispose()
  })

  it('announces itself and closes when another custom surface opens', () => {
    shell()
    const controller = {
      toggle: vi.fn(),
      close: vi.fn(),
      subscribe: () => () => {},
      getSnapshot: () => ({ panelOpen: false }),
    }
    const dispose = mountSidebarEntry(controller as never)
    document.querySelector<HTMLButtonElement>('[data-dsh-ssh-entry]')!.click()
    expect(controller.toggle).toHaveBeenCalledOnce()

    document.dispatchEvent(new CustomEvent(SURFACE_NAVIGATION_EVENT, { detail: { surface: 'task-board' } }))
    expect(controller.close).toHaveBeenCalledOnce()
    dispose()
  })
})


it('desktop Dock opens the existing ssh controller without mounting a left shortcut', () => {
  const native = shell()
  let receive: (() => boolean) | undefined
  const unsubscribe = vi.fn()
  const onDesktopToolOpen = vi.fn((tool: string, callback: () => boolean) => {
    expect(tool).toBe('ssh')
    receive = callback
    return unsubscribe
  })
  Object.assign(window, { dshDesktop: { onDesktopToolOpen } })
  const controller = { open: vi.fn(), close: vi.fn(),
    subscribe: () => () => {}, getSnapshot: () => ({ panelOpen: false }) }
  const dispose = mountSidebarEntry(controller as never)
  try {
    expect(document.querySelector('[data-dsh-ssh-entry]')).toBeNull()
    expect(onDesktopToolOpen).toHaveBeenCalledOnce()
    expect(receive!()).toBe(false)
    expect(controller.open).not.toHaveBeenCalled()
    const view = document.createElement('div')
    view.dataset.dshSshView = ''
    document.body.append(view)
    expect(receive!()).toBe(true)
    expect(controller.open).toHaveBeenCalledOnce()
    document.dispatchEvent(new CustomEvent(SURFACE_NAVIGATION_EVENT, { detail: { surface: 'another-tool' } }))
    expect(controller.close).toHaveBeenCalledOnce()
    native.click()
    expect(controller.close).toHaveBeenCalledTimes(2)
  } finally {
    dispose()
    delete (window as typeof window & { dshDesktop?: unknown }).dshDesktop
  }
  expect(unsubscribe).toHaveBeenCalledOnce()
})


it('retains the existing ssh entry on older hosts without the new Desktop tool bridge', () => {
  shell()
  Object.assign(window, { dshDesktop: { getInfo: vi.fn() } })
  const controller = { toggle: vi.fn(), subscribe: () => () => {}, getSnapshot: () => ({ panelOpen: false }) }
  const dispose = mountSidebarEntry(controller as never)
  try {
    const entry = document.querySelector<HTMLButtonElement>('[data-dsh-ssh-entry]')
    expect(entry).not.toBeNull()
    entry!.click()
    expect(controller.toggle).toHaveBeenCalledOnce()
  } finally { dispose(); delete (window as typeof window & { dshDesktop?: unknown }).dshDesktop }
})
