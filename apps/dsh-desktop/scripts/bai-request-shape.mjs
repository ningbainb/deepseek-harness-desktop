import assert from 'node:assert/strict'

export function baiRequestShape(calls, defaultMaxTokens) {
  assert.ok(Number.isSafeInteger(defaultMaxTokens) && defaultMaxTokens > 0, 'the public provider output limit must be a positive integer')
  return calls.map(({ model, maxTokens }) => {
    assert.equal(typeof model, 'string')
    assert.ok(model.length > 0)
    const effectiveMaxTokens = maxTokens ?? defaultMaxTokens
    assert.ok(Number.isSafeInteger(effectiveMaxTokens) && effectiveMaxTokens > 0, 'each effective request output limit must be a positive integer')
    return { model, maxTokens: effectiveMaxTokens }
  }).sort((first, second) => first.model.localeCompare(second.model) || first.maxTokens - second.maxTokens)
}
