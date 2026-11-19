import { composeEntries } from '@deepseek-ai/dsh-app-boot'
import { AsyncLocalStorage } from 'node:async_hooks'
import { statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
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

// Official Discover decorates each entry from the same bundle inventory that
// the Plugins panel has just read. Reuse that scan only for bundled Workshop
// requests. Other reads, including mutation preconditions, stay authoritative.
export function shareDesktopWorkshopInventory(manager, market, getRevision, now = Date.now) {
  const workshopRead = new AsyncLocalStorage()
  const readBundles = manager.listBundles
  const searchMarket = market.search
  let recent
  const invalidate = () => { recent = undefined }
  const listBundles = function (...args) {
    const revision = getRevision()
    if (workshopRead.getStore() && revision !== undefined && recent?.revision === revision && now() - recent.at <= 5_000) {
      return recent.result
    }
    invalidate()
    const result = readBundles.apply(this, args)
    if (revision !== undefined && getRevision() === revision) {
      const record = { revision, at: now(), result }
      recent = record
      void Promise.resolve(result).catch(() => { if (recent === record) invalidate() })
    }
    return result
  }
  const search = function (url, ...args) {
    if (url === DESKTOP_COMMUNITY_INDEX_URL) return workshopRead.run(true, () => searchMarket.call(this, url, ...args))
    return searchMarket.call(this, url, ...args)
  }
  manager.listBundles = listBundles
  market.search = search
  return {
    invalidate,
    dispose() {
      invalidate()
      if (manager.listBundles === listBundles) manager.listBundles = readBundles
      if (market.search === search) market.search = searchMarket
    },
  }
}

export function installDesktopWorkshopInventory(ctx, profileDir) {
  const paths = ['package.json', 'cordis.patch.yml', 'pnpm-lock.yaml'].map(file => join(profileDir, file))
  const profileRevision = () => {
    try {
      const stats = paths.map(path => statSync(path, { bigint: true, throwIfNoEntry: false }))
      if (!stats[0]) return undefined
      return stats.map(stat => stat ? `${stat.ino}:${stat.mtimeNs}:${stat.size}` : '-').join('/')
    } catch {
      return undefined
    }
  }
  ctx.inject(['pluginManager', 'pluginMarket'], scope => {
    const manager = scope.get('pluginManager')
    const market = scope.get('pluginMarket')
    if (typeof manager?.listBundles !== 'function' || typeof market?.search !== 'function') return
    const { invalidate, dispose } = shareDesktopWorkshopInventory(manager, market, profileRevision)
    scope.on('plugin-manager/changed', invalidate)
    scope.effect(() => dispose, 'Desktop Workshop inventory')
  })
}
