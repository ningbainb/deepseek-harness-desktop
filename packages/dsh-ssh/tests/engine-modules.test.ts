/**
 * Unit tests for the extracted engine modules (connection-pool, pty, sftp,
 * tunnel, cluster), exercised through mock/stand-in engine objects so no
 * real SSH server is needed here. The full end-to-end behaviour stays
 * covered by tests/engine.test.ts against the embedded ssh2 server.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Client } from 'ssh2'
import { acquire, appendOutput, disposeRecord, sweepPool, withClient, DEFAULTS, type PoolEngine, type PoolRecord } from '../src/engine/connection-pool.ts'
import { openShell } from '../src/engine/pty.ts'
import { walkLocalDir, upload } from '../src/engine/sftp.ts'
import { listTunnels, stopAllTunnels, stopTunnel, type TunnelEngine, type TunnelRecord } from '../src/engine/tunnel.ts'
import { cluster } from '../src/engine/cluster.ts'
import type { HostStore } from '../src/store.ts'

function fakeClient(): { client: Client; end: ReturnType<typeof vi.fn> } {
  const end = vi.fn()
  const client = { end } as unknown as Client
  return { client, end }
}

function fakeRecord(client: Client, overrides: Partial<PoolRecord> = {}): PoolRecord {
  return { client, hops: [], idleAt: 0, pinned: false, broken: false, inFlight: 0, ...overrides }
}

/** A bare PoolEngine whose store.list() is controlled by the caller. */
function fakeEngine(entries: unknown[] = []): PoolEngine {
  return {
    store: { list: () => entries, find: () => undefined } as unknown as HostStore,
    opts: { ...DEFAULTS },
    pool: new Map<string, PoolRecord>(),
    acquireQueue: new Map<string, Promise<PoolRecord>>(),
  }
}

/** PoolEngine widened to the tunnel registry surface. */
function fakeTunnelEngine(entries: unknown[] = []): TunnelEngine {
  return {
    ...fakeEngine(entries),
    tunnels: new Map<string, TunnelRecord>(),
    nextTunnelId: 1,
  }
}

describe('connection-pool', () => {
  it('appendOutput caps bytes and never splits a surrogate pair', () => {
    const target = { text: '', truncated: false }
    appendOutput(target, Buffer.from('hello'), 3)
    expect(target.text).toBe('hel…[output truncated]')
    expect(target.truncated).toBe(true)
    // Already truncated: a later chunk is ignored.
    appendOutput(target, Buffer.from('world'), 3)
    expect(target.text).toBe('hel…[output truncated]')
  })

  it('sweepPool disposes only idle, unpinned, unused records', () => {
    const engine = fakeEngine()
    const busy = fakeClient().client
    const pinned = fakeClient().client
    const stale = fakeClient().client
    engine.pool.set('busy', fakeRecord(busy, { idleAt: 0, inFlight: 1 }))
    engine.pool.set('pinned', fakeRecord(pinned, { idleAt: 0, pinned: true }))
    engine.pool.set('stale', fakeRecord(stale, { idleAt: 0 }))
    sweepPool(engine)
    expect(engine.pool.has('busy')).toBe(true)
    expect(engine.pool.has('pinned')).toBe(true)
    expect(engine.pool.has('stale')).toBe(false)
  })

  it('disposeRecord ends the target and every hop client', () => {
    const engine = fakeEngine()
    const target = fakeClient()
    const hop = fakeClient()
    engine.pool.set('a', fakeRecord(target.client, { hops: [hop.client] }))
    disposeRecord(engine, 'a')
    expect(target.end).toHaveBeenCalledTimes(1)
    expect(hop.end).toHaveBeenCalledTimes(1)
    expect(engine.pool.has('a')).toBe(false)
    // A stale record that is no longer the current one must not touch it.
    const fresh = fakeClient()
    engine.pool.set('b', fakeRecord(fresh.client))
    const ghost = fakeRecord(fresh.client)
    disposeRecord(engine, 'b', ghost)
    expect(fresh.end).not.toHaveBeenCalled()
  })

  it('acquire reuses the healthy pooled record instead of replacing it', async () => {
    const engine = fakeEngine()
    const target = fakeClient()
    const record = fakeRecord(target.client)
    engine.pool.set('a', record)
    // The fake store cannot resolve 'a' at all, so a fresh connectChain would
    // throw; resolving with the existing record proves the reuse path.
    await expect(acquire(engine, 'a')).resolves.toBe(record)
  })

  it('withClient surfaces an application error without retrying', async () => {
    const engine = fakeEngine()
    const target = fakeClient()
    engine.pool.set('a', fakeRecord(target.client))
    let calls = 0
    await expect(withClient(engine, 'a', async () => {
      calls += 1
      throw new Error('bad command')
    })).rejects.toThrow('bad command')
    expect(calls).toBe(1)
    expect(engine.pool.has('a')).toBe(true)
  })

  it('withClient tears down a record that broke mid-flight and retries once', async () => {
    const engine = fakeEngine()
    const dead = fakeClient()
    const deadRecord = fakeRecord(dead.client)
    engine.pool.set('a', deadRecord)
    let calls = 0
    // The client error listener marks the record broken before the operation
    // rejects; the reconnect attempt then fails because the fake store has no
    // such alias.
    await expect(withClient(engine, 'a', async () => {
      calls += 1
      deadRecord.broken = true
      throw new Error('connection reset')
    })).rejects.toThrow(/not found/)
    expect(calls).toBe(1)
    expect(dead.end).toHaveBeenCalledTimes(1)
    expect(engine.pool.has('a')).toBe(false)
  })
})

