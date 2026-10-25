import { waitForAsyncPageFunction } from './async-page-predicate.mjs'

export async function skinBackgroundMatches(values) {
  const response = await fetch('/api/skin-center/v2/active', { method: 'GET', cache: 'no-store' })
  const payload = await response.json().catch(() => null)
  const background = payload?.background
  if (response.ok !== true || payload?.ok !== true || background === null
    || typeof background !== 'object' || Array.isArray(background)) return false
  return Object.entries(values).every(([field, value]) => Object.hasOwn(background, field) && background[field] === value)
}

export async function waitForBackgroundSettings(page, expected) {
  await waitForAsyncPageFunction(page, skinBackgroundMatches, expected, { timeout: 30_000 })
}
