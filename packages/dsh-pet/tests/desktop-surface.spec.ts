// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { apply } from '../src/client/index.ts'

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({ render: vi.fn(), unmount: vi.fn() })),
}))

const disposers: Array<() => void> = []

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  disposers.splice(0).reverse().forEach(dispose => dispose())
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  window.history.replaceState({}, '', '/')
})

function install(visible: boolean) {
  const saved = { enabled: true, visible, right: 24, bottom: 20, size: 160, name: 'Fixture' }
  const listeners = new Set<() => void>()
  const writes = vi.fn()
  const scope = {
    getSnapshot: () => ({ status: 'ready', writable: true, value: saved, base: saved, user: {} }),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
    set: writes,
    update: writes,
  }
  const register = vi.fn()
  const request = vi.fn()
  vi.stubGlobal('fetch', request)
  const context = {
    get: () => ({ bind: () => scope }),
    locale: { register: vi.fn() },
    slots: { inject: (_name: string, factory: () => unknown) => factory(), register },
    effect: (factory: () => void | (() => void)) => {
      const cleanup = factory()
      let disposed = false
      const dispose = () => { if (!disposed) { disposed = true; cleanup?.() } }
      disposers.push(dispose)
      return dispose
    },
  }
  apply(context as unknown as Parameters<typeof apply>[0])
  return { register, request, saved, writes, refresh: () => listeners.forEach(listener => listener()) }
}

for (const setting of ['value-mode', 'models', 'memory', 'skill-market', 'plugin-options']) {
  for (const visible of [true, false]) {
    it(`does not mount or poll a ${visible ? 'visible' : 'hidden'} pet in the dedicated ${setting} document, while preserving its configuration card`, () => {
      window.history.replaceState({}, '', `/?desktop-dock-setting=${setting}`)
      const { register, request, saved, writes, refresh } = install(visible)
      const before = JSON.stringify(saved)
      refresh()
      document.dispatchEvent(new Event('visibilitychange'))
      expect(register).toHaveBeenCalledWith(expect.objectContaining({ id: 'pet-settings' }), expect.any(Function))
      expect(document.querySelector('[data-dsh-pet-root]')).toBeNull()
      expect(createRoot).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
      expect(request).not.toHaveBeenCalled()
      expect(writes).not.toHaveBeenCalled()
      expect(JSON.stringify(saved)).toBe(before)
    })
  }
}

for (const visible of [true, false]) {
  it(`retains the main document pet root and polling lifecycle with visible=${visible}`, () => {
    const { register, saved, writes } = install(visible)
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ id: 'pet-settings' }), expect.any(Function))
    expect(document.querySelectorAll('[data-dsh-pet-root]')).toHaveLength(1)
    expect(createRoot).toHaveBeenCalledOnce()
    expect(vi.mocked(createRoot).mock.results[0].value.render).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(1)
    expect(saved.visible).toBe(visible)
    expect(writes).not.toHaveBeenCalled()
  })
}
