export function iconAssetBytesEqual(path, actual, expected) {
  if (!Buffer.isBuffer(actual) || !Buffer.isBuffer(expected)) return false
  if (!path.endsWith('.ts')) return actual.equals(expected)
  return actual.toString('utf8').replace(/\r\n/gu, '\n') === expected.toString('utf8').replace(/\r\n/gu, '\n')
}
