const ROW_ID = 'client-hmr'
const OFFICIAL_PACKAGE = '@deepseek-ai/dsh-client-hmr'
export const DESKTOP_CLIENT_HMR_PACKAGE = '@linxin666/dsh-desktop-client-hmr'

export function adaptDesktopClientHmrPatches(patches, { enabled } = {}) {
  if (!(enabled ?? patches.some(patch => patch.id === ROW_ID && patch.name === DESKTOP_CLIENT_HMR_PACKAGE))) return patches
  const targets = new Map()
  const adaptEntry = entry => {
    const result = { ...entry }
    if (entry.id === ROW_ID && entry.name === OFFICIAL_PACKAGE) result.name = DESKTOP_CLIENT_HMR_PACKAGE
    if (entry.group && Array.isArray(entry.config)) result.config = entry.config.map(adaptEntry)
    return result
  }
  const indexInserted = entries => {
    for (const entry of entries) {
      if (entry.id) targets.set(entry.id, { name: entry.name, group: entry.group })
      if (entry.group && Array.isArray(entry.config)) indexInserted(entry.config)
    }
  }
  return patches.map(patch => {
    const result = { ...patch }
    if (patch.insert) {
      if (patch.id && !targets.get(patch.id)?.group) return result
      result.insert = patch.insert.map(adaptEntry)
      indexInserted(result.insert)
      return result
    }
    if (patch.id === ROW_ID && patch.name === OFFICIAL_PACKAGE) result.name = DESKTOP_CLIENT_HMR_PACKAGE
    const target = patch.id && targets.get(patch.id)
    if (!target || (result.name && result.name !== target.name)) return result
    const group = Object.hasOwn(patch, 'group') ? patch.group : target.group
    if (group && Array.isArray(patch.config)) result.config = patch.config.map(adaptEntry)
    if (Object.hasOwn(patch, 'group')) target.group = patch.group
    return result
  })
}
