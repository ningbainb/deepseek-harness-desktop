// Shared, content-free update diagnostic contract for Desktop and the Worker.
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,20})?$/u
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u
const STAGES = ['check', 'download', 'verify', 'prepare', 'install', 'complete', 'unknown']
const TYPES = ['none', 'network', 'timeout', 'http', 'rate_limit', 'metadata', 'checksum', 'signature', 'permission', 'file_busy', 'disk_full', 'prepare_timeout', 'launch_timeout', 'cancelled', 'unknown']
const CODES = new Set(['none', 'unknown', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'EACCES', 'EPERM', 'EBUSY', 'ENOSPC', 'ERR_CONNECTION_RESET', 'ERR_CONNECTION_REFUSED', 'ERR_CONNECTION_CLOSED', 'ERR_NAME_NOT_RESOLVED', 'ERR_INTERNET_DISCONNECTED', 'ERR_PROXY_CONNECTION_FAILED', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_TIMED_OUT', 'ERR_CONNECTION_TIMED_OUT', 'ERR_CERT_AUTHORITY_INVALID', 'ERR_CERT_DATE_INVALID', 'ERR_UPDATER_INVALID_RELEASE_FEED', 'ERR_UPDATER_INVALID_VERSION', 'ERR_UPDATER_NO_PUBLISHED_VERSIONS', 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND', 'ERR_UPDATER_INVALID_UPDATE_INFO', 'ERR_UPDATER_NO_FILES_PROVIDED', 'ERR_UPDATER_CHECKSUM_MISMATCH', 'ERR_UPDATER_INVALID_SIGNATURE', 'ERR_UPDATER_INVALID_INSTALLER', 'UPDATE_PREPARATION_TIMEOUT', 'UPDATE_INSTALL_LAUNCH_TIMEOUT', 'ABORT_ERR'])
const FIELDS = ['attempt_id', 'stage', 'error_type', 'error_code', 'source_version', 'target_version', 'source', 'source_attempt', 'update_channel', 'timestamp']
export const UPDATE_DIAGNOSTIC_EVENTS = Object.freeze(['update_result', 'update_available', 'update_downloaded', 'update_install_requested', 'update_error', 'update_completed'])

export function validUpdateDiagnostic(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === FIELDS.length && FIELDS.every(key => Object.hasOwn(value, key))
    && typeof value.attempt_id === 'string' && UUID.test(value.attempt_id)
    && STAGES.includes(value.stage) && TYPES.includes(value.error_type)
    && typeof value.error_code === 'string' && (CODES.has(value.error_code) || /^HTTP_[45]\d\d$/u.test(value.error_code))
    && typeof value.source_version === 'string' && VERSION.test(value.source_version)
    && typeof value.target_version === 'string' && (value.target_version === 'unknown' || VERSION.test(value.target_version))
    && ['github', 'configured_mirror', 'unknown'].includes(value.source)
    && Number.isInteger(value.source_attempt) && value.source_attempt >= 0 && value.source_attempt <= 100
    && ['stable', 'beta'].includes(value.update_channel)
    && typeof value.timestamp === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value.timestamp) && Number.isFinite(Date.parse(value.timestamp))
    && (value.error_type === 'none' ? value.error_code === 'none' : value.error_code !== 'none')
}

