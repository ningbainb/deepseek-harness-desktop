/**
 * Live Stats HTTP routes.
 * Serves /api/live-stats/balance and /api/live-stats/stats to allow browser client
 * components to query live LLM account balance, heatmap activity, and token ledger data.
 * @module @linxin666/dsh-live-stats/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { BalanceService } from './balance-service.ts'
import type { LedgerStore } from './ledger-store.ts'

export const BALANCE_API_PATH = '/api/live-stats/balance'
export const STATS_API_PATH = '/api/live-stats/stats'

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  response.end(JSON.stringify(value))
}

export function makeLiveStatsRoutes(options: {
  service: BalanceService
  ledger: LedgerStore
}): WebRoute[] {
  const { service, ledger } = options
  return [
    {
      kind: 'exact',
      path: BALANCE_API_PATH,
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (req.method !== 'GET') {
          writeJson(res, 405, { ok: false, error: 'Method Not Allowed' })
          return
        }
        try {
          const url = new URL(req.url ?? '', 'http://127.0.0.1')
          const force = url.searchParams.get('force') === '1'
          const result = await service.getBalance(force)
          writeJson(res, 200, result)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          writeJson(res, 500, { ok: false, error: msg })
        }
      },
    },
    {
      kind: 'exact',
      path: STATS_API_PATH,
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (req.method !== 'GET') {
          writeJson(res, 405, { ok: false, error: 'Method Not Allowed' })
          return
        }
        try {
          const summary = ledger.getSummary()
          writeJson(res, 200, { ok: true, stats: summary })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          writeJson(res, 500, { ok: false, error: msg })
        }
      },
    },
  ]
}
