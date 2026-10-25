import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { composeEntries } from '../src/skill-market-sdk-adapter.mjs'
import { parse } from 'yaml'

import {
  BUILTIN_BUNDLES,
  BUILTIN_RUNTIME_PACKAGES,
  DESKTOP_PATCH_CONFIG,
  createDesktopProfileManifest,
  ensureDesktopProfile,
  mergeDesktopPatch,
} from '../src/profile.mjs'

const market = 'dsh-agent-plugins-market'
const desktop = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const workspace = parse(readFileSync(new URL('../../../pnpm-workspace.yaml', import.meta.url), 'utf8'))
const marketEntry = patch => composeEntries([
  { insert: [{ id: market, name: market }] },
  ...parse(patch),
]).find(entry => entry.id === market)

test('the embedded market is mounted once alongside the retained local Skill Center', () => {
  assert.equal(BUILTIN_BUNDLES.filter(name => name === market).length, 1)
  assert.equal(BUILTIN_RUNTIME_PACKAGES.filter(name => name === market).length, 1)
  const bundles = createDesktopProfileManifest().dsh.profile.bundles
  assert.equal(bundles.filter(name => name === market).length, 1)
  assert.ok(bundles.includes('@linxin666/dsh-client-ui-skill-explorer'))
  assert.equal(desktop.dependencies[market], '0.11.1')
})

test('a fresh market stays inactive until explicit activation and cannot enable feedback or translation by default', () => {
  const entry = marketEntry(DESKTOP_PATCH_CONFIG)
  assert.equal(entry.disabled, true)
  assert.equal(entry.config?.feedbackEnabled, false)
  assert.equal(entry.config?.translationEnabled, false)
  assert.equal(entry.config?.autoUpdateSources, false)
  assert.equal(entry.config?.scanProjectLayouts, false)
})

test('profile refresh preserves explicit market choices and a disabled market without replacing local sources', () => {
  const userPatch = `- id: ${market}
  name: ${market}
  disabled: true
  config:
    feedbackEnabled: true
    translationEnabled: true
    sources:
      - id: existing-source
        url: E:/my-skills
`
  const merged = mergeDesktopPatch(userPatch)
  const entry = marketEntry(merged)
  assert.equal(entry.disabled, true)
  assert.equal(entry.config.feedbackEnabled, true)
  assert.equal(entry.config.translationEnabled, true)
  assert.deepEqual(entry.config.sources, [{ id: 'existing-source', url: 'E:/my-skills' }])
  assert.deepEqual(marketEntry(mergeDesktopPatch(merged)), entry)
})

test('an existing explicit market activation is not silently revoked during profile refresh', () => {
  const patch = mergeDesktopPatch(`- id: ${market}\n  disabled: false\n  config:\n    translationEnabled: false\n`)
  assert.equal(marketEntry(patch).disabled, false)
  assert.equal(marketEntry(mergeDesktopPatch(patch)).disabled, false)
})

test('adopting a previously installed community market preserves its bundle activation and later disable choice', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-market-adoption-'))
  const profile = join(home, 'profiles', 'desktop')
  try {
    await mkdir(profile, { recursive: true })
    await writeFile(join(profile, 'package.json'), JSON.stringify({
      private: true, dependencies: { [market]: '0.11.1' }, dsh: { profile: { bundles: [market] } },
    }))
    await ensureDesktopProfile({ dshHome: home })
    const patchPath = join(profile, 'cordis.patch.yml')
    const first = await readFile(patchPath, 'utf8')
    assert.equal(marketEntry(first).disabled, false, 'an existing bundle is an explicit activation, not a fresh default')
    await ensureDesktopProfile({ dshHome: home })
    assert.equal(marketEntry(await readFile(patchPath, 'utf8')).disabled, false)
    await writeFile(patchPath, `${first}\n- id: ${market}\n  disabled: true\n`)
    await ensureDesktopProfile({ dshHome: home })
    assert.equal(marketEntry(await readFile(patchPath, 'utf8')).disabled, true)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('a completely fresh profile boots with the embedded market inactive', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-market-fresh-'))
  try {
    await ensureDesktopProfile({ dshHome: home })
    const patch = await readFile(join(home, 'profiles', 'desktop', 'cordis.patch.yml'), 'utf8')
    assert.equal(marketEntry(patch).disabled, true)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('market prerelease ranges explicitly resolve to the Desktop SDK cohort instead of rc.2 from 0.2.0', () => {
  for (const name of ['dsh-atomic-write', 'dsh-home-paths', 'dsh-hook-protocol', 'dsh-lsp', 'dsh-lsp-stdio', 'dsh-tool-lsp']) {
    assert.equal(workspace.overrides[`${market}>@deepseek-ai/${name}`], desktop.dependencies['@deepseek-ai/dsh'], name)
  }
})

test('the installed market and its runtime SDK dependencies have the reviewed package identities', () => {
  const require = createRequire(new URL('../package.json', import.meta.url))
  const manifestPath = require.resolve(`${market}/package.json`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const fromMarket = createRequire(manifestPath)
  assert.equal(manifest.version, '0.11.1')
  for (const name of Object.keys(manifest.dependencies).filter(name => name.startsWith('@deepseek-ai/dsh-'))) {
    const dependency = JSON.parse(readFileSync(fromMarket.resolve(`${name}/package.json`), 'utf8'))
    assert.equal(dependency.version, desktop.dependencies['@deepseek-ai/dsh'], name)
  }
})

test('a sources-only config replacement still defaults to no public feedback and no automatic translation', async () => {
  const require = createRequire(new URL('../package.json', import.meta.url))
  const root = dirname(require.resolve(`${market}/package.json`))
  const contract = await import(pathToFileURL(join(root, 'lib/packages/market-contracts/src/contracts/settings.js')).href)
  const settings = contract.resolveMarketSettings({ sources: [{ id: 'local-source', url: 'E:/skills' }] })
  assert.equal(settings.feedbackEnabled, false)
  assert.equal(settings.translationEnabled, false)
  const explicit = contract.resolveMarketSettings({ feedbackEnabled: true, translationEnabled: true })
  assert.equal(explicit.feedbackEnabled, true)
  assert.equal(explicit.translationEnabled, true)
})
