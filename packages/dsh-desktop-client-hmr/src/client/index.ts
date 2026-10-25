import type { Context } from '@deepseek-ai/cordis'
import type { ClientModuleSystem } from '@deepseek-ai/dsh-client-modules/client'
import { startClientBridge } from './bridge.ts'

export const name = 'desktop-client-hmr'
export const inject = ['modules']

export function apply(ctx: Context) {
  const modules = ctx.get('modules') as ClientModuleSystem
  const transport = (globalThis as typeof globalThis & { __DSH_TRANSPORT__?: { fetch?: typeof fetch } }).__DSH_TRANSPORT__
  const request = transport?.fetch ?? globalThis.fetch.bind(globalThis)
  ctx.effect(() => startClientBridge({ entries: modules.entries, fetch: request,
    report: message => ctx.logger.warn(message) }), 'desktop-client-hmr: reconnecting event stream')
}
