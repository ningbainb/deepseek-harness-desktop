#!/usr/bin/env node
/**
 * Runtime identity guard - DeepSeek Harness Desktop 3.2.0.
 *
 * WHY THIS EXISTS
 * ---------------
 * Some @deepseek-ai/* packages carry module-level identity. @deepseek-ai/dsh-tools,
 * for example, keys its tool scheduler with a module-scoped Symbol:
 *
 *   const TOOL_RUNTIME_SCHEDULER = Symbol("@deepseek-ai/dsh-tools.scheduler")
 *
 * If two physical copies of that package land in one Node process, there are two
 * distinct Symbols. The agent loop then reads `ctx.tools[TOOL_RUNTIME_SCHEDULER]`
 * and gets undefined, and every tool call dies with:
 *
 *   Cannot read properties of undefined (reading 'prepare')
 *
 * The failure surfaces with no stack and "source: UNKNOWN" in the UI, because
 * the renderer cannot attribute an error raised in a duplicated core module.
 * (BUG-REPORT desktop 3.0.9, P0 item 1 and 2.)
 *
 * This script is the CI enforcement of that invariant:
 *
 *   an identity-sensitive package must resolve to exactly ONE version
 *   across the entire workspace.
 *
 * SCOPE: WHAT IT CHECKS, AND WHAT IT DELIBERATELY DOES NOT
 * --------------------------------------------------------
 * - It reads `packages:` entries in pnpm-lock.yaml, i.e. actual RESOLUTIONS, not
 *   package.json specifiers. Two importers may declare different ranges
 *   (`^0.1.1-rc.1` and `0.1.1-rc.1`) and still be perfectly fine as long as pnpm
 *   resolved both to the same concrete version. Comparing resolutions rather than
 *   specifiers is what makes that case pass instead of producing noise.
 * - It only inspects identity-sensitive packages. Build/test-only tooling
 *   (tsdown, vitest, typescript, jsdom) is allowed to have several versions.
 * - The identity-sensitive list is DERIVED from the real runtime graph (Desktop
 *   app `dependencies` plus workspace packages' runtime `dependencies`). It is
 *   never hard-coded here, so adding a runtime dependency needs no edit to this
 *   file to stay protected.
 * - A missing resolution is a FAILURE, not a silent pass. If the lockfile cannot
 *   tell us how an identity package resolved, the invariant is unverified and CI
 *   must say so.
 *
 * RELATIONSHIP TO scripts/runtime-deps-check.mjs
 * ----------------------------------------------
 *   runtime-deps-check  : "does committed runtime JS import something undeclared?"
 *   runtime-graph-check : "can one Runtime load two copies of an identity package?"
 *
 * Different failure modes, different data sources; both stay.
 *
 * Usage: node scripts/runtime-graph-check.mjs
 * Tests: node --test scripts/runtime-graph-check.test.mjs
 */

import { readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * A `packages:` entry key: two-space indent, quoted `name@version`, trailing colon.
 * The version may carry a pnpm peer-resolution suffix such as `(react@18.3.1)`.
 */
const PACKAGE_ENTRY = /^ {2}'((?:@[^'/]+\/)?[^'@]+)@([^']+)':\s*$/gm

const PROBLEM = Object.freeze({
  MULTIPLE_VERSIONS: 'multiple-versions',
  MISSING_RESOLUTION: 'missing-resolution',
  UNANALYZABLE: 'unanalyzable',
})

/** Strip a pnpm peer-resolution suffix: `0.1.1-rc.1(abc123)` -> `0.1.1-rc.1`. */
export function baseVersion(version) {
  const index = String(version).indexOf('(')
  return index === -1 ? String(version) : String(version).slice(0, index)
}

/**
 * Parse `packages:` entries into name -> Set(resolved versions).
 *
 * Pure function (no filesystem access) so the node:test suite can feed inline
 * lockfile fixtures.
 *
 * @param {string} lockfileText raw pnpm-lock.yaml
 * @returns {Map<string, Set<string>>}
 */
export function parseLockfileResolutions(lockfileText) {
  const resolutions = new Map()
  if (typeof lockfileText !== 'string' || lockfileText.length === 0) return resolutions
  // Scope the scan to the `packages:` section; ignores `importers:` and
  // `snapshots:` which repeat the same names in a different shape.
  const header = /^packages:\s*$/m.exec(lockfileText)
  const section = header ? lockfileText.slice(header.index + header[0].length) : lockfileText
  for (const match of section.matchAll(PACKAGE_ENTRY)) {
    const [, name, version] = match
    if (!resolutions.has(name)) resolutions.set(name, new Set())
    resolutions.get(name).add(baseVersion(version))
  }
  return resolutions
}

/**
 * Parse `importers:` into importer -> Map(depName -> { specifier, section }).
 *
 * Used only for diagnostics: when the invariant breaks, say who asked for the
 * conflicting versions. Best effort - a format change must not turn into a
 * false failure, it only degrades the error message.
 *
 * @param {string} lockfileText
 * @returns {Map<string, Map<string, { specifier: string, section: string }>>}
 */
