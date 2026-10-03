import { createServer } from 'node:http'

export async function createRuntimeAccountCallback({ webServer }) {
  if (typeof webServer?.match !== 'function') throw new TypeError('account callback requires the official WebRoute service')
  let origin
  const server = createServer((request, response) => {
    response.setHeader('cache-control', 'no-store')
    response.setHeader('referrer-policy', 'no-referrer')
    response.setHeader('content-security-policy', "default-src 'none'; frame-ancestors 'none'")
    const rawUrl = request.url ?? ''
    if (!origin || request.headers.host !== new URL(origin).host || rawUrl.length > 8192 || rawUrl.split('?', 1)[0] !== '/oauth/callback') {
      response.writeHead(404).end()
      return
    }
    if (request.method !== 'GET') {
      response.writeHead(405, { allow: 'GET' }).end()
      return
    }
    const url = new URL(rawUrl, origin)
    if (['code', 'state'].some(name => url.searchParams.getAll(name).length !== 1 || !url.searchParams.get(name))) {
      response.writeHead(400).end()
      return
    }
    const route = webServer.match('/oauth/callback')
    if (route?.kind !== 'exact' || route.path !== '/oauth/callback' || typeof route.handler !== 'function') {
      response.writeHead(410).end()
      return
    }
    try {
      Promise.resolve(route.handler(request, response)).catch(() => {
        if (!response.headersSent) response.writeHead(500).end()
        else response.destroy()
      })
    } catch {
      if (!response.headersSent) response.writeHead(500).end()
      else response.destroy()
    }
  })
  server.requestTimeout = 10_000
  server.headersTimeout = 10_000
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
  origin = `http://127.0.0.1:${server.address().port}`
  let closing
  return Object.freeze({
    origin,
    close() {
      closing ??= new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve())
        server.closeAllConnections()
      })
      return closing
    },
  })
}
