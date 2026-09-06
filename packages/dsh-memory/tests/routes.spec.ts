import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import { isTrustedMemoryRequest } from '../src/routes.ts'

function request(remoteAddress: string, headers: Record<string, string | undefined>): IncomingMessage {
  return { socket: { remoteAddress }, headers } as unknown as IncomingMessage
}

describe('memory route fence', () => {
  it('accepts only loopback same-origin requests', () => {
    expect(isTrustedMemoryRequest(request('127.0.0.1', { host: '127.0.0.1:1234' }))).toBe(true)
    expect(isTrustedMemoryRequest(request('::ffff:127.0.0.1', { host: 'localhost:1234' }))).toBe(true)
    expect(isTrustedMemoryRequest(request('192.168.1.8', { host: '127.0.0.1:1234' }))).toBe(false)
    expect(isTrustedMemoryRequest(request('127.0.0.1', { host: '127.0.0.1:1234', 'sec-fetch-site': 'cross-site' }))).toBe(false)
  })
})

