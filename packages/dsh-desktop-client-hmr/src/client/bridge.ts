import type { ClientModuleSystem } from '@deepseek-ai/dsh-client-modules/client'
import { createSseDecoder, parseFrame } from '../core/events.ts'

export interface BridgeOptions {
  entries: Pick<ClientModuleSystem['entries'], 'sync' | 'reload'>
  fetch: typeof globalThis.fetch
  report(message: string): void
  retryDelayMs?: number
}

export function startClientBridge(options: BridgeOptions) {
  const controller = new AbortController()
  let active = true
  let timer: ReturnType<typeof setTimeout> | undefined
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const report = (message: string) => {
    if (!active) return
    try { options.report(message) } catch {}
  }
  const receive = (data: string) => {
    if (!active) return
    let value: unknown
    try { value = JSON.parse(data) } catch { report('Desktop client HMR received malformed JSON'); return }
    const parsed = parseFrame(value)
    if (parsed.kind === 'invalid') { report('Desktop client HMR received an invalid frame'); return }
    if (parsed.kind !== 'frame') return
    try {
      const frame = parsed.frame
      const operation = frame.type === 'graph' ? options.entries.sync(frame.graph) : options.entries.reload(frame.id, frame.rev)
      void Promise.resolve(operation).catch(() => report('Desktop client HMR module reconciliation failed'))
    } catch { report('Desktop client HMR module reconciliation failed') }
  }
  const connect = async () => {
    if (!active) return
    try {
      const response = await options.fetch('plugins/events', { method: 'GET', credentials: 'same-origin',
        headers: { accept: 'text/event-stream' }, signal: controller.signal })
      if (!active) { void response.body?.cancel().catch(() => {}); return }
      if (!response.ok || response.body === null) {
        void response.body?.cancel().catch(() => {})
        throw new Error('Desktop client HMR event stream refused')
      }
      reader = response.body.getReader()
      const decoder = new TextDecoder()
      const events = createSseDecoder(receive)
      while (active) {
        const chunk = await reader.read()
        if (!active) break
        if (chunk.done) break
        events.push(decoder.decode(chunk.value, { stream: true }))
      }
      if (active) report('Desktop client HMR event stream ended; reconnecting')
    } catch { report('Desktop client HMR event stream interrupted; reconnecting') }
    finally {
      if (reader) {
        void reader.cancel().catch(() => {})
        try { reader.releaseLock() } catch {}
        reader = undefined
      }
      if (active) timer = setTimeout(() => { timer = undefined; void connect() }, options.retryDelayMs ?? 1_000)
    }
  }
  void connect()
  return () => {
    if (!active) return
    active = false
    clearTimeout(timer)
    controller.abort()
    void reader?.cancel().catch(() => {})
  }
}
