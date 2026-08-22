import { describe, expect, it } from 'vitest'

import {
  DESKTOP_MIGRATION_PROBE_QUERY,
  isDesktopMigrationProbe,
} from '../src/client/migration-probe.ts'

describe('Desktop migration probe guard', () => {
  it('only recognizes the explicit hidden-recovery query', () => {
    expect(isDesktopMigrationProbe(`?${DESKTOP_MIGRATION_PROBE_QUERY}=1`)).toBe(true)
    expect(isDesktopMigrationProbe(`?${DESKTOP_MIGRATION_PROBE_QUERY}=0`)).toBe(false)
    expect(isDesktopMigrationProbe('?migration=1')).toBe(false)
    expect(isDesktopMigrationProbe(undefined)).toBe(false)
  })
})
