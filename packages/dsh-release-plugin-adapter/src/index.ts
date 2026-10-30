import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-client-connection'
import { PLUGIN_IDS, REQUIREMENTS, STATUS_PATH, assessPlugin, type PluginAssessment } from './core/contracts.ts'

export const name = 'release-plugin-adapter'
export const inject = ['connection']

/** The existing Connection carrier applies owner authentication before dispatch. */
export function makeStatusRoute(snapshot: () => PluginAssessment[]): ConnectionFetchRoute {
  return {
    path: STATUS_PATH, methods: ['GET'], requestBody: 'buffered',
    async fetch(request) {
      if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } })
      return Response.json({ schemaVersion: 1, plugins: snapshot() }, { headers: { 'cache-control': 'no-store' } })
    },
  }
}

/** Supplement vendor rows; never duplicate their tools, projections, routes, or client factories. */
export function apply(ctx: Context): void {
  const services = [...new Set(Object.values(REQUIREMENTS).flat().map(path => path.split('.')[0]!))]
  const snapshot = () => {
    const current: Record<string, unknown> = {}
    for (const service of services) {
      try { current[service] = ctx.get(service, false) } catch { current[service] = undefined }
    }
    return PLUGIN_IDS.map(id => assessPlugin(id, current))
  }
  ctx.effect(() => ctx.connection.fetch.register(makeStatusRoute(snapshot)), 'release plugins: prerequisite route')
}
