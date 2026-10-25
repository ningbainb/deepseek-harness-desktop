import { afterEach, expect, test, vi } from 'vitest'
import { createBundleWatcher } from '../src/core/scanner.ts'

const baseline = (path: string, size = 1) => ({ path, mtimeMs: 1, ctimeMs: 1, size })
const settle = async () => { for (let turn = 0; turn < 30; turn++) await Promise.resolve() }
const disposers: (() => void)[] = []
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); vi.useRealTimers() })

function fixture(overrides: Record<string, unknown> = {}) {
  const rows = new Map([['first', baseline('/first')]])
  const publish = vi.fn((id: string) => rows.get(id))
  const stat = vi.fn(async (path: string) => baseline(path))
  const schedule = vi.fn((callback: () => void, milliseconds: number) => {
    const timer = setTimeout(callback, milliseconds)
    return () => clearTimeout(timer)
  })
  const yieldControl = vi.fn(async () => {})
  const report = vi.fn()
  const watcher = createBundleWatcher({ snapshot: () => rows, stat, publish, schedule, yieldControl,
    report, pollIntervalMs: 20, ...overrides } as Parameters<typeof createBundleWatcher>[0])
  disposers.push(() => watcher.dispose())
  return { watcher, rows, publish, stat, schedule, yieldControl, report }
}

test('starts only four asynchronous stats and does not schedule an overlapping batch', async () => {
  vi.useFakeTimers()
  const pending: (() => void)[] = []
  const rows = new Map(Array.from({ length: 9 }, (_, index) => [`row-${index}`, baseline(`/row-${index}`)]))
  const stat = vi.fn((path: string) => new Promise(resolve => pending.push(() => resolve(baseline(path)))))
  const result = fixture({ snapshot: () => rows, stat })
  await settle()
  expect(stat).toHaveBeenCalledTimes(4)
  await vi.advanceTimersByTimeAsync(200)
  expect(stat).toHaveBeenCalledTimes(4)
  expect(result.schedule).not.toHaveBeenCalled()
  pending.shift()!()
  await settle()
  expect(stat).toHaveBeenCalledTimes(5)
  result.watcher.dispose()
  for (const release of pending) release()
  await settle()
  expect(stat).toHaveBeenCalledTimes(5)
  expect(result.publish).not.toHaveBeenCalled()
})

test('compares against the registry baseline so the first scan catches an activation race', async () => {
  const result = fixture({ stat: async (path: string) => baseline(path, 2) })
  await settle()
  expect(result.publish).toHaveBeenCalledWith('first')
  expect(result.yieldControl).toHaveBeenCalledTimes(1)
})

test.each(['mtimeMs', 'ctimeMs', 'size'] as const)('detects a changed %s independently', async field => {
  const result = fixture({ stat: async (path: string) => ({ ...baseline(path), [field]: 2 }) })
  await settle()
  expect(result.publish).toHaveBeenCalledTimes(1)
})

test('unchanged files are not published and the next batch starts after the completed batch delay', async () => {
  vi.useFakeTimers()
  const result = fixture()
  await settle()
  expect(result.publish).not.toHaveBeenCalled()
  expect(result.schedule).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(19)
  expect(result.stat).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(result.stat).toHaveBeenCalledTimes(2)
})

test('ENOENT marks a file dirty and recovery publishes even when its metadata matches', async () => {
  vi.useFakeTimers()
  let missing = true
  const result = fixture({ stat: async (path: string) => {
    if (missing) throw Object.assign(new Error('private path'), { code: 'ENOENT' })
    return baseline(path)
  } })
  await settle()
  expect(result.report).not.toHaveBeenCalled()
  missing = false
  await vi.advanceTimersByTimeAsync(20)
  expect(result.publish).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(20)
  expect(result.publish).toHaveBeenCalledTimes(1)
})

test.each(['remove', 'replace-path', 'replace-baseline', 'remove-readd'])('ignores late stats after graph %s', async action => {
  const pending = Promise.withResolvers<ReturnType<typeof baseline>>()
  const result = fixture({ stat: () => pending.promise })
  await settle()
  if (action === 'remove' || action === 'remove-readd') result.rows.delete('first')
  else result.rows.set('first', baseline(action === 'replace-path' ? '/replacement' : '/first', 3))
  result.watcher.refresh()
  if (action === 'remove-readd') { result.rows.set('first', baseline('/first')); result.watcher.refresh() }
  pending.resolve(baseline('/first', 2))
  await settle()
  expect(result.publish).not.toHaveBeenCalled()
})