export function classifyUpdateError(error) {
  if (!error) return { error_type: 'none', error_code: 'none' }
  const message = String(error.message ?? error).slice(0, 16_000)
  const rawCode = String(error.code ?? '').toUpperCase()
  const knownCode = CODES.has(rawCode) ? rawCode : [...CODES].find(code => !['none', 'unknown'].includes(code) && new RegExp(`\\b${code}\\b`, 'u').test(message))
  let code = knownCode ?? 'unknown'
  const http = Number(error.statusCode ?? error.status ?? message.match(/(?:HTTP(?:\s+error)?|status(?:\s+code)?)\s*[:=]?\s*([45]\d\d)\b/iu)?.[1] ?? message.match(/^([45]\d\d)\s+[A-Za-z]/u)?.[1])
  if (Number.isInteger(http) && http >= 400 && http <= 599) code = `HTTP_${http}`
  let type = 'unknown'
  // Prefer machine codes over words that may occur in a file path or URL.
  if (code !== 'unknown') {
    const types = { UPDATE_PREPARATION_TIMEOUT: 'prepare_timeout', UPDATE_INSTALL_LAUNCH_TIMEOUT: 'launch_timeout',
      ERR_UPDATER_CHECKSUM_MISMATCH: 'checksum', ERR_UPDATER_INVALID_SIGNATURE: 'signature',
      EACCES: 'permission', EPERM: 'permission', EBUSY: 'file_busy', ENOSPC: 'disk_full', ABORT_ERR: 'cancelled' }
    type = types[code] ?? (code === 'HTTP_429' ? 'rate_limit' : code.startsWith('HTTP_') ? 'http'
      : /TIMED?_?OUT|ETIMEDOUT/u.test(code) ? 'timeout' : code.startsWith('ERR_UPDATER_') ? 'metadata' : 'network')
    return { error_type: type, error_code: code }
  }
  if (code === 'UPDATE_PREPARATION_TIMEOUT' || /update preparation did not finish before the timeout/iu.test(message)) { type = 'prepare_timeout'; code = 'UPDATE_PREPARATION_TIMEOUT' }
  else if (code === 'UPDATE_INSTALL_LAUNCH_TIMEOUT' || /update installer did not start before the launch timeout/iu.test(message)) { type = 'launch_timeout'; code = 'UPDATE_INSTALL_LAUNCH_TIMEOUT' }
  else if (/checksum|sha(?:256|512).*mismatch/iu.test(message) || code === 'ERR_UPDATER_CHECKSUM_MISMATCH') type = 'checksum'
  else if (/signature|not signed|publisher/iu.test(message) || code === 'ERR_UPDATER_INVALID_SIGNATURE') type = 'signature'
  else if (code === 'HTTP_429') type = 'rate_limit'
  else if (code.startsWith('HTTP_')) type = 'http'
  else if (['EACCES', 'EPERM'].includes(code) || /access (?:is )?denied|permission denied/iu.test(message)) type = 'permission'
  else if (code === 'EBUSY' || /file.*(?:in use|being used)|resource busy/iu.test(message)) type = 'file_busy'
  else if (code === 'ENOSPC' || /no space left|disk.*full/iu.test(message)) type = 'disk_full'
  else if (/TIMED?_?OUT|ETIMEDOUT/u.test(code) || /timed? out|timeout/iu.test(message)) type = 'timeout'
  else if (code === 'ABORT_ERR' || /cancelled|canceled/iu.test(message)) type = 'cancelled'
  else if (code.startsWith('ERR_UPDATER_')) type = 'metadata'
  else if (code !== 'unknown' || /net::ERR_|connection reset|network|socket hang up/iu.test(message)) type = 'network'
  return { error_type: type, error_code: code }
}

export function updateDiagnostic({ attemptId, stage, sourceVersion, targetVersion, source = 'github', sourceAttempt = 0, channel = 'stable', error, timestamp = new Date().toISOString() }) {
  const failure = classifyUpdateError(error)
  const value = {
    attempt_id: attemptId,
    stage: stage === 'download' && ['checksum', 'signature'].includes(failure.error_type) ? 'verify' : stage,
    ...failure,
    source_version: sourceVersion,
    target_version: typeof targetVersion === 'string' && VERSION.test(targetVersion) ? targetVersion : 'unknown',
    source, source_attempt: Math.min(100, Math.max(0, Math.trunc(sourceAttempt))), update_channel: channel, timestamp,
  }
  return validUpdateDiagnostic(value) ? Object.freeze(value) : undefined
}

export function validUpdateEventDiagnostic(event) {
  return UPDATE_DIAGNOSTIC_EVENTS.includes(event.name) && validUpdateDiagnostic(event.update)
    && (event.name === 'update_error' ? event.update.error_type !== 'none' : event.update.error_type === 'none')
    && (event.name === 'update_completed' ? event.update.stage === 'complete' && event.appVersion === event.update.target_version : event.appVersion === event.update.source_version)
}
