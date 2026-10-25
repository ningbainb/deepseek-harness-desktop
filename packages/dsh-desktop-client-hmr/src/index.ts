import { stat } from 'node:fs/promises'
import { setImmediate as yieldImmediate } from 'node:timers/promises'
import type { ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import type { ClientModuleRegistry } from '@deepseek-ai/dsh-client-modules'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { createBundleWatcher } from './core/scanner.ts'
import type { BundleBaseline } from './core/scanner.ts'

export const name = 'desktop-client-hmr'
export const inject = ['clientModules', 'webServer', 'connection']
export interface Config { pollIntervalMs?: number | { get(): number } }
export const Config = z.object({ pollIntervalMs: z.number().step(1).min(1).default(500).volatile() })
export const EVENTS_ENDPOINT = '/plugins/events'

function eventChannel(registry: ClientModuleRegistry, connection: HostConnectionHandle, webServer: WebServer) {
  const connections = new Set<(line: string) => void>()
  const closers = new Set<() => void>()
  let disposed = false
  const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`
  const broadcast = (line: string) => {
    if (disposed) return
    for (const send of connections) send(line)
  }
  const connect = (response: ServerResponse) => {
    let closed = false
    let blocked = false
    let queuedBytes = 0
    const queue: string[] = []
    const close = () => {
      if (closed) return
      closed = true
      connections.delete(send)
      closers.delete(close)
      response.off('drain', drain)
      response.off('error', close)
      response.off('close', close)
      queue.length = 0
      if (!response.destroyed) response.destroy()
    }
    const write = (line: string) => {
      try { blocked = !response.write(line) } catch { close() }
    }
    const send = (line: string) => {
      if (closed || disposed) return
      if (!blocked) { write(line); return }
      queuedBytes += Buffer.byteLength(line)
      if (queuedBytes > 1_048_576) { close(); return }
      queue.push(line)
    }
    const drain = () => {
      blocked = false
      while (!closed && !disposed && !blocked && queue.length > 0) {
        const line = queue.shift()!
        queuedBytes -= Buffer.byteLength(line)
        write(line)
      }
    }
    response.on('drain', drain)
    response.on('error', close)
    response.on('close', close)
    connections.add(send)
    closers.add(close)
    try {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
      send(': connected\n\n')
      send(frame({ type: 'graph', graph: registry.graph() }))
    } catch { close() }
  }
  const unregister = webServer.register({ kind: 'exact', path: EVENTS_ENDPOINT, handler(request, response) {
    if (disposed) { response.writeHead(503); response.end(); return }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' }); response.end(); return
    }
    let rejection
    try { rejection = connection.requestRejection(request) } catch { rejection = 503 }
    if (rejection !== undefined) { response.writeHead(rejection); response.end(); return }
    if (request.method === 'HEAD') {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      response.end()
      return
    }
    connect(response)
  } })
  const unsubscribeGraph = registry.onGraphChanged(() => {
    if (!disposed) broadcast(frame({ type: 'graph', graph: registry.graph() }))
  })
  const unsubscribeRebuilt = registry.onRebuilt((id, rev) => broadcast(frame({ type: 'rebuilt', id, rev })))
  return () => {
    if (disposed) return
    disposed = true
    unsubscribeGraph()
    unsubscribeRebuilt()
    unregister()
    for (const close of closers) close()
  }
}

export function apply(ctx: Context, config: Config = {}) {
  const interval = config.pollIntervalMs
  const readInterval = () => typeof interval === 'object' ? interval.get() : interval
  const fallbackInterval = Config({ pollIntervalMs: readInterval() }).pollIntervalMs.get()
  const registry = ctx.get('clientModules') as ClientModuleRegistry
  const connection = ctx.get('connection') as HostConnectionHandle
  const webServer = ctx.get('webServer') as WebServer
  if (!registry || !connection || !webServer) throw new Error('Desktop client HMR requires the official module registry and authenticated carrier')
  ctx.effect(() => {
    const closeEvents = eventChannel(registry, connection, webServer)
    let watcher: ReturnType<typeof createBundleWatcher>
    try {
      watcher = createBundleWatcher({
        get pollIntervalMs() { return readInterval() ?? fallbackInterval },
        snapshot: () => registry.graph().entries.flatMap(row => {
          const baseline = registry.artifactBaseline(row.id)
          return baseline === undefined ? [] : [[row.id, baseline] as const]
        }),
        stat,
        publish: id => { registry.rebuilt(id); return registry.artifactBaseline(id) as BundleBaseline | undefined },
        yieldControl: () => yieldImmediate(),
        schedule(callback, milliseconds) {
          const timer = setTimeout(callback, milliseconds)
          timer.unref()
          return () => clearTimeout(timer)
        },
        report: () => { ctx.logger.warn('Desktop client HMR bundle observation failed; retrying on the next scan') },
      })
    } catch (error) { closeEvents(); throw error }
    const unsubscribe = registry.onGraphChanged(() => watcher.refresh())
    return () => { watcher.dispose(); unsubscribe(); closeEvents() }
  }, 'desktop-client-hmr: asynchronous watches and authenticated events')
}
