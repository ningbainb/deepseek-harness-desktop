import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const [scenario, directory, packageRoot] = process.argv.slice(2)
const root = resolve(directory)
const fromMarket = createRequire(join(packageRoot, 'package.json'))
const { zipSync, strToU8 } = fromMarket('fflate')
const destination = join(root, 'source')
const original = Buffer.from('old source must survive')
if (!scenario.startsWith('recover-')) {
  await mkdir(destination, { recursive: true })
  await writeFile(join(destination, 'old.txt'), original)
}
const archive = zipSync({ 'new.txt': strToU8('new source content') })
const server = createServer((request, response) => {
  if (request.url === '/broken.zip') response.writeHead(503).end('fixture unavailable')
  else if (request.url === '/interrupted.zip') response.destroy()
  else if (request.url === '/traversal.zip') response.writeHead(200).end(zipSync({ '../outside.txt': strToU8('must not escape') }))
  else response.writeHead(200, { 'content-type': 'application/zip' }).end(archive)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/source.zip`
const load = path => import(pathToFileURL(join(packageRoot, path)).href)
const contextOptions = { userRoot: root, dataRoot: join(root, 'data'), agentsRoot: join(root, 'agents'), onChanged: async () => {}, git: { allowHttpArchives: true } }
try {
  if (scenario.startsWith('git-refresh-') || scenario === 'archive-refresh-failure') {
    const { CatalogContext } = await load('lib/packages/market-catalog/src/application/catalog-context.js')
    const { SourceStore } = await load('lib/packages/market-catalog/src/application/source-store.js')
    const context = new CatalogContext(contextOptions)
    await context.load()
    const checkout = join(root, '.sources', 'fixture')
    let source
    let origin
    if (scenario === 'archive-refresh-failure') {
      await mkdir(checkout, { recursive: true })
      await writeFile(join(checkout, 'old.txt'), original)
      source = { id: 'fixture', kind: 'archive', url: url.replace('/source.zip', '/broken.zip') }
    } else {
      const git = async args => (await promisify(execFile)('git', args, { windowsHide: true, timeout: 10_000 })).stdout.trim()
      const repository = join(root, 'fixture-repo')
      await git(['init', '--initial-branch=main', repository])
      await writeFile(join(repository, 'old.txt'), original)
      const commit = async () => {
        await git(['-C', repository, 'add', '.'])
        await git(['-c', 'user.name=Market Fixture', '-c', 'user.email=fixture@invalid.test', '-C', repository, 'commit', '--no-gpg-sign', '-m', 'isolated fixture'])
      }
      await commit()
      origin = pathToFileURL(repository).href
      await mkdir(join(root, '.sources'), { recursive: true })
      await git(['clone', '--depth', '1', '--', origin, checkout])
      await writeFile(join(repository, 'new.txt'), 'new source content')
      await commit()
      const unavailable = pathToFileURL(join(root, 'missing-repo')).href
      if (scenario === 'git-refresh-foreign-china') {
        const foreign = 'https://github.com/private-owner/custom-market.git'
        await git(['-C', checkout, 'remote', 'set-url', 'origin', foreign])
        context.git.insteadOf = { [foreign]: origin, [`https://gh-proxy.com/${foreign}`]: unavailable }
      }
      if (scenario === 'git-refresh-failure') await git(['-C', checkout, 'remote', 'set-url', 'origin', unavailable])
      source = { id: 'fixture', kind: 'git', url: scenario === 'git-refresh-success' ? origin : unavailable }
    }
    const state = { version: 1, sources: [source], installed: {} }
    await context.commit(state)
    const sources = new SourceStore(context, { downloadRegion: async () => scenario === 'git-refresh-foreign-china' ? 'china' : 'global', localePreference: () => 'en' })
    if (scenario.endsWith('failure')) {
      await assert.rejects(sources.refresh('fixture'))
      assert.deepEqual(await readFile(join(checkout, 'old.txt')), original)
    } else {
      await sources.refresh('fixture')
      assert.equal(await readFile(join(checkout, 'new.txt'), 'utf8'), 'new source content')
    }
    assert.deepEqual(context.state, state)
    assert.deepEqual(JSON.parse(await readFile(join(root, 'state.json'), 'utf8')), state)
  } else if (scenario === 'journal-unlink-after-restore' || scenario === 'uncommitted-new-recovery' || scenario === 'crash-after-restore') {
    const staging = join(root, 'staging')
    await mkdir(staging)
    await writeFile(join(staging, 'new.txt'), 'new source content')
    const target = scenario === 'uncommitted-new-recovery' ? join(root, 'new-source') : destination
    const remove = fs.promises.rm
    const rename = fs.promises.rename
    let failedUnlink = false
    fs.promises.rm = async (path, ...args) => {
      if (!failedUnlink && String(path).endsWith('.json') && String(path).includes('.desktop-source-replace-')) {
        failedUnlink = true
        throw Object.assign(new Error('fixture journal unlink denied'), { code: 'EACCES' })
      }
      return remove(path, ...args)
    }
    if (scenario === 'crash-after-restore') fs.promises.rename = async (source, destinationPath) => {
      await rename(source, destinationPath)
      if (String(source).includes('backup') && resolve(destinationPath) === destination) process.exit(73)
    }
    syncBuiltinESMExports()
    const { replaceSourceDirectory, recoverSourceReplacements } = await load('lib/packages/market-catalog/src/scanning/source-replacement.js')
    await assert.rejects(replaceSourceDirectory(staging, target, { commit: async () => { throw new Error('fixture commit failed') } }))
    await recoverSourceReplacements(root)
    if (scenario === 'uncommitted-new-recovery') {
      assert.equal(fs.existsSync(target), false, 'recovery must never republish an uncommitted new source')
      const backup = (await readdir(root)).find(name => name.startsWith('.new-source.desktop-backup-'))
      assert.equal(await readFile(join(root, backup, 'new.txt'), 'utf8'), 'new source content')
    } else assert.deepEqual(await readFile(join(destination, 'old.txt')), original)
  } else if (scenario === 'recover-after-restore') {
    const { recoverSourceReplacements } = await load('lib/packages/market-catalog/src/scanning/source-replacement.js')
    await recoverSourceReplacements(root)
    assert.deepEqual(await readFile(join(destination, 'old.txt')), original)
  } else if (scenario === 'crash-before-swap') {
    const staging = join(root, 'staging')
    await mkdir(staging)
    await writeFile(join(staging, 'new.txt'), 'new source content')
    const rename = fs.promises.rename
    fs.promises.rename = async (source, target) => {
      await rename(source, target)
      if (resolve(source) === destination && String(target).includes('backup')) process.exit(71)
    }
    syncBuiltinESMExports()
    const { replaceSourceDirectory } = await load('lib/packages/market-catalog/src/scanning/source-replacement.js')
    await replaceSourceDirectory(staging, destination)
    assert.fail('the child must stop at the filesystem transaction boundary')
  } else if (scenario === 'recover-before-swap') {
    const { recoverSourceReplacements } = await load('lib/packages/market-catalog/src/scanning/source-replacement.js')
    await recoverSourceReplacements(root)
    assert.deepEqual(await readFile(join(destination, 'old.txt')), original)
  } else if (scenario === 'crash-after-state') {
    const { CatalogContext } = await load('lib/packages/market-catalog/src/application/catalog-context.js')
    const { SourceStore } = await load('lib/packages/market-catalog/src/application/source-store.js')
    const context = new CatalogContext(contextOptions)
    const checkout = join(root, '.sources', 'fixture')
    await mkdir(checkout, { recursive: true })
    await writeFile(join(checkout, 'old.txt'), original)
    await context.load()
    await context.commit({ version: 1, sources: [{ id: 'fixture', kind: 'archive', url: `${url}?old=1` }], installed: {} })
    const rename = fs.promises.rename
    fs.promises.rename = async (source, target) => {
      await rename(source, target)
      if (resolve(target) === join(root, 'state.json')) process.exit(72)
    }
    syncBuiltinESMExports()
    const sources = new SourceStore(context, { downloadRegion: async () => 'global' })
    await sources.update('fixture', { url })
    assert.fail('the child must stop after the durable state commit')
  } else if (scenario === 'recover-after-state') {
    const { CatalogContext } = await load('lib/packages/market-catalog/src/application/catalog-context.js')
    const context = new CatalogContext(contextOptions)
    await context.load()
    assert.equal(context.state.sources[0].url.endsWith('/source.zip'), true)
    assert.equal(await readFile(join(root, '.sources', 'fixture', 'new.txt'), 'utf8'), 'new source content')
    assert.equal((await readdir(join(root, '.sources'))).some(name => name.endsWith('.json') && name.startsWith('.desktop-source-replace-')), false)
  } else if (scenario === 'linked-destination' || scenario === 'escaping-destination' || scenario === 'hostile-journal') {
    const managed = join(root, 'managed')
    const staging = join(managed, 'staging')
    const outside = join(root, 'outside')
    await mkdir(staging, { recursive: true })
    await mkdir(outside)
    await writeFile(join(staging, 'new.txt'), 'new source content')
    await writeFile(join(outside, 'sentinel.txt'), 'outside must survive')
    const { replaceSourceDirectory, recoverSourceReplacements } = await load('lib/packages/market-catalog/src/scanning/source-replacement.js')
    if (scenario === 'linked-destination') {
      const linked = join(managed, 'linked')
      await symlink(outside, linked, process.platform === 'win32' ? 'junction' : 'dir')
      await assert.rejects(replaceSourceDirectory(staging, linked, { root: managed }), /link|real director/iu)
    } else if (scenario === 'escaping-destination') {
      await assert.rejects(replaceSourceDirectory(staging, outside, { root: managed }), /escape|root/iu)
    } else {
      const filename = `.desktop-source-replace-${createHash('sha256').update('source').digest('hex').slice(0, 16)}.json`
      await writeFile(join(managed, filename), JSON.stringify({ version: 1, target: 'source', backup: '../outside', staging: 'staging', hadOriginal: true, phase: 'prepared' }))
      await assert.rejects(recoverSourceReplacements(managed), /invalid|journal/iu)
    }
    assert.equal(await readFile(join(outside, 'sentinel.txt'), 'utf8'), 'outside must survive')
  } else if (scenario === 'state-failure') {
    const { CatalogContext } = await load('lib/packages/market-catalog/src/application/catalog-context.js')
    const context = new CatalogContext(contextOptions)
    await context.load()
    const before = structuredClone(context.state)
    await mkdir(join(root, 'state.json'))
    await assert.rejects(context.commit({ version: 1, sources: [], installed: { 'fixture/suite': { enabled: true } } }))
    assert.deepEqual(context.state, before, 'failed disk persistence must not publish enabled in-memory state')
  } else if (scenario === 'archive-swap-failure' || scenario === 'rollback-failure') {
    const rename = fs.promises.rename
    const open = fs.promises.open
    fs.promises.rename = async (source, target) => {
      if (resolve(target) === destination && (scenario === 'rollback-failure' || !String(source).includes('backup'))) throw Object.assign(new Error('fixture replacement denied'), { code: 'EACCES' })
      return rename(source, target)
    }
    fs.promises.open = async (path, ...args) => {
      if (resolve(path) === join(destination, 'new.txt')) throw Object.assign(new Error('fixture copy denied'), { code: 'EACCES' })
      return open(path, ...args)
    }
    syncBuiltinESMExports()
    const { archiveInstall } = await load('lib/packages/market-catalog/src/scanning/archive.js')
    await assert.rejects(archiveInstall(url, destination, { allowHttp: true }), scenario === 'rollback-failure' ? /backup|recovery/iu : undefined)
    if (scenario === 'rollback-failure') {
      const backup = (await readdir(root)).find(name => name.includes('backup'))
      assert.ok(backup, 'failed rollback must retain its complete backup')
      assert.deepEqual(await readFile(join(root, backup, 'old.txt')), original)
    } else assert.deepEqual(await readFile(join(destination, 'old.txt')), original, 'replacement failure must restore the previous complete source')
  } else if (scenario === 'url-update-failure') {
    const { CatalogContext } = await load('lib/packages/market-catalog/src/application/catalog-context.js')
    const { SourceStore } = await load('lib/packages/market-catalog/src/application/source-store.js')
    const context = new CatalogContext(contextOptions)
    const checkout = join(root, '.sources', 'fixture')
    await mkdir(checkout, { recursive: true })
    await writeFile(join(checkout, 'old.txt'), original)
    await context.load()
    const before = { version: 1, sources: [{ id: 'fixture', kind: 'archive', url }], installed: {} }
    await context.commit(before)
    const sources = new SourceStore(context, { downloadRegion: async () => 'global' })
    await assert.rejects(sources.update('fixture', { url: url.replace('/source.zip', '/broken.zip') }))
    assert.deepEqual(context.state, before)
    assert.deepEqual(JSON.parse(await readFile(join(root, 'state.json'), 'utf8')), before)
    assert.deepEqual(await readFile(join(checkout, 'old.txt')), original)
  } else if (scenario === 'source-state-failure') {
    const { CatalogContext } = await load('lib/packages/market-catalog/src/application/catalog-context.js')
    const { SourceStore } = await load('lib/packages/market-catalog/src/application/source-store.js')
    const context = new CatalogContext(contextOptions)
    const checkout = join(root, '.sources', 'fixture')
    await mkdir(checkout, { recursive: true })
    await writeFile(join(checkout, 'old.txt'), original)
    await context.load()
    const before = { version: 1, sources: [{ id: 'fixture', kind: 'archive', url: `${url}?old=1` }], installed: {} }
    await context.commit(before)
    const rename = fs.promises.rename
    fs.promises.rename = async (source, target) => {
      if (resolve(target) === join(root, 'state.json')) throw Object.assign(new Error('fixture state commit denied'), { code: 'EACCES' })
      return rename(source, target)
    }
    syncBuiltinESMExports()
    const sources = new SourceStore(context, { downloadRegion: async () => 'global' })
    await assert.rejects(sources.update('fixture', { url }))
    assert.deepEqual(context.state, before)
    assert.deepEqual(JSON.parse(await readFile(join(root, 'state.json'), 'utf8')), before)
    assert.deepEqual(await readFile(join(checkout, 'old.txt')), original)
  } else if (scenario === 'archive-interrupted' || scenario === 'archive-traversal') {
    const { archiveInstall } = await load('lib/packages/market-catalog/src/scanning/archive.js')
    const targetUrl = url.replace('/source.zip', scenario === 'archive-interrupted' ? '/interrupted.zip' : '/traversal.zip')
    await assert.rejects(archiveInstall(targetUrl, destination, { allowHttp: true }))
    assert.deepEqual(await readFile(join(destination, 'old.txt')), original)
    assert.equal(fs.existsSync(join(root, 'outside.txt')), false)
  } else if (scenario === 'local-adopted-preserved') {
    const { CatalogContext } = await load('lib/packages/market-catalog/src/application/catalog-context.js')
    const { SourceStore } = await load('lib/packages/market-catalog/src/application/source-store.js')
    const context = new CatalogContext(contextOptions)
    await context.load()
    await context.commit({ version: 1, sources: [{ id: 'fixture', url: destination, local: true, adopted: true }], installed: {} })
    const sources = new SourceStore(context, { downloadRegion: async () => 'global' })
    await sources.update('fixture', { url: root })
    assert.deepEqual(await readFile(join(destination, 'old.txt')), original)
  } else if (scenario === 'archive-success') {
    const { archiveInstall } = await load('lib/packages/market-catalog/src/scanning/archive.js')
    const result = await archiveInstall(url, destination, { allowHttp: true })
    assert.match(result.sha256, /^[a-f0-9]{64}$/u)
    assert.equal(await readFile(join(destination, 'new.txt'), 'utf8'), 'new source content')
    assert.equal((await readdir(destination)).includes('old.txt'), false)
  } else throw new Error(`unknown recovery scenario: ${scenario}`)
  console.log(`market recovery scenario passed: ${scenario}`)
} finally {
  await new Promise(resolve => server.close(resolve))
}
