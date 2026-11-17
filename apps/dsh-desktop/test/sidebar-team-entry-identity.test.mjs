import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { installDesktopMarketTeamCompatibility, SIDEBAR_TEAM_REVIEWED_ENTRY } from '../src/runtime-market-team-compat.mjs'

const require = createRequire(import.meta.url)
const entryPath = require.resolve('dsh-better-sidebar')
const reviewedEntry = await readFile(entryPath, 'utf8')

test('sidebar reviewed entry pin agrees with the support manifest', async () => {
  const manifest = JSON.parse(await readFile(new URL('../runtime-support/builtin-plugin-adaptation.json', import.meta.url), 'utf8'))
  assert.deepEqual(manifest.plugins.find(plugin => plugin.name === 'dsh-better-sidebar').desktopCompatibility.reviewedEntry, SIDEBAR_TEAM_REVIEWED_ENTRY)
})

for (const [label, version, source, reviewed = false] of [
  ['newer package version', '0.25.0', reviewedEntry],
  ['same-version customized entry', '0.24.1', 'export function apply(ctx) { return ctx }\nexport const customEntry = true\n'],
  ['reviewed all-LF patched entry', '0.24.1', reviewedEntry.replaceAll('\r\n', '\n'), true],
  ['same-version all-LF code modification', '0.24.1', reviewedEntry.replaceAll('\r\n', '\n').replace('autoOpenSubagent: true', 'autoOpenSubagent: !0  ')],
]) {
  test(`native module loading ${reviewed ? 'adapts' : 'preserves'} sidebar ${label}`, async () => {
    if (label === 'same-version all-LF code modification') {
      assert.notEqual(source, reviewedEntry.replaceAll('\r\n', '\n'))
      assert.equal(Buffer.byteLength(source), Buffer.byteLength(reviewedEntry.replaceAll('\r\n', '\n')), 'the code mutation control must defeat SHA, not merely the byte-length check')
    }
    const root = await mkdtemp(join(tmpdir(), 'dsh-sidebar-entry-identity-'))
    const packageRoot = join(root, 'node_modules', 'dsh-better-sidebar')
    let dispose
    try {
      await mkdir(join(packageRoot, 'lib'), { recursive: true })
      await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: 'dsh-better-sidebar', version, type: 'module', main: 'lib/index.js' }))
      await writeFile(join(packageRoot, 'lib', 'index.js'), source)
      // Resolve the unchanged bundle's real public SDK imports from its actual
      // NPM dependency directory; no SDK replacement or modified vendor files.
      const vendorRequire = createRequire(entryPath)
      const imports = new Set([...source.matchAll(/from "([^".][^"]*)"/gu)].map(match => match[1]).filter(name => !name.startsWith('node:')))
      for (const name of imports) {
        let dependencyRoot = dirname(vendorRequire.resolve(name))
        for (;;) {
          const manifest = await readFile(join(dependencyRoot, 'package.json'), 'utf8').then(JSON.parse).catch(() => undefined)
          if (manifest?.name === name) break
          const parent = dirname(dependencyRoot)
          assert.notEqual(parent, dependencyRoot, `actual dependency root not found: ${name}`)
          dependencyRoot = parent
        }
        const target = join(packageRoot, 'node_modules', name)
        await mkdir(dirname(target), { recursive: true })
        await symlink(dependencyRoot, target, 'junction')
      }
      installDesktopMarketTeamCompatibility({ effect(factory) { dispose = factory() } })
      const module = await import(pathToFileURL(join(packageRoot, 'lib', 'index.js')).href)
      if (reviewed) assert.match(module.apply.toString(), /wrapSidebarTeamContext/u)
      else assert.doesNotMatch(module.apply.toString(), /wrapSidebarTeamContext/u)
      if (label === 'same-version customized entry') {
        const sentinel = { userOwnedEntry: true }
        assert.equal(module.apply(sentinel), sentinel)
        assert.equal(module.customEntry, true)
      }
      assert.equal(await readFile(join(packageRoot, 'lib', 'index.js'), 'utf8'), source)
    } finally {
      dispose?.()
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })
}
