// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSidebarEntry, SURFACE_NAVIGATION_EVENT } from '../src/client/sidebar-entry.ts'

function shell(): HTMLButtonElement {
  document.body.innerHTML = '<aside data-pane="sidebar"><div><div class="logoRow"><button class="newSession">New</button></div><button class="sessionRow">Session</button></div></aside>'
  return document.querySelector<HTMLButtonElement>('.sessionRow')!
}

describe('task-board sidebar navigation', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('closes the board when an original sidebar destination is clicked', () => {
    const original = shell()
    const controller = {
      toggleBoard: vi.fn(),
      closeBoard: vi.fn(),
      subscribe: () => () => {},
      getSnapshot: () => ({ boardOpen: true }),
    }
    const dispose = mountSidebarEntry(controller as never)

    original.click()

    expect(controller.closeBoard).toHaveBeenCalledOnce()
    dispose()
  })

  it('announces itself and closes when another custom surface opens', () => {
    shell()
    const controller = {
      toggleBoard: vi.fn(),
      closeBoard: vi.fn(),
      subscribe: () => () => {},
      getSnapshot: () => ({ boardOpen: false }),
    }
    const dispose = mountSidebarEntry(controller as never)
    document.querySelector<HTMLButtonElement>('[data-dsh-taskboard-entry]')!.click()
    expect(controller.toggleBoard).toHaveBeenCalledOnce()

    document.dispatchEvent(new CustomEvent(SURFACE_NAVIGATION_EVENT, { detail: { surface: 'ssh' } }))
    expect(controller.closeBoard).toHaveBeenCalledOnce()
    dispose()
  })
})


it('desktop Dock opens the existing task-board controller without mounting a left shortcut', () => {
  const native = shell()
  let receive: (() => boolean) | undefined
  const unsubscribe = vi.fn()
  const onDesktopToolOpen = vi.fn((tool: string, callback: () => boolean) => {
    expect(tool).toBe('task-board')
    receive = callback
    return unsubscribe
  })
  Object.assign(window, { dshDesktop: { onDesktopToolOpen } })
  const controller = { openBoard: vi.fn(), closeBoard: vi.fn(),
    subscribe: () => () => {}, getSnapshot: () => ({ boardOpen: false }) }
  const dispose = mountSidebarEntry(controller as never)
  try {
    expect(document.querySelector('[data-dsh-taskboard-entry]')).toBeNull()
    expect(onDesktopToolOpen).toHaveBeenCalledOnce()
    expect(receive!()).toBe(false)
    expect(controller.openBoard).not.toHaveBeenCalled()
    const view = document.createElement('div')
    view.dataset.dshTaskboardView = ''
    document.body.append(view)
    expect(receive!()).toBe(true)
    expect(controller.openBoard).toHaveBeenCalledOnce()
    document.dispatchEvent(new CustomEvent(SURFACE_NAVIGATION_EVENT, { detail: { surface: 'another-tool' } }))
    expect(controller.closeBoard).toHaveBeenCalledOnce()
    native.click()
    expect(controller.closeBoard).toHaveBeenCalledTimes(2)
  } finally {
    dispose()
    delete (window as typeof window & { dshDesktop?: unknown }).dshDesktop
  }
  expect(unsubscribe).toHaveBeenCalledOnce()
})


it('retains the existing task-board entry on older hosts without the new Desktop tool bridge', () => {
  shell()
  Object.assign(window, { dshDesktop: { getInfo: vi.fn() } })
  const controller = { toggleBoard: vi.fn(), subscribe: () => () => {}, getSnapshot: () => ({ boardOpen: false }) }
  const dispose = mountSidebarEntry(controller as never)
  try {
    const entry = document.querySelector<HTMLButtonElement>('[data-dsh-taskboard-entry]')
    expect(entry).not.toBeNull()
    entry!.click()
    expect(controller.toggleBoard).toHaveBeenCalledOnce()
  } finally { dispose(); delete (window as typeof window & { dshDesktop?: unknown }).dshDesktop }
})
