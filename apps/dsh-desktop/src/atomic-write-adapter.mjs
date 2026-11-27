import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'

export { withFileLock, writeFileAtomic }

/** Use the desktop's historical fs.writeFile and mkdir permissions unless a caller selects a private policy. */
export function writeJsonAtomic(path, value, options = { mode: 0o666 }) {
  return writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`, options)
}

export function writePrivateJson(path, value) {
  return writeJsonAtomic(path, value, { mode: 0o600, dirMode: 0o700 })
}
