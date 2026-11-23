import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import test from 'node:test'
import { createDesktopDataMigration } from '../src/desktop-data-migration.mjs'
import { resolveDesktopDataLocation } from '../src/desktop-data-location.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-migration-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const userData = join(root, 'config')
  const home = join(root, 'old')
  const target = join(root, 'new')
  const program = join(root, 'program')
  await Promise.all([userData, target, program, join(home, 'cache')].map(path => mkdir(path, { recursive: true })))
  const payload = Buffer.from([0, 128, 255, 1])
  await writeFile(join(home, 'cache', 'session'), payload)
  const location = { home, source: 'existing-default', cachePath: join(home, 'cache') }
  const calls = []
  const options = {
    userData, forbidden: [program], choose: async () => target,
    confirm: async () => true, stop: async () => { calls.push('stop') },
    restart: async () => { calls.push('restart') }, relaunch: async () => { calls.push('relaunch') },
  }
  const execute = async migration => {
    await migration.choose(location)
    assert.equal((await migration.preflight(location)).bytes, payload.length)
    return migration.execute(location)
  }
  const resolve = () => resolveDesktopDataLocation({ userData, defaultHome: home, env: {} })
  return { root, home, target, program, location, calls, options, execute, resolve, payload }
}

test('copies and verifies bytes, records the new home and retains the old directory', async t => {
  const f = await fixture(t)
  const transaction = createDesktopDataMigration(f.options)
  assert.deepEqual(await f.execute(transaction), { accepted: true })
  assert.deepEqual(f.calls, ['stop', 'relaunch'])
  assert.deepEqual(await readFile(join(f.target, 'cache', 'session')), f.payload)
  assert.deepEqual(await readFile(join(f.home, 'cache', 'session')), f.payload)
  assert.equal((await f.resolve()).home, f.target)
  const startup = createDesktopDataMigration(f.options)
  assert.equal(await startup.prepareBoot({}), true)
  await startup.finishBoot(true)
  assert.equal((await startup.status(await f.resolve())).phase, 'complete')
})

test('a failed startup restores the previous selection and removes the copied data', async t => {
  const f = await fixture(t)
  await f.execute(createDesktopDataMigration(f.options))
  const startup = createDesktopDataMigration(f.options)
  assert.equal(await startup.prepareBoot({}), true)
  await startup.finishBoot(false)
  assert.equal((await f.resolve()).home, f.home)
  assert.equal((await startup.status(f.location)).phase, 'rolled-back')
  await assert.rejects(readFile(join(f.target, 'cache', 'session')), { code: 'ENOENT' })
  assert.deepEqual(f.calls, ['stop', 'relaunch', 'stop', 'relaunch'])
})

test('an interrupted verification is rolled back at the next launch', async t => {
  const f = await fixture(t)
  await f.execute(createDesktopDataMigration(f.options))
  assert.equal(await createDesktopDataMigration(f.options).prepareBoot({}), true)
  assert.equal(await createDesktopDataMigration(f.options).prepareBoot({}), false)
  assert.equal((await f.resolve()).home, f.home)
})

test('a failure after stopping restarts the original Runtime', async t => {
  const f = await fixture(t)
  const migration = createDesktopDataMigration({ ...f.options, relaunch: async () => { throw Error('launch failed') } })
  await assert.rejects(f.execute(migration), /launch failed/)
  assert.equal((await f.resolve()).home, f.home)
  assert.deepEqual(f.calls, ['stop', 'restart'])
  await assert.rejects(readFile(join(f.target, 'cache', 'session')), { code: 'ENOENT' })
})

test('rejects environment overrides and unsafe targets', async t => {
  const f = await fixture(t)
  const locked = { ...f.location, source: 'environment' }
  const migration = createDesktopDataMigration(f.options)
  assert.equal((await migration.status(locked)).canMigrate, false)
  assert.equal(await migration.choose(locked), null)
  await assert.rejects(migration.preflight(locked), /DSH_HOME/)
  const alias = join(f.root, 'linked')
  await symlink(f.target, alias, 'junction')
  await writeFile(join(f.target, 'unrelated'), 'keep me')
  const badTargets = [f.home, join(f.home, 'nested'), parse(f.root).root, f.program, 'relative', alias, f.target]
  for (const path of badTargets) {
    const migration = createDesktopDataMigration({ ...f.options, choose: async () => path })
    await migration.choose(f.location)
    await assert.rejects(migration.preflight(f.location))
  }
  assert.deepEqual(f.calls, [])
  assert.equal(await readFile(join(f.target, 'unrelated'), 'utf8'), 'keep me')
})

test('recreates profile junctions without copying the linked directory', async t => {
  const f = await fixture(t)
  const outside = join(f.root, 'sdk')
  await mkdir(outside)
  await writeFile(join(outside, 'module'), 'linked runtime')
  await symlink(outside, join(f.home, 'profile-dependency'), 'junction')
  await symlink(join(f.home, 'cache'), join(f.home, 'linked-cache'), 'junction')
  await f.execute(createDesktopDataMigration(f.options))
  assert.equal(await readFile(join(f.target, 'profile-dependency', 'module'), 'utf8'), 'linked runtime')
  await writeFile(join(f.target, 'cache', 'session'), 'new data')
  assert.equal(await readFile(join(f.target, 'linked-cache', 'session'), 'utf8'), 'new data')
  assert.deepEqual(await readFile(join(f.home, 'cache', 'session')), f.payload)
})
