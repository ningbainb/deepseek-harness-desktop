/**
 * Route-layer tests: the loopback fence, hosts CRUD dispatch (single handler
 * per path), upload NDJSON framing, download headers, and the terminal
 * upgrade bridge speaking real RFC 6455 WebSocket frames.
 */

import { createServer, request as httpRequest, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocket } from 'ws'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeRoutes } from '../src/routes.ts'
import { HostStore } from '../src/store.ts'
import { SSH_API, type SshHostSummary } from '../src/protocol.ts'
import type { SshEngine, ShellSession } from '../src/engine.ts'

/** In-memory engine stub for route-level tests. */
class StubEngine {
  hosts: SshHostSummary[] = []
  uploadBytes = 0
  uploadError: Error | undefined
  openShellSession: ShellSession | undefined
  shellInputs: string[] = []
  shellResizes: Array<{ cols: number; rows: number }> = []
  shellCloses = 0

  list(): SshHostSummary[] {
    return this.hosts
  }
  find(): SshHostSummary | undefined {
    return undefined
  }
  async exec(): Promise<{ success: boolean; exitCode: number | null; timedOut: boolean; stdout: string; stderr: string; durationMs: number }> {
    return { success: true, exitCode: 0, timedOut: false, stdout: '', stderr: '', durationMs: 1 }
  }
  async cluster(): Promise<unknown[]> {
    return []
  }
  async upload(): Promise<{ bytes: number; files: number }> {
    if (this.uploadError !== undefined) throw this.uploadError
    return { bytes: this.uploadBytes, files: 1 }
  }
  async download(_alias: string, _remotePath: string, localPath: string): Promise<{ bytes: number }> {
    // Materialize the staged file the download route streams out.
    writeFileSync(localPath, 'hello', 'utf8')
    return { bytes: 5 }
  }
  async ls(): Promise<unknown[]> {
    return []
  }
  listTunnels(): unknown[] {
    return []
  }
  async startTunnel(): Promise<unknown> {
    throw new Error('n/a')
  }
  stopTunnel(): boolean {
    return false
  }
  stopAllTunnels(): number {
    return 0
  }
  async openShell(_alias: string): Promise<ShellSession> {
    const session: ShellSession = {
      send: (data) => { this.shellInputs.push(data) },
      resize: (cols, rows) => { this.shellResizes.push({ cols, rows }) },
      close: () => { this.shellCloses += 1 },
      pause: () => undefined,
      resume: () => undefined,
    }
    this.openShellSession = session
    return session
  }
  async test(): Promise<{ ok: boolean }> {
    return { ok: true }
  }
}

const engine = (stub: StubEngine): SshEngine => stub as unknown as SshEngine

let server: Server
let port: number
let store: HostStore
let stub: StubEngine
const dir = mkdtempSync(join(tmpdir(), 'dsh-ssh-routes-'))

function get(path: string, headers: Record<string, string> = {}): Promise<{ status: number; text: string; headers: Record<string, string | string[] | undefined> }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, headers }, (res) => {
      let text = ''
      res.on('data', (chunk: Buffer) => { text += chunk.toString('utf8') })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text, headers: res.headers }))
    })
    req.on('error', reject)
    req.end()
  })
}

