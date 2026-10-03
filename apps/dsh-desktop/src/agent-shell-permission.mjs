import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from './atomic-write-adapter.mjs'

export const AGENT_SHELL_PERMISSION_FILE = 'desktop-agent-shell.json'
export const AGENT_SHELL_PERMISSION_MODES = Object.freeze(['off', 'ask', 'allow'])

export function agentShellPermissionPath(dshHome) {
  if (typeof dshHome !== 'string' || dshHome.length === 0) throw new TypeError('DSH home is required')
  return join(dshHome, AGENT_SHELL_PERMISSION_FILE)
}

export function parseAgentShellPermission(raw) {
  if (raw === undefined) return Object.freeze({ mode: 'ask', valid: true })
  try {
    const value = JSON.parse(raw)
    if (value?.version === 1 && AGENT_SHELL_PERMISSION_MODES.includes(value.mode)) {
      return Object.freeze({ mode: value.mode, valid: true })
    }
  } catch {}
  return Object.freeze({ mode: 'off', valid: false })
}

export class AgentShellPermissionStore {
  #path
  #writeQueue = Promise.resolve()

  constructor({ dshHome }) {
    this.#path = agentShellPermissionPath(dshHome)
  }

  async status() {
    let raw
    try {
      raw = await readFile(this.#path, 'utf8')
    } catch (error) {
      if (error?.code !== 'ENOENT') return Object.freeze({ mode: 'off', valid: false })
    }
    return parseAgentShellPermission(raw)
  }

  async setMode(mode) {
    if (!AGENT_SHELL_PERMISSION_MODES.includes(mode)) throw new TypeError('unknown Agent shell permission mode')
    const operation = this.#writeQueue.then(async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          await writeFileAtomic(this.#path, `${JSON.stringify({ version: 1, mode })}\n`, { mode: 0o600, dirMode: 0o700 })
          break
        } catch (error) {
          if (process.platform !== 'win32' || !['EACCES', 'EBUSY', 'EPERM'].includes(error?.code) || attempt >= 4) throw error
          await new Promise(resolve => setTimeout(resolve, 50 + Math.floor(Math.random() * 150)))
        }
      }
      return this.status()
    })
    this.#writeQueue = operation.catch(() => {})
    return operation
  }
}
