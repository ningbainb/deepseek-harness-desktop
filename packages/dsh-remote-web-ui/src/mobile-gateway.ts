/** Adapter from the 0.1.5 Typert Gateway to the plugin-owned mobile contract. */

import type { TypertGateway } from '@deepseek-ai/dsh-api-gateway'
import {
  expandAssistantStream,
  type AssistantStreamRecord,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type {
  ModelCatalog,
  ModelSelection,
  SessionControlFrame,
  SessionFollowFrame,
  SessionFollowRequest,
  SessionPage,
  SessionProjectionBaseline,
  SessionSummary,
  SessionWireEvent,
} from '@deepseek-ai/dsh-api-session-controller/types'
import type { WorkspaceFollowFrame } from '@deepseek-ai/dsh-api-workspace-controller/types'
import type {
  MobileApiProxy,
  MobileMuxFrame,
  MobileProxyPush,
  MobileProxyResponse,
  SessionModels,
} from './mobile-contract.ts'

interface RecordValue {
  readonly [key: string]: unknown
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ok<T>(rpcId: string, value: T): MobileProxyResponse<T> {
  return { rpcId, result: { ok: true, value } }
}

function failed<T>(rpcId: string): MobileProxyResponse<T> {
  return { rpcId, result: { ok: false, error: { code: 'internal', message: 'request failed' } } }
}

async function invoke<T>(
  gateway: TypertGateway,
  namespace: string,
  method: string,
  args: Readonly<Record<string, unknown>>,
  signal?: AbortSignal,
): Promise<T> {
  return await gateway.invoke({ namespace, method, args, ...(signal === undefined ? {} : { signal }) }) as T
}

async function firstStreamValue<T>(
  gateway: TypertGateway,
  namespace: string,
  method: string,
  args: Readonly<Record<string, unknown>>,
): Promise<T> {
  const controller = new AbortController()
  try {
    const stream = await gateway.stream({ namespace, method, args, signal: controller.signal })
    for await (const value of stream) return value as T
    throw new Error('remote stream ended before its opening baseline')
  } finally {
    controller.abort()
  }
}

function sessionAddress(sessionId: string): SessionFollowRequest['address'] {
  return { kind: 'session', sessionId: sessionId as SessionSummary['sessionId'] }
}

function selectionFrom(
  baseline: SessionProjectionBaseline | undefined,
  fallback: ModelSelection,
): ModelSelection {
  const value = baseline?.values.modelSelection
  return value?.next ?? value?.lastUsed ?? fallback
}

async function* merge<T>(iterables: readonly AsyncIterable<T>[]): AsyncGenerator<T> {
  const iterators = iterables.map(iterable => iterable[Symbol.asyncIterator]())
  const pending: Array<Promise<{ index: number; result: IteratorResult<T> }> | undefined> = iterators
    .map((iterator, index) => iterator.next().then(result => ({ index, result })))
  try {
    while (pending.some(Boolean)) {
      const available = pending.filter((item): item is Promise<{ index: number; result: IteratorResult<T> }> => item !== undefined)
      if (available.length === 0) return
      const { index, result } = await Promise.race(available)
      if (result.done) {
        pending[index] = undefined
        continue
      }
      pending[index] = iterators[index]!.next().then(next => ({ index, result: next }))
      yield result.value
    }
  } finally {
    await Promise.all(iterators.map(async iterator => { try { await iterator.return?.() } catch { /* transport cleanup */ } }))
  }
}

interface ActiveAttempt {
  readonly startedAfterSeq: number
  readonly turn: number
  readonly step: number
  readonly denominator: number
}

function liveEvent(attempt: ActiveAttempt, index: number, time: number, chunk: StreamChunk): SessionWireEvent {
  const fraction = (index + 1) / attempt.denominator
  return {
    type: 'assistant/chunk',
    seq: attempt.startedAfterSeq + fraction,
    time,
    data: { turn: attempt.turn, step: attempt.step, chunk } as never,
    ignorable: true,
  }
}

function projectionFrames(
  sessionId: string,
  baseline: SessionProjectionBaseline,
): MobileMuxFrame[] {
  return Object.entries(baseline.values).map(([key, value]) => ({
    type: 'session/projection',
    sessionId,
    key,
    value,
    seq: baseline.asOfSeq,
  }))
}

async function* followFrames(
  gateway: TypertGateway,
  sessionId: string,
  signal: AbortSignal,
): AsyncGenerator<MobileMuxFrame> {
  const request: SessionFollowRequest = {
    address: sessionAddress(sessionId),
    maxMessages: 50,
    assistantStream: true,
  }
  const stream = await gateway.stream({
    namespace: 'session',
    method: 'follow',
    args: { request },
    signal,
  })
  const attempts = new Map<string, ActiveAttempt>()
  for await (const value of stream) {
    const frame = value as SessionFollowFrame
    if (frame.type === 'snapshot') {
      yield { type: 'session/subscribed', sessionId, lastSeq: frame.cursor }
      for (const record of frame.records) yield { type: 'session/event', sessionId, event: record.event }
      for (const projection of projectionFrames(sessionId, frame.projections)) yield projection
      const active = frame.assistantStream?.activeAttempt
      if (active !== undefined) {
        const expanded = expandAssistantStream(active.stream as unknown as readonly AssistantStreamRecord[])
        const attempt: ActiveAttempt = {
          startedAfterSeq: active.startedAfterSeq,
          turn: active.turn,
          step: active.step,
          denominator: expanded.length + 2,
        }
        attempts.set(String(active.attemptId), attempt)
        for (let index = 0; index < expanded.length; index += 1) {
          const member = expanded[index]!
          yield { type: 'session/event', sessionId, event: liveEvent(attempt, index, member.time, member.chunk) }
        }
      }
      continue
    }
    if (frame.type === 'event') {
      yield { type: 'session/event', sessionId, event: frame.event }
      continue
    }
    const assistant = frame.frame
    const attemptId = String(assistant.attemptId)
    if (assistant.type === 'start') {
      attempts.set(attemptId, {
        startedAfterSeq: assistant.startedAfterSeq,
        turn: assistant.turn,
        step: assistant.step,
        denominator: Number.MAX_SAFE_INTEGER,
      })
    } else if (assistant.type === 'chunk') {
      const attempt = attempts.get(attemptId)
      if (attempt !== undefined) {
        yield {
          type: 'session/event',
          sessionId,
          event: liveEvent(attempt, assistant.index, assistant.time, assistant.chunk as unknown as StreamChunk),
        }
      }
    } else {
      attempts.delete(attemptId)
    }
  }
}

async function* controlFrames(
  gateway: TypertGateway,
  sessionId: string,
  signal: AbortSignal,
): AsyncGenerator<MobileMuxFrame> {
  const stream = await gateway.stream({ namespace: 'session', method: 'control', args: {}, signal })
  for await (const value of stream) {
    const frame = value as SessionControlFrame
    if (frame.type === 'baseline') {
      const queue = frame.value.queues[sessionId as keyof typeof frame.value.queues]
      const jobs = frame.value.jobs[sessionId as keyof typeof frame.value.jobs]
      const projections = frame.value.projections[sessionId as keyof typeof frame.value.projections]
      if (queue !== undefined) yield { type: 'session/queue', sessionId, items: queue }
      if (jobs !== undefined) yield { type: 'session/jobs', sessionId, jobs }
      if (projections !== undefined) {
        for (const projection of projectionFrames(sessionId, projections)) yield projection
      }
      continue
    }
    if (String(frame.sessionId) !== sessionId) continue
    if (frame.type === 'queue') yield { type: 'session/queue', sessionId, items: frame.items }
    else if (frame.type === 'jobs') yield { type: 'session/jobs', sessionId, jobs: frame.jobs }
    else yield { type: 'session/projection', sessionId, key: frame.key, value: frame.value, seq: frame.seq }
  }
}

/** Build the mobile compatibility surface over the supported 0.1.5 Gateway. */
export function createMobileGatewayProxy(gateway: TypertGateway): MobileApiProxy {
  const cursors = new Map<string, number>()
  const projections = new Map<string, SessionProjectionBaseline>()

  async function snapshot(sessionId: string, maxMessages: number): Promise<Extract<SessionFollowFrame, { type: 'snapshot' }>> {
    const value = await firstStreamValue<SessionFollowFrame>(gateway, 'session', 'follow', {
      request: { address: sessionAddress(sessionId), maxMessages },
    })
    if (value.type !== 'snapshot') throw new Error('session follow did not open with a snapshot')
    cursors.set(sessionId, value.cursor)
    projections.set(sessionId, value.projections)
    return value
  }

  return {
    workspace: {
      async list(request) {
        try {
          const frame = await firstStreamValue<WorkspaceFollowFrame>(gateway, 'workspace', 'follow', {})
          if (frame.type !== 'baseline') throw new Error('workspace follow did not open with a baseline')
          return ok(request.rpcId, frame.value)
        } catch {
          return failed(request.rpcId)
        }
      },
    },
    sessions: {
      async create(request) {
        try { return ok(request.rpcId, await invoke(gateway, 'session', 'create', { request: request.payload })) } catch { return failed(request.rpcId) }
      },
      async list(request) {
        try {
          const value = await invoke<{ items: readonly SessionSummary[] }>(gateway, 'session', 'list', { _request: request.payload })
          return ok(request.rpcId, value)
        } catch { return failed(request.rpcId) }
      },
      async history(request) {
        const payload = isRecord(request.payload) ? request.payload : {}
        const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : ''
        const maxMessages = typeof payload.maxMessages === 'number' ? payload.maxMessages : 30
        const beforeSeq = typeof payload.beforeSeq === 'number' ? payload.beforeSeq : undefined
        try {
          if (beforeSeq === undefined) {
            const opening = await snapshot(sessionId, maxMessages)
            return ok(request.rpcId, {
              events: opening.records,
              hasMore: opening.hasMore,
              projections: opening.projections,
            })
          }
          let throughSeq = cursors.get(sessionId)
          if (throughSeq === undefined) throughSeq = (await snapshot(sessionId, 1)).cursor
          const page = await invoke<SessionPage>(gateway, 'session', 'page', {
            request: {
              address: sessionAddress(sessionId),
              throughSeq,
              beforeSeq,
              maxMessages,
            },
          })
          return ok(request.rpcId, { events: page.records, hasMore: page.hasMore })
        } catch { return failed(request.rpcId) }
      },
      async prompt(request) {
        const payload = isRecord(request.payload) ? request.payload : {}
        try {
          return ok(request.rpcId, await invoke(gateway, 'session', 'prompt', {
            request: { ...payload, requestId: request.rpcId },
          }))
        } catch { return failed(request.rpcId) }
      },
      async models(request) {
        const payload = isRecord(request.payload) ? request.payload : {}
        const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : ''
        try {
          const catalog = await invoke<ModelCatalog>(gateway, 'session', 'modelCatalog', {})
          if (!projections.has(sessionId)) await snapshot(sessionId, 1)
          const current = selectionFrom(projections.get(sessionId), catalog.default)
          const value: SessionModels = {
            current,
            routable: catalog.routableProviders.includes(current.provider),
            groups: catalog.groups,
            failures: catalog.failures,
          }
          return ok(request.rpcId, value)
        } catch { return failed(request.rpcId) }
      },
      async selectModel(request) {
        try { return ok(request.rpcId, await invoke(gateway, 'session', 'selectModel', { request: request.payload })) } catch { return failed(request.rpcId) }
      },
      async rename(request) {
        try { return ok(request.rpcId, await invoke(gateway, 'session', 'rename', { request: request.payload })) } catch { return failed(request.rpcId) }
      },
    },
    events: {
      async *mux(request, signal): AsyncGenerator<MobileProxyPush> {
        const sessionId = request.payload.sessionId
        if (sessionId === undefined) {
          if (!signal.aborted) await new Promise<void>(resolve => signal.addEventListener('abort', () => { resolve() }, { once: true }))
          return
        }
        let index = 0
        for await (const payload of merge([
          followFrames(gateway, sessionId, signal),
          controlFrames(gateway, sessionId, signal),
        ])) {
          yield { rpcId: `${request.rpcId}-${String(index++)}`, payload }
        }
      },
    },
  }
}
