async function *emptyUplink() {}

const CODEX_PROVIDER = 'openai-codex'
// Address from the official pi-ai authorization service. Read only the
// configured/kind projection, never the grant payload.
const CODEX_CREDENTIAL_RECORD = `llm-pi-ai/${CODEX_PROVIDER}`
const MODEL_CATALOG_PATH = '/api/session/modelCatalog'

async function projectDesktopModelCatalog(ctx, response) {
  if (!response.ok || !response.headers.get('content-type')?.startsWith('application/json')) return response
  const envelope = await response.clone().json().catch(() => undefined)
  if (envelope?.type !== 'server-response' || envelope.result?.ok !== true) return response
  const catalog = envelope.result.value
  if (!Array.isArray(catalog?.groups) || !Array.isArray(catalog?.routableProviders) || !Array.isArray(catalog?.failures)) return response
  const isOtherProvider = item => item?.id !== CODEX_PROVIDER
  if (catalog.groups.every(isOtherProvider) && catalog.failures.every(isOtherProvider)
    && !catalog.routableProviders.includes(CODEX_PROVIDER)) return response

  let grant
  try {
    grant = await ctx.get('credentials')?.describeRecord(CODEX_CREDENTIAL_RECORD)
  } catch {
    // A temporarily unreadable record cannot establish sign-in. Keep all
    // unconnected providers usable while hiding the uncertain Codex catalog.
  }
  if (grant?.configured === true && grant.kind === 'grant') return response

  // The native selectors also use the deployment default to reconstruct a
  // historical/current selection. Hide choices without altering that value.
  const value = {
    ...catalog,
    groups: catalog.groups.filter(isOtherProvider),
    routableProviders: catalog.routableProviders.filter(id => id !== CODEX_PROVIDER),
    failures: catalog.failures.filter(isOtherProvider),
  }
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  void response.body?.cancel().catch(() => {})
  return Response.json({ ...envelope, result: { ...envelope.result, value } }, {
    status: response.status, statusText: response.statusText, headers,
  })
}

function connectionPeer(ctx) {
  const peer = ctx.connection.browserPeer ?? ctx.connection.operator
  if (peer === undefined || peer === null) throw new TypeError('Runtime stream requires the official Connection peer')
  return peer
}

export function fetchDesktopConnectionApi(ctx, api, request) {
  const response = api.fetch(request, connectionPeer(ctx))
  if (request.method !== 'POST' || new URL(request.url).pathname !== MODEL_CATALOG_PATH) return response
  return Promise.resolve(response).then(result => projectDesktopModelCatalog(ctx, result))
}

export function openDesktopWireStream(ctx, endpoint, payload, signal, uplink = emptyUplink()) {
  if (!(signal instanceof AbortSignal)) throw new TypeError('Runtime stream cancellation signal is required')
  return ctx.typertGateway.wireStream.open(endpoint, payload, uplink, connectionPeer(ctx), signal)
}
