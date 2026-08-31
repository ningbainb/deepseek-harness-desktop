import { createServer, request as httpRequest } from 'node:http'
import { describe, expect, it } from 'vitest'
import type { AddressInfo, Server } from 'node:net'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { makeLiveStatsRoutes, BALANCE_API_PATH, STATS_API_PATH } from '../src/routes.ts'
import { BalanceService } from '../src/balance-service.ts'
import { LedgerStore } from '../src/ledger-store.ts'

interface TestServer {
  port: number
  close: () => Promise<void>
}

async function serve(routes: WebRoute[]): Promise<TestServer> {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://x').pathname
    const route = routes.find(r => r.kind === 'exact'
      ? r.path === pathname
      : pathname === r.path || pathname.startsWith(`${r.path}/`))
    if (route === undefined) {
      response.writeHead(404)
      response.end()
      return
    }
    void route.handler(request, response)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return {
    port: address.port,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()))
    }),
  }
}

describe('Live stats balance & stats routes', () => {
  it('serves /api/live-stats/balance and /api/live-stats/stats via makeLiveStatsRoutes', async () => {
    const service = new BalanceService('test-key')
    const ledger = new LedgerStore()
    const routes = makeLiveStatsRoutes({ service, ledger })
    const server = await serve(routes)

    try {
      // Test balance endpoint
      const balanceRes = await new Promise<{ status: number; body: any }>((resolve, reject) => {
        const req = httpRequest({
          host: '127.0.0.1',
          port: server.port,
          path: BALANCE_API_PATH,
          method: 'GET',
        }, (response) => {
          let data = ''
          response.on('data', chunk => { data += chunk })
          response.on('end', () => {
            resolve({
              status: response.statusCode ?? 0,
              body: JSON.parse(data),
            })
          })
        })
        req.on('error', reject)
        req.end()
      })

      expect(balanceRes.status).toBe(200)
      expect(balanceRes.body).toHaveProperty('modelName')
      expect(balanceRes.body).toHaveProperty('provider')

      // Test stats endpoint
      const statsRes = await new Promise<{ status: number; body: any }>((resolve, reject) => {
        const req = httpRequest({
          host: '127.0.0.1',
          port: server.port,
          path: STATS_API_PATH,
          method: 'GET',
        }, (response) => {
          let data = ''
          response.on('data', chunk => { data += chunk })
          response.on('end', () => {
            resolve({
              status: response.statusCode ?? 0,
              body: JSON.parse(data),
            })
          })
        })
        req.on('error', reject)
        req.end()
      })

      expect(statsRes.status).toBe(200)
      expect(statsRes.body.ok).toBe(true)
      expect(statsRes.body.stats).toHaveProperty('heatmap')
      expect(statsRes.body.stats).toHaveProperty('recentDays')
      expect(statsRes.body.stats).toHaveProperty('models')
    } finally {
      await server.close()
    }
  })
})
