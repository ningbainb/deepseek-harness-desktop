import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'

const moduleUrl = new URL('../src/desktop-data-location.mjs', import.meta.url)
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-data-location-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return { root, userData: join(root, 'shell'), defaultHome: join(root, 'community'), legacyHome: join(root, 'legacy'), env: {}, isPackaged: true }
}

test('desktop data location exports a resolver', async () => {
  const module = await import(moduleUrl).catch(() => ({}))
  assert.equal(typeof module.resolveDesktopDataLocation, 'function')
})

test('explicit environment wins without opening a dialog or overwriting persisted selection', async t => {
  const { resolveDesktopDataLocation, DESKTOP_DATA_LOCATION_FILE } = await import(moduleUrl)
  const f = await fixture(t)
  await mkdir(f.userData)
  const record = JSON.stringify({ schemaVersion: 1, owner: 'deepseek-harness-community-desktop', home: join(f.root, 'saved') })
  await writeFile(join(f.userData, DESKTOP_DATA_LOCATION_FILE), record)
  const selected = await resolveDesktopDataLocation({ ...f, env: { DSH_HOME: join(f.root, 'explicit') }, chooseDirectory: () => { throw Error('unexpected dialog') } })
  assert.equal(selected.home, join(f.root, 'explicit'))
  assert.equal(selected.source, 'environment')
  assert.equal(selected.cachePath, join(selected.home, 'cache'))
  assert.equal(await readFile(join(f.userData, DESKTOP_DATA_LOCATION_FILE), 'utf8'), record)
})

test('fresh packaged selection persists outside program resources and survives reinstall resolution', async t => {
  const { resolveDesktopDataLocation } = await import(moduleUrl)
  const f = await fixture(t)
  const selectedPath = join(f.root, 'chosen-data')
  let dialogs = 0
  const selected = await resolveDesktopDataLocation({ ...f, chooseDirectory: () => { dialogs++; return selectedPath } })
  assert.equal(selected.home, selectedPath)
  assert.equal(selected.source, 'selected')
  assert.equal(dialogs, 1)
  await assert.rejects(stat(selectedPath), { code: 'ENOENT' })
  const relaunched = await resolveDesktopDataLocation({ ...f, chooseDirectory: () => { throw Error('reinstall must retain choice') } })
  assert.equal(relaunched.home, selectedPath)
  assert.equal(relaunched.source, 'persisted')
})

test('existing default Home is retained without a dialog', async t => {
  const { resolveDesktopDataLocation } = await import(moduleUrl)
  const f = await fixture(t)
  await mkdir(f.defaultHome)
  const selected = await resolveDesktopDataLocation({ ...f, chooseDirectory: () => { throw Error('upgrade must not choose again') } })
  assert.equal(selected.home, f.defaultHome)
  assert.equal(selected.source, 'existing-default')
})

test('legacy Home is left for the established ownership migration and never selected directly', async t => {
  const { resolveDesktopDataLocation } = await import(moduleUrl)
  const f = await fixture(t)
  await mkdir(join(f.legacyHome, 'profiles', 'web'), { recursive: true })
  const selected = await resolveDesktopDataLocation({ ...f, chooseDirectory: () => { throw Error('legacy ownership must be checked first') } })
  assert.equal(selected.home, f.defaultHome)
  assert.equal(selected.source, 'legacy-migration')
  await assert.rejects(stat(f.defaultHome), { code: 'ENOENT' })
  assert.ok((await stat(join(f.legacyHome, 'profiles', 'web'))).isDirectory())
})

test('cancelled clean installation neither silently falls back nor persists a choice', async t => {
  const { resolveDesktopDataLocation, DESKTOP_DATA_LOCATION_FILE } = await import(moduleUrl)
  const f = await fixture(t)
  await assert.rejects(resolveDesktopDataLocation({ ...f, chooseDirectory: () => ({ canceled: true, filePaths: [] }) }), { code: 'DESKTOP_DATA_LOCATION_CANCELLED' })
  await assert.rejects(stat(f.defaultHome), { code: 'ENOENT' })
  await assert.rejects(stat(join(f.userData, DESKTOP_DATA_LOCATION_FILE)), { code: 'ENOENT' })
})

test('development and headless resolution never display a directory chooser', async t => {
  const { resolveDesktopDataLocation } = await import(moduleUrl)
  const f = await fixture(t)
  assert.equal((await resolveDesktopDataLocation({ ...f, isPackaged: false, chooseDirectory: () => { throw Error('development GUI forbidden') } })).home, f.defaultHome)
  assert.equal((await resolveDesktopDataLocation({ ...f, chooseDirectory: undefined })).home, f.defaultHome)
})

