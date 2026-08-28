/**
 * Import Token Budgeter.
 * Guarantees that the generated Handoff Context stays strictly bounded,
 * leaving ample context window for model reasoning, tools, and future turns.
 */

export const TOKEN_BUDGET_DEFAULTS = Object.freeze({
  TARGET_BUDGET_TOKENS: 6000,
  HARD_MAX_TOKENS: 10000,
  RECENT_TURNS_PRESERVED: 4,
})

export class ImportTokenBudgeter {
  /**
   * Fast estimate of token count for a text string.
   */
  static estimateTokens(text) {
    if (!text || typeof text !== 'string') return 0
    // Approximate: 1 token ~= 3.5 ASCII chars, or 1.5 CJK chars
    let cjkCount = 0
    let asciiCount = 0
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i)
      if (code >= 0x4e00 && code <= 0x9fa5) {
        cjkCount++
      } else {
        asciiCount++
      }
    }
    return Math.ceil(cjkCount / 1.5 + asciiCount / 3.5)
  }

  /**
   * Truncate a text string to stay within a maximum token limit.
   */
  static truncateToTokenBudget(text, maxTokens = TOKEN_BUDGET_DEFAULTS.HARD_MAX_TOKENS) {
    if (!text || typeof text !== 'string') return ''
    const currentEst = ImportTokenBudgeter.estimateTokens(text)
    if (currentEst <= maxTokens) return text

    // Proportional character truncation with ellipsis notice
    const ratio = maxTokens / currentEst
    const targetLength = Math.floor(text.length * ratio * 0.95)
    return text.slice(0, targetLength) + '\n\n[... historical context truncated for token budget ...]'
  }
}