describe('pty', () => {
  it('openShell rejects an unknown alias before any connection', async () => {
    const engine = fakeEngine()
    await expect(openShell(engine, 'nope', { cols: 80, rows: 24 })).rejects.toThrow(/not found/)
  })
})

describe('sftp', () => {
  it('walkLocalDir collects every file recursively', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-ssh-sftp-walk-'))
    try {
      mkdirSync(join(dir, 'a', 'b'), { recursive: true })
      writeFileSync(join(dir, 'root.txt'), 'x', 'utf8')
      writeFileSync(join(dir, 'a', 'one.txt'), 'x', 'utf8')
      writeFileSync(join(dir, 'a', 'b', 'two.txt'), 'x', 'utf8')
      const files = walkLocalDir(dir).sort()
      expect(files).toEqual(['a/b/two.txt', 'a/one.txt', 'root.txt'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('upload rejects a relative remote path before touching the pool', async () => {
    const engine = fakeEngine()
    await expect(upload(engine, 'host', '/tmp/x', 'relative/file.txt', false)).rejects.toThrow(/absolute/)
    expect(engine.pool.size).toBe(0)
    expect(engine.acquireQueue.size).toBe(0)
  })
})

describe('tunnel', () => {
  it('stopAllTunnels stops only the matching alias and clears the registry', () => {
    const engine = fakeTunnelEngine()
    const makeRecord = (id: string, alias: string): TunnelRecord => {
      const target = fakeClient()
      engine.pool.set(alias, fakeRecord(target.client, { pinned: true }))
      return {
        info: { id, alias, localPort: 40000, remoteHost: 'db', remotePort: 5432, state: 'forwarding', startedAt: 1 },
        server: { close: vi.fn() } as unknown as TunnelRecord['server'],
        alias,
        record: engine.pool.get(alias) as PoolRecord,
        sockets: new Set(),
      }
    }
    engine.tunnels.set('tun-1', makeRecord('tun-1', 'api'))
    engine.tunnels.set('tun-2', makeRecord('tun-2', 'db'))
    expect(listTunnels(engine)).toHaveLength(2)
    expect(stopAllTunnels(engine, 'api')).toBe(1)
    expect(engine.tunnels.has('tun-1')).toBe(false)
    expect(engine.tunnels.has('tun-2')).toBe(true)
    expect(stopAllTunnels(engine, 'db')).toBe(1)
    expect(listTunnels(engine)).toHaveLength(0)
  })

  it('stopTunnel keeps a shared connection alive while another tunnel still pins it', () => {
    const engine = fakeTunnelEngine()
    const target = fakeClient()
    const record = fakeRecord(target.client, { pinned: true })
    engine.pool.set('api', record)
    const makeTunnel = (id: string): TunnelRecord => ({
      info: { id, alias: 'api', localPort: 40000, remoteHost: 'db', remotePort: 5432, state: 'forwarding', startedAt: 1 },
      server: { close: vi.fn() } as unknown as TunnelRecord['server'],
      alias: 'api',
      record,
      sockets: new Set(),
    })
    engine.tunnels.set('tun-1', makeTunnel('tun-1'))
    engine.tunnels.set('tun-2', makeTunnel('tun-2'))
    // Stopping tun-1 must not end the connection tun-2 still depends on.
    expect(stopTunnel(engine, 'tun-1')).toBe(true)
    expect(engine.pool.has('api')).toBe(true)
    expect(record.pinned).toBe(true)
    expect(target.end).not.toHaveBeenCalled()
    // Stopping the last tunnel releases the pinned connection.
    expect(stopTunnel(engine, 'tun-2')).toBe(true)
    expect(engine.pool.has('api')).toBe(false)
    expect(target.end).toHaveBeenCalledTimes(1)
  })

  it('stopTunnel ends only its own orphaned connection, never the replacement', () => {
    const engine = fakeTunnelEngine()
    const orphan = fakeClient()
    const replacement = fakeClient()
    const tunnel: TunnelRecord = {
      info: { id: 'tun-1', alias: 'api', localPort: 40000, remoteHost: 'db', remotePort: 5432, state: 'forwarding', startedAt: 1 },
      server: { close: vi.fn() } as unknown as TunnelRecord['server'],
      alias: 'api',
      record: fakeRecord(orphan.client, { pinned: true, broken: true }),
      sockets: new Set(),
    }
    engine.tunnels.set('tun-1', tunnel)
    // A reconnect after the tunnel's connection broke replaced the record.
    engine.pool.set('api', fakeRecord(replacement.client))
    expect(stopAllTunnels(engine, 'api')).toBe(1)
    expect(orphan.end).toHaveBeenCalledTimes(1)
    expect(replacement.end).not.toHaveBeenCalled()
    expect(engine.pool.has('api')).toBe(true)
  })
})

describe('cluster', () => {
  it('returns an empty list when no host matches', async () => {
    const engine = fakeEngine([{ alias: 'a', environment: 'prod', tags: ['web'] }])
    const results = await cluster(engine, { command: 'true', aliases: ['missing'] })
    expect(results).toEqual([])
  })
})