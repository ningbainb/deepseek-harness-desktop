import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { stringify } from 'yaml'

import { prepareSkillMarketMcpSentinel } from '../scripts/skill-market-safety-fixture.mjs'

const run = promisify(execFile)
const git = args => run('git', args, { windowsHide: true, timeout: 30_000 })
const script = (await readFile(new URL('../scripts/verify-skill-market.mjs', import.meta.url), 'utf8')).replaceAll('\r\n', '\n')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const require = createRequire(import.meta.url)
const marketRoot = dirname(require.resolve('dsh-agent-plugins-market/package.json'))
const loadMarket = path => import(pathToFileURL(join(marketRoot, 'lib/packages', path)).href)

async function prepare(t, existingState) {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-market-local-sources-'))
  t.after(() => rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }))
  const home = join(temporary, 'dsh-home'), source = join(temporary, 'fixture-source')
  const statePath = join(home, 'agent-plugins', 'state.json')
  if (existingState) {
    await mkdir(dirname(statePath), { recursive: true })
    await writeFile(statePath, existingState)
  }
  const bindings = {
    temporary, home, source, statePath, run, mkdir, readFile, writeFile, join, pathToFileURL, assert, stringify,
    agentsHome: join(temporary, 'agents-home'), userData: join(temporary, 'user-data'),
    workspace: join(temporary, 'workspace'), sourceUrl: pathToFileURL(source).href,
    checkout: join(home, 'agent-plugins', '.sources', 'desktop-fixture'),
    skillName: 'desktop-market-check', localName: 'desktop-retained-local-check', STAR_PROMPT_VERSION: '5.2.0',
    prepareSkillMarketMcpSentinel,
    // Profile linking belongs to native startup. Execute the real Git/state setup without loading Electron.
    async prepareSkillMarketProbe({ home }) {
      const profile = join(home, 'profiles', 'desktop')
      await mkdir(profile, { recursive: true })
      await writeFile(join(profile, 'cordis.patch.yml'), '[]\n')
    },
  }
  const start = script.indexOf('\ntry {\n  for (const directory')
  const end = script.indexOf("\n  markStage('launch')", start)
  assert.ok(start >= 0 && end > start, 'execute only the actual prelaunch setup')
  const execute = new AsyncFunction(...Object.keys(bindings), `let sharedMcp, originalSkill\n${script.slice(start + '\ntry {'.length, end)}\nreturn typeof fixtureSources === 'undefined' ? undefined : fixtureSources`)
  const setup = () => execute(...Object.values(bindings))
  return { ...bindings, setup }
}

test('prelaunch fixture retains the preset ID as a second unique Git suite without seeding the primary source', async t => {
  const fixture = await prepare(t)
  const sources = await fixture.setup()
  const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
  assert.equal(state.version, 1)
  assert.deepEqual(state.installed, {})
  assert.equal(state.sources.length, 1)
  assert.equal(state.sources[0].id, 'dsh-agent-plugins')
  assert.equal(state.sources[0].kind, 'git')
  assert.equal(new URL(state.sources[0].url).protocol, 'file:')
  assert.equal(sources.length, 2)
  const names = await Promise.all(sources.map(async source => JSON.parse(await readFile(join(source.repository, '.claude-plugin', 'plugin.json'), 'utf8')).name))
  assert.equal(new Set(names).size, 2, 'the preset must not create a duplicate desktop-market-suite card')
  assert.equal(names.filter(name => name === 'desktop-market-suite').length, 1)
})

test('installed market recovers a failed update then refreshes both real local Git checkouts and preserves URLs on reload', async t => {
  const fixture = await prepare(t)
  const sources = await fixture.setup()
  const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
  assert.equal(state.sources.length, 1)
  assert.equal(new URL(state.sources[0].url).protocol, 'file:', 'never acquire an uncontrolled remote')
  const { CatalogContext } = await loadMarket('market-catalog/src/application/catalog-context.js')
  const { InstallStore } = await loadMarket('market-catalog/src/application/install-store.js')
  const { SourceStore } = await loadMarket('market-catalog/src/application/source-store.js')
  const { presetSourceRef } = await loadMarket('market-contracts/src/model/preset-source.js')
  const context = new CatalogContext({ userRoot: dirname(fixture.statePath), dataRoot: join(fixture.temporary, 'data'), agentsRoot: fixture.agentsHome, onChanged: async () => {} })
  await context.load()
  const store = new SourceStore(context, { downloadRegion: () => 'auto', localePreference: () => 'zh' })
  const installs = new InstallStore(context, store)
  const seeds = [{ id: 'desktop-fixture', url: fixture.sourceUrl, kind: 'git' }, presetSourceRef()]
  await installs.mergeSources(seeds)
  assert.deepEqual(context.state.sources.map(source => source.id).sort(), ['desktop-fixture', 'dsh-agent-plugins'])
  assert.ok(context.state.sources.every(source => new URL(source.url).protocol === 'file:'))
  const before = await readFile(fixture.statePath)
  const skillPath = join(fixture.checkout, 'skills', fixture.skillName, 'SKILL.md')
  const skill = await readFile(skillPath)
  await assert.rejects(store.update('desktop-fixture', { url: pathToFileURL(join(fixture.temporary, 'missing-source.git')).href }))
  assert.deepEqual(await readFile(fixture.statePath), before)
  assert.deepEqual(await readFile(skillPath), skill)
  for (const source of sources) {
    await writeFile(join(source.repository, 'refresh-proof.txt'), `new upstream commit for ${source.id}\n`)
    await git(['-C', source.repository, 'add', 'refresh-proof.txt'])
    await git(['-c', 'user.name=Desktop Fixture', '-c', 'user.email=fixture@invalid.test', '-C', source.repository, 'commit', '--no-gpg-sign', '-m', 'refresh positive control'])
    source.head = (await git(['-C', source.repository, 'rev-parse', 'HEAD'])).stdout.trim()
  }
  const helperStart = script.indexOf('async function assertRefreshedSourceCheckouts(')
  const helperEnd = script.indexOf('\nasync function waitForActivationReceipt()', helperStart)
  assert.ok(helperStart >= 0 && helperEnd > helperStart)
  const verify = await new AsyncFunction('assert', 'readFile', 'statePath', 'run', `${script.slice(helperStart, helperEnd)}\nreturn assertRefreshedSourceCheckouts`)(assert, readFile, fixture.statePath, run)
  await assert.rejects(verify(sources), 'stale or missing checkouts must fail before all-source refresh')
  await store.refresh()
  await verify(sources)
  const reloaded = new CatalogContext({ userRoot: dirname(fixture.statePath), dataRoot: join(fixture.temporary, 'data'), agentsRoot: fixture.agentsHome, onChanged: async () => {} })
  await reloaded.load()
  await new InstallStore(reloaded, store).mergeSources(seeds)
  await verify(sources)
  assert.equal(reloaded.state.sources.length, 2)
  assert.deepEqual(await readFile(skillPath), skill)
})

test('prelaunch fixture refuses to overwrite existing market user state', async t => {
  const bytes = Buffer.from('{"version":1,"sources":[],"installed":{"keep/me":{"enabled":true}}}\n')
  const fixture = await prepare(t, bytes)
  await assert.rejects(fixture.setup(), { code: 'EEXIST' })
  assert.deepEqual(await readFile(fixture.statePath), bytes)
})
