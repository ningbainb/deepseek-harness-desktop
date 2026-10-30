import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, test } from 'node:test'
import { pathToFileURL } from 'node:url'

import { ensureDesktopProfile } from '../src/profile.mjs'

const appRequire = createRequire(new URL('../package.json', import.meta.url))
const { composeEntries, loadOptionalPatches, loadProfileDirectory } = await import(pathToFileURL(appRequire.resolve('@deepseek-ai/dsh-app-boot')).href)
const pipeURL = pathToFileURL(appRequire.resolve('@linxin666/dsh-desktop-pipe-webserver'))
const pipe = await import(pipeURL.href)
const { Context } = createRequire(pipeURL)('@deepseek-ai/cordis')
const { Peer } = appRequire('@deepseek-ai/dsh-client-connection')
const aggregateRequire = createRequire(appRequire.resolve('@linxin666/dsh-web-all'))
const unexpectedGatewayCall = () => { throw new Error('Composition regression must not invoke model or session APIs') }
let home
let rows

before(async () => {
  home = await mkdtemp(join(tmpdir(), 'dsh-remote-profile-composition-'))
  await ensureDesktopProfile({ dshHome: home })
  const profile = loadProfileDirectory('dsh', join(home, 'profiles', 'desktop'), appRequire.resolve('@deepseek-ai/dsh/package.json'))
  assert.deepEqual(profile.skippedBundles, [], 'Compile every actual managed Desktop bundle')
  assert.ok(profile.patches.length > 0, 'Include the generated managed user layer, not only bundle defaults')
  rows = composeEntries([
    ...profile.layers.flatMap(layer => layer.patches),
    ...profile.patches,
    ...(loadOptionalPatches('dsh', join(home, 'cordis.patch.yml')) ?? []),
  ])
})

after(async () => {
  if (home === undefined) return
  assert.equal(dirname(home), resolve(tmpdir()))
  assert.ok(home.startsWith(join(tmpdir(), 'dsh-remote-profile-composition-')))
  await rm(home, { recursive: true, force: true })
})

function rowFor(id) {
  const matches = rows.filter(row => row.id === id)
  assert.equal(matches.length, 1, `Exactly one composed ${id} row`)
  assert.notEqual(matches[0].disabled, true)
  return matches[0]
}

async function mountRow(ctx, row) {
  // Resolve the actual NPM aggregate entry selected by the official compiler.
  const shell = await import(pathToFileURL(appRequire.resolve(row.name)).href)
  return await ctx.plugin(shell, row.config)
}

async function gateResult(ctx, remote) {
  let delegated = 0
  const request = {
    headers: { host: remote ? '192.168.1.8:45126' : '127.0.0.1' },
    socket: { remoteAddress: remote ? '192.168.1.9' : '127.0.0.1' },
  }
  const allowed = await ctx.waterfall('api/gate', request, 'session.list', () => { delegated++; return true })
  return { allowed, delegated }
}

function snapshotUpdates(web) {
  return ['/api/update/status', '/api/update/run'].map(path => {
    const route = web.exact.get(path)
    assert.equal(typeof route?.handler, 'function', `Dedicated updater owns ${path}`)
    return [path, route]
  })
}

