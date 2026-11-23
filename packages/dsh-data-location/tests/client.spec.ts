import { describe, expect, it, vi } from 'vitest'
import { createDesktopClient } from '@linxin666/dsh-desktop-client'

describe('data migration Desktop capability', () => {
  it('is read-only without the Desktop bridge', async () => {
    const client = createDesktopClient({ globalObject: {} })
    expect(await client.statusDataMigration()).toEqual({ available: false, reason: 'unavailable' })
    expect(await client.chooseDataMigration()).toBeNull()
  })

  it('requires a declared capability before calling the bridge', async () => {
    const executeDataMigration = vi.fn(async () => ({ accepted: true }))
    const client = createDesktopClient({ globalObject: { dshDesktop: {
      getContract: async () => ({ apiVersion: '1.5.0', surface: 'main', capabilities: ['data-migration.manage'] }),
      executeDataMigration,
    } } })
    expect(await client.executeDataMigration()).toEqual({ accepted: true })
    expect(executeDataMigration).toHaveBeenCalledWith()
  })
})
