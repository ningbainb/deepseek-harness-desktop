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

const KEY_VALUE_SECRET_PATTERN = /(?:\b(?:api[-_]?key|access[-_]?token|auth[-_]?token|secret[-_]?key|password|passwd|client[-_]?secret|session[-_]?token|private[-_]?key)\b\s*[:=]\s*["']?)([^"'\s\r\n]{6,})(["']?)/giu

const ENV_ASSIGNMENT_PATTERN = /(?:^|\n)\s*(?:[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|AUTH|PRIVATE)[A-Z0-9_]*)\s*=\s*(?:["'][^"'\r\n]+["']|[^\s\r\n]+)/giu

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

    // 4. Key-Value secret pairs (e.g. password=xyz, apiKey: "xyz")
    result = result.replace(KEY_VALUE_SECRET_PATTERN, (match, secretVal, quote) => {
      const prefix = match.slice(0, match.length - secretVal.length - (quote ? quote.length : 0))
      return `${prefix}[REDACTED_SECRET]${quote || ''}`
    })

    // 5. Raw .env assignments
    result = result.replace(ENV_ASSIGNMENT_PATTERN, (match) => {
      const equalsIndex = match.indexOf('=')
      if (equalsIndex === -1) return match
      const keyPart = match.slice(0, equalsIndex + 1)
      return `${keyPart} [REDACTED_SECRET]`
    })

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
        sanitized[key] = Redactor.redactObject(value, depth + 1)
      }
      return sanitized
    }
    return obj
  }
}
