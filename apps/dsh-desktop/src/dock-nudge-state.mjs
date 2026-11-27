import { writePrivateJson } from './atomic-write-adapter.mjs'
import { readFile } from 'node:fs/promises'

export const DOCK_NUDGE_LAUNCH_LIMIT = 3

function shownLaunchesOf(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).length !== 2
    || value.schemaVersion !== 1
    || !Number.isInteger(value.shownLaunches)
    || value.shownLaunches < 0
    || value.shownLaunches > DOCK_NUDGE_LAUNCH_LIMIT
  ) return undefined
  return value.shownLaunches
}

/** Persists only how many app launches actually displayed the Dock nudge. */
export class DockNudgeStore {
  #claim
  #dismissed = false

  constructor({ path } = {}) {
    if (typeof path !== 'string' || path.length === 0) {
      throw new TypeError('Dock nudge state path is required')
    }
    this.path = path
  }

  async claimLaunch() {
    this.#claim ??= this.#claimLaunch()
    const eligible = await this.#claim
    return eligible && !this.#dismissed
  }

  async dismiss() {
    if (this.#claim === undefined || this.#dismissed) return false
    const eligible = await this.#claim
    if (!eligible || this.#dismissed) return false
    this.#dismissed = true
    return true
  }

  async #claimLaunch() {
    let shownLaunches = 0
    try {
      const stored = shownLaunchesOf(JSON.parse(await readFile(this.path, 'utf8')))
      if (stored === undefined) return false
      shownLaunches = stored
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        if (error instanceof SyntaxError) return false
        throw error
      }
    }
    if (shownLaunches >= DOCK_NUDGE_LAUNCH_LIMIT) return false
    await writePrivateJson(this.path, {
      schemaVersion: 1,
      shownLaunches: shownLaunches + 1,
    })
    return true
  }
}
