import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { normalizeTerminalShellId } from './terminal-session.mjs'

export class TerminalShellPreferencesStore {
  constructor(path) {
    if (typeof path !== 'string' || path.length === 0) throw new TypeError('terminal shell preferences path is required')
    this.path = path
    this.writeQueue = Promise.resolve()
  }

  async load() {
    try {
      const value = JSON.parse(await readFile(this.path, 'utf8'))
      return normalizeTerminalShellId(value?.shellId)
    } catch {
      return 'auto'
    }
  }

  save(value) {
    const shellId = normalizeTerminalShellId(value)
    const operation = this.writeQueue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true })
      const temporary = `${this.path}.${process.pid}.${Date.now()}.tmp`
      try {
        await writeFile(temporary, `${JSON.stringify({ shellId })}\n`, { flag: 'wx' })
        await rename(temporary, this.path)
      } finally {
        await rm(temporary, { force: true }).catch(() => {})
      }
      return shellId
    })
    this.writeQueue = operation.catch(() => {})
    return operation
  }
}
