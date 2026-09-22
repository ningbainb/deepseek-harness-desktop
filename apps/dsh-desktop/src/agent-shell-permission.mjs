import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

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
      const temporary = join(dirname(this.#path), `.desktop-agent-shell-${randomUUID()}.tmp`)
      try {
        await writeFile(temporary, `${JSON.stringify({ version: 1, mode })}\n`, { encoding: 'utf8', flag: 'wx' })
        await rename(temporary, this.#path)
      } catch (error) {
        await rm(temporary, { force: true }).catch(() => {})
        throw error
      }
      return this.status()
    })
    this.#writeQueue = operation.catch(() => {})
    return operation
  }
}