test('dispose returns without pending IO and prevents a late successful stat from publishing or scheduling', async () => {
  const pending = Promise.withResolvers<ReturnType<typeof baseline>>()
  const result = fixture({ stat: () => pending.promise })
  expect(result.watcher.dispose()).toBeUndefined()
  pending.resolve(baseline('/first', 2))
  await settle()
  expect(result.publish).not.toHaveBeenCalled()
  expect(result.schedule).not.toHaveBeenCalled()
})

test('checks disposal again after yielding and before the synchronous rebuilt call', async () => {
  const yielded = Promise.withResolvers<void>()
  const result = fixture({ stat: async () => baseline('/first', 2), yieldControl: () => yielded.promise })
  await settle()
  result.watcher.dispose()
  yielded.resolve()
  await settle()
  expect(result.publish).not.toHaveBeenCalled()
})

test('a graph generation invalidates late stats even when the new baseline has identical metadata', async () => {
  const pending = Promise.withResolvers<ReturnType<typeof baseline>>()
  const result = fixture({ stat: () => pending.promise })
  await settle()
  result.watcher.refresh()
  pending.resolve(baseline('/first', 2))
  await settle()
  expect(result.publish).not.toHaveBeenCalled()
})

test('a synchronous graph refresh during publication retains the registry generation for the next batch', async () => {
  vi.useFakeTimers()
  const rows = new Map([['first', baseline('/first')]])
  let refresh = () => {}
  const publish = vi.fn(() => { rows.set('first', baseline('/first', 3)); refresh(); return rows.get('first') })
  const result = fixture({ snapshot: () => rows, stat: async () => baseline('/first', 3), publish })
  refresh = () => result.watcher.refresh()
  await settle()
  expect(publish).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(20)
  expect(publish).toHaveBeenCalledTimes(1)
})

test('synchronous publication refreshes rescan remaining changed bundles without a poll interval per bundle', async () => {
  vi.useFakeTimers()
  const rows = new Map(Array.from({ length: 4 }, (_, index) => [`row-${index}`, baseline(`/row-${index}`)]))
  let refresh = () => {}
  const stat = vi.fn(async (path: string) => baseline(path, 2))
  const publish = vi.fn((id: string) => {
    rows.set(id, baseline(`/${id}`, 2))
    refresh()
    return rows.get(id)
  })
  const result = fixture({ snapshot: () => rows, stat, publish })
  refresh = () => result.watcher.refresh()
  await settle()
  expect(publish.mock.calls).toEqual([['row-0']])
  expect(result.schedule).toHaveBeenLastCalledWith(expect.any(Function), 0)
  await vi.advanceTimersByTimeAsync(3)
  expect(publish.mock.calls).toEqual([['row-0'], ['row-1'], ['row-2'], ['row-3']])
  expect(stat).toHaveBeenCalledTimes(16)
  expect(result.schedule.mock.calls.map(call => call[1])).toEqual([0, 0, 0, 20])
  await vi.advanceTimersByTimeAsync(20)
  expect(publish).toHaveBeenCalledTimes(4)
})

test.each(['refresh', 'dispose'] as const)('an accelerated scan keeps four workers without overlap and invalidates on %s', async action => {
  vi.useFakeTimers()
  const rows = new Map(Array.from({ length: 9 }, (_, index) => [`row-${index}`, baseline(`/row-${index}`)]))
  const pending: (() => void)[] = []
  let refresh = () => {}
  const stat = vi.fn((path: string) => stat.mock.calls.length <= rows.size
    ? Promise.resolve(baseline(path, 2))
    : new Promise(resolve => pending.push(() => resolve(baseline(path, 2)))))
  const publish = vi.fn((id: string) => {
    rows.set(id, baseline(`/${id}`, 2))
    refresh()
    return rows.get(id)
  })
  const result = fixture({ snapshot: () => rows, stat, publish })
  refresh = () => result.watcher.refresh()
  await settle()
  expect(stat).toHaveBeenCalledTimes(9)
  expect(result.schedule).toHaveBeenLastCalledWith(expect.any(Function), 0)
  await vi.advanceTimersByTimeAsync(0)
  expect(stat).toHaveBeenCalledTimes(13)
  await vi.advanceTimersByTimeAsync(200)
  expect(stat).toHaveBeenCalledTimes(13)
  expect(result.schedule).toHaveBeenCalledTimes(1)
  if (action === 'refresh') result.watcher.refresh()
  else result.watcher.dispose()
  for (const release of pending) release()
  await settle()
  expect(stat).toHaveBeenCalledTimes(13)
  expect(publish).toHaveBeenCalledTimes(1)
  expect(result.schedule).toHaveBeenCalledTimes(action === 'refresh' ? 2 : 1)
  if (action === 'refresh') expect(result.schedule).toHaveBeenLastCalledWith(expect.any(Function), 20)
})

