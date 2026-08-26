import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { DOCK_NUDGE_LAUNCH_LIMIT, DockNudgeStore } from '../src/dock-nudge-state.mjs'

test('Dock nudge is shown once in each of the first three app launches', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-dock-nudge-'))
  const path = join(directory, 'state.json')
  try {
    assert.equal(DOCK_NUDGE_LAUNCH_LIMIT, 3)
    for (let launch = 1; launch <= DOCK_NUDGE_LAUNCH_LIMIT; launch += 1) {
      const store = new DockNudgeStore({ path })
      assert.deepEqual(await Promise.all([store.claimLaunch(), store.claimLaunch()]), [true, true])
      assert.equal((JSON.parse(await readFile(path, 'utf8'))).shownLaunches, launch)
    }
    assert.equal(await new DockNudgeStore({ path }).claimLaunch(), false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('dismissal hides the nudge for the rest of the current app launch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-dock-dismiss-'))
  const path = join(directory, 'state.json')
  try {
    const store = new DockNudgeStore({ path })
    assert.equal(await store.claimLaunch(), true)
    assert.equal(await store.dismiss(), true)
    assert.equal(await store.dismiss(), false)
    assert.equal(await store.claimLaunch(), false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('malformed state suppresses only the nudge without blocking the Dock entry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-dock-corrupt-'))
  const path = join(directory, 'state.json')
  try {
    await writeFile(path, '{broken', 'utf8')
    const store = new DockNudgeStore({ path })
    assert.equal(await store.claimLaunch(), false)
    assert.equal(await readFile(path, 'utf8'), '{broken')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
