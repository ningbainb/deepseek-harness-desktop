/** Runtime documents allowed inside the unprivileged Extension Dock view. */
export const DOCK_SETTING_IDS = Object.freeze([
  'relay', 'value-mode', 'personal-prompt', 'memory', 'particle-theme', 'describe-image',
  'appearance', 'models', 'usage', 'sessions',
])

export function assertDockSetting(id) {
  if (id !== null && !DOCK_SETTING_IDS.includes(id)) throw new TypeError('unknown Dock settings page')
}