test.each(['throw', 'unchanged', 'uncommitted'] as const)('a publication refresh with %s progress waits for the regular poll', async outcome => {
  vi.useFakeTimers()
  const rows = new Map([['first', baseline('/first')], ['second', baseline('/second')]])
  let refresh = () => {}
  const publish = vi.fn((id: string) => {
    refresh()
    if (outcome === 'throw') throw new Error('fixture rebuild failed')
    if (outcome === 'uncommitted') return baseline(`/${id}`, 2)
    return rows.get(id)
  })
  const result = fixture({ snapshot: () => rows, stat: async (path: string) => baseline(path, 2), publish })
  refresh = () => result.watcher.refresh()
  await settle()
  expect(publish).toHaveBeenCalledTimes(1)
  expect(result.schedule).toHaveBeenLastCalledWith(expect.any(Function), 20)
  await vi.advanceTimersByTimeAsync(19)
  expect(publish).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(publish).toHaveBeenCalledTimes(2)
  expect(result.schedule.mock.calls.every(call => call[1] === 20)).toBe(true)
  expect(result.report).not.toHaveBeenCalled()
})

test('an accelerated rescan returns to regular polling when the remaining publication fails', async () => {
  vi.useFakeTimers()
  const rows = new Map([['first', baseline('/first')], ['second', baseline('/second')]])
  let refresh = () => {}
  const publish = vi.fn((id: string) => {
    if (id === 'second') { refresh(); throw new Error('fixture rebuild failed') }
    rows.set(id, baseline(`/${id}`, 2))
    refresh()
    return rows.get(id)
  })
  const result = fixture({ snapshot: () => rows, stat: async (path: string) => baseline(path, 2), publish })
  refresh = () => result.watcher.refresh()
  await settle()
  await vi.advanceTimersByTimeAsync(3)
  expect(publish.mock.calls).toEqual([['first'], ['second']])
  expect(result.report).not.toHaveBeenCalled()
  expect(result.schedule.mock.calls.map(call => call[1])).toEqual([0, 20])
  await vi.advanceTimersByTimeAsync(20)
  expect(publish.mock.calls).toEqual([['first'], ['second'], ['second']])
  expect(result.report).not.toHaveBeenCalled()
  expect(result.schedule).toHaveBeenLastCalledWith(expect.any(Function), 20)
})

test('publication errors stay dirty and do not prevent other rows or future batches', async () => {
  vi.useFakeTimers()
  let fail = true
  const result = fixture({ stat: async () => baseline('/first', 2), publish: () => {
    if (fail) throw new Error('fixture rebuild failed')
    return baseline('/first', 2)
  } })
  await settle()
  expect(result.report).toHaveBeenCalledTimes(1)
  fail = false
  await vi.advanceTimersByTimeAsync(20)
  expect(result.schedule).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(20)
  expect(result.report).toHaveBeenCalledTimes(1)
})

test('serializes changed bundle publications with a yield between each one', async () => {
  const rows = new Map([['first', baseline('/first')], ['second', baseline('/second')]])
  const order: string[] = []
  fixture({ snapshot: () => rows, stat: async (path: string) => baseline(path, 2),
    yieldControl: async () => { order.push('yield') }, publish: (id: string) => {
      order.push(id)
      return baseline(`/${id}`, 2)
    } })
  await settle()
  expect(order).toEqual(['yield', 'first', 'yield', 'second'])
})
