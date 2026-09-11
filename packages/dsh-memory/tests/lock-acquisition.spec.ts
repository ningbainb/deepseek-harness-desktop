import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as atomicWrite from '@deepseek-ai/dsh-atomic-write'
import type { PrincipalId } from '@ningbainb/dsh-user-scope'
import { MemoryStore } from '../src/store.ts'

vi.mock('@deepseek-ai/dsh-atomic-write', async importOriginal => {
  const actual = await importOriginal<typeof atomicWrite>()
  return { ...actual, withFileLock: vi.fn(actual.withFileLock) }
})

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
const roots: string[] = []
const principal = 'lock-race-owner' as PrincipalId
const empty = () => ({ version: 1 as const, items: [] })
afterEach(async () => {
  Object.defineProperty(process, 'platform', originalPlatform)
  vi.restoreAllMocks()
  vi.mocked(atomicWrite.withFileLock).mockReset()
  const actual = await vi.importActual<typeof atomicWrite>('@deepseek-ai/dsh-atomic-write')
  vi.mocked(atomicWrite.withFileLock).mockImplementation(actual.withFileLock)
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'win32' })
  const root = await mkdtemp(join(tmpdir(), 'dsh-memory-lock-race-'))
  roots.push(root)
  const store = new MemoryStore({ rootDir: root, lockWaitMs: 500 })
  const path = store.filenameForPrincipal(principal) + '.lock'
  const error = Object.assign(new Error('lock acquisition failed'), { code: 'EPERM', syscall: 'open', path })
  return { store, error, lock: vi.mocked(atomicWrite.withFileLock) }
}

describe('memory lock acquisition boundary', () => {
  it.each(['load', 'save', 'update'] as const)('retries a Windows acquisition race for %s, using the official lock', async kind => {
    const { store, error, lock } = await fixture()
    lock.mockRejectedValueOnce(error)
    const result = kind === 'load' ? store.load(principal)
      : kind === 'save' ? store.save(principal, empty())
        : store.update(principal, empty)
    await expect(result).resolves.toEqual(empty())
    expect(lock).toHaveBeenCalledTimes(2)
    expect(lock.mock.calls[1]![2]!.waitMs).toBeLessThan(500)
    expect(lock.mock.calls[1]![2]!.waitMs).toBeGreaterThan(0)
  })

  it('bounds persistent permission failures and never invokes the update callback', async () => {
    const { store, error, lock } = await fixture()
    lock.mockRejectedValue(error)
    const operation = vi.fn(empty)
    await expect(store.update(principal, operation)).rejects.toBe(error)
    expect(lock).toHaveBeenCalledTimes(4)
    expect(operation).not.toHaveBeenCalled()
  })

  it.each(['operation', 'release'] as const)('never replays a transaction after a %s failure', async stage => {
    const { store, error, lock } = await fixture()
    const operation = vi.fn(() => { if (stage === 'operation') throw error; return empty() })
    lock.mockImplementationOnce(async (_filename, callback) => {
      await callback()
      throw error
    })
    await expect(store.update(principal, operation)).rejects.toBe(error)
    expect(operation).toHaveBeenCalledTimes(1)
    expect(lock).toHaveBeenCalledTimes(1)
  })

  it.each([
    { code: 'EACCES' }, { syscall: 'unlink' }, { path: 'unrelated.lock' },
  ])('does not retry unrelated I/O failures: %j', async details => {
    const { store, error, lock } = await fixture()
    Object.assign(error, details)
    lock.mockRejectedValue(error)
    await expect(store.load(principal)).rejects.toBe(error)
    expect(lock).toHaveBeenCalledTimes(1)
  })

  it('keeps non-Windows errors unchanged', async () => {
    const { store, error, lock } = await fixture()
    Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'linux' })
    lock.mockRejectedValue(error)
    await expect(store.load(principal)).rejects.toBe(error)
    expect(lock).toHaveBeenCalledTimes(1)
  })

  it('does not extend an exhausted caller deadline', async () => {
    const { store, error, lock } = await fixture()
    const now = vi.spyOn(performance, 'now')
    now.mockReturnValueOnce(0).mockReturnValue(501)
    lock.mockRejectedValue(error)
    await expect(store.load(principal)).rejects.toBe(error)
    expect(lock).toHaveBeenCalledTimes(1)
  })
})
