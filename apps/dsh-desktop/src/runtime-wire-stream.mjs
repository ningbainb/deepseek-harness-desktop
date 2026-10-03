async function *emptyUplink() {}

export function openDesktopWireStream(ctx, endpoint, payload, signal, uplink = emptyUplink()) {
  if (!(signal instanceof AbortSignal)) throw new TypeError('Runtime stream cancellation signal is required')
  return ctx.typertGateway.wireStream.open(endpoint, payload, uplink, ctx.connection.operator, signal)
}
