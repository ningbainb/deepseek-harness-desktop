import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { installDesktopMarketTeamCompatibility, MARKET_TEAM_REVIEWED_ENTRY } from '../src/runtime-market-team-compat.mjs'

const require = createRequire(import.meta.url)
const reviewedEntry = await readFile(require.resolve('dsh-agent-plugins-market'), 'utf8')

test('runtime market entry pin agrees with the reviewed support manifest', async () => {
  const manifest = JSON.parse(await readFile(new URL('../runtime-support/builtin-plugin-adaptation.json', import.meta.url), 'utf8'))
  const plugins = manifest.plugins ?? manifest.packages
  assert.deepEqual(plugins.find(plugin => plugin.name === 'dsh-agent-plugins-market').desktopCompatibility.reviewedEntry, MARKET_TEAM_REVIEWED_ENTRY)
})

for (const [label, version, source] of [
  ['newer package version', '0.12.0', reviewedEntry],
  ['same-version customized entry', '0.11.1', 'export function apply(ctx) { return ctx }\nexport const customEntry = true\n'],
]) {
  test(`native module loading preserves ${label} without the audited market wrapper`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-market-entry-identity-'))
    const packageRoot = join(root, 'node_modules', 'dsh-agent-plugins-market')
    let dispose
    try {
      await mkdir(join(packageRoot, 'lib', 'packages', 'market-bundle', 'src'), { recursive: true })
      await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: 'dsh-agent-plugins-market', version, type: 'module', main: 'lib/index.js' }))
      await writeFile(join(packageRoot, 'lib', 'index.js'), source)
      await writeFile(join(packageRoot, 'lib', 'packages', 'market-bundle', 'src', 'index.js'), 'export function apply(ctx) { return ctx }\n')
      installDesktopMarketTeamCompatibility({ effect(factory) { dispose = factory() } })
      const module = await import(pathToFileURL(join(packageRoot, 'lib', 'index.js')).href)
      const sentinel = { userOwnedEntry: true }
      assert.equal(module.apply(sentinel), sentinel, 'unknown package must receive its original context and implementation')
      if (label === 'same-version customized entry') assert.equal(module.customEntry, true)
      assert.equal(await readFile(join(packageRoot, 'lib', 'index.js'), 'utf8'), source)
    } finally {
      dispose?.()
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })
}