beforeAll(async () => {
  store = new HostStore(join(dir, 'hosts.json'))
  stub = new StubEngine()
  const vendorDir = join(dir, 'vendor')
  mkdirSync(vendorDir, { recursive: true })
  writeFileSync(join(vendorDir, 'xterm.js'), 'globalThis.Terminal = class Terminal {}', 'utf8')
  writeFileSync(join(vendorDir, 'addon-fit.js'), 'globalThis.FitAddon = { FitAddon: class FitAddon {} }', 'utf8')
  const { routes, upgrade } = makeRoutes({
    store,
    engine: engine(stub),
    stagingDir: join(dir, 'staging'),
    maxUploadBytes: 16,
    vendorFiles: {
      xterm: join(vendorDir, 'xterm.js'),
      fitAddon: join(vendorDir, 'addon-fit.js'),
    },
  })
  server = createServer((req, res) => {
    const rawPath = new URL(req.url ?? '/', 'http://x').pathname
    const route = routes.find(r => r.kind === 'exact' && r.path === rawPath)
    if (route === undefined) {
      res.writeHead(404)
      res.end()
      return
    }
    void route.handler(req, res)
  })
  server.on('upgrade', (req, socket, head) => {
    const rawPath = new URL(req.url ?? '/', 'http://x').pathname
    if (rawPath === SSH_API.terminal) {
      upgrade.handler(req, socket, head)
    } else {
      socket.destroy()
    }
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  await new Promise<void>((resolve) => { server.close(() => resolve()) })
  rmSync(dir, { recursive: true, force: true })
})

describe('loopback fence', () => {
  it('serves immutable same-origin xterm assets with validators', async () => {
    const first = await get(SSH_API.xtermScript)
    expect(first.status).toBe(200)
    expect(first.text).toContain('class Terminal')
    expect(first.headers['content-type']).toBe('text/javascript; charset=utf-8')
    expect(first.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(first.headers['x-content-type-options']).toBe('nosniff')
    expect(first.headers.etag).toMatch(/^"[a-f0-9]{64}"$/)

    const cached = await get(SSH_API.xtermScript, { 'if-none-match': String(first.headers.etag) })
    expect(cached.status).toBe(304)
    expect(cached.text).toBe('')

    const fit = await get(SSH_API.fitAddonScript)
    expect(fit.status).toBe(200)
    expect(fit.text).toContain('class FitAddon')
  })

  it('rejects cross-site requests with 403', async () => {
    const result = await get(SSH_API.hosts, { 'sec-fetch-site': 'cross-site' })
    expect(result.status).toBe(403)
  })

  it('rejects non-loopback Host headers with 403', async () => {
    const result = await get(SSH_API.hosts, { host: 'evil.example.com' })
    expect(result.status).toBe(403)
  })

  it('rejects wrong methods with 405', async () => {
    const result = await new Promise<{ status: number }>((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, path: SSH_API.download + '?alias=a&remotePath=/x', method: 'POST' }, (res) => {
        res.resume()
        res.on('end', () => resolve({ status: res.statusCode ?? 0 }))
      })
      req.on('error', reject)
      req.end()
    })
    expect(result.status).toBe(405)
  })
})

describe('hosts CRUD (one handler per path)', () => {
  it('creates, lists, patches, and deletes through the shared route', async () => {
    const create = await fetch('http://127.0.0.1:' + port + SSH_API.hosts, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        alias: 'web-01',
        host: '10.0.0.1',
        user: 'root',
        auth: { kind: 'password', password: 'pw' },
      }),
    })
    expect(create.status).toBe(201)
    expect(store.list()).toHaveLength(1)
    expect(store.find('web-01')?.auth.password).toBe('pw')

    // The GET surface lists through the engine; the summary never carries secrets.
    stub.hosts = [store.summarize(store.find('web-01')!)]
    const list = await fetch('http://127.0.0.1:' + port + SSH_API.hosts)
    expect(list.status).toBe(200)
    const body = await list.json() as { hosts: SshHostSummary[] }
    expect(body.hosts).toHaveLength(1)
    expect(body.hosts[0]?.alias).toBe('web-01')
    expect('password' in body.hosts[0]!).toBe(false)

    const patch = await fetch('http://127.0.0.1:' + port + SSH_API.hosts + '?alias=web-01', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'renewed' }),
    })
    expect(patch.status).toBe(200)
    expect(store.find('web-01')?.description).toBe('renewed')
    expect(store.find('web-01')?.auth.password).toBe('pw')

    const del = await fetch('http://127.0.0.1:' + port + SSH_API.hosts + '?alias=web-01', { method: 'DELETE' })
    expect(del.status).toBe(200)
    expect(store.list()).toHaveLength(0)
  })

  it('rejects unknown methods on the hosts path with 405', async () => {
    const result = await get(SSH_API.hosts, {})
    // GET via httpRequest has no body; use OPTIONS to hit the fallback.
    const options = await new Promise<{ status: number }>((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, path: SSH_API.hosts, method: 'OPTIONS' }, (res) => {
        res.resume()
        res.on('end', () => resolve({ status: res.statusCode ?? 0 }))
      })
      req.on('error', reject)
      req.end()
    })
    expect(options.status).toBe(405)
  })
})

