import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

export { withFileLock, writeFileAtomic }

export function writePrivateJson(path, value) {
  return writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
}
