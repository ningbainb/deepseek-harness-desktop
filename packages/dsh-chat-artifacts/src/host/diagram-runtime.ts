import { readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'

const require = createRequire(import.meta.url)
let bundledRuntime: Promise<string> | undefined

async function readRuntime(): Promise<string> {
  const location = require.resolve('@mermaid-js/tiny')
  if ((await stat(location)).size > 8 * 1024 * 1024) throw new Error('Diagram runtime exceeds its size limit.')
  return readFile(location, 'utf8')
}

export function mountDiagramRuntime(ctx: Context): void {
  ctx.inject(['webServer'], scope => scope.webServer.register({
    kind: 'exact', path: '/api/dsh-artifacts/mermaid-runtime',
    async handler(request, response, route) {
      if (request.method !== 'GET' || route?.principal?.kind !== 'owner'
        || request.headers['x-dsh-artifact-runtime'] !== '1' || request.headers['sec-fetch-site'] === 'cross-site') {
        response.writeHead(403).end()
        return
      }
      try {
        const source = await (bundledRuntime ??= readRuntime())
        response.writeHead(200, {
          'content-type': 'text/javascript; charset=utf-8',
          'x-content-type-options': 'nosniff',
          'cache-control': 'private, max-age=3600',
        }).end(source)
      } catch { response.writeHead(503).end() }
    },
  }))
}