export function parseLockfileImporters(lockfileText) {
  const importers = new Map()
  if (typeof lockfileText !== 'string' || lockfileText.length === 0) return importers
  const lines = lockfileText.split('\n')
  let inImporters = false
  let current = null
  let section = 'dependencies'
  let pending = null
  for (const line of lines) {
    if (/^importers:\s*$/.test(line)) {
      inImporters = true
      continue
    }
    if (!inImporters) continue
    // Any non-indented line ends the importers block.
    if (line.length > 0 && !/^\s/.test(line)) break
    const importer = /^ {2}([^ :][^:]*):\s*$/.exec(line)
    if (importer) {
      current = importer[1]
      importers.set(current, new Map())
      section = 'dependencies'
      pending = null
      continue
    }
    const depSection = /^ {4}(dependencies|devDependencies):\s*$/.exec(line)
    if (depSection) {
      section = depSection[1]
      pending = null
      continue
    }
    if (current === null) continue
    const depName = /^ {6}'?([^':]+)'?:\s*$/.exec(line)
    if (depName) {
      pending = depName[1]
      continue
    }
    const specifier = /^ {8}specifier:\s*(.+?)\s*$/.exec(line)
    if (specifier && pending) {
      importers.get(current).set(pending, { specifier: specifier[1], section })
      pending = null
    }
  }
  return importers
}

/**
 * Derive the identity-sensitive package list from real runtime manifests.
 *
 * Only `dependencies` counts, never `devDependencies`: plugin packages declare
 * the @deepseek-ai/* SDK in devDependencies purely for typechecking, and the
 * bundle keeps those external (see `neverBundle` in shared/tsdown.client.ts),
 * so they never enter a Runtime.
 *
 * @param {{ name?: string, dependencies?: Record<string,string> }[]} manifests
 * @returns {string[]} sorted identity-sensitive package names
 */
export function collectIdentityPackages(manifests) {
  const identity = new Set()
  for (const manifest of manifests ?? []) {
    for (const name of Object.keys(manifest?.dependencies ?? {})) {
      if (name.startsWith('@deepseek-ai/')) identity.add(name)
    }
  }
  return [...identity].sort()
}

/**
 * The exported invariant check.
 *
 * @param {object} input
 * @param {string} input.lockfileText raw pnpm-lock.yaml
 * @param {string[]} input.identityPackages names that must stay single-version
 * @returns {{ kind: string, name?: string, versions?: string[], message?: string }[]}
 */
export function checkRuntimeIdentityGraph({ lockfileText, identityPackages = [] } = {}) {
  const problems = []
  if (typeof lockfileText !== 'string' || lockfileText.length === 0) {
    return [{
      kind: PROBLEM.UNANALYZABLE,
      message: 'lockfile is empty or unreadable; the runtime identity invariant is unverified',
    }]
  }
  const resolutions = parseLockfileResolutions(lockfileText)
  if (resolutions.size === 0) {
    return [{
      kind: PROBLEM.UNANALYZABLE,
      message: 'lockfile contains no packages: entries; the runtime identity invariant is unverified',
    }]
  }
  for (const name of identityPackages) {
    const versions = resolutions.get(name)
    if (versions === undefined || versions.size === 0) {
      problems.push({ kind: PROBLEM.MISSING_RESOLUTION, name, versions: [] })
      continue
    }
    if (versions.size > 1) {
      problems.push({ kind: PROBLEM.MULTIPLE_VERSIONS, name, versions: [...versions].sort() })
    }
  }
  return problems
}

/** Workspace manifests whose `dependencies` describe a real Runtime graph. */
async function runtimeManifests() {
  const paths = ['apps/dsh-desktop/package.json']
  for (const group of ['packages', 'packages/skins']) {
    let entries = []
    try {
      entries = await readdir(join(ROOT, group), { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      paths.push(join(group, entry.name, 'package.json'))
    }
  }
  const manifests = []
  for (const relative of paths) {
    try {
      manifests.push(JSON.parse(readFileSync(join(ROOT, relative), 'utf8')))
    } catch {
      // A directory without a package.json is not a workspace package.
    }
  }
  return manifests
}

const isCli = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url

if (isCli) {
  const manifests = await runtimeManifests()
  const identityPackages = collectIdentityPackages(manifests)
  let lockfileText = ''
  try {
    lockfileText = readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8')
  } catch (error) {
    console.error('[FAIL] cannot read pnpm-lock.yaml:', error?.message ?? error)
    console.error('       the runtime identity invariant is unverified')
    process.exit(1)
  }

  const problems = checkRuntimeIdentityGraph({ lockfileText, identityPackages })
  if (problems.length === 0) {
    console.log(`[OK] runtime identity invariant holds for ${identityPackages.length} identity-sensitive packages`)
    process.exit(0)
  }

  const importers = parseLockfileImporters(lockfileText)
  const consumersOf = (name) => {
    const found = []
    for (const [importer, deps] of importers) {
      const dep = deps.get(name)
      if (dep) found.push(`- ${importer} (${dep.section}) declares "${dep.specifier}"`)
    }
    return found
  }

  for (const problem of problems) {
    if (problem.kind === PROBLEM.UNANALYZABLE) {
      console.error(`[FAIL] ${problem.message}`)
      continue
    }
    if (problem.kind === PROBLEM.MISSING_RESOLUTION) {
      console.error(`[FAIL] runtime identity violation`)
      console.error(`       ${problem.name} has no resolution in pnpm-lock.yaml`)
      console.error('       an identity-sensitive package that never resolved is an unverified invariant')
      continue
    }
    console.error(`[FAIL] runtime identity violation`)
    console.error(`       ${problem.name} resolved versions:`)
    for (const version of problem.versions) console.error(`       - ${version}`)
    const consumers = consumersOf(problem.name)
    if (consumers.length > 0) {
      console.error('       consumers:')
      for (const consumer of consumers) console.error(`       ${consumer}`)
    }
    console.error(`       A Runtime may load multiple physical copies of ${problem.name.split('/')[1] ?? problem.name}.`)
    console.error('')
  }
  console.error(`${problems.length} identity-sensitive package(s) FAILED the runtime graph check`)
  process.exit(1)
}
