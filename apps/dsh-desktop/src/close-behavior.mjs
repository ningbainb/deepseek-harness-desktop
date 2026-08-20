import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export const CLOSE_BEHAVIORS = Object.freeze({
  QUIT: 'quit',
  MINIMIZE_TO_TRAY: 'minimize-to-tray',
  ASK: 'ask',
})

export const DEFAULT_CLOSE_BEHAVIOR = CLOSE_BEHAVIORS.QUIT
export const DEFAULT_AUTOMATIC_SAFE_MODE = true

const CLOSE_BEHAVIOR_VALUES = new Set(Object.values(CLOSE_BEHAVIORS))

/**
 * Read a persisted close preference defensively. A missing or legacy value
 * must never turn background mode on by surprise, so it deliberately falls
 * back to the historical quit-on-close behavior.
 */
export function normalizeCloseBehavior(value) {
  return typeof value === 'string' && CLOSE_BEHAVIOR_VALUES.has(value)
    ? value
    : DEFAULT_CLOSE_BEHAVIOR
}

/**
 * Background automation is an explicit subset of close behavior. Choosing
 * Ask may still minimize one close interaction, but it never grants a
 * persistent unattended scheduler permission.
 */
export function isBackgroundAutomationEnabled(value) {
  return normalizeCloseBehavior(value) === CLOSE_BEHAVIORS.MINIMIZE_TO_TRAY
}

/** Validate an untrusted explicit preference update from a Desktop surface. */
export function assertCloseBehavior(value) {
  if (typeof value !== 'string' || !CLOSE_BEHAVIOR_VALUES.has(value)) {
    throw new TypeError(`invalid close behavior: ${JSON.stringify(value)}`)
  }
  return value
}

export function normalizeAutomaticSafeMode(value) {
  return typeof value === 'boolean' ? value : DEFAULT_AUTOMATIC_SAFE_MODE
}

export function assertAutomaticSafeMode(value) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`invalid automatic safe mode preference: ${JSON.stringify(value)}`)
  }
  return value
}

export function normalizeDesktopClosePreferences(input) {
  return Object.freeze({
    closeBehavior: normalizeCloseBehavior(input?.closeBehavior),
    automaticSafeMode: normalizeAutomaticSafeMode(input?.automaticSafeMode),
  })
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true })
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const temporary = `${path}.tmp-${suffix}`
  const backup = `${path}.bak-${suffix}`
  await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
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
    await rm(temporary, { force: true })
    if (movedExisting) {
      await rm(path, { force: true })
      await rename(backup, path)
    }
    throw error
  }
}

/**
 * Small, Desktop-owned preference store. Each process-lifecycle preference
 * has a dedicated validator and save method so renderers cannot write
 * arbitrary keys or files.
 */
export class DesktopClosePreferencesStore {
  constructor(path) {
    if (typeof path !== 'string' || path.length === 0) throw new TypeError('desktop preferences path is required')
    this.path = path
    this.writeQueue = Promise.resolve()
  }

  async load() {
    try {
      return normalizeDesktopClosePreferences(JSON.parse(await readFile(this.path, 'utf8')))
    } catch {
      return normalizeDesktopClosePreferences()
    }
  }

  #save(patch) {
    const operation = this.writeQueue.then(async () => {
      const preferences = normalizeDesktopClosePreferences({
        ...await this.load(),
        ...patch,
      })
      await atomicWrite(this.path, `${JSON.stringify(preferences, null, 2)}\n`)
      return preferences
    })
    this.writeQueue = operation.catch(() => {})
    return operation
  }

  saveCloseBehavior(value) {
    const closeBehavior = assertCloseBehavior(value)
    return this.#save({ closeBehavior }).then(() => closeBehavior)
  }

  saveAutomaticSafeMode(value) {
    const automaticSafeMode = assertAutomaticSafeMode(value)
    return this.#save({ automaticSafeMode }).then(() => automaticSafeMode)
  }
}

/**
 * Main-window close policy that keeps Electron objects at the boundary. The
 * adapter shape makes its policy independently testable with fake dialogs and
 * windows, while the actual Tray object stays entirely in the main process.
 */
export function createCloseBehaviorController({
  getCloseBehavior,
  canMinimizeToTray = () => false,
  hideWindow,
  promptForClose = async () => CLOSE_BEHAVIORS.QUIT,
  requestQuit = () => {},
  getBypassReason = () => undefined,
  log = () => {},
} = {}) {
  if (typeof getCloseBehavior !== 'function') throw new TypeError('getCloseBehavior is required')
  if (typeof hideWindow !== 'function') throw new TypeError('hideWindow is required')
  if (typeof promptForClose !== 'function') throw new TypeError('promptForClose must be a function')
  if (typeof requestQuit !== 'function') throw new TypeError('requestQuit must be a function')

  let explicitQuit = false
  let promptPending = false

  const report = (error) => {
    try {
      void Promise.resolve(log(error instanceof Error ? error : new Error(String(error)))).catch(() => {})
    } catch {
      // Diagnostics must never change the close outcome.
    }
  }

  const beginExplicitQuit = () => { explicitQuit = true }
  const cancelExplicitQuit = () => { explicitQuit = false }
  const shouldBypass = () => {
    if (explicitQuit) return true
    try {
      return Boolean(getBypassReason())
    } catch (error) {
      report(error)
      // Unknown shutdown state must never hide the only reachable window.
      return true
    }
  }

  const trayAvailable = () => {
    try {
      return canMinimizeToTray() === true
    } catch (error) {
      report(error)
      return false
    }
  }

  const selectedBehavior = () => {
    try {
      return normalizeCloseBehavior(getCloseBehavior())
    } catch (error) {
      report(error)
      return DEFAULT_CLOSE_BEHAVIOR
    }
  }

  const hide = () => {
    try {
      hideWindow()
      return true
    } catch (error) {
      report(error)
      return false
    }
  }

  const resolvePrompt = async () => {
    try {
      // A prompt dismissal is intentionally neither a malformed preference
      // nor a request to quit. Treat only the two affirmative buttons as an
      // action so Escape/Cancel leaves the shell visible.
      const response = await promptForClose()
      if (response === CLOSE_BEHAVIORS.MINIMIZE_TO_TRAY && trayAvailable()) {
        hide()
        return
      }
      if (response === CLOSE_BEHAVIORS.QUIT) {
        beginExplicitQuit()
        try {
          requestQuit()
        } catch (error) {
          cancelExplicitQuit()
          throw error
        }
      }
    } catch (error) {
      report(error)
      // A failed prompt must not strand a hidden window. Keep it visible and
      // let the user retry their close action.
    } finally {
      promptPending = false
    }
  }

  /**
   * Returns true when the close event was intercepted. Event-like fakes only
   * need a preventDefault method, so this can be tested without Electron.
   */
  const handleWindowClose = (event) => {
    if (shouldBypass()) return false
    const behavior = selectedBehavior()
    if (behavior === CLOSE_BEHAVIORS.QUIT || !trayAvailable()) return false

    event?.preventDefault?.()
    if (behavior === CLOSE_BEHAVIORS.MINIMIZE_TO_TRAY) {
      hide()
      return true
    }
    if (!promptPending) {
      promptPending = true
      void resolvePrompt()
    }
    return true
  }

  return Object.freeze({
    handleWindowClose,
    beginExplicitQuit,
    cancelExplicitQuit,
    get explicitQuit() { return explicitQuit },
    get promptPending() { return promptPending },
  })
}
