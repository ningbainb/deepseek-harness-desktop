import { randomUUID } from 'node:crypto'

export const DESKTOP_RUNTIME_SCHEME = 'dsh-runtime'
export const DESKTOP_RUNTIME_ORIGIN = `${DESKTOP_RUNTIME_SCHEME}://app`

const STREAM_OPEN_CHANNEL = 'desktop:runtime-stream-open'
const STREAM_CANCEL_CHANNEL = 'desktop:runtime-stream-cancel'
const STREAM_WRITE_CHANNEL = 'desktop:runtime-stream-write'
const STREAM_FRAME_CHANNEL = 'desktop:runtime-stream-frame'
const ENDPOINT_PATTERN = /^[A-Za-z0-9_$.-]+(?:\/[A-Za-z0-9_$.-]+)*$/u
const MAX_STREAM_PAYLOAD_BYTES = 4 * 1024 * 1024
const MAX_STREAM_ITEM_BYTES = 700 * 1024

export function registerDesktopRuntimeScheme(protocol) {
  if (typeof protocol?.registerSchemesAsPrivileged !== 'function') {
    throw new TypeError('Electron protocol registry is required')
  }
  protocol.registerSchemesAsPrivileged([{
    scheme: DESKTOP_RUNTIME_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
      allowServiceWorkers: false,
    },
  }])
}

function runtimeRequest(request) {
  const source = new URL(request.url)
  if (source.protocol !== `${DESKTOP_RUNTIME_SCHEME}:` || source.hostname !== 'app') {
    return undefined
  }
  const target = new URL(`${source.pathname}${source.search}`, 'http://dsh.internal')
  return new Request(target, request)
}

export async function installDesktopRuntimeProtocol({ protocol, getProvider, beforeFetch, afterFetch }) {
  if (typeof protocol?.handle !== 'function' || typeof getProvider !== 'function') {
    throw new TypeError('runtime protocol and provider getter are required')
  }
  let quiescing = false
  const closeOnQuiesce = response => {
    if (response.body === null) return response
    const reader = response.body.getReader()
    const body = new ReadableStream({
      async pull(controller) {
        try {
          const result = await reader.read()
          if (result.done) controller.close()
          else controller.enqueue(result.value)
        } catch (error) {
          if (quiescing) controller.close()
          else controller.error(error)
        }
      },
      cancel: reason => reader.cancel(reason),
    })
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
  await protocol.handle(DESKTOP_RUNTIME_SCHEME, async (request) => {
    const forwarded = runtimeRequest(request)
    if (forwarded === undefined) return new Response('not found', { status: 404 })
    const provider = getProvider()
    if (provider?.status?.state !== 'ready' || typeof provider.fetch !== 'function') {
      return new Response('runtime unavailable', { status: 503 })
    }
    try {
      const override = await beforeFetch?.(forwarded)
      const response = override instanceof Response ? override : await provider.fetch(forwarded)
      if (afterFetch) {
        try { await afterFetch(forwarded, response) } catch { /* observer must not break Runtime transport */ }
      }
      return closeOnQuiesce(response)
    } catch (error) {
      if (quiescing) return new Response(null, { status: 204 })
      throw error
    }
  })
  return Object.freeze({
    quiesce() { quiescing = true },
    resume() { quiescing = false },
  })
}

function validateStreamRequest(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || typeof value.endpoint !== 'string'
    || !ENDPOINT_PATTERN.test(value.endpoint)
  ) throw new TypeError('runtime stream request is invalid')
  const bytes = Buffer.byteLength(JSON.stringify(value.payload ?? null))
  if (bytes > MAX_STREAM_PAYLOAD_BYTES) throw new RangeError('runtime stream payload exceeded the limit')
  return { endpoint: value.endpoint, payload: structuredClone(value.payload) }
}