for (const order of ['updater-first', 'remote-first']) {
  test(`complete managed profile mounts remote and update through actual aggregate shell (${order})`, { timeout: 15_000 }, async t => {
    const remoteRow = rowFor('web-ui-remote-web-ui')
    const updateRow = rowFor('web-ui-update')
    assert.equal(updateRow.config.plugin, '@linxin666/dsh-update')
    assert.equal(remoteRow.config.embeddedUpdateRoutes, false)
    assert.equal(aggregateRequire.resolve('@linxin666/dsh-remote-web-ui'), appRequire.resolve('@linxin666/dsh-remote-web-ui'),
      'Aggregate dynamic import must resolve the actual Desktop remote override')

    const previousLanBase = process.env.DSH_DESKTOP_LAN_GATEWAY_BASE
    delete process.env.DSH_DESKTOP_LAN_GATEWAY_BASE
    const ctx = new Context()
    pipe.apply(ctx)
    const web = ctx.get('webServer')
    ctx.provide('connection', { createPeer: options => new Peer(ctx, options) })
    ctx.provide('typertGateway', { invoke: unexpectedGatewayCall, stream: unexpectedGatewayCall })
    const unexpectedUserDataCall = () => { throw new Error('Unpaired regression must not access user data') }
    ctx.provide('userScope', {
      bindDevice: unexpectedUserDataCall,
      grantWorkspace: unexpectedUserDataCall,
      revokeDevice: unexpectedUserDataCall,
    })
    let remoteFiber
    let updateFiber
    const errors = []
    ctx.on('internal/error', error => { errors.push(error) })
    try {
      let firstOwner
      if (order === 'updater-first') {
        updateFiber = await mountRow(ctx, updateRow)
        firstOwner = snapshotUpdates(web)
        remoteFiber = await mountRow(ctx, remoteRow)
      } else {
        remoteFiber = await mountRow(ctx, remoteRow)
        firstOwner = web.exact.get('/api/pair/issue')
        updateFiber = await mountRow(ctx, updateRow)
      }
      const issue = await web.fetch(new Request('http://127.0.0.1/api/pair/issue', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      }))
      t.diagnostic(JSON.stringify({ order, composedRemoteConfig: remoteRow.config,
        pairIssueRegistered: web.exact.has('/api/pair/issue'), issueStatus: issue.status }))
      assert.equal(issue.status, 409, 'Real pairing route must report lan-required, never an absent-route 404')
      assert.equal((await issue.json()).code, 'lan-required')
      assert.equal(remoteRow.config.plugin, '@linxin666/dsh-remote-web-ui')
      const updateOwner = snapshotUpdates(web)
      if (order === 'updater-first') assert.deepEqual(updateOwner, firstOwner)
      else assert.equal(web.exact.get('/api/pair/issue'), firstOwner)
      assert.deepEqual([...web.exact.keys()].filter(path => path.startsWith('/api/update/')).sort(),
        ['/api/update/run', '/api/update/status'])
      assert.equal(web.prefixes.has('/m/api'), true)
      assert.equal((await web.fetch(new Request('http://127.0.0.1/api/pair/status'))).status, 200)
      const mobile = await web.fetch(new Request('http://127.0.0.1/m'))
      assert.equal(mobile.status, 200)
      assert.match(await mobile.text(), /<!doctype html>/iu)
      assert.deepEqual(await gateResult(ctx, false), { allowed: true, delegated: 1 })
      assert.deepEqual(await gateResult(ctx, true), { allowed: false, delegated: 0 }, 'Default remote full API remains denied')
      for (const path of ['/api/pair/issue', '/api/update/status']) {
        const route = web.exact.get(path)
        assert.throws(() => web.register(route), /duplicate exact route/u)
        assert.equal(web.exact.get(path), route, 'Rejected duplicate cannot replace its owner')
      }

      await remoteFiber.dispose()
      assert.deepEqual(snapshotUpdates(web), updateOwner, 'Removing remote preserves both dedicated update handlers')
      assert.equal([...web.exact.keys()].some(path => path.startsWith('/api/pair/')), false)
      assert.equal(web.prefixes.has('/m/api'), false)
      assert.equal((await web.fetch(new Request('http://127.0.0.1/m'))).status, 404)
      assert.deepEqual(await gateResult(ctx, true), { allowed: true, delegated: 1 }, 'Remote disposal removes its gate listener')
      remoteFiber = await mountRow(ctx, remoteRow)
      assert.equal(web.exact.has('/api/pair/issue'), true, 'Remount restores exactly one remote owner')
      assert.deepEqual(snapshotUpdates(web), updateOwner)
      assert.deepEqual(await gateResult(ctx, true), { allowed: false, delegated: 0 })
      await remoteFiber.dispose()
      await updateFiber.dispose()
      assert.equal(web.exact.size, 0, 'Remove aggregate health routes and every owner route')
      assert.equal(web.prefixes.size, 0)
      assert.equal(web.upgrades.size, 0)
      assert.deepEqual(errors, [])
    } finally {
      await ctx.fiber.dispose()
      if (previousLanBase === undefined) delete process.env.DSH_DESKTOP_LAN_GATEWAY_BASE
      else process.env.DSH_DESKTOP_LAN_GATEWAY_BASE = previousLanBase
    }
    assert.equal(web.exact.size, 0)
    assert.equal(web.prefixes.size, 0)
    assert.equal(web.upgrades.size, 0)
  })
}
