import { mkdir } from 'node:fs/promises'

/** Share only directory creation within one profile reconciliation invocation. */
export function createProfileDirectoryPreparer(createDirectory = mkdir) {
  const pending = new Map()
  return function prepareDirectory(path) {
    if (!pending.has(path)) pending.set(path, Promise.resolve().then(() => createDirectory(path, { recursive: true })))
    return pending.get(path)
  }
}
