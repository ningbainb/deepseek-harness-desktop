/**
 * Weighted bin-packing shard & retry helpers for `run-regression-e2e.mjs`.
 * Pure, dependency-free so unit tests and CI tooling can share the exact logic.
 */

export const SUITE_DURATION_HINTS = Object.freeze({
  'scripts/verify-packaged-direct-start-matrix.mjs': 116,
  'scripts/verify-dock-settings.mjs': 105,
  'scripts/verify-skin-center.mjs': 100,
  'scripts/verify-star-prompt.mjs': 75,
  'scripts/verify-background-residency.mjs': 70,
  'scripts/verify-dock-model-catalog.mjs': 63,
  'scripts/verify-workspace-relocation.mjs': 63,
  'scripts/verify-packaged-personalization.mjs': 61,
  'scripts/verify-beta-usability.mjs': 59,
  'scripts/verify-account-skin-chrome.mjs': 54,
  'scripts/verify-skill-market.mjs': 52,
  'scripts/verify-packaged-release-browser.mjs': 48,
  'scripts/verify-plugin-options.mjs': 45,
  'scripts/verify-conversation-scroll.mjs': 45,
  'scripts/verify-installer-lifecycle.mjs': 43,
  'scripts/verify-packaged-agent-work.mjs': 40,
  'scripts/verify-native-settings-interactions.mjs': 36,
  'scripts/verify-packaged-ssh.mjs': 36,
  'scripts/verify-dock-clarity.mjs': 35,
  'scripts/verify-window-chrome.mjs': 35,
  'scripts/verify-packaged-image-drop.mjs': 32,
  'scripts/verify-conversation-skills.mjs': 32,
  'scripts/verify-directory-picker.mjs': 32,
  'scripts/verify-particle-theme.mjs': 30,
  'scripts/verify-native-plugin-pages.mjs': 30,
  'scripts/verify-selected-balance.mjs': 27,
  'scripts/verify-runtime-settings-reload.mjs': 25,
  'scripts/verify-bai-onboarding.mjs': 24,
  'scripts/verify-control-approval.mjs': 24,
  'scripts/verify-packaged-model-preferences.mjs': 22,
  'scripts/verify-packaged-fresh-second-launch.mjs': 20,
  'scripts/verify-runtime-provider.mjs': 20,
  'scripts/verify-settings-window.mjs': 19,
  'scripts/verify-preset-export.mjs': 19,
  '--test': 18,
  'scripts/verify-update-shutdown.mjs': 17,
  'scripts/verify-window-state-dpi.mjs': 16,
  'scripts/verify-skill-discovery.mjs': 16,
  'scripts/verify-packaged-local-lan-gateway.mjs': 15,
  'scripts/verify-preset-deep-link.mjs': 14,
  'scripts/verify-packaged-profile-reset.mjs': 10,
})

/**
 * Parse a `<index>/<total>` shard specifier (1-based index).
 * Returns `null` when unset/blank, or throws `RangeError` if invalid.
 */
export function parseShardSpec(raw) {
  if (raw === undefined || raw === null) return null
  const trimmed = String(raw).trim()
  if (trimmed === '') return null
  const match = /^([1-9]\d*)\/([1-9]\d*)$/u.exec(trimmed)
  if (!match) {
    throw new RangeError(`Invalid shard spec "${raw}". Expected <index>/<total> (e.g. 1/4).`)
  }
  const index = Number(match[1])
  const total = Number(match[2])
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(total) || index < 1 || index > total) {
    throw new RangeError(`Invalid shard spec "${raw}": index must be between 1 and ${total}.`)
  }
  return { index, total }
}

/**
 * Parse retry-flaky count (integer between 0 and 3). Defaults to 0.
 */
export function parseRetryCount(raw) {
  if (raw === undefined || raw === null) return 0
  const trimmed = String(raw).trim()
  if (trimmed === '') return 0
  if (!/^\d+$/u.test(trimmed)) {
    throw new RangeError(`Invalid retry-flaky count "${raw}". Expected an integer between 0 and 3.`)
  }
  const count = Number(trimmed)
  if (!Number.isSafeInteger(count) || count < 0 || count > 3) {
    throw new RangeError(`Invalid retry-flaky count "${raw}": must be between 0 and 3.`)
  }
  return count
}

/**
 * Partition suites across `shard.total` buckets via greedy LPT (longest processing time first)
 * bin-packing using `SUITE_DURATION_HINTS`, returning the slice for `shard.index` in original order.
 */
export function selectShardSuites(suites, shard) {
  if (!shard) return suites
  const total = shard.total
  const weighted = suites.map((suite, order) => ({
    suite,
    order,
    weight: Number.isFinite(suite.durationHint)
      ? suite.durationHint
      : (SUITE_DURATION_HINTS[suite.script] ?? 25),
  }))
  weighted.sort((a, b) => b.weight - a.weight || a.order - b.order)

  const buckets = Array.from({ length: total }, () => ({ load: 0, items: [] }))
  for (const entry of weighted) {
    let target = buckets[0]
    for (let i = 1; i < buckets.length; i++) {
      if (buckets[i].load < target.load) target = buckets[i]
    }
    target.load += entry.weight
    target.items.push(entry)
  }

  return buckets[shard.index - 1].items
    .sort((a, b) => a.order - b.order)
    .map(entry => entry.suite)
}
