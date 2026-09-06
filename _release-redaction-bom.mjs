/**
 * Centralized Secret Redaction for Conversation Import.
 * Strips API keys, OAuth tokens, authorization headers, passwords, cookies,
 * private keys, and environment secret dumps from all imported content.
 */

const PRIVATE_KEY_PATTERN = /-----BEGIN\s+[A-Z0-9\s_-]+PRIVATE\s+KEY-----[\s\S]*?-----END\s+[A-Z0-9\s_-]+PRIVATE\s+KEY-----/gu

const AUTH_HEADER_PATTERN = /(?:authorization|proxy-authorization)\s*:\s*(?:bearer|basic)\s+[^\s\r\n]+/giu
const BEARER_TOKEN_PATTERN = /\b(?:bearer\s+[a-zA-Z0-9._~+/-]{16,})\b/giu
const JWT_PATTERN = /\b(?:eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9._~+/-]{10,})\b/gu

const KNOWN_API_KEYS = [
  // OpenAI / Anthropic / DeepSeek / Google / GitHub tokens
  /\b(?:sk-[a-zA-Z0-9_-]{20,})\b/gu,
  /\b(?:ghp_[a-zA-Z0-9]{20,}|gho_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{22,})\b/gu,
  /\b(?:xox[baprs]-[a-zA-Z0-9_-]{10,})\b/gu,
  /\b(?:AIzaSy[a-zA-Z0-9_-]{33})\b/gu,
]

// Keep this list deliberately key-oriented. It is shared by the textual
// matcher and redactObject, so JSON payloads and nested tool arguments follow
// the same policy instead of relying on the caller to redact each field.
const SECRET_KEY_PATTERN = 'api[-_]?key|api[-_]?secret|access[-_]?token|auth[-_]?token|authorization|proxy[-_]?authorization|secret[-_]?key|password|passwd|pwd|client[-_]?secret|session[-_]?token|private[-_]?key|credential|cookie|database[-_]?url|connection[-_]?string|dsn|token'

// Match JSON keys, YAML keys, and shell-like fields with quoted values.
const QUOTED_KEY_VALUE_SECRET_PATTERN = new RegExp(
  '(\\b(?:' + SECRET_KEY_PATTERN + ')\\b\\s*(?:["\']\\s*)?[:=]\\s*)(["\'])([\\s\\S]*?)\\2',
  'giu',
)
const UNQUOTED_KEY_VALUE_SECRET_PATTERN = new RegExp(
  '(\\b(?:' + SECRET_KEY_PATTERN + ')\\b\\s*(?:["\']\\s*)?[:=]\\s*)(?!["\'])([^\\s,;}\\]]+)',
  'giu',
)

// Environment assignments commonly appear with an export prefix or
// indentation in copied shell output. Include URL/DSN-style names because
// their values can contain database credentials even when no token is present.
const ENV_ASSIGNMENT_PATTERN = new RegExp(
  '(^|[\\r\\n])(\\s*(?:export\\s+)?[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|AUTH|PRIVATE|CREDENTIAL|COOKIE|DATABASE|DSN)[A-Z0-9_]*\\s*=\\s*)(["\'])([^"\'\\r\\n]*?)\\3',
  'gim',
)
const UNQUOTED_ENV_ASSIGNMENT_PATTERN = new RegExp(
  '(^|[\\r\\n])(\\s*(?:export\\s+)?[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|AUTH|PRIVATE|CREDENTIAL|COOKIE|DATABASE|DSN)[A-Z0-9_]*\\s*=\\s*)(?!["\'])([^\\s\\r\\n]+)',
  'gim',
)

const SENSITIVE_OBJECT_KEY_PATTERN = new RegExp(
  '(?:^|[-_])(?:' + SECRET_KEY_PATTERN + ')(?:$|[-_])',
  'iu',
)

export class Redactor {
  /**
   * Redact all discovered secrets from a text string.
   * @param {string} text - The input text containing potential credentials.
   * @returns {string} - The sanitized text with credentials masked.
   */
  static redact(text) {
    if (typeof text !== 'string' || text.length === 0) return ''

    let result = text

    // 1. Private keys
    result = result.replace(PRIVATE_KEY_PATTERN, '[REDACTED_PRIVATE_KEY]')

    // 2. Auth headers & standalone Bearer tokens / JWTs
    result = result.replace(AUTH_HEADER_PATTERN, 'authorization: [REDACTED_AUTH]')
    result = result.replace(BEARER_TOKEN_PATTERN, 'Bearer [REDACTED_AUTH]')
    result = result.replace(JWT_PATTERN, '[REDACTED_JWT]')

    // 3. Known API key formats
    for (const pattern of KNOWN_API_KEYS) {
      result = result.replace(pattern, '[REDACTED_API_KEY]')
    }

    // 4. Key-Value secret pairs, including JSON keys and quoted values with
    // spaces. The unquoted form stops at common structural delimiters.
    result = result.replace(QUOTED_KEY_VALUE_SECRET_PATTERN, '$1$2[REDACTED_SECRET]$2')
    result = result.replace(UNQUOTED_KEY_VALUE_SECRET_PATTERN, '$1[REDACTED_SECRET]')

    // 5. Raw .env assignments
    result = result.replace(ENV_ASSIGNMENT_PATTERN, '$1$2$3[REDACTED_SECRET]$3')
    result = result.replace(UNQUOTED_ENV_ASSIGNMENT_PATTERN, '$1$2[REDACTED_SECRET]')

    return result
  }

  /**
   * Redact all string values deeply within an object or array.
   */
  static redactObject(obj, depth = 0) {
    if (depth > 20) return '[REDACTED_MAX_DEPTH]'
    if (typeof obj === 'string') {
      return Redactor.redact(obj)
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => Redactor.redactObject(item, depth + 1))
    }
    if (obj !== null && typeof obj === 'object') {
      const sanitized = {}
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = SENSITIVE_OBJECT_KEY_PATTERN.test(key)
          ? '[REDACTED_SECRET]'
          : Redactor.redactObject(value, depth + 1)
      }
      return sanitized
    }
    return obj
  }
}