describe('upload', () => {
  it('streams progress and result frames as NDJSON', async () => {
    stub.uploadBytes = 7
    const res = await fetch('http://127.0.0.1:' + port + SSH_API.upload + '?alias=web-01&remotePath=/tmp/x.txt', {
      method: 'POST',
      body: 'payload',
    })
    expect(res.status).toBe(200)
    const text = await res.text()
    const lines = text.split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>)
    expect(lines.some(line => line.type === 'progress')).toBe(true)
    const result = lines.find(line => line.type === 'result')
    expect(result?.ok).toBe(true)
  })

  it('reports engine failures through the result frame', async () => {
    stub.uploadError = new Error('remote rejected')
    const res = await fetch('http://127.0.0.1:' + port + SSH_API.upload + '?alias=web-01&remotePath=/tmp/x.txt', {
      method: 'POST',
      body: 'payload',
    })
    const text = await res.text()
    const lines = text.split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>)
    const result = lines.find(line => line.type === 'result')
    expect(result?.ok).toBe(false)
    expect(String(result?.error)).toContain('remote rejected')
  })

  it('enforces the byte cap on a chunked upload without content-length', async () => {
    stub.uploadError = undefined
    const text = await new Promise<string>((resolve, reject) => {
      const req = httpRequest({
        host: '127.0.0.1',
        port,
        path: SSH_API.upload + '?alias=web-01&remotePath=/tmp/x.txt',
        method: 'POST',
        headers: { 'transfer-encoding': 'chunked' },
      }, (res) => {
        let body = ''
        res.on('data', (chunk: Buffer) => { body += chunk.toString('utf8') })
        res.on('end', () => resolve(body))
      })
      req.on('error', reject)
      req.write('x'.repeat(40))
      req.end()
    })
    const lines = text.split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>)
    const result = lines.find(line => line.type === 'result')
    expect(result?.ok).toBe(false)
    expect(String(result?.error)).toContain('too large')
  })
})

describe('download', () => {
  it('serves the file with content-disposition', async () => {
    const res = await fetch('http://127.0.0.1:' + port + SSH_API.download + '?alias=web-01&remotePath=/tmp/app.tar.gz')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain('app.tar.gz')
    expect(res.headers.get('content-length')).toBe('5')
  })
})

describe('terminal upgrade', () => {
  it('round-trips JSON frames over a real WebSocket (ready/output/input/exit)', async () => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + SSH_API.terminal + '?alias=web-01&cols=80&rows=24')
    const messages: string[] = []
    ws.on('message', (data) => { messages.push(String(data)) })
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve())
      ws.on('error', (error) => reject(error))
    })
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (messages.some(m => (JSON.parse(m) as { type: string }).type === 'ready')) {
          clearInterval(timer)
          resolve()
        }
      }, 10)
    })
    const ready = JSON.parse(messages.find(m => (JSON.parse(m) as { type: string }).type === 'ready')!) as { type: string; alias: string }
    expect(ready.alias).toBe('web-01')

    // Client -> server input must reach the shell session.
    ws.send(JSON.stringify({ type: 'input', data: 'ls\r' }))
    ws.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }))
    await new Promise<void>((resolve) => setTimeout(resolve, 50))
    expect(stub.shellInputs).toContain('ls\r')
    expect(stub.shellResizes).toContainEqual({ cols: 120, rows: 40 })

    // Server -> client output must arrive as decodable frames.
    stub.openShellSession?.onData?.(Buffer.from('hello from remote'))
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (messages.some(m => {
          const parsed = JSON.parse(m) as { type: string; data?: string }
          return parsed.type === 'output' && parsed.data === 'hello from remote'
        })) {
          clearInterval(timer)
          resolve()
        }
      }, 10)
    })

    // Remote exit closes the socket cleanly.
    stub.openShellSession?.onExit?.(0)
    const code = await new Promise<number>((resolve) => {
      ws.on('close', (closeCode) => resolve(closeCode))
      setTimeout(() => resolve(-1), 2000)
    })
    expect(code).toBe(1000)
    ws.terminate()
  })

  it('rejects malformed terminal frames before they reach the shell', async () => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + SSH_API.terminal + '?alias=web-01')
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve())
      ws.on('error', reject)
    })
    const inputsBefore = stub.shellInputs.length
    const closed = new Promise<number>((resolve) => { ws.on('close', resolve) })
    ws.send(JSON.stringify({ type: 'resize', cols: 1, rows: 24 }))
    expect(await closed).toBe(1008)
    expect(stub.shellInputs).toHaveLength(inputsBefore)
  })

  it('closes oversized terminal frames without buffering unbounded input', async () => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + SSH_API.terminal + '?alias=web-01')
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve())
      ws.on('error', reject)
    })
    const inputsBefore = stub.shellInputs.length
    const closed = new Promise<number>((resolve) => { ws.on('close', resolve) })
    ws.send(JSON.stringify({ type: 'input', data: 'x'.repeat(64 * 1024) }))
    expect(await closed).toBe(1009)
    expect(stub.shellInputs).toHaveLength(inputsBefore)
  })
})
