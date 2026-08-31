/**
 * Compact display formatters for the usage center. Raw token counts and
 * 4-decimal costs are hard to scan; these keep values readable while the
 * exact figure stays available via the element's title attribute.
 */

/** Round to one decimal and drop a trailing ".0". */
function trimDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** Fixed-precision string with trailing zeros stripped. */
function trimFixed(value: number, digits: number): string {
  return value.toFixed(digits).replace(/0+$/u, '').replace(/\.$/u, '')
}

/** 9,999 -> "9,999"; 12,345 -> "1.2万"; 123,456,789 -> "1.2亿". */
export function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value < 10_000) return Math.round(value).toLocaleString()
  if (value < 100_000_000) return `${trimDecimal(value / 10_000)}万`
  return `${trimDecimal(value / 100_000_000)}亿`
}

/** Adaptive-precision cost: 2 decimals at >= 1, up to 4 below, dust marker under 0.0001. */
export function formatCost(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value >= 1) return value.toFixed(2)
  if (value >= 0.0001) return trimFixed(value, 4)
  return '<0.0001'
}

/** Balance strings come from the provider API as plain decimals; pair them with a currency mark. */
export function formatBalanceAmount(value: string, currency: string): string {
  if (value === '--' || value === '') return '--'
  const code = currency.toUpperCase()
  if (code === 'CNY' || code === 'RMB') return `¥${value}`
  if (code === 'USD') return `$${value}`
  return `${value} ${currency}`
}
