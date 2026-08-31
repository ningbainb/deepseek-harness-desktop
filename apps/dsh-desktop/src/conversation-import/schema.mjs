/**
 * External Conversation Import Schema and Constants (V1 & V2).
 * Normalized internal IR for multi-agent context handoff and transcript import.
 */

import { createHash } from 'node:crypto'

export const IMPORT_SCHEMA_VERSION_V1 = 1
export const IMPORT_SCHEMA_VERSION_V2 = 'external-conversation-v2'
export const IMPORT_SCHEMA_VERSION = IMPORT_SCHEMA_VERSION_V1
export const IMPORT_ADAPTER_VERSION = '2.0.0'

export const SOURCE_KINDS = Object.freeze({
  CLAUDE_CODE: 'claude-code',
  CODEX: 'codex',
})

export const EVENT_TYPES = Object.freeze({
  MESSAGE: 'message',
  TOOL_CALL: 'tool_call',
  TOOL_RESULT: 'tool_result',
  SYSTEM: 'system',
})

export const EVENT_ROLES = Object.freeze({
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  TOOL: 'tool',
})

export const TIMESTAMP_QUALITY = Object.freeze({
  EXACT: 'exact',
  INFERRED: 'inferred',
})

export const TOOL_STATUS = Object.freeze({
  SUCCESS: 'success',
  ERROR: 'error',
  ABORTED: 'aborted',
  UNKNOWN: 'unknown',
})

export const ADAPTER_STATUS = Object.freeze({
  RECOGNIZED: 'recognized',
  PARTIALLY_READABLE: 'partially-readable',
  UNSUPPORTED_VERSION: 'unsupported-version',
  CORRUPT: 'corrupt',
  UNAVAILABLE: 'unavailable',
})

export const MATCH_STATUS = Object.freeze({
  EXACT_PATH: 'exact-path',
  GIT_ROOT: 'git-root',
  GIT_REMOTE: 'git-remote',
  MANUAL_SELECTED: 'manual-selected',
  PATH_NOT_FOUND: 'path-not-found',
  MISMATCH: 'mismatch',
  UNKNOWN: 'unknown',
})

export const IMPORT_STATE = Object.freeze({
  IDLE: 'idle',
  PROBING: 'probing',
  DISCOVERING: 'discovering',
  READY: 'ready',
  PREVIEWING: 'previewing',
  PLANNING: 'planning',
  CONFIRMED: 'confirmed',
  RECONSTRUCTING: 'reconstructing',
  CREATING_SESSION: 'creating-session',
  SEEDING_CONTEXT: 'seeding-context',
  IMPORTING_TRANSCRIPT: 'importing-transcript',
  VERIFYING: 'verifying',
  COMMITTING_LEDGER: 'committing-ledger',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
})

export const LEDGER_STATUS = Object.freeze({
  IN_PROGRESS: 'in_progress',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  IMPORTED: 'imported',
  SOURCE_UPDATED: 'source-updated',
})

export const IMPORT_LIMITS = Object.freeze({
  MAX_FILE_SIZE_BYTES: 150 * 1024 * 1024, // 150MB
  // Codex Desktop keeps long-lived rollouts with large command outputs. They
  // are still parsed through the bounded line/event limits below, but should
  // not appear in the picker only to fail when the user selects them.
  MAX_CODEX_FILE_SIZE_BYTES: 4 * 1024 * 1024 * 1024, // 4GiB
  MAX_LINE_LENGTH_BYTES: 1024 * 1024, // 1MB per JSON line
  // Deep-search is a convenience filter, not the import path. Bound the
  // amount read from a very large source file so typing in the picker never
  // turns into a multi-gigabyte scan.
  MAX_SEARCH_FILE_BYTES: 32 * 1024 * 1024,
  // Prefer the most recently modified sessions and keep one query bounded
  // even when the source directory contains years of history.
  MAX_SEARCH_TOTAL_BYTES: 512 * 1024 * 1024,
  MAX_FIELD_LENGTH_CHARS: 500 * 1024, // 500k chars per field
  MAX_PROJECTS: 200,
  MAX_SESSIONS_PER_PROJECT: 1000,
  MAX_EVENTS_PER_SESSION: 5000,
  MAX_MESSAGES_SAVED: 1000,
  PLAN_TTL_MS: 15 * 60 * 1000, // 15 min
})

/**
 * Generate a deterministic stable eventId for an imported transcript event.
 */
export function generateStableEventId(sourceSessionId, sequence, sourceEventId = '') {
  const seed = `${sourceSessionId || 'unknown'}:${sequence}:${sourceEventId}`
  return createHash('sha256').update(seed).digest('hex').slice(0, 32)
}

/**
 * Create a validated ExternalConversationV2 transcript event.
 */
