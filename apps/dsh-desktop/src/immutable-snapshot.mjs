/** Copy a tree of record and array data before exposing it to a caller. */
export function immutableSnapshot(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableSnapshot))
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, item]) => [key, immutableSnapshot(item)])
    return Object.freeze(Object.fromEntries(entries))
  }
  return value
}
