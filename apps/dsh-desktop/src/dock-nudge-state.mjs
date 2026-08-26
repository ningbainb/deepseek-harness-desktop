import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

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

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const suffix = `${process.pid}-${Date.now()}-${randomBytes(6).toString('hex')}`
  const temporary = `${path}.tmp-${suffix}`
  const backup = `${path}.bak-${suffix}`
  await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  let movedExisting = false
  try {
    try {
      await rename(path, backup)
      movedExisting = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await rename(temporary, path)
    if (movedExisting) await rm(backup, { force: true })
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    if (movedExisting) {
      await rm(path, { force: true }).catch(() => {})
      await rename(backup, path).catch(() => {})
    }
    throw error
  }
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
    await atomicWrite(this.path, `${JSON.stringify({
      schemaVersion: 1,
      shownLaunches: shownLaunches + 1,
    }, null, 2)}\n`)
    return true
  }
}