test('root, installation resources, links and third-party Web Home cannot become selected data roots', async t => {
  const { resolveDesktopDataLocation } = await import(moduleUrl)
  const f = await fixture(t)
  await assert.rejects(resolveDesktopDataLocation({ ...f, chooseDirectory: () => parse(f.root).root }), /root directory/)
  const resourcesPath = join(f.root, 'program', 'resources')
  await mkdir(resourcesPath, { recursive: true })
  await assert.rejects(resolveDesktopDataLocation({ ...f, resourcesPath, programDirectory: join(f.root, 'program'), chooseDirectory: () => join(resourcesPath, 'data') }), /program|resources/)
  const linked = join(f.root, 'linked')
  await symlink(resourcesPath, linked, 'junction')
  await assert.rejects(resolveDesktopDataLocation({ ...f, chooseDirectory: () => join(linked, 'data') }), /link/)
  const foreign = join(f.root, 'foreign')
  await mkdir(join(foreign, 'profiles', 'web'), { recursive: true })
  await assert.rejects(resolveDesktopDataLocation({ ...f, chooseDirectory: () => foreign }), /ownership|third-party/)
})

test('corrupt persisted metadata fails visibly instead of creating a new Home', async t => {
  const { resolveDesktopDataLocation, DESKTOP_DATA_LOCATION_FILE } = await import(moduleUrl)
  const f = await fixture(t)
  await mkdir(f.userData)
  await writeFile(join(f.userData, DESKTOP_DATA_LOCATION_FILE), '{broken')
  await assert.rejects(resolveDesktopDataLocation({ ...f, chooseDirectory: () => { throw Error('must not replace broken selection') } }), /persisted/)
})

test('persisted missing Home stays selected ahead of existing defaults and cannot silently switch accounts', async t => {
  const { resolveDesktopDataLocation, DESKTOP_DATA_LOCATION_FILE } = await import(moduleUrl)
  const f = await fixture(t)
  await mkdir(f.userData)
  await mkdir(f.defaultHome)
  const previous = join(f.root, 'previous-data-drive')
  await writeFile(join(f.userData, DESKTOP_DATA_LOCATION_FILE), JSON.stringify({ schemaVersion: 1, owner: 'deepseek-harness-community-desktop', home: previous }))
  const location = await resolveDesktopDataLocation({ ...f, chooseDirectory: () => { throw Error('must not switch Home') } })
  assert.equal(location.home, previous)
  assert.equal(location.source, 'persisted')
  await assert.rejects(stat(previous), { code: 'ENOENT' })
})

test('explicit old Home on the program drive remains compatible outside installation directories', async t => {
  const { resolveDesktopDataLocation } = await import(moduleUrl)
  const f = await fixture(t)
  const home = join(f.root, 'retained-home')
  await mkdir(home)
  const location = await resolveDesktopDataLocation({ ...f, programDirectory: join(f.root, 'program'), env: { DSH_HOME: home }, chooseDirectory: () => { throw Error('old environment cannot show GUI') } })
  assert.equal(location.home, home)
  assert.equal(location.source, 'environment')
})

test('existing explicit junction Home preserves its launch path identity and data', async t => {
  const { resolveDesktopDataLocation } = await import(moduleUrl)
  const f = await fixture(t)
  const target = join(f.root, 'retained-data')
  const home = join(f.root, 'existing-home-junction')
  await mkdir(target)
  await writeFile(join(target, 'retained.txt'), 'old account data')
  await symlink(target, home, 'junction')
  const location = await resolveDesktopDataLocation({ ...f, env: { DSH_HOME: home }, chooseDirectory: () => { throw Error('existing Home must not show GUI') } })
  assert.equal(location.home, home)
  assert.equal(await readFile(join(home, 'retained.txt'), 'utf8'), 'old account data')
})

test('existing default junction and explicit Home inside the old program layout retain prior launch contracts', async t => {
  const { resolveDesktopDataLocation } = await import(moduleUrl)
  const f = await fixture(t)
  const target = join(f.root, 'retained-default')
  await mkdir(target)
  await symlink(target, f.defaultHome, 'junction')
  assert.equal((await resolveDesktopDataLocation(f)).home, f.defaultHome)
  const old = join(f.root, 'old-program', 'data')
  await mkdir(old, { recursive: true })
  assert.equal((await resolveDesktopDataLocation({ ...f, env: { DSH_HOME: old }, programDirectory: join(f.root, 'old-program') })).home, old)
})
