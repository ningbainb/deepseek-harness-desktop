import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { defaults, efforts, namespace, statusPath, type Settings } from './config.ts'
import { CliRunner } from './core/cli-runner.ts'
import { AntigravityAdapter, providerId, registerProvider } from './provider.ts'

export const name = namespace
export const inject = ['llm', 'settings', 'webServer']
export const Config = z.object({
  enabled: z.boolean().default(defaults.enabled).volatile(),
  cliPath: z.string().max(4096).default(defaults.cliPath).volatile(),
  transport: z.union(['stream-json', 'acp']).default(defaults.transport).volatile(),
  effort: z.union(['auto', ...efforts]).default(defaults.effort).volatile(),
  timeoutSeconds: z.number().step(1).min(1).max(1800).default(defaults.timeoutSeconds).volatile(),
  extraModels: z.string().max(8192).default(defaults.extraModels).volatile(),
})

export function apply(ctx: Context, config: Settings = defaults) {
  const settings = () => ({
    ...defaults,
    ...Object.fromEntries(Object.entries(config).map(([key, value]) => [
      key, typeof value === 'object' && value !== null && 'get' in value && typeof value.get === 'function'
        ? value.get() : value,
    ])),
  })
  const onModelsUpdated = () => {
    try { ctx.emit('llm/models-updated', providerId) }
    catch (error) { ctx.logger.warn(error) }
  }
  const adapter = new AntigravityAdapter(new CliRunner(), settings, onModelsUpdated)
  ctx.effect(() => registerProvider(ctx.llm, adapter))
  ctx.effect(() => ctx.settings.configure({ auto: false }, ctx.fiber))
  ctx.on('loader/volatile-update', onModelsUpdated)
  const handler: WebRoute['handler'] = async (request, response, peer) => {
    const address = request.socket.remoteAddress
    if ((address !== undefined && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address))
      || peer?.principal.kind !== 'owner' || request.headers['x-dsh-antigravity'] !== '1'
      || request.headers['sec-fetch-site'] === 'cross-site') {
      response.writeHead(403).end()
      return
    }
    const refresh = request.method === 'POST'
    if (request.method !== 'GET' && !refresh) {
      response.writeHead(405).end()
      return
    }
    const status = await adapter.status(refresh).catch(() => ({ state: 'error', models: [] }))
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    response.end(JSON.stringify(status))
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: statusPath, handler }))
}
