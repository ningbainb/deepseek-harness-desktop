/**
 * A Desktop recovery window needs to read the old, origin-scoped v1 ledger
 * without mounting this client plugin.  The flag is intentionally narrow: it
 * only suppresses plugin application for the single hidden recovery page and
 * is not a general runtime mode or capability.
 */
export const DESKTOP_MIGRATION_PROBE_QUERY = 'dshDesktopMigrationProbe'

export function isDesktopMigrationProbe(search: string | undefined = globalThis.location?.search): boolean {
  if (typeof search !== 'string') return false
  try {
    return new URLSearchParams(search).get(DESKTOP_MIGRATION_PROBE_QUERY) === '1'
  } catch {
    return false
  }
}
