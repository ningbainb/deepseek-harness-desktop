#!/usr/bin/env node
/**
 * Feature Preservation Baseline Verification Gate.
 *
 * Enforces repository rule from AGENTS.md:
 * Prevents silent feature loss, entry point deletion, or plugin removal across:
 * - scripts/feature-baseline.json (the machine-readable feature manifest)
 * - packages/dsh-web-ui-all/aggregate.yml (the aggregate plugin manifest)
 * - packages/dsh-web-ui-all/cordis.patch.yml (active cordis patch injection)
 * - packages/dsh-web-ui-all/package.json (aggregate workspace dependencies)
 * - apps/dsh-desktop/package.json (desktop application dependencies)
 * - apps/dsh-desktop/src/profile.mjs (desktop runtime bundles & skin catalog)
 * - desktop surfaces and verification test files
 *
 * Usage:
 *   node scripts/verify-feature-baseline.mjs
 *   node scripts/verify-feature-baseline.mjs --check
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolvePath(SCRIPT_DIR, '..')

/**
 * Pure validation logic for feature baseline consistency.
 *
 * @param {object} baseline Parsed feature-baseline.json
 * @param {object} aggregateManifest Parsed aggregate.yml
 * @param {string} cordisPatchContent Raw cordis.patch.yml
 * @param {object} aggregatePkgJson Parsed packages/dsh-web-ui-all/package.json
 * @param {object} desktopPackageJson Parsed apps/dsh-desktop/package.json
 * @param {string} desktopProfileContent Raw apps/dsh-desktop/src/profile.mjs
 * @param {(relativePath: string) => boolean} fileExistsFn Function to check file existence
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateFeatureBaseline(
  baseline,
  aggregateManifest,
  cordisPatchContent,
  aggregatePkgJson,
  desktopPackageJson,
  desktopProfileContent,
  fileExistsFn = (p) => existsSync(join(REPO_ROOT, p))
) {
  const errors = []
  const warnings = []

  if (!baseline || !Array.isArray(baseline.plugins)) {
    errors.push('Feature baseline manifest is missing or invalid: "plugins" array is required.')
    return { errors, warnings }
  }

  const desktopDeps = new Set([
    ...Object.keys(desktopPackageJson.dependencies || {}),
    ...Object.keys(desktopPackageJson.devDependencies || {}),
  ])

  const aggregateDeps = new Set([
    ...Object.keys(aggregatePkgJson.dependencies || {}),
    ...Object.keys(aggregatePkgJson.devDependencies || {}),
  ])

  // 1. Check all baseline plugins
  for (const plugin of baseline.plugins) {
    // Check package directory exists
    if (plugin.path && !fileExistsFn(plugin.path)) {
      errors.push(`[PLUGIN REMOVED] Plugin directory for ${plugin.package} not found at ${plugin.path}`)
    }

    // Check aggregate.yml inclusion
    if (plugin.requiredInAggregate) {
      const declaredInPatchFrom = aggregateManifest.patchFrom.some((entry) => {
        return entry.includes(plugin.path.replace('packages/', '')) ||
          (plugin.id === 'ui-skin-center' && (entry.includes('skin-center') || entry.includes('dsh-skins')))
      })
      if (!declaredInPatchFrom) {
        errors.push(`[AGGREGATE DRIFT] Plugin ${plugin.id} (${plugin.package}) is missing from aggregate.yml patchFrom!`)
      }

      const declaredInDeps = aggregateManifest.deps.some((entry) => {
        return entry.includes(plugin.path.replace('packages/', '')) ||
          (plugin.id === 'ui-skin-center' && (entry.includes('skin-center') || entry.includes('dsh-skins')))
      })
      if (!declaredInDeps) {
        errors.push(`[AGGREGATE DRIFT] Plugin ${plugin.id} (${plugin.package}) is missing from aggregate.yml deps!`)
      }

      // Check package.json in dsh-web-ui-all
      if (!aggregateDeps.has(plugin.package)) {
        errors.push(`[AGGREGATE DEP MISSING] Plugin ${plugin.package} is missing from packages/dsh-web-ui-all dependencies!`)
      }
    }

    // Check cordis.patch.yml patch entry
    if (plugin.requiredInCordisPatch && plugin.patchId) {
      const patchRegex = new RegExp(`id:\\s*['"]?${plugin.patchId}['"]?`)
      if (!patchRegex.test(cordisPatchContent)) {
        errors.push(`[PATCH MISSING] Plugin ${plugin.id} cordis patch id "${plugin.patchId}" is not present in cordis.patch.yml!`)
      }
    }

    // Check Desktop package.json dependencies (if directly required)
    if (plugin.requiredInDesktop) {
      if (!desktopDeps.has(plugin.package)) {
        errors.push(`[DESKTOP DEPENDENCY REMOVED] Core plugin ${plugin.package} is missing from apps/dsh-desktop package.json!`)
      }
    }

    // Check Desktop profile.mjs registration (either directly or via AGGREGATED_BUNDLES)
    const isAggregated = desktopProfileContent.includes(`'${plugin.package}'`) ||
      desktopProfileContent.includes(`"${plugin.package}"`)
    if (!isAggregated) {
      errors.push(`[PROFILE BUNDLE MISSING] Core plugin ${plugin.package} is not registered in apps/dsh-desktop profile.mjs!`)
    }
  }

  // 2. Check Desktop Built-in Bundles
  if (Array.isArray(baseline.desktopBuiltins)) {
    for (const bundle of baseline.desktopBuiltins) {
      if (!desktopDeps.has(bundle)) {
        errors.push(`[DESKTOP BUILTIN REMOVED] Desktop builtin bundle ${bundle} is missing from apps/dsh-desktop dependencies!`)
      }
      if (!desktopProfileContent.includes(`'${bundle}'`) && !desktopProfileContent.includes(`"${bundle}"`)) {
        errors.push(`[DESKTOP BUILTIN MISSING] Builtin bundle ${bundle} is missing from apps/dsh-desktop profile.mjs BUILTIN_BUNDLES!`)
      }
    }
  }

  // 3. Check Desktop Surfaces & UI Entries
  if (Array.isArray(baseline.desktopSurfaces)) {
    for (const surface of baseline.desktopSurfaces) {
      if (surface.e2eScript) {
        const scriptPath = join('apps/dsh-desktop', surface.e2eScript)
        if (!fileExistsFn(scriptPath)) {
          errors.push(`[E2E VERIFICATION SCRIPT MISSING] Surface "${surface.name}" (${surface.id}) specifies test script ${surface.e2eScript} which does not exist!`)
        }
      }
    }
  }

  // 4. Check Skin Catalog
  if (Array.isArray(baseline.skinCatalog)) {
    for (const skinId of baseline.skinCatalog) {
      if (!desktopProfileContent.includes(`'${skinId}'`) && !desktopProfileContent.includes(`"${skinId}"`)) {
        errors.push(`[THEME SKIN MISSING] Built-in theme skin "${skinId}" is missing from apps/dsh-desktop profile.mjs BUILTIN_SKIN_IDS!`)
      }
    }
  }

  return { errors, warnings }
}

function parseSimpleYaml(raw) {
  const manifest = { patchFrom: [], deps: [], self: [] }
  let section = null
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const sectionMatch = trimmed.match(/^([A-Za-z0-9_-]+):\s*$/)
    if (sectionMatch) {
      section = sectionMatch[1]
      continue
    }
    const entryMatch = trimmed.match(/^-\s+(.+)$/)
    if (entryMatch && section && manifest[section]) {
      manifest[section].push(entryMatch[1].trim().replace(/\s+#.*$/, ''))
    }
  }
  return manifest
}

export function runBaselineCheck() {
  const baselinePath = join(REPO_ROOT, 'scripts', 'feature-baseline.json')
  const aggregatePath = join(REPO_ROOT, 'packages', 'dsh-web-ui-all', 'aggregate.yml')
  const cordisPatchPath = join(REPO_ROOT, 'packages', 'dsh-web-ui-all', 'cordis.patch.yml')
  const aggregatePkgPath = join(REPO_ROOT, 'packages', 'dsh-web-ui-all', 'package.json')
  const desktopPkgPath = join(REPO_ROOT, 'apps', 'dsh-desktop', 'package.json')
  const desktopProfilePath = join(REPO_ROOT, 'apps', 'dsh-desktop', 'src', 'profile.mjs')

  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
  const aggregateManifest = parseSimpleYaml(readFileSync(aggregatePath, 'utf8'))
  const cordisPatchContent = readFileSync(cordisPatchPath, 'utf8')
  const aggregatePkg = JSON.parse(readFileSync(aggregatePkgPath, 'utf8'))
  const desktopPkg = JSON.parse(readFileSync(desktopPkgPath, 'utf8'))
  const desktopProfileContent = readFileSync(desktopProfilePath, 'utf8')

  const { errors, warnings } = validateFeatureBaseline(
    baseline,
    aggregateManifest,
    cordisPatchContent,
    aggregatePkg,
    desktopPkg,
    desktopProfileContent
  )

  for (const warning of warnings) {
    console.warn(`[WARN] ${warning}`)
  }

  if (errors.length > 0) {
    console.error('\n============================================================')
    console.error(' [FEATURE PRESERVATION GATE FAILED]')
    console.error(' Per AGENTS.md: Existing UI entries, plugins, configurations,')
    console.error(' and capabilities must NOT be deleted or broken silently.')
    console.error('============================================================')
    for (const error of errors) {
      console.error(` x ${error}`)
    }
    console.error('\nTo resolve: Restore the removed feature/entry or obtain explicit confirmation.')
    process.exit(1)
  }

  console.log(`[PASS] Feature baseline gate: all ${baseline.plugins.length} plugins, ${baseline.desktopBuiltins.length} builtins, ${baseline.desktopSurfaces.length} desktop surfaces, and ${baseline.skinCatalog.length} skins verified.`)
}

if (process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBaselineCheck()
}