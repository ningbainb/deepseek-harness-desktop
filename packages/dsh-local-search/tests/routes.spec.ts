import { expect, it, vi } from 'vitest'
import { searchRoutes } from '../src/host/routes.ts'

it('requires the local search header and owner before consulting the desktop scope', async () => {
  const desktopRequestScope = vi.fn()
  const [route] = searchRoutes({ desktopRequestScope } as never)
  for (const [header, principal, expected] of [
    [undefined, 'owner', 403],
    ['1', 'guest', 403],
    ['1', 'owner', 405],
  ] as const) {
    const request = {
      method: 'GET', socket: { remoteAddress: '127.0.0.1' },
      headers: { host: 'localhost:3000', 'x-dsh-local-search': header },
    }
    const response = { writeHead: vi.fn(), end: vi.fn() }
    await route.handler(request as never, response as never, { principal: { kind: principal } } as never)
    expect(response.writeHead.mock.calls[0]?.[0]).toBe(expected)
  }
  expect(desktopRequestScope).not.toHaveBeenCalled()
})
