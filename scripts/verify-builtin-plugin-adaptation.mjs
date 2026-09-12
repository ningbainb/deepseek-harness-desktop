#!/usr/bin/env node
// Read-only gate for the packages actually selected by the Desktop resolver.
// Passing this gate establishes source/version/patch/mount preservation only.
// It does not execute the documented tests or certify interactive acceptance.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BUILTIN_BUNDLES,
  BUILTIN_RUNTIME_PACKAGES,
  DEPENDENCY_ONLY_BUNDLES,
  DESKTOP_REPAIR_BUNDLE,
  resolveRuntimePackages,
} from '../apps/dsh-desktop/src/profile.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(repoRoot, 'apps/dsh-desktop/package.json'))
const { parse } = require('yaml')
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const normalize = text => text.replace(/\r\n/g, '\n')
const samePath = (left, right) => relative(left, right) === ''
const contained = (root, path) => {
  const rel = relative(root, path)
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`))
}

/** Extract the resulting text of each unified-diff hunk, including its context. */
export function patchPostimages(patchText) {
  const blocks = []
  let file
  let block
  for (const line of normalize(patchText).split('\n')) {
    if (line.startsWith('diff --git ')) {
      file = undefined
      block = undefined
    } else if (line.startsWith('+++ b/')) {
      file = line.slice(6).split('\t')[0]
      if (file.split(/[\\/]/).some(part => part === '..') || isAbsolute(file)) {
        throw new Error('patch contains an unsafe target path')
      }
    } else if (line.startsWith('@@ ')) {
      if (!file) throw new Error('patch contains an unsupported or deleted target')
      block = { file, lines: [] }
      blocks.push(block)
    } else if (block && (line.startsWith('+') || line.startsWith(' '))) {
      block.lines.push(line.slice(1))
    }
  }
  return blocks.filter(block => block.lines.length > 0)
    .map(({ file, lines }) => ({ file, text: lines.join('\n') }))
}

/** Gather live observations independently of the adaptation manifest. */
export function collectAdaptationState() {
  const root = repoRoot
  const roots = resolveRuntimePackages()
  const runtimeRoot = resolveRuntimePackages(['@deepseek-ai/dsh']).get('@deepseek-ai/dsh')
  const workspace = parse(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'))
  const lock = parse(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8'))
  const names = [...BUILTIN_RUNTIME_PACKAGES, DESKTOP_REPAIR_BUNDLE]
  const packages = new Map(names.map(name => {
    const path = realpathSync(roots.get(name))
    return [name, { root: path, ...readJson(join(path, 'package.json')) }]
  }))
  const aggregateRoot = roots.get('@linxin666/dsh-web-ui-all')
  const aggregatePatch = parse(readFileSync(join(aggregateRoot, 'cordis.patch.yml'), 'utf8'))
  return {
    repoRoot: realpathSync(root),
    names,
    packages,
    desktop: readJson(join(root, 'apps/dsh-desktop/package.json')),
    runtimeVersion: readJson(join(runtimeRoot, 'package.json')).version,
    patchedDependencies: workspace.patchedDependencies ?? {},
    lockedPatches: lock.patchedDependencies ?? {},
    lockPackages: Object.keys(lock.packages ?? {}),
    topLevel: BUILTIN_BUNDLES,
    dependencyOnly: DEPENDENCY_ONLY_BUNDLES,
    repairBundle: DESKTOP_REPAIR_BUNDLE,
    aggregateEntries: aggregatePatch.flatMap(operation => operation.insert ?? []),
  }
}

export function validateBuiltinPluginAdaptation(manifest, state, io = {}) {
  const errors = []
  const readText = io.readText ?? (path => readFileSync(path, 'utf8'))
  const pathExists = io.exists ?? existsSync
  const realpath = io.realpath ?? realpathSync
  const atRoot = path => join(state.repoRoot, path)
  const check = (condition, message) => { if (!condition) errors.push(message) }
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.plugins) || !manifest.mounts) {
    return { errors: ['invalid builtin adaptation manifest schema'], checked: 0 }
  }
  check(manifest.policy === 'desktop-first', 'adaptation policy must be desktop-first')
  check(manifest.runtimeVersion === state.runtimeVersion, `runtime changed: expected ${manifest.runtimeVersion}, resolved ${state.runtimeVersion}`)
  const declared = new Set()
  for (const plugin of manifest.plugins) {
    const { name, selection, validation } = plugin
    check(!declared.has(name), `duplicate adaptation entry: ${name}`)
    declared.add(name)
    check(state.names.includes(name), `adaptation entry is no longer builtin: ${name}`)
    check(typeof plugin.reason === 'string' && plugin.reason.length > 0, `${name}: missing desktop decision reason`)
    check(Array.isArray(plugin.desktopContracts) && plugin.desktopContracts.length > 0, `${name}: missing desktop preservation contracts`)
    check(plugin.publicSnapshot?.status === 'available' || plugin.publicSnapshot?.status === 'not-found', `${name}: missing public registry snapshot`)
    check(Boolean(plugin.publicSnapshot?.checkedAt && plugin.publicSnapshot?.url), `${name}: public snapshot requires timestamp and source`)
    if (plugin.publicSnapshot?.status === 'available') {
      check(typeof plugin.publicSnapshot.latest === 'string', `${name}: available public snapshot needs latest version`)
    }
    const observed = state.packages.get(name)
    if (!observed) {
      errors.push(`${name}: builtin package did not resolve`)
      continue
    }
    check(observed.name === name, `${name}: resolver selected a different package name`)
    check(selection?.version === observed.version, `${name}: expected ${selection?.version}, resolved ${observed.version}`)
    if (selection?.source === 'workspace') {
      const target = typeof selection.path === 'string' ? atRoot(selection.path) : ''
      check(target && contained(atRoot('packages'), target), `${name}: workspace path must stay under packages/`)
      if (target && pathExists(target)) {
        check(contained(realpath(atRoot('packages')), observed.root), `${name}: workspace resolves outside packages/`)
        check(samePath(realpath(target), observed.root), `${name}: workspace fixes replaced by a different source`)
      } else errors.push(`${name}: expected workspace directory is missing`)
    } else if (selection?.source === 'npm') {
      check(contained(atRoot('node_modules'), observed.root), `${name}: expected an installed npm package, resolved a different source`)
      check(state.lockPackages.includes(`${name}@${observed.version}`), `${name}: resolved npm version is absent from lockfile`)
    } else errors.push(`${name}: unsupported source ${selection?.source}`)

    const key = `${name}@${observed.version}`
    const actualPatch = state.patchedDependencies[key]
    check((selection?.patch ?? null) === (actualPatch ?? null), `${name}: desktop patch declaration changed`)
    if (selection?.patch) {
      try {
        const patchPath = atRoot(selection.patch)
        if (!contained(atRoot('patches'), patchPath)) throw new Error('patch must stay under patches/')
        const patchText = readText(patchPath)
        // pnpm 11 hashes LF-normalized patch text, also on Windows checkouts.
        const hash = createHash('sha256').update(normalize(patchText)).digest('hex')
        const locked = state.lockedPatches[key]
        check(hash === (typeof locked === 'string' ? locked : locked?.hash), `${name}: patch and lockfile hash differ`)
        const postimages = patchPostimages(patchText)
        check(postimages.length > 0, `${name}: patch has no verifiable text hunks`)
        for (const block of postimages) {
          const target = join(observed.root, block.file)
          if (!contained(observed.root, target)) throw new Error('patch target escapes package')
          check(normalize(readText(target)).includes(block.text), `${name}: installed patch hunk is missing in ${block.file}`)
        }
      } catch (error) {
        errors.push(`${name}: patch verification failed: ${error.message}`)
      }
    }

    check(validation && Array.isArray(validation.automatedChecks) && Array.isArray(validation.desktopAcceptance) && Array.isArray(validation.results), `${name}: validation must separate planned checks from recorded results`)
    for (const path of validation?.automatedChecks ?? []) {
      check(contained(state.repoRoot, atRoot(path)) && pathExists(atRoot(path)), `${name}: automated check is missing: ${path}`)
    }
    for (const result of validation?.results ?? []) {
      check(['automated', 'desktop-ui', 'business'].includes(result.kind), `${name}: invalid validation result kind`)
      check(['passed', 'failed'].includes(result.outcome), `${name}: invalid validation outcome`)
      check(Boolean(result.checkedAt && result.evidence && result.scope), `${name}: recorded result needs time, evidence, and scope`)
      if (result.evidence) check(contained(state.repoRoot, atRoot(result.evidence)) && pathExists(atRoot(result.evidence)), `${name}: recorded validation evidence is missing`)
    }
  }
  for (const name of state.names) check(declared.has(name), `builtin has no adaptation decision: ${name}`)
  check(JSON.stringify(manifest.mounts.topLevel) === JSON.stringify(state.topLevel), 'top-level builtin mounts changed or reordered')
  check(JSON.stringify(manifest.mounts.dependencyOnly) === JSON.stringify(state.dependencyOnly), 'dependency-only mount classification changed')
  check(manifest.mounts.repairBundle === state.repairBundle, 'desktop repair bundle changed')
  for (const expected of manifest.mounts.aggregateEntries ?? []) {
    const matches = state.aggregateEntries.filter(actual => actual.id === expected.id)
    check(matches.length === 1 && matches[0].name === expected.name, `aggregate mount changed or duplicated: ${expected.id}`)
  }
  check(JSON.stringify(manifest.mounts.aggregateEntries) === JSON.stringify(state.aggregateEntries.map(({ id, name }) => ({ id, name }))), 'aggregate mount composition or order changed')
  return { errors, checked: manifest.plugins.length }
}

export function verifyBuiltinPluginAdaptation() {
  const manifest = readJson(join(repoRoot, 'apps/dsh-desktop/runtime-support/builtin-plugin-adaptation.json'))
  return validateBuiltinPluginAdaptation(manifest, collectAdaptationState())
}

if (process.argv[1] && samePath(resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
  try {
    const result = verifyBuiltinPluginAdaptation()
    for (const error of result.errors) console.error(`[builtin-adaptation] ${error}`)
    if (result.errors.length) process.exitCode = 1
    else console.log(`[builtin-adaptation] ${result.checked} packages: source, version, patch, and mount checks passed. Interactive/business acceptance is recorded separately.`)
  } catch (error) {
    console.error(`[builtin-adaptation] ${error.message}`)
    process.exitCode = 1
  }
}
