import { setTimeout as delay } from 'node:timers/promises'

export async function waitForAsyncPageFunction(page, predicate, argument, { timeout = 30_000, polling = 100 } = {}) {
  if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isFinite(polling) || polling <= 0) {
    throw new TypeError('Async page predicate timeout and polling must be positive finite numbers')
  }
  let settled = false
  let timer
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Async page predicate did not become truthy within ${timeout}ms`)
      error.code = 'ERR_ASYNC_PREDICATE_TIMEOUT'
      reject(error)
    }, timeout)
  })
  const poll = async () => {
    while (!settled) {
      let value
      try {
        value = await page.evaluate(predicate, argument)
      } catch (error) {
        if (!/Execution context was destroyed|Cannot find context with specified id/u.test(error.message)) throw error
      }
      if (settled) return undefined
      if (value) return value
      await delay(polling)
    }
  }
  try {
    return await Promise.race([poll(), deadline])
  } finally {
    settled = true
    clearTimeout(timer)
  }
}
