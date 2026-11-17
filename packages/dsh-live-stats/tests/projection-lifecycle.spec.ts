import type { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { apply } from '../src/index.ts'

function fixture() {
  let complete!: (value: ReturnType<typeof handle>) => void
  const registration = new Promise<ReturnType<typeof handle>>(resolve => { complete = resolve })
  const register = vi.fn(() => registration)
  const cleanups: Array<() => unknown> = []
  let rebuild!: () => void
  let changed!: (session: unknown, event: unknown) => void
  const config = { enabled: true, charsPerToken: 4 }
  const ctx = {
    sessionProjections: { register, onChanged: (listener: typeof changed) => { changed = listener; return () => {} } },
    effect: (effect: () => () => unknown) => { cleanups.push(effect()) },
    inject: () => {},
    on: (name: string, listener: () => void) => {
      if (name === 'loader/volatile-update') rebuild = listener
      if (name === 'session/event') changed = listener
      return () => {}
    },
    logger: { error: vi.fn() },
  } as unknown as Context
  const ready = apply(ctx, config)
  return { register, complete, cleanups, ready, rebuild: () => rebuild(), changed: () => changed({}, { type: 'step/end' }), config, ctx }
}

function handle() {
  return { stateOf: vi.fn(), readerFor: vi.fn(), dispose: vi.fn(async () => {}) }
}

it('does not report plugin readiness until the initial typed handle is published', async () => {
  const test = fixture()
  const ready = vi.fn()
  void test.ready.then(ready)
  await vi.waitFor(() => expect(test.register).toHaveBeenCalledOnce())
  expect(ready).not.toHaveBeenCalled()
  test.complete(handle())
  await test.ready
  expect(ready).toHaveBeenCalledOnce()
  await test.cleanups[0]!()
})

it('releases a registration completing after unload without publishing its reader', async () => {
  const test = fixture()
  await vi.waitFor(() => expect(test.register).toHaveBeenCalledOnce())
  const cleanup = test.cleanups[0]!()
  const stale = handle()
  test.complete(stale)
  await cleanup
  test.changed()
  expect(stale.dispose).toHaveBeenCalledOnce()
  expect(stale.stateOf).not.toHaveBeenCalled()
  test.rebuild()
  await Promise.resolve()
  expect(test.register).toHaveBeenCalledOnce()
})

it('disposes an in-flight registration before a disabled rebuild can read it', async () => {
  const test = fixture()
  await vi.waitFor(() => expect(test.register).toHaveBeenCalledOnce())
  test.config.enabled = false
  test.rebuild()
  const stale = handle()
  test.complete(stale)
  await vi.waitFor(() => expect(stale.dispose).toHaveBeenCalledOnce())
  test.changed()
  expect(stale.stateOf).not.toHaveBeenCalled()
  expect(test.register).toHaveBeenCalledOnce()
  await test.cleanups[0]!()
  expect(stale.dispose).toHaveBeenCalledOnce()
})

it('awaits release before replacing the projection after a config update', async () => {
  const test = fixture()
  await vi.waitFor(() => expect(test.register).toHaveBeenCalledOnce())
  let release!: () => void
  const first = handle()
  first.dispose.mockImplementation(() => new Promise<void>(resolve => { release = resolve }))
  test.complete(first)
  await new Promise(resolve => setTimeout(resolve, 0))
  const next = handle()
  test.register.mockResolvedValue(next)
  test.config.charsPerToken = 2
  test.rebuild()
  await vi.waitFor(() => expect(first.dispose).toHaveBeenCalledOnce())
  expect(test.register).toHaveBeenCalledOnce()
  release()
  await vi.waitFor(() => expect(test.register).toHaveBeenCalledTimes(2))
  await test.cleanups[0]!()
  expect(next.dispose).toHaveBeenCalledOnce()
})
