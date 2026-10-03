/** Runtime documents allowed inside the unprivileged Extension Dock view. */
export const DOCK_SETTING_IDS = Object.freeze([
  'relay', 'value-mode', 'personal-prompt', 'memory', 'particle-theme', 'describe-image',
  'appearance', 'models', 'usage', 'sessions', 'plugin-options',
])

export function assertDockSetting(id) {
  if (id !== null && !DOCK_SETTING_IDS.includes(id)) throw new TypeError('unknown Dock settings page')
}

export function assertDockPlugin(id, plugin) {
  if (plugin === undefined) return
  if (id !== 'plugin-options' || typeof plugin !== 'string' || !/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/u.test(plugin)) {
    throw new TypeError('invalid Dock plugin configuration target')
  }
}

/**
 * Top-level Extension Dock tabs that may be targeted by an external open
 * request. Values are the renderer `data-tab` identifiers (see
 * ui/extensions.html); only stable, non-settings panels are exposed so an
 * outside caller can land on Plugins / Skills / Market / etc. consistently.
 */
export const DOCK_TAB_IDS = Object.freeze([
  'plugins', 'skills', 'market', 'presets', 'recovery', 'qqbot',
  'conversation-import', 'migration', 'plugin-settings',
])

/**
 * Normalize an arbitrary open-request tab value to a known Dock tab id.
 * Returns undefined for anything unrecognized so callers can safely fall back
 * to the default view instead of navigating to a nonexistent panel.
 */
export function normalizeDockTab(value) {
  if (typeof value !== 'string') return undefined
  const id = value.trim().toLowerCase()
  return DOCK_TAB_IDS.includes(id) ? id : undefined
}
