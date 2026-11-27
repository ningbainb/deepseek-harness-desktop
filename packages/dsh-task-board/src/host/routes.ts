/** Safe same-origin Host routes for the profile-isolated Task Board ledger. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isLoopbackRequest } from './loopback-request.ts'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'

import { parseLedger, type TaskLedgerDocumentV2 } from '../core/store.ts'
import type { TaskRecord } from '../core/tasks.ts'
import type { HostTaskFileStore } from './file-store.ts'

export const TASK_BOARD_API_PATH = '/api/dsh-task-board/tasks'
export const TASK_BOARD_EVENTS_PATH = '/api/dsh-task-board/events'
const MAX_BODY_BYTES = 2 * 1024 * 1024
const KEEPALIVE_MS = 15_000

export { isLoopbackRequest as isTrustedTaskBoardRequest }

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  response.end(JSON.stringify(value))
}

async function readTasks(request: IncomingMessage): Promise<TaskRecord[] | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += buffer.length
    if (size > MAX_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  let value: unknown
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null || !Array.isArray((value as { tasks?: unknown }).tasks)) return undefined
  const rows = (value as { tasks: unknown[] }).tasks
  const tasks = parseLedger(JSON.stringify(rows))
  return tasks.length === rows.length ? tasks : undefined
}

interface OpenStream {
  response: ServerResponse
  timer: ReturnType<typeof setInterval>
}

/** One event stream per browser; writes occur only on Host-store mutations. */
export class TaskBoardEvents {
  private readonly streams = new Set<OpenStream>()
  private readonly unsubscribe: () => void

  constructor(store: HostTaskFileStore) {
    this.unsubscribe = store.subscribe((document) => { this.push(document) })
  }

  open(request: IncomingMessage, response: ServerResponse, document: TaskLedgerDocumentV2): void {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    })
    const stream: OpenStream = {
      response,
      timer: setInterval(() => { response.write(': keepalive\n\n') }, KEEPALIVE_MS),
    }
    stream.timer.unref?.()
    this.streams.add(stream)
    response.write(`data: ${JSON.stringify({ type: 'ready', revision: document.revision })}\n\n`)
    const close = (): void => {
      if (!this.streams.delete(stream)) return
      clearInterval(stream.timer)
    }
    request.once('close', close)
    response.once('close', close)
  }

  push(document: TaskLedgerDocumentV2): void {
    const frame = `data: ${JSON.stringify({ type: 'changed', revision: document.revision })}\n\n`
    for (const stream of [...this.streams]) {
      try {
        stream.response.write(frame)
      } catch {
        clearInterval(stream.timer)
        this.streams.delete(stream)
      }
    }
  }

  dispose(): void {
    this.unsubscribe()
    for (const stream of this.streams) {
      clearInterval(stream.timer)
      stream.response.end()
    }
    this.streams.clear()
  }
}

export function makeTaskBoardRoutes(store: HostTaskFileStore): { routes: WebRoute[]; dispose: () => void } {
  const events = new TaskBoardEvents(store)
  const tasksHandler = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (!isLoopbackRequest(request)) {
      writeJson(response, 403, { ok: false, code: 'forbidden' })
      return
    }
    if (request.method === 'GET') {
      writeJson(response, 200, await store.load())
      return
    }
    if (request.method === 'PUT') {
      const tasks = await readTasks(request)
      if (tasks === undefined) {
        writeJson(response, 400, { ok: false, code: 'invalid-ledger' })
        return
      }
      writeJson(response, 200, await store.save(tasks))
      return
    }
    if (request.method === 'DELETE') {
      writeJson(response, 200, await store.clear())
      return
    }
    writeJson(response, 405, { ok: false, code: 'method-not-allowed' })
  }
  const eventHandler = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (!isLoopbackRequest(request)) {
      writeJson(response, 403, { ok: false, code: 'forbidden' })
      return
    }
    if (request.method !== 'GET') {
      writeJson(response, 405, { ok: false, code: 'method-not-allowed' })
      return
    }
    events.open(request, response, await store.load())
  }
  return {
    routes: [
      { kind: 'exact', path: TASK_BOARD_API_PATH, handler: tasksHandler },
      { kind: 'exact', path: TASK_BOARD_EVENTS_PATH, handler: eventHandler },
    ],
    dispose: () => events.dispose(),
  }
}
