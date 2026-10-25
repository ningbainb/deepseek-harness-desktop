async function *emptyUplink() {}

function connectionPeer(ctx) {
  const peer = ctx.connection.browserPeer ?? ctx.connection.operator
  if (peer === undefined || peer === null) throw new TypeError('Runtime stream requires the official Connection peer')
  return peer
}

export function fetchDesktopConnectionApi(ctx, api, request) {
  return api.fetch(request, connectionPeer(ctx))
}

export function openDesktopWireStream(ctx, endpoint, payload, signal, uplink = emptyUplink()) {
  if (!(signal instanceof AbortSignal)) throw new TypeError('Runtime stream cancellation signal is required')
  return ctx.typertGateway.wireStream.open(endpoint, payload, uplink, connectionPeer(ctx), signal)
}
