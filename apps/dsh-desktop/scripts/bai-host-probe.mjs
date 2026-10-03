import assert from 'node:assert/strict'
import { readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { makeRelayRoutes, RELAY_BASE_URL, RELAY_CREDENTIAL_REF } from '@linxin666/dsh-client-ui-web-ui-settings'

const sdkRequire = createRequire(import.meta.resolve('@linxin666/dsh-client-ui-web-ui-settings'))
const { credentialRef } = await import(pathToFileURL(sdkRequire.resolve('@deepseek-ai/dsh-credentials')).href)

export const inject = ['settings', 'credentials', 'webServer', 'agentDefaultModel', 'deepseekAccount']

export async function apply(ctx, config) {
  assert.equal(await realpath(process.env.DSH_HOME), await realpath(config.expectedHome))
  let modelRequests = 0
  let inferenceRequests = 0
  const requestPaths = {}
  const inferenceCalls = []
  const originalFetch = globalThis.fetch
  const guardedFetch = async (input, options) => {
    const target = new URL(input instanceof Request ? input.url : String(input))
    if (target.origin === new URL(RELAY_BASE_URL).origin) {
      requestPaths[target.pathname] = (requestPaths[target.pathname] ?? 0) + 1
      if (target.pathname === '/v1/models') {
        const fixture = JSON.parse(await readFile(config.catalogPath, 'utf8'))
        return new Response(JSON.stringify(fixture.body), { status: fixture.status ?? 200 })
      }
      if (['/v1/chat/completions', '/v1/responses'].includes(target.pathname)) {
        inferenceRequests++
        const body = typeof options?.body === 'string' ? JSON.parse(options.body) : {}
        inferenceCalls.push({ model: body.model, maxTokens: body.max_tokens ?? body.max_completion_tokens ?? body.max_output_tokens })
      }
      return new Response(JSON.stringify({ error: { message: 'Invalid API key', type: 'invalid_api_key', code: 'invalid_api_key' } }),
        { status: 401, headers: { 'content-type': 'application/json' } })
    }
    return originalFetch(input, options)
  }
  globalThis.fetch = guardedFetch
  ctx.effect(() => () => { if (globalThis.fetch === guardedFetch) globalThis.fetch = originalFetch })
  const routes = makeRelayRoutes({
    settings: ctx.settings,
    credentials: ctx.credentials,
    defaultModel: ctx.agentDefaultModel,
    officialAccount: ctx.deepseekAccount,
    fetchImpl: async (input, options) => {
      assert.equal(String(input), RELAY_BASE_URL + '/models')
      assert.equal(options?.method, 'GET')
      assert.equal(options?.redirect, 'error')
      assert.match(options?.headers?.authorization, /^Bearer synthetic-bai-/u)
      modelRequests++
      const fixture = JSON.parse(await readFile(config.catalogPath, 'utf8'))
      return new Response(JSON.stringify(fixture.body), { status: fixture.status ?? 200 })
    },
  })
  ctx.effect(() => () => routes.dispose())
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/api/isolated-bai',
    handler: async (request, response) => {
      if (request.url === '/api/isolated-bai/metrics') {
        response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        response.end(JSON.stringify({ modelRequests, inferenceRequests, inferenceCalls, requestPaths, default: ctx.agentDefaultModel.currentSelection() }))
        return
      }
      if (request.url === '/api/isolated-bai/revoke') {
        await ctx.credentials.unset(credentialRef(RELAY_CREDENTIAL_REF))
        response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        response.end(JSON.stringify({ ok: true }))
        return
      }
      const originalUrl = request.url
      request.url = request.url?.replace('/api/isolated-bai/', '/api/dsh-relay/')
      try { await routes[0].handler(request, response) }
      finally { request.url = originalUrl }
    },
  }))
}
