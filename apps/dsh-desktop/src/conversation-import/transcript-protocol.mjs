/**
 * DSH Transcript Import Protocol and Event Transformation.
 *
 * External adapters expose a deliberately small, source-neutral IR. This
 * module is the only place that turns that IR into the public DSH session log
 * vocabulary. The generated seed is accepted by the real
 * `@deepseek-ai/dsh-session` constructor; import provenance remains in the
 * import ledger rather than being copied into the session event envelope.
 */

import { createHash } from 'node:crypto'

import {
  EVENT_ROLES,
  EVENT_TYPES,
  TOOL_STATUS,
} from './schema.mjs'

export const TRANSCRIPT_IMPORT_CHUNK_SIZE = 50
export const TRANSCRIPT_IMPORT_MAX_SEED_BYTES = 24 * 1024 * 1024

const MAX_MESSAGE_TEXT_CHARS = 128 * 1024
const MAX_TOOL_RESULT_CHARS = 16 * 1024
const MAX_TOOL_ARGUMENT_CHARS = 32 * 1024
const TRUNCATION_MARKER = '\n\n[... imported content truncated for safety ...]'
const SEED_RESERVE_BYTES = 4096

export const TRANSCRIPT_IMPORT_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMMITTED: 'committed',
  FAILED: 'failed',
})

const DEFAULT_PROVIDER = 'external-import'
const DEFAULT_MODEL = 'imported-transcript'

function stableHash(...parts) {
  return createHash('sha256').update(parts.map((part) => String(part ?? '')).join('\u001f')).digest('hex').slice(0, 32)
}

function messageId(importId, sourceSessionId, event, index, suffix) {
  return `import-msg-${stableHash(importId, sourceSessionId, event?.eventId, event?.sourceEventId, event?.sequence, index, suffix)}`
}

function callId(importId, sourceSessionId, rawCallId, event, index) {
  return `import-call-${stableHash(importId, sourceSessionId, rawCallId || 'anonymous-call', event?.eventId, event?.sourceEventId, index)}`
}

function truncateText(value, maxChars) {
  const text = typeof value === 'string' ? value : String(value ?? '')
  if (text.length <= maxChars) return text
  const headLength = Math.max(0, maxChars - TRUNCATION_MARKER.length)
  return text.slice(0, headLength) + TRUNCATION_MARKER
}

function textValue(value, maxChars = MAX_MESSAGE_TEXT_CHARS) {
  if (typeof value === 'string') return truncateText(value, maxChars)
  if (value === undefined || value === null) return ''
  try {
    const serialized = JSON.stringify(value)
    return typeof serialized === 'string' ? truncateText(serialized, maxChars) : truncateText(value, maxChars)
  } catch {
    return truncateText(value, maxChars)
  }
}

function finiteTimestamp(value, fallback) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  return Number.isSafeInteger(fallback) ? fallback : Date.now()
}

function safeArguments(value) {
  if (typeof value === 'string') return truncateText(value, MAX_TOOL_ARGUMENT_CHARS)
  try {
    const serialized = JSON.stringify(value ?? {})
    return typeof serialized === 'string' ? truncateText(serialized, MAX_TOOL_ARGUMENT_CHARS) : '{}'
  } catch {
    return '{}'
  }
}

function safeToolName(value) {
  const name = typeof value === 'string' ? value.trim() : ''
  return name || 'tool'
}

function sourceForSystemMessage() {
  return {
    kind: 'plugin',
    plugin: 'dsh-conversation-import',
    form: 'recall',
  }
}

/**
 * Convert ExternalConversationV2 events to a valid DSH Session seed.
 *
 * The returned array intentionally does not include `session/end-seed` or
 * arbitrary import metadata. `Session` appends the seed marker itself and
 * rejects unknown envelope keys. Every message-producing event carries the
 * official surface marker and every message has a stable identity.
 */
