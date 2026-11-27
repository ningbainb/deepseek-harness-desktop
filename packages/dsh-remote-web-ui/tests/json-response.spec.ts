import type { ServerResponse } from 'node:http'
import { expect, it, vi } from 'vitest'
import { writeJson } from '../src/json-response.ts'

it('preserves JSON headers and the response state after an encoding error', () => {
  const response = { writeHead: vi.fn(), end: vi.fn() }
  const res = response as unknown as ServerResponse
  const headers = { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' }

  writeJson(res, 403, { ok: false })
  expect(response.writeHead).toHaveBeenCalledWith(403, headers)
  expect(response.end).toHaveBeenCalledWith('{"ok":false}')
  response.writeHead.mockClear()
  response.end.mockClear()

  const failure = new TypeError('unencodable response')
  const body = { toJSON() { throw failure } }
  expect(() => writeJson(res, 200, body)).toThrow(failure)
  expect(response.writeHead).not.toHaveBeenCalled()
  expect(response.end).not.toHaveBeenCalled()
})