export function createTranscriptEvent({
  sequence,
  type,
  role,
  content = '',
  toolName,
  toolCallId,
  toolArgs,
  toolResult,
  toolStatus = TOOL_STATUS.UNKNOWN,
  sourceEventId,
  sourceTimestamp,
  timestampQuality = TIMESTAMP_QUALITY.INFERRED,
  sourceSessionId = '',
}) {
  if (typeof sequence !== 'number' || sequence < 1) {
    throw new TypeError(`sequence must be a positive integer: ${sequence}`)
  }
  if (!Object.values(EVENT_TYPES).includes(type)) {
    throw new TypeError(`invalid transcript event type: ${type}`)
  }

  const eventId = generateStableEventId(sourceSessionId, sequence, sourceEventId)

  const event = {
    eventId,
    sequence,
    type,
    historical: true,
    executable: false,
    timestampQuality: timestampQuality === TIMESTAMP_QUALITY.EXACT ? TIMESTAMP_QUALITY.EXACT : TIMESTAMP_QUALITY.INFERRED,
  }

  if (role) event.role = role
  if (content !== undefined && content !== null) {
    event.content = typeof content === 'string' ? content : JSON.stringify(content)
  }
  if (toolName) event.toolName = String(toolName)
  if (toolCallId) event.toolCallId = String(toolCallId)
  if (toolArgs !== undefined) event.toolArgs = toolArgs
  if (toolResult !== undefined) event.toolResult = toolResult
  if (toolStatus) event.toolStatus = toolStatus
  if (sourceEventId) event.sourceEventId = String(sourceEventId)
  if (typeof sourceTimestamp === 'number' && !Number.isNaN(sourceTimestamp)) {
    event.sourceTimestamp = Math.round(sourceTimestamp)
  }

  return event
}

/**
 * Compute stable transcript hash over all canonical events.
 */
export function computeTranscriptHash(events = []) {
  const hash = createHash('sha256')
  for (const ev of events) {
    const signature = `${ev.sequence}:${ev.type}:${ev.role || ''}:${ev.sourceEventId || ''}:${ev.content || ''}:${ev.toolName || ''}:${ev.toolCallId || ''}`
    hash.update(signature)
  }
  return hash.digest('hex')
}

/**
 * Validate that an object conforms to ExternalConversationV2 structure.
 */
export function validateExternalConversationV2(conv) {
  if (!conv || typeof conv !== 'object') {
    throw new TypeError('ExternalConversationV2 must be a non-null object')
  }
  if (conv.schemaVersion !== IMPORT_SCHEMA_VERSION_V2) {
    throw new TypeError(`Unsupported schema version: ${conv.schemaVersion}`)
  }
  if (!conv.source || typeof conv.source.kind !== 'string' || !conv.source.sessionId) {
    throw new TypeError('Invalid source metadata in ExternalConversationV2')
  }
  if (!conv.conversation || typeof conv.conversation !== 'object') {
    throw new TypeError('Invalid conversation metadata in ExternalConversationV2')
  }
  if (!Array.isArray(conv.events)) {
    throw new TypeError('events must be an array in ExternalConversationV2')
  }

  let lastSeq = 0
  for (const ev of conv.events) {
    if (!ev || typeof ev !== 'object') {
      throw new TypeError('event must be a non-null object')
    }
    if (typeof ev.sequence !== 'number' || ev.sequence !== lastSeq + 1) {
      throw new TypeError(`event sequence must be strictly sequential (expected ${lastSeq + 1}, got ${ev?.sequence})`)
    }
    lastSeq = ev.sequence
    if (!ev.eventId || typeof ev.eventId !== 'string') {
      throw new TypeError(`event at sequence ${ev.sequence} missing eventId`)
    }
    if (!Object.values(EVENT_TYPES).includes(ev.type)) {
      throw new TypeError(`event at sequence ${ev.sequence} has invalid type: ${ev.type}`)
    }
    if (ev.historical !== true || ev.executable !== false) {
      throw new TypeError(`event at sequence ${ev.sequence} must have historical: true and executable: false`)
    }
  }

  return true
}

/**
 * Validate that an object conforms to ExternalConversationV1 structure.
 */
export function validateExternalConversationV1(conv) {
  if (!conv || typeof conv !== 'object') {
    throw new TypeError('ExternalConversation must be a non-null object')
  }
  if (conv.schemaVersion !== IMPORT_SCHEMA_VERSION_V1) {
    throw new TypeError(`Unsupported schema version: ${conv.schemaVersion}`)
  }
  if (!conv.source || typeof conv.source.kind !== 'string' || !conv.source.sourceSessionId) {
    throw new TypeError('Invalid source metadata in ExternalConversation')
  }
  if (!Array.isArray(conv.messages)) {
    throw new TypeError('messages must be an array in ExternalConversation')
  }
  return true
}
