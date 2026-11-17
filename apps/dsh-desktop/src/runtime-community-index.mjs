import { composeEntries } from '@deepseek-ai/dsh-app-boot'

export const DESKTOP_COMMUNITY_INDEX_URL = 'https://raw.githubusercontent.com/ningbainb/deepseek-harness-desktop/main/apps/dsh-desktop/runtime-support/community-plugin-index.json'
const officialMarket = '@deepseek-ai/dsh-plugin-market'

function* rows(entries) {
  for (const entry of entries) {
    yield entry
    if (Array.isArray(entry?.insert)) yield* rows(entry.insert)
    if (entry?.group && Array.isArray(entry.config)) yield* rows(entry.config)
  }
}

/** In-memory Desktop projection only. The official SDK retains lazy index reads and installation ownership. */
export function adaptDesktopCommunityIndexPatches(patches, { layers, userPatches = layers?.slice(1).flat() ?? [], profileName = 'desktop' } = {}) {
  if (profileName !== 'desktop') return patches
  const additions = []
  for (const row of rows(composeEntries(patches))) {
    if (row?.name !== officialMarket || typeof row.id !== 'string') continue
    if ([...rows(patches)].some(patch => patch?.id === row.id && typeof patch.name === 'string' && patch.name !== officialMarket)) continue
    const indexes = row.config?.indexes ?? []
    // Dynamic user expressions belong to the official evaluator; do not replace them.
    if (!Array.isArray(indexes) || indexes.includes(DESKTOP_COMMUNITY_INDEX_URL)) continue
    const explicitlyClosed = indexes.length === 0 && [...rows(userPatches)].some(patch =>
      (patch?.id === row.id || patch?.name === officialMarket)
      && Array.isArray(patch.config?.indexes) && patch.config.indexes.length === 0,
    )
    if (explicitlyClosed) continue
    additions.push({ id: row.id, name: officialMarket, config: { ...row.config, indexes: [...indexes, DESKTOP_COMMUNITY_INDEX_URL] } })
  }
  return additions.length ? [...patches, ...additions] : patches
}
