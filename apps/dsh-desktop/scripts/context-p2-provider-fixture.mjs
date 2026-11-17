import { createServer } from 'node:http'

// Observed in context-p2-source-fourth; do not broaden this to arbitrary GETs.
const BALANCE_ADVISORY_PATHS = new Set(['/user/balance', '/v1/usage', '/dashboard/billing/subscription', '/dashboard/billing/usage',
  '/v1/dashboard/billing/subscription', '/v1/dashboard/billing/usage'])

/** An isolated synthetic provider: directory reads are not inference turns. */
export function createContextP2ProviderProbe(onRequest) {
  return createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    let body
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    const path = new URL(request.url, 'http://127.0.0.1').pathname
    const catalog = request.method === 'GET' && path === '/v1/models'
    const generation = request.method === 'POST' && /^\/v1\/(?:chat\/completions|completions|responses|messages)$/u.test(path)
    const advisory = request.method === 'GET' && BALANCE_ADVISORY_PATHS.has(path)
    // Never record headers or credentials. Every body here belongs to the
    // fixture's synthetic provider, whose environment is scrubbed before launch.
    onRequest({ method: request.method, path, kind: catalog ? 'catalog' : generation ? 'generation' : advisory ? 'balance-advisory' : 'unknown',
      model: body?.model, messages: body?.messages, input: body?.input })
    response.setHeader('content-type', 'application/json')
    if (catalog) {
      response.writeHead(200).end(JSON.stringify({ object: 'list', data: [{ id: 'context-p2-fixture', object: 'model', owned_by: 'isolated-fixture' }] }))
    } else if (advisory) response.writeHead(404).end(JSON.stringify({ error: { code: 'unsupported', message: 'Balance advisory is unsupported by the synthetic fixture' } }))
    else response.writeHead(generation ? 500 : 404).end(JSON.stringify({ error: { message: 'Unexpected request in the no-generation fixture' } }))
  })
}
