import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  DIRECT_START_FIXTURE_VERSIONS,
  materializeDirectStartFixture,
} from '../scripts/direct-start-matrix-runner.mjs'
import { StartupRepairCoordinator } from '../src/startup-repair-coordinator.mjs'

test('historical session markers stay under the original Home for all supported releases', async () => {
  for (const version of DIRECT_START_FIXTURE_VERSIONS) {
    const root = await mkdtemp(join(tmpdir(), `session-preservation-${version.replaceAll('.', '-')}-`))
    try {
      const layout = await materializeDirectStartFixture({ root, version })
      const marker = JSON.parse(await readFile(
        join(layout.dshHome, 'sessions', 'direct-start-fixture', 'marker.json'),
        'utf8',
      ))
      assert.equal(marker.marker, layout.sessionMarker)
      assert.equal(layout.profileDir.startsWith(layout.dshHome), true)
      assert.doesNotMatch(layout.dshHome, /free-|isolated|migration/u)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
})

test('builtins fallback reads the same Home marker after two full-profile failures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'session-preservation-fallback-'))
  try {
    const layout = await materializeDirectStartFixture({ root, version: '3.0.1' })
    const reads = []
    function provider(profileName, failures) {
      let remaining = failures
      return {
        profileName,
        dshHome: layout.dshHome,
        async ensureProfile() {},
        async start() {
          const marker = JSON.parse(await readFile(
            join(this.dshHome, 'sessions', 'direct-start-fixture', 'marker.json'),
            'utf8',
          )).marker
          reads.push([profileName, marker])
          if (remaining > 0) {
            remaining -= 1
            throw new Error('deterministic full-profile failure')
          }
        },
        async stop() {},
        async forceStop() {},
      }
    }
    const full = provider('desktop', 2)
    const builtins = provider('desktop-builtins', 0)
    const result = await new StartupRepairCoordinator({
      createProvider: ({ profileName }) => profileName === 'desktop' ? full : builtins,
      runRepair: async () => ({ status: 'unavailable' }),
    }).start()

    assert.equal(result.state, 'ready-builtins')
    assert.equal(result.provider.dshHome, layout.dshHome)
    assert.deepEqual(reads, [
      ['desktop', layout.sessionMarker],
      ['desktop', layout.sessionMarker],
      ['desktop-builtins', layout.sessionMarker],
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
