import { composeEntries } from '@deepseek-ai/dsh-app-boot'

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
  const adapted = []
  for (const patch of patches) {
    const result = { ...patch }
    adapted.push(result)
    if (patch.insert) {
      if (patch.id && !targets.get(patch.id)?.group) continue
      result.insert = patch.insert.map(adaptEntry)
      indexInserted(result.insert)
      continue
    }
    if (patch.id === ROW_ID && patch.name === OFFICIAL_PACKAGE) result.name = DESKTOP_CLIENT_HMR_PACKAGE
    const target = patch.id && targets.get(patch.id)
    if (!target || (result.name && result.name !== target.name)) continue
    const group = Object.hasOwn(patch, 'group') ? patch.group : target.group
    if (group && Array.isArray(patch.config)) result.config = patch.config.map(adaptEntry)
    if (Object.hasOwn(patch, 'group') || (group && Array.isArray(patch.config))) {
      // Alpha.2 reindexes a replaced group's children before later patches.
      targets.clear()
      indexInserted(composeEntries(adapted))
    }
  }
  return adapted
}