export function convertExternalEventsToDshEvents(events, importMeta = {}) {
  if (!Array.isArray(events)) throw new TypeError('events must be an array')

  const importId = typeof importMeta.importId === 'string' && importMeta.importId.length > 0
    ? importMeta.importId
    : 'import-direct'
  const provider = typeof importMeta.provider === 'string' && importMeta.provider.length > 0
    ? importMeta.provider
    : DEFAULT_PROVIDER
  const model = typeof importMeta.model === 'string' && importMeta.model.length > 0
    ? importMeta.model
    : DEFAULT_MODEL
  const sourceSessionId = typeof importMeta.sourceSessionId === 'string' ? importMeta.sourceSessionId : ''

  const dshEvents = []
  const callIds = new Map()
  let lastCallId
  let turn = 1
  let step = 1
  let inTurn = false
  let inStep = false
  let clock = Date.now()
  let seedBytes = 0
  let truncated = false
  let truncationNoticeAppended = false

  const append = (type, data, { surface = false, time, ignorable = false, force = false } = {}) => {
    const event = {
      type,
      seq: dshEvents.length,
      time: finiteTimestamp(time, clock),
      data,
      ...(surface ? { surfaceOp: 'append' } : {}),
      ...(ignorable ? { ignorable: true } : {}),
    }
    const eventBytes = Buffer.byteLength(JSON.stringify(event), 'utf8')
    const byteLimit = force ? TRANSCRIPT_IMPORT_MAX_SEED_BYTES : TRANSCRIPT_IMPORT_MAX_SEED_BYTES - SEED_RESERVE_BYTES
    const structural = type === 'turn/start'
      || type === 'turn/end'
      || type === 'step/start'
      || type === 'step/end'
    if (!force && !structural && seedBytes + eventBytes > byteLimit) {
      truncated = true
      return undefined
    }
    if (seedBytes + eventBytes > TRANSCRIPT_IMPORT_MAX_SEED_BYTES && !force) {
      truncated = true
      return undefined
    }
    dshEvents.push(event)
    seedBytes += eventBytes
    clock = event.time
    return event
  }

  const closeStep = (time) => {
    if (!inStep) return
    append('step/end', { turn, step }, { time, ignorable: true })
    inStep = false
  }

  const closeTurn = (time) => {
    if (!inTurn) return
    closeStep(time)
    append('turn/end', { turn, reason: { kind: 'completed' } }, { time, ignorable: true })
    inTurn = false
    turn += 1
    step = 1
  }

  const ensureTurn = (time) => {
    if (inTurn) return
    append('turn/start', { turn }, { time, ignorable: true })
    inTurn = true
  }

  const ensureStep = (time) => {
    ensureTurn(time)
    if (inStep) return
    append('step/start', { turn, step }, { time, ignorable: true })
    inStep = true
  }

  const resolveCallId = (event, index) => {
    const raw = typeof event?.toolCallId === 'string' && event.toolCallId.length > 0
      ? event.toolCallId
      : undefined
    if (raw !== undefined) {
      const existing = callIds.get(raw)
      if (existing !== undefined) return existing
      const stable = callId(importId, sourceSessionId, raw, event, index)
      callIds.set(raw, stable)
      return stable
    }
    return lastCallId ?? callId(importId, sourceSessionId, undefined, event, index)
  }

  const appendAssistant = (event, index, content, time, suffix = 'assistant') => {
    append('assistant/message', {
      turn,
      step,
      message: {
        id: messageId(importId, sourceSessionId, event, index, suffix),
        role: 'assistant',
        content,
        source: { kind: 'model', provider, model },
      },
    }, { surface: true, time })
  }

  for (let index = 0; index < events.length; index += 1) {
    if (seedBytes >= TRANSCRIPT_IMPORT_MAX_SEED_BYTES - SEED_RESERVE_BYTES) {
      truncated = true
      break
    }
    const event = events[index]
    if (!event || typeof event !== 'object') continue
    const eventTime = finiteTimestamp(event.sourceTimestamp, clock)

    if (event.type === EVENT_TYPES.MESSAGE && event.role === EVENT_ROLES.USER) {
      closeTurn(eventTime)
      ensureTurn(eventTime)
      append('user/message', {
        id: messageId(importId, sourceSessionId, event, index, 'user'),
        role: 'user',
        content: [{ type: 'text', text: textValue(event.content) }],
        source: { kind: 'user' },
      }, { surface: true, time: eventTime })
      continue
    }

    if (event.type === EVENT_TYPES.MESSAGE && event.role === EVENT_ROLES.ASSISTANT) {
      ensureStep(eventTime)
      appendAssistant(event, index, [{ type: 'text', text: textValue(event.content) }], eventTime)
      continue
    }

    if (event.type === EVENT_TYPES.TOOL_CALL) {
      ensureStep(eventTime)
      const stableCallId = resolveCallId(event, index)
      lastCallId = stableCallId
      const name = safeToolName(event.toolName)
      const args = safeArguments(event.toolArgs)

      // The assistant surface carries the tool-call block so a resumed model
      // receives the same assistant request that preceded the result.
      appendAssistant(event, index, [{ type: 'tool-call', id: stableCallId, name, arguments: args }], eventTime, 'tool-call')
      append('tool/call', {
        turn,
        step,
        callId: stableCallId,
        name,
        arguments: args,
      }, { time: eventTime, ignorable: true })
      continue
    }

    if (event.type === EVENT_TYPES.TOOL_RESULT) {
      ensureStep(eventTime)
      const stableCallId = resolveCallId(event, index)
      const resultText = textValue(event.toolResult, MAX_TOOL_RESULT_CHARS)
      const isError = event.toolStatus === TOOL_STATUS.ERROR || event.toolStatus === TOOL_STATUS.ABORTED
      append('tool/result', {
        turn,
        step,
        message: {
          id: messageId(importId, sourceSessionId, event, index, 'tool-result'),
          role: 'user',
          content: [{
            type: 'tool-result',
            toolCallId: stableCallId,
            content: [{ type: 'text', text: resultText }],
            ...(isError ? { isError: true } : {}),
          }],
          source: { kind: 'tool', callId: stableCallId },
        },
        ...(isError ? { error: { name: 'ToolError', code: 'TOOL_EXECUTION_ERROR' } } : {}),
      }, { surface: true, time: eventTime })
      lastCallId = stableCallId
      continue
    }

    if (event.type === EVENT_TYPES.SYSTEM) {
      ensureTurn(eventTime)
      append('user/message', {
        id: messageId(importId, sourceSessionId, event, index, 'system'),
        role: 'user',
        content: [{ type: 'text', text: `[System Context]\n${textValue(event.content)}` }],
        source: sourceForSystemMessage(),
      }, { surface: true, time: eventTime })
    }
  }

  if (truncated && !truncationNoticeAppended) {
    ensureStep(clock)
    const marker = append('user/message', {
      id: messageId(importId, sourceSessionId, { eventId: 'truncation-marker' }, dshEvents.length, 'truncated'),
      role: 'user',
      content: [{ type: 'text', text: '[Imported transcript reached the safe size limit; the remaining source history was not copied.]' }],
      source: sourceForSystemMessage(),
    }, { surface: true, time: clock, force: true })
    truncationNoticeAppended = marker !== undefined
  }
  closeTurn(clock)
  Object.defineProperty(dshEvents, 'truncated', {
    enumerable: false,
    configurable: false,
    get: () => truncated,
  })
  Object.defineProperty(dshEvents, 'byteLength', {
    enumerable: false,
    configurable: false,
    get: () => seedBytes,
  })
  return dshEvents
}

/**
 * Validate whether an import chunk conforms to sequence and integrity
 * constraints in the external IR. Chunk sequences remain one-based because
 * that is the adapter-facing schema; the DSH seed converter owns zero-based
 * session event sequences.
 */
export function validateImportChunk(chunk, expectedSeqStart) {
  if (!chunk || !Array.isArray(chunk.events)) {
    throw new TypeError('chunk.events must be an array')
  }
  if (chunk.events.length === 0) return true

  for (let i = 0; i < chunk.events.length; i += 1) {
    const event = chunk.events[i]
    const expectedSeq = expectedSeqStart + i
    if (event.sequence !== expectedSeq) {
      throw new Error(`sequence mismatch: expected ${expectedSeq}, got ${event.sequence}`)
    }
    if (!event.eventId) {
      throw new Error(`missing eventId at sequence ${event.sequence}`)
    }
  }
  return true
}