export function registerDesktopRuntimeStreamIpc({ ipcMain, getProvider, schedule = setImmediate }) {
  if (typeof ipcMain?.handle !== 'function' || typeof getProvider !== 'function') {
    throw new TypeError('runtime stream IPC and provider getter are required')
  }
  const active = new Map()
  let quiescing = false
  const cancel = (id, reason = new Error('runtime stream cancelled')) => {
    const entry = active.get(id)
    if (entry === undefined) return false
    active.delete(id)
    entry.controller.abort(reason)
    entry.source?.cancel?.(reason)
    return true
  }

  ipcMain.handle(STREAM_OPEN_CHANNEL, (event, value) => {
    const request = validateStreamRequest(value)
    if (quiescing) {
      const id = randomUUID()
      schedule(() => {
        if (!event.sender.isDestroyed?.()) event.sender.send(STREAM_FRAME_CHANNEL, { id, type: 'end' })
      })
      return id
    }
    const provider = getProvider()
    if (provider?.status?.state !== 'ready' || typeof provider.openDuplex !== 'function') {
      throw new Error('runtime stream is unavailable')
    }
    const id = randomUUID()
    const controller = new AbortController()
    let resolveSource
    const entry = { controller, sender: event.sender, source: undefined, sourceReady: new Promise(resolve => { resolveSource = resolve }) }
    active.set(id, entry)
    schedule(() => {
      void (async () => {
        try {
          const source = provider.openDuplex(request.endpoint, request.payload, controller.signal)
          entry.source = source
          resolveSource(source)
          for await (const item of source) {
            if (controller.signal.aborted || event.sender.isDestroyed?.()) return
            event.sender.send(STREAM_FRAME_CHANNEL, { id, type: 'item', value: item })
          }
          if (!controller.signal.aborted && !event.sender.isDestroyed?.()) {
            event.sender.send(STREAM_FRAME_CHANNEL, { id, type: 'end' })
          }
        } catch (error) {
          resolveSource(undefined)
          if (!controller.signal.aborted && !event.sender.isDestroyed?.()) {
            event.sender.send(STREAM_FRAME_CHANNEL, {
              id,
              type: 'error',
              message: error instanceof Error ? error.message.slice(0, 1_000) : 'Runtime stream failed',
            })
          }
        } finally {
          active.delete(id)
        }
      })()
    })
    return id
  })
  ipcMain.handle(STREAM_CANCEL_CHANNEL, (event, id) => {
    if (typeof id !== 'string') return false
    const entry = active.get(id)
    if (entry?.sender !== event.sender) return false
    return cancel(id)
  })
  ipcMain.handle(STREAM_WRITE_CHANNEL, async (event, id, value) => {
    if (typeof id !== 'string') return false
    const entry = active.get(id)
    if (entry?.sender !== event.sender) return false
    if (Buffer.byteLength(JSON.stringify(value ?? null)) > MAX_STREAM_ITEM_BYTES) {
      throw new RangeError('runtime stream item exceeded the limit')
    }
    const source = entry.source ?? await entry.sourceReady
    if (typeof source?.write !== 'function' || controllerAborted(entry)) return false
    await source.write(structuredClone(value))
    return true
  })

  const quiesce = async () => {
    quiescing = true
    for (const [id, entry] of active) {
      if (!entry.sender.isDestroyed?.()) entry.sender.send(STREAM_FRAME_CHANNEL, { id, type: 'end' })
      cancel(id, new Error('runtime stream IPC quiesced'))
    }
    await new Promise(resolve => setImmediate(resolve))
  }
  const dispose = () => {
    ipcMain.removeHandler?.(STREAM_OPEN_CHANNEL)
    ipcMain.removeHandler?.(STREAM_CANCEL_CHANNEL)
    ipcMain.removeHandler?.(STREAM_WRITE_CHANNEL)
    void quiesce()
  }
  dispose.quiesce = quiesce
  dispose.resume = () => { quiescing = false }
  return dispose
}

function controllerAborted(entry) {
  return entry.controller.signal.aborted
}

export const RUNTIME_STREAM_FRAME_CHANNEL = STREAM_FRAME_CHANNEL
export const RUNTIME_STREAM_WRITE_CHANNEL = STREAM_WRITE_CHANNEL
