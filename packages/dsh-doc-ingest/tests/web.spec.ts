import { createServer } from 'node:http'
import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { authorizePublicUrl, fetchPublicHtml } from '../src/host/web-fetch.ts'

afterEach(() => vi.unstubAllEnvs())

describe('public webpage transport', () => {
  it.each(['http://127.0.0.1/', 'http://169.254.169.254/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'file:///notes.txt'])('rejects a non-public destination %s', async input => {
    await expect(authorizePublicUrl(input)).rejects.toThrow()
  })

  it('rejects DNS responses mixing public and private addresses', async () => {
    const lookup = vi.fn(async () => [{ address: '1.1.1.1', family: 4 }, { address: '192.168.0.1', family: 4 }])
    await expect(authorizePublicUrl('https://example.com/', lookup)).rejects.toThrow(/public/i)
  })

  it('pins the approved address and refuses unsafe redirects before a second connection', async () => {
    const lookup = vi.fn(async () => [{ address: '1.1.1.1', family: 4 }])
    const request = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }))
    await expect(fetchPublicHtml('https://example.com/', { lookup, request })).rejects.toThrow(/public/i)
    expect(request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ address: '1.1.1.1' }), expect.any(AbortSignal))
  })

  it('rejects oversized HTML according to the same cap used for streamed bodies', async () => {
    const request = vi.fn(async () => new Response('test', { headers: { 'content-type': 'text/html', 'content-length': '8388609' } }))
    await expect(fetchPublicHtml('https://1.1.1.1/', { request })).rejects.toThrow(/size/i)
  })

  it('applies the response limit when no size header is known', async () => {
    const request = vi.fn(async () => new Response(new Uint8Array(8388609), { headers: { 'content-type': 'text/html' } }))
    await expect(fetchPublicHtml('https://1.1.1.1/', { request })).rejects.toThrow(/size/i)
  })

  it('passes only the validated numeric destination to a fixed proxy', async () => {
    let destination: string | undefined
    const proxy = createServer()
    proxy.on('connect', (request, socket) => {
      destination = request.url
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
    })
    proxy.listen(0, '127.0.0.1')
    await once(proxy, 'listening')
    try {
      const address = proxy.address()
      if (!address || typeof address === 'string') throw new Error('Test proxy did not start.')
      vi.stubEnv('HTTPS_PROXY', `http://127.0.0.1:${address.port}`)
      vi.stubEnv('NO_PROXY', '')
      vi.stubEnv('no_proxy', '')
      vi.stubEnv('DSH_DESKTOP_DOC_PROXY_UNAVAILABLE', '0')
      const lookup = vi.fn(async () => [{ address: '1.1.1.1', family: 4 }])
      await expect(fetchPublicHtml('https://example.com/', { lookup })).rejects.toThrow(/proxy rejected/i)
      expect(destination).toBe('1.1.1.1:443')
    } finally {
      await new Promise<void>((resolve, reject) => proxy.close(error => error ? reject(error) : resolve()))
    }
  })

  it('stops before DNS when the configured Desktop proxy cannot enforce a pinned connection', async () => {
    vi.stubEnv('DSH_DESKTOP_DOC_PROXY_UNAVAILABLE', '1')
    const lookup = vi.fn(async () => [{ address: '1.1.1.1', family: 4 }])
    await expect(fetchPublicHtml('https://example.com/', { lookup })).rejects.toThrow(/configured Desktop proxy mode/i)
    expect(lookup).not.toHaveBeenCalled()
  })
})
