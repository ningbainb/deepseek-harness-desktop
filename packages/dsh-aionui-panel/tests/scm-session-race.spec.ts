// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { createScmStore } from '../src/client/store.ts'
import type { PanelApi } from '../src/client/api.ts'

it.each(['stage', 'unstage', 'discard'] as const)('%s cannot publish or start a stale refresh after leaving and returning to a root', async method => {
  let finish!: (value: unknown) => void
  const pending = new Promise(resolve => { finish = resolve })
  const api = {
    gitStatus: vi.fn(async () => ({ ok: true, value: null })),
    gitStage: vi.fn(() => pending),
    gitUnstage: vi.fn(() => pending),
    gitDiscard: vi.fn(() => pending),
  }
  const store = createScmStore(api as unknown as PanelApi)
  store.setRoot('/a')
  await store.refresh()
  const action = store[method](['old.txt'])
  store.setRoot('/b')
  store.setRoot('/a')
  await store.refresh()
  store.update(prev => ({ ...prev, busy: ['new.txt'], failed: ['current.txt'] }))
  const snapshot = store.getSnapshot()
  const calls = api.gitStatus.mock.calls.length
  finish({ ok: false, error: { code: 'io', message: 'old failure' } })
  await action
  expect(store.getSnapshot()).toBe(snapshot)
  expect(api.gitStatus).toHaveBeenCalledTimes(calls)
})

it('binding no workspace makes no Git request and leaves loading settled', async () => {
  const api = { gitStatus: vi.fn(async () => ({ ok: true, value: null })) }
  const store = createScmStore(api as unknown as PanelApi)
  store.setRoot('/a')
  await store.refresh()
  const count = api.gitStatus.mock.calls.length
  store.setRoot('')
  expect(store.getSnapshot().loading).toBe(false)
  expect(api.gitStatus).toHaveBeenCalledTimes(count)
})
