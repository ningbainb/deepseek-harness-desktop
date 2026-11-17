// The shared Models document also owns native catalog consumers. Count the
// Value Mode advisory loader through Chromium's actual async initiator, rather
// than treating every official model-page refresh as an advisory-cache miss.
export function isValueModeCatalogInitiator(stack) {
  for (let depth = 0; stack && depth < 32; depth++, stack = stack.parent) {
    if (stack.callFrames?.some(frame => frame.functionName === 'fetchModels'
      && typeof frame.url === 'string' && frame.url.includes('@linxin666/dsh-value-mode/client.js'))) return true
  }
  return false
}
