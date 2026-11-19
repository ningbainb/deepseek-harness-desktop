import { composeEntries } from '@deepseek-ai/dsh-app-boot'
import { readFile } from 'node:fs/promises'
import { DESKTOP_COMMUNITY_INDEX_URL } from './dock-pages.mjs'

export { DESKTOP_COMMUNITY_INDEX_URL }
const officialMarket = '@deepseek-ai/dsh-plugin-market'
const officialMarketUi = '@deepseek-ai/dsh-client-ui-plugin-market'
const bundledIndex = new URL('../runtime-support/community-plugin-index.json', import.meta.url)

function* rows(entries) {
  for (const entry of entries) {
    yield entry
    if (Array.isArray(entry?.insert)) yield* rows(entry.insert)
    if (entry?.group && Array.isArray(entry.config)) yield* rows(entry.config)
  }
}

/** In-memory Desktop projection only. The official SDK retains lazy index reads and installation ownership. */
export function adaptDesktopCommunityIndexPatches(patches, { layers, userPatches = layers?.slice(1).flat() ?? [], profileName = 'desktop', enableWorkshop = false } = {}) {
  if (profileName !== 'desktop') return patches
  const additions = []
  let effective = patches
  let composed = [...rows(composeEntries(effective))]
  if (enableWorkshop && !composed.some(row => row?.id === 'plugin-market' || row?.name === officialMarket)) {
    // Insert defaults before the Profile or Home patches that refer to these IDs.
    effective = [{ insert: [
      { id: 'plugin-market', name: officialMarket, config: { indexes: [DESKTOP_COMMUNITY_INDEX_URL] } },
      ...(composed.some(row => row?.id === 'ui-plugin-market' || row?.name === officialMarketUi) ? []
        : [{ id: 'ui-plugin-market', name: officialMarketUi }]),
    ] }, ...patches]
    composed = [...rows(composeEntries(effective))]
  }
  for (const row of composed) {
    if (row?.name !== officialMarket || typeof row.id !== 'string') continue
    if ([...rows(patches)].some(patch => patch?.id === row.id && typeof patch.name === 'string' && patch.name !== officialMarket)) continue
    const indexes = row.config?.indexes ?? []
    // Dynamic user expressions belong to the official evaluator; do not replace them.
    if (!Array.isArray(indexes) || indexes.includes(DESKTOP_COMMUNITY_INDEX_URL)) continue
    const explicitlyConfigured = [...rows(userPatches)].some(patch =>
      (patch?.id === row.id || patch?.name === officialMarket)
      && Object.hasOwn(patch.config ?? {}, 'indexes'),
    )
    if (explicitlyConfigured && (!indexes.length || row.disabled === true)) continue
    additions.push({ id: row.id, name: officialMarket, config: { ...row.config, indexes: [...indexes, DESKTOP_COMMUNITY_INDEX_URL] } })
  }
  return additions.length ? [...effective, ...additions] : effective
}

// The official reader still validates, searches and paginates this index. The
// Desktop source is pinned to the candidate and works before any network read.
export function installDesktopWorkshopIndexFetch(target = globalThis) {
  const original = target.fetch
  let bytes
  const fetchIndex = async (input, options) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url
    if (url !== DESKTOP_COMMUNITY_INDEX_URL || (options?.method ?? input?.method ?? 'GET') !== 'GET') {
      return original.call(target, input, options)
    }
    const signal = options?.signal ?? input?.signal
    signal?.throwIfAborted()
    bytes ??= await readFile(bundledIndex)
    signal?.throwIfAborted()
    return new Response(bytes, { headers: { 'content-type': 'application/json' } })
  }
  target.fetch = fetchIndex
  return () => { if (target.fetch === fetchIndex) target.fetch = original }
}
