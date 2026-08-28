/**
 * External Conversation Import Schema and Constants (V1).
 * Normalized internal IR for multi-agent context handoff.
 */

export const IMPORT_SCHEMA_VERSION = 1
export const IMPORT_ADAPTER_VERSION = '1.0.0'

export const SOURCE_KINDS = Object.freeze({
  CLAUDE_CODE: 'claude-code',
  CODEX: 'codex',
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
  VERIFYING: 'verifying',
  COMMITTING_LEDGER: 'committing-ledger',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
})

export const LEDGER_STATUS = Object.freeze({
  IMPORTED: 'imported',
  SOURCE_UPDATED: 'source-updated',
  FAILED: 'failed',
})

export const IMPORT_LIMITS = Object.freeze({
  MAX_FILE_SIZE_BYTES: 150 * 1024 * 1024, // 150MB
  MAX_LINE_LENGTH_BYTES: 1024 * 1024, // 1MB per JSON line
  MAX_PROJECTS: 200,
  MAX_SESSIONS_PER_PROJECT: 1000,
  MAX_EVENTS_PER_SESSION: 5000,
  MAX_MESSAGES_SAVED: 300,
  PLAN_TTL_MS: 15 * 60 * 1000, // 15 min
})

/**
 * Validate that an object conforms to ExternalConversationV1 structure.
 */
export function validateExternalConversationV1(conv) {
  if (!conv || typeof conv !== 'object') {
    throw new TypeError('ExternalConversation must be a non-null object')
  }
  if (conv.schemaVersion !== IMPORT_SCHEMA_VERSION) {
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
