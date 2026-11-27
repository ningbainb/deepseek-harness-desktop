import { writeJsonAtomic } from './atomic-write-adapter.mjs'
import { readFile } from 'node:fs/promises'

export const SETTINGS_WINDOW_MIN_WIDTH = 520
export const SETTINGS_WINDOW_MIN_HEIGHT = 360
export const SETTINGS_WINDOW_MARGIN = 12

const DEFAULT_WIDTH = 800
const DEFAULT_HEIGHT = 680
const MAX_STORED_COORDINATE = 16_384

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

/** Clamp CSS-pixel panel geometry to the settings overlay's safe viewport. */
export function normalizeSettingsWindowBounds(input = {}, viewport = {}) {
  const viewportWidth = Math.max(1, Math.round(Number(viewport.width) || 0))
  const viewportHeight = Math.max(1, Math.round(Number(viewport.height) || 0))
  const maximumWidth = Math.max(1, viewportWidth - SETTINGS_WINDOW_MARGIN * 2)
  const maximumHeight = Math.max(1, viewportHeight - SETTINGS_WINDOW_MARGIN * 2)
  const minimumWidth = Math.min(SETTINGS_WINDOW_MIN_WIDTH, maximumWidth)
  const minimumHeight = Math.min(SETTINGS_WINDOW_MIN_HEIGHT, maximumHeight)
  const requestedWidth = Number.isFinite(input?.width) ? Math.round(input.width) : DEFAULT_WIDTH
  const requestedHeight = Number.isFinite(input?.height) ? Math.round(input.height) : DEFAULT_HEIGHT
  const width = clamp(requestedWidth, minimumWidth, maximumWidth)
  const height = clamp(requestedHeight, minimumHeight, maximumHeight)
  const defaultX = Math.round((viewportWidth - width) / 2)
  const defaultY = Math.round((viewportHeight - height) / 2)
  const requestedX = Number.isFinite(input?.x) ? Math.round(input.x) : defaultX
  const requestedY = Number.isFinite(input?.y) ? Math.round(input.y) : defaultY
  const x = clamp(requestedX, SETTINGS_WINDOW_MARGIN, Math.max(SETTINGS_WINDOW_MARGIN, viewportWidth - SETTINGS_WINDOW_MARGIN - width))
  const y = clamp(requestedY, SETTINGS_WINDOW_MARGIN, Math.max(SETTINGS_WINDOW_MARGIN, viewportHeight - SETTINGS_WINDOW_MARGIN - height))
  return { x, y, width, height }
}

/** Validate the narrow clone-safe object accepted from the main renderer. */
export function normalizeStoredSettingsWindowBounds(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('invalid settings window bounds')
  }
  const output = {}
  for (const key of ['x', 'y', 'width', 'height']) {
    const value = input[key]
    if (!Number.isFinite(value) || value < 0 || value > MAX_STORED_COORDINATE) {
      throw new TypeError(`invalid settings window bounds.${key}`)
    }
    output[key] = Math.round(value)
  }
  if (output.width === 0 || output.height === 0) {
    throw new TypeError('invalid settings window bounds size')
  }
  return output
}

export class SettingsWindowStateStore {
  constructor(path) {
    this.path = path
    this.writeQueue = Promise.resolve()
  }

  async load() {
    try {
      return normalizeStoredSettingsWindowBounds(JSON.parse(await readFile(this.path, 'utf8')))
    } catch {
      return undefined
    }
  }

  save(input) {
    const bounds = normalizeStoredSettingsWindowBounds(input)
    const operation = this.writeQueue.then(() => writeJsonAtomic(this.path, bounds))
    this.writeQueue = operation.catch(() => {})
    return operation.then(() => bounds)
  }
}
