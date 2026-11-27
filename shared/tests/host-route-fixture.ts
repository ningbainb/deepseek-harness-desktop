type RouteHandler = (request: unknown, response: unknown) => Promise<void>

interface Route {
  kind: string
  path: string
  handler: RouteHandler
}

export function createRouteRegistry(warn: (...args: unknown[]) => void) {
  const registrations: Route[] = []
  const ctx = {
    logger: { warn },
    webServer: {
      register(route: Route) {
        registrations.push(route)
        return () => {}
      },
    },
  }
  return { ctx, registrations }
}

/** Capture JSON responses and individual writes from an open SSE stream. */
export async function driveRoute(handler: RouteHandler, request: unknown) {
  const state = { status: 0, headers: {} as Record<string, string>, body: '', writes: [] as string[] }
  await handler(request, {
    writeHead(status: number, headers: Record<string, string> = {}) {
      state.status = status
      state.headers = { ...headers }
    },
    write(chunk: unknown) { state.writes.push(String(chunk)) },
    end(chunk?: unknown) {
      if (chunk !== undefined && chunk !== null) state.writes.push(String(chunk))
      state.body = state.writes.join('')
    },
  })
  return { ...state }
}
