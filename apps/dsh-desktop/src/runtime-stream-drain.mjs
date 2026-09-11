import { channel } from 'node:diagnostics_channel'

/** Track HTTP carriers without patching the SDK or reading its private server. */
export function createRuntimeEventStreamDrain({ timeoutMs = 400 } = {}) {
  const requests = channel('http.server.request.start')
  const responses = new Map()
  const changes = new Set()
  const changed = () => { for (const notify of [...changes]) notify() }
  const observe = ({ request, response, server }) => {
    if (!request || !response || responses.size >= 512) return
    const record = { server, method: request.method, remove: undefined, contentType: undefined }
    // writeHead's explicit headers are not retained by getHeader(). Observe
    // that public method on this response only; preserve all arguments/return
    // values and compose with compression middleware without touching SDK code.
    const writeHead = response.writeHead
    const observeHead = function (...args) {
      const headers = typeof args[1] === 'string' ? args[2] : args[1]
      const entries = Array.isArray(headers)
        ? Array.from({ length: Math.floor(headers.length / 2) }, (_, index) => [headers[index * 2], headers[index * 2 + 1]])
        : Object.entries(headers ?? {})
      for (const [name, value] of entries) if (String(name).toLowerCase() === 'content-type') record.contentType = value
      const result = writeHead.apply(this, args)
      changed()
      return result
    }
    response.writeHead = observeHead
    const remove = () => {
      responses.delete(response)
      if (response.writeHead === observeHead) response.writeHead = writeHead
      response.off('finish', remove)
      response.off('close', remove)
      changed()
    }
    record.remove = remove
    responses.set(response, record)
    response.once('finish', remove)
    response.once('close', remove)
    changed()
  }
  requests.subscribe(observe)
  return {
    async drain(port) {
      if (!Number.isInteger(port) || port < 1) return 0
      const deadline = Date.now() + timeoutMs
      let completedStreams = 0
      while (true) {
        const pending = [...responses].filter(([response, { server }]) =>
          server.address()?.port === port && !response.destroyed)
        if (!pending.length) break
        for (const [response, { method, contentType }] of pending) {
          // Only event streams are ended here. Finite GET/POST handlers keep
          // running normally so shutdown does not truncate e.g. fs.tree JSON.
          if (method !== 'GET' || response.writableEnded
            || !/^text\/event-stream(?:;|$)/i.test(String(contentType ?? response.getHeader('content-type') ?? ''))) continue
          completedStreams += 1
          try { response.end() } catch { /* normal disposal remains the fallback */ }
        }
        const remaining = deadline - Date.now()
        if (remaining <= 0) break
        await new Promise(resolve => {
          const finish = () => {
            clearTimeout(timer)
            changes.delete(finish)
            resolve()
          }
          const timer = setTimeout(finish, remaining)
          changes.add(finish)
        })
      }
      return completedStreams
    },
    dispose() {
      requests.unsubscribe(observe)
      for (const { remove } of [...responses.values()]) remove()
    },
  }
}
