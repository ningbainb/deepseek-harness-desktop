import type { ServerResponse } from 'node:http'
import { expect, it, vi } from 'vitest'
import { sendJson } from '../src/json-response.ts'

it('preserves JSON headers and the response state after an encoding error', () => {
  const response = { writeHead: vi.fn(), end: vi.fn() }
  const res = response as unknown as ServerResponse
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

  sendJson(res, 403, { ok: false })
  expect(response.writeHead).toHaveBeenCalledWith(403, headers)
  expect(response.end).toHaveBeenCalledWith('{"ok":false}')
  response.writeHead.mockClear()
  response.end.mockClear()

  const failure = new TypeError('unencodable response')
  const body = { toJSON() { throw failure } }
  expect(() => sendJson(res, 200, body)).toThrow(failure)
  expect(response.writeHead).toHaveBeenCalledWith(200, headers)
  expect(response.end).not.toHaveBeenCalled()
})
