import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { mergeQqBotPatch, readQqBotPatchEnabled } from './extensions/qqbot.mjs'

export const BUILTIN_BUNDLES = Object.freeze([
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  '@linxin666/dsh-desktop-compat',
  '@linxin666/dsh-web-ui-all',
  '@tencent-connect/dsh-qqbot',
  'dshmarket',
  'dsh-codex-connect',
  'reasoning-slider',
])

// Packages expanded by @linxin666/dsh-web-ui-all. Older desktop profiles
// listed some of these as top-level bundles as well, which makes Cordis
// register their patch ids twice. Keep the packages installed for the
// aggregate's dependency graph, but migrate the duplicate bundle entries
// away whenever the desktop profile is refreshed.
export const AGGREGATED_BUNDLES = Object.freeze([
  '@linxin666/dsh-client-ui-aionui-panel',
  '@linxin666/dsh-client-ui-community-plugins',
  '@linxin666/dsh-client-ui-git-graph',
  '@linxin666/dsh-client-ui-skin-center',
  '@linxin666/dsh-client-ui-task-board',
  '@linxin666/dsh-client-ui-web-ui-settings',
  '@linxin666/dsh-liangshen',
  '@linxin666/dsh-live-stats',
  '@linxin666/dsh-pet',
  '@linxin666/dsh-remote-web-ui',
  '@linxin666/dsh-skins',
  '@linxin666/dsh-ssh',
  '@linxin666/dsh-tool-describe-image',
].toSorted())

export const BUILTIN_SKIN_PACKAGES = Object.freeze([
  '@linxin666/dsh-client-ui-skin-blue-fantasy',
  '@linxin666/dsh-client-ui-skin-dragon-heir',
  '@linxin666/dsh-client-ui-skin-harbor',
  '@linxin666/dsh-client-ui-skin-miku',
  '@linxin666/dsh-client-ui-skin-minecraft',
  '@linxin666/dsh-client-ui-skin-qq98',
  '@linxin666/dsh-client-ui-skin-ths',
  '@linxin666/dsh-client-ui-skin-trading',
  '@linxin666/dsh-client-ui-skin-whale-song',
  '@linxin666/dsh-client-ui-skin-xp',
].toSorted())

// These packages were linked directly by older desktop releases. They are
// either supplied by the aggregate now or replaced by the single supported
// marketplace. Leaving them in dependencies lets DSH's bundle reconciler (or
// dshmarket's client-only hot mount) load them a second time.
export const RETIRED_MANAGED_PACKAGES = Object.freeze([
  '@linxin666/dsh-client-ui-skin-qq2006',
  '@linxin666/dsh-web-ui-compat',
  '@vectorize-io/hindsight-coding-agents',
  ...BUILTIN_SKIN_PACKAGES,
  'dsh-plugin-hub',
].toSorted())

// Only one package may own the openai-codex adapter. Fresh profiles use Codex
// Connect, while upgraded profiles keep an already-installed provider instead
// of failing startup with duplicate route ownership.
export const CODEX_PROVIDER_CONFLICTS = Object.freeze([
  'dsh-codex',
  'dsh-codex-auth',
].toSorted())

export const WEB_UI_SETTINGS_NAMESPACES = Object.freeze([
  'llm-openai-codex',
  'live-stats',
  'pet',
  'remote-web-ui',
  'skin-background',
  'task-board',
].toSorted())

export const BUILTIN_RUNTIME_PACKAGES = Object.freeze([
  '@linxin666/dsh-desktop-compat',
  '@linxin666/dsh-client-ui-aionui-panel',
  '@linxin666/dsh-client-ui-community-plugins',
  '@linxin666/dsh-client-ui-git-graph',
  '@linxin666/dsh-client-ui-mode-switcher',
  '@linxin666/dsh-client-ui-skin-center',
  '@linxin666/dsh-client-ui-task-board',
  '@linxin666/dsh-client-ui-web-ui-settings',
  '@linxin666/dsh-liangshen',
  '@linxin666/dsh-live-stats',
  '@linxin666/dsh-pet',
  '@linxin666/dsh-remote-web-ui',
  '@linxin666/dsh-skins',
  '@linxin666/dsh-ssh',
  '@linxin666/dsh-tool-describe-image',
  '@linxin666/dsh-web-ui-all',
  '@tencent-connect/dsh-qqbot',
  'dsh-codex-connect',
  'dshmarket',
  'reasoning-slider',
].toSorted())

export const DESKTOP_SUPPORT_PACKAGES = Object.freeze([
  '@deepseek-ai/dsh-client-ui-directory-picker-browse',
  '@deepseek-ai/dsh-host-directory-picker-browse',
].toSorted())

const BUNDLED_SKIN_PACKAGE_PREFIX = '@linxin666/dsh-client-ui-skin-'

// Desktop-owned packages supplied to another bundle's composition instead of
// mounted as top-level bundles. Old top-level rows must still be migrated away.
export const DEPENDENCY_ONLY_BUNDLES = Object.freeze([
  '@linxin666/dsh-client-ui-mode-switcher',
].toSorted())

// Compatibility dependencies for supported community plugins whose published
// manifests omit a package that they import at runtime. Link these directly
// into the isolated desktop profile so pnpm's strict resolution can find them.
export const DESKTOP_PLUGIN_COMPAT_PACKAGES = Object.freeze([
  'schemastery',
].toSorted())

// Desktop 2.1 first claimed this package as a managed compatibility link, but
// a 2.0 profile can already contain pnpm's ordinary materialized copy. Adopt
// only the exact release known to have been left by that upgrade path.
export const MANAGED_RUNTIME_PACKAGES = Object.freeze([
  ...BUILTIN_RUNTIME_PACKAGES,
  ...DESKTOP_SUPPORT_PACKAGES,
  ...DESKTOP_PLUGIN_COMPAT_PACKAGES,
].toSorted())

// DSH rc.6 exposes these runtime modules as peers. Keep them explicit so the
// packaged host is hermetic instead of resolving through a developer machine.
export const DSH_BOOT_RUNTIME_PACKAGES = Object.freeze([
  '@deepseek-ai/cordis-plugin-group',
  '@deepseek-ai/dsh',
  '@deepseek-ai/dsh-anonymous-user-id',
  '@deepseek-ai/dsh-attachment',
  '@deepseek-ai/dsh-atomic-write',
  '@deepseek-ai/dsh-bash-local',
  '@deepseek-ai/dsh-brand',
  '@deepseek-ai/dsh-code-runtime',
  '@deepseek-ai/dsh-compaction',
  '@deepseek-ai/dsh-fs',
  '@deepseek-ai/dsh-output-retention',
  '@deepseek-ai/dsh-sandbox',
  '@deepseek-ai/dsh-sandbox-policy',
  '@deepseek-ai/dsh-scope',
  '@deepseek-ai/dsh-session-telemetry',
  '@deepseek-ai/dsh-session-title-llm',
  '@deepseek-ai/dsh-shell',
  '@deepseek-ai/dsh-spill',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-subagent-in-process-driver',
  '@deepseek-ai/dsh-subprocess',
  '@deepseek-ai/dsh-timeout',
  '@deepseek-ai/dsh-typert-protocol',
  '@deepseek-ai/dsh-workflow',
].toSorted())

const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/
const ROOT_CONFIG = '[]\n'
export const DESKTOP_PATCH_START = '# --- dsh-desktop managed (auto-generated; do not edit) ---'
export const DESKTOP_PATCH_END = '# --- end dsh-desktop managed ---'
export const SKIN_PATCH_START = '# --- dsh-skin managed (auto-generated; do not edit) ---'
export const SKIN_PATCH_END = '# --- end dsh-skin managed ---'
const LEGACY_DESKTOP_PATCH_CONFIG = `- id: directory-picker
  name: '@deepseek-ai/dsh-host-directory-picker-auto'
  disabled: true
- insert:
    - id: directory-picker-desktop-host
      name: '@deepseek-ai/dsh-host-directory-picker-browse'
    - id: directory-picker-desktop-client
      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'
`
export const DESKTOP_PATCH_CONFIG = `${DESKTOP_PATCH_START}
${LEGACY_DESKTOP_PATCH_CONFIG.trimEnd()}
- id: llm-deepseek
  config:
    retryPolicy:
      mode: normal
      maxRetries: 4
      retryableCodes:
        - EMPTY_RESPONSE
        - RATE_LIMIT
        - SERVER
        - TIMEOUT
        - TRANSPORT
        - STREAM_CLOSED
      backoff:
        initialDelayMs: 750
        maxDelayMs: 15000
        jitterRatio: 0.15
- id: dsh-market
  config:
    profile: desktop
    allowRestart: false
${DESKTOP_PATCH_END}
`
const WORKSPACE_CONFIG = `packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n`

export function packagePathSegments(packageName) {
  if (typeof packageName !== 'string' || !PACKAGE_NAME_PATTERN.test(packageName)) {
    throw new TypeError(`invalid package name: ${JSON.stringify(packageName)}`)
  }
  return packageName.split('/')
}

export function materializeFilesystemPath(path) {
  return path.replace(/([\\/])app\.asar([\\/])/u, '$1app.asar.unpacked$2')
}

export function createDesktopProfileManifest(existing = {}) {
  const existingBundles = existing.dsh?.profile?.bundles
  const existingDependencies = existing.dependencies ?? {}
  const hasExistingCodexProvider = CODEX_PROVIDER_CONFLICTS.some((name) =>
    existingDependencies[name] !== undefined
      || (Array.isArray(existingBundles) && existingBundles.includes(name)))
  const managedBundles = hasExistingCodexProvider
    ? BUILTIN_BUNDLES.filter((name) => name !== 'dsh-codex-connect')
    : [...BUILTIN_BUNDLES]
  const communityBundles = Array.isArray(existingBundles)
    ? existingBundles.filter((name) =>
         !BUILTIN_BUNDLES.includes(name)
         && !DEPENDENCY_ONLY_BUNDLES.includes(name)
         && !AGGREGATED_BUNDLES.includes(name)
        && !RETIRED_MANAGED_PACKAGES.includes(name))
    : []
  const dependencies = Object.fromEntries(
    Object.entries(existingDependencies)
      .filter(([name]) =>
        !RETIRED_MANAGED_PACKAGES.includes(name)
        && !(hasExistingCodexProvider && name === 'dsh-codex-connect')),
  )

  return {
    name: 'dsh-profile-desktop',
    private: true,
    dependencies,
    dsh: {
      profile: {
        bundles: [...managedBundles, ...communityBundles],
      },
    },
  }
}

function managedSection(text, startMarker, endMarker) {
  const source = String(text)
  const start = source.indexOf(startMarker)
  if (start === -1) return undefined
  const end = source.indexOf(endMarker, start)
  if (end === -1) throw new Error(`${startMarker} section is unterminated`)
  return source.slice(start, end + endMarker.length)
}

export function extractManagedSkinSection(existing = '') {
  return managedSection(existing, SKIN_PATCH_START, SKIN_PATCH_END)
}

export function stripManagedSkinSection(existing = '') {
  const source = String(existing)
  const section = extractManagedSkinSection(source)
  if (section === undefined) return source
  return `${source.slice(0, source.indexOf(section))}${source.slice(source.indexOf(section) + section.length)}`
}

export function mergeDesktopPatch(existing = '') {
  // Old desktop builds placed the skin selector's managed section in the
  // profile patch, while current skin-center owns the DSH-home patch. Keeping
  // both layers makes Cordis register the same skin id twice.
  let userPatch = stripManagedSkinSection(existing)
  const start = userPatch.indexOf(DESKTOP_PATCH_START)
  if (start !== -1) {
    const end = userPatch.indexOf(DESKTOP_PATCH_END, start)
    if (end === -1) throw new Error('desktop managed patch section is unterminated')
    userPatch = `${userPatch.slice(0, start)}${userPatch.slice(end + DESKTOP_PATCH_END.length)}`
  } else if (userPatch.startsWith(LEGACY_DESKTOP_PATCH_CONFIG)) {
    userPatch = userPatch.slice(LEGACY_DESKTOP_PATCH_CONFIG.length)
  }
  const suffix = userPatch.trim()
  return suffix ? `${DESKTOP_PATCH_CONFIG.trimEnd()}\n\n${suffix}\n` : DESKTOP_PATCH_CONFIG
}

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

async function writeIfChanged(path, content) {
  try {
    if ((await readFile(path, 'utf8')) === content) return false
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  await atomicWrite(path, content)
  return true
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true })
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const temporary = `${path}.tmp-${suffix}`
  const backup = `${path}.bak-${suffix}`
  await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
  let movedExisting = false
  try {
    try {
      await rename(path, backup)
      movedExisting = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await rename(temporary, path)
    if (movedExisting) await rm(backup, { force: true })
  } catch (error) {
    await rm(temporary, { force: true })
    if (movedExisting) {
      await rm(path, { force: true })
      await rename(backup, path)
    }
    throw error
  }
}

async function pathExists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function linkTargetsSource(target, source) {
  if (typeof source !== 'string' || source.length === 0) return false
  try {
    return (await realpath(target)) === (await realpath(source))
  } catch {
    try {
      return resolve(dirname(target), await readlink(target)) === resolve(source)
    } catch {
      return false
    }
  }
}

async function linkManagedPackage({
  packageName,
  profileDir,
  sourceDir,
  previous,
  legacyDependencySpec,
}) {
  const target = join(profileDir, 'node_modules', ...packagePathSegments(packageName))
  await mkdir(dirname(target), { recursive: true })
  if (await pathExists(target)) {
    if (await linkTargetsSource(target, sourceDir)) {
      return { changed: false, record: { mode: 'link', source: sourceDir } }
    }
    const metadata = await lstat(target)
    const installed = await readJsonIfPresent(join(target, 'package.json'))
    if (previous?.mode === 'copy' && previous.source === sourceDir && installed?.name === packageName) {
      return { changed: false, record: previous }
    }
    const ownedLink = previous?.mode === 'link'
      && metadata.isSymbolicLink()
      && await linkTargetsSource(target, previous.source)
    const ownedCopy = previous?.mode === 'copy'
      && metadata.isDirectory()
      && typeof previous.source === 'string'
      && installed?.name === packageName
    const packaged = await readJsonIfPresent(join(sourceDir, 'package.json'))
    const matchingLegacyVersion = typeof installed?.version === 'string'
      && installed.version.length > 0
      && installed.version === packaged?.version
    const declaredByLegacyProfile = typeof legacyDependencySpec === 'string'
      && legacyDependencySpec.length > 0
    const migratableLegacyCopy = metadata.isDirectory()
      && installed?.name === packageName
      && packaged?.name === packageName
      && (matchingLegacyVersion || declaredByLegacyProfile)
    if (!ownedLink && !ownedCopy && !migratableLegacyCopy) {
      throw new Error(`refusing to replace unmanaged package at ${target}`)
    }
    await rm(target, { recursive: true, force: true })
  }

  try {
    await symlink(sourceDir, target, process.platform === 'win32' ? 'junction' : 'dir')
    return { changed: true, record: { mode: 'link', source: sourceDir } }
  } catch (error) {
    if (!['EACCES', 'EPERM', 'UNKNOWN'].includes(error?.code)) throw error
    await cp(sourceDir, target, { recursive: true, errorOnExist: true, force: false })
    return { changed: true, record: { mode: 'copy', source: sourceDir } }
  }
}

async function retireManagedPackage({ packageName, profileDir, previous }) {
  if (previous === undefined) return false
  const target = join(profileDir, 'node_modules', ...packagePathSegments(packageName))
  let metadata
  try {
    metadata = await lstat(target)
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }

  if (previous.mode === 'link' && metadata.isSymbolicLink()) {
    const owned = await linkTargetsSource(target, previous.source)
    if (!owned) return false
    await rm(target, { recursive: true, force: true })
    return true
  }

  if (previous.mode === 'copy' && metadata.isDirectory()) {
    const installed = await readJsonIfPresent(join(target, 'package.json'))
    if (installed?.name !== packageName || previous.source === undefined) return false
    await rm(target, { recursive: true, force: true })
    return true
  }
  return false
}

function selectedBundledSkinPackage(managedSection) {
  if (managedSection === undefined) return undefined
  const matches = [...managedSection.matchAll(/^\s+name:\s*(['"])(@linxin666\/dsh-client-ui-skin-([a-z0-9-]+))\1\s*$/gmu)]
  const selected = matches.at(-1)
  return selected ? { packageName: selected[2], skinId: selected[3] } : undefined
}

async function resolveBundledSkinSelection({ managedSection, carrierRoot }) {
  if (typeof carrierRoot !== 'string') return undefined
  const selected = selectedBundledSkinPackage(managedSection)
  if (selected === undefined || !selected.packageName.startsWith(BUNDLED_SKIN_PACKAGE_PREFIX)) return undefined
  const { packageName, skinId } = selected
  const sourceDir = join(carrierRoot, 'skins', skinId)
  const sourceManifest = await readJsonIfPresent(join(sourceDir, 'package.json'))
  return sourceManifest?.name === packageName ? { packageName, sourceDir } : undefined
}

async function ensureBundledSkinAlias({ selection, profileDir, previous }) {
  if (selection === undefined) return { changed: false }
  const { packageName, sourceDir } = selection
  const target = join(profileDir, 'node_modules', ...packagePathSegments(packageName))
  if (await pathExists(target)) {
    if (await linkTargetsSource(target, sourceDir)) {
      return { changed: false, packageName, record: { mode: 'link', source: sourceDir } }
    }
    const installed = await readJsonIfPresent(join(target, 'package.json'))
    const metadata = await lstat(target)
    const ownedLink = previous?.mode === 'link'
      && metadata.isSymbolicLink()
      && await linkTargetsSource(target, previous.source)
    const ownedCopy = previous?.mode === 'copy'
      && metadata.isDirectory()
      && typeof previous.source === 'string'
      && installed?.name === packageName
    if (!ownedLink && !ownedCopy) {
      if (installed?.name === packageName) return { changed: false, packageName }
      if (!metadata.isSymbolicLink()) throw new Error(`refusing to replace unmanaged package at ${target}`)
      await rm(target, { recursive: true, force: true })
    }
  }
  const result = await linkManagedPackage({ packageName, profileDir, sourceDir, previous })
  return { ...result, packageName }
}

export async function ensureDesktopProfile({
  dshHome,
  packageRoots = resolveRuntimePackages(),
  profileName = 'desktop',
} = {}) {
  if (typeof dshHome !== 'string' || dshHome.length === 0) {
    throw new TypeError('dshHome must be a non-empty absolute path')
  }
  const profileDir = join(dshHome, 'profiles', profileName)
  await mkdir(profileDir, { recursive: true })
  const manifestPath = join(profileDir, 'package.json')
  const recordPath = join(profileDir, '.dsh-desktop-links.json')
  const previousRecords = (await readJsonIfPresent(recordPath)) ?? {}
  const existing = await readJsonIfPresent(manifestPath)
  const manifest = createDesktopProfileManifest(existing)
  const activePackageRoots = new Map(packageRoots)
  const codexConnectEnabled = manifest.dsh.profile.bundles.includes('dsh-codex-connect')
  if (!codexConnectEnabled) activePackageRoots.delete('dsh-codex-connect')

  for (const [packageName, sourceDir] of activePackageRoots) {
    manifest.dependencies[packageName] = `link:${sourceDir.replaceAll('\\', '/')}`
  }
  const sortedDependencies = Object.fromEntries(
    Object.entries(manifest.dependencies).toSorted(([left], [right]) => left.localeCompare(right)),
  )
  manifest.dependencies = sortedDependencies

  let changed = false
  changed = (await writeIfChanged(join(profileDir, 'cordis.yml'), ROOT_CONFIG)) || changed
  const patchPath = join(profileDir, 'cordis.patch.yml')
  const existingPatch = await readFile(patchPath, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return ''
    throw error
  })
  const homePatchPath = join(dshHome, 'cordis.patch.yml')
  let homePatch = await readFile(homePatchPath, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return undefined
    throw error
  })
  const legacySkinSection = extractManagedSkinSection(existingPatch)
  // Desktop builds before the skin center moved its selector state into the
  // profile patch. The home patch is now the single authority: move the old
  // section there only when no newer home-layer state exists, and never clear
  // a section the running skin center has already written.
  if (legacySkinSection !== undefined && extractManagedSkinSection(homePatch ?? '') === undefined) {
    const rawPrefix = (homePatch ?? '').trim()
    const prefix = rawPrefix === '[]' ? '' : rawPrefix
    homePatch = prefix ? `${prefix}\n\n${legacySkinSection}\n` : `${legacySkinSection}\n`
    changed = (await writeIfChanged(homePatchPath, homePatch)) || changed
  }
  // DSH parses an existing patch file as YAML and requires a top-level array.
  // An empty file parses as null, so repair blank files left by desktop 0.1.8
  // even after its one-time legacy migration has already completed.
  if (homePatch !== undefined && homePatch.trim() === '') {
    homePatch = ROOT_CONFIG
    changed = (await writeIfChanged(homePatchPath, homePatch)) || changed
  }
  const qqBotEnabled = readQqBotPatchEnabled(existingPatch) ?? false
  const managedPatch = mergeQqBotPatch(mergeDesktopPatch(existingPatch), qqBotEnabled)
  changed = (await writeIfChanged(patchPath, managedPatch)) || changed
  changed = (await writeIfChanged(join(profileDir, 'pnpm-workspace.yaml'), WORKSPACE_CONFIG)) || changed
  changed = (await writeIfChanged(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)) || changed

  const bundledSkinSelection = await resolveBundledSkinSelection({
    managedSection: extractManagedSkinSection(homePatch ?? ''),
    carrierRoot: activePackageRoots.get('@linxin666/dsh-skins'),
  })
  const packagesToRetire = codexConnectEnabled
    ? RETIRED_MANAGED_PACKAGES
    : [...RETIRED_MANAGED_PACKAGES, 'dsh-codex-connect']
  const retired = await Promise.all(packagesToRetire
    .filter((packageName) => packageName !== bundledSkinSelection?.packageName)
    .map((packageName) =>
    retireManagedPackage({
      packageName,
      profileDir,
      previous: previousRecords[packageName],
    }),
  ))
  changed = retired.some(Boolean) || changed
  const linked = await Promise.all(
    [...activePackageRoots]
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(async ([packageName, sourceDir]) => ({
        packageName,
        result: await linkManagedPackage({
          packageName,
          profileDir,
          sourceDir,
          previous: previousRecords[packageName],
          legacyDependencySpec: existing?.dependencies?.[packageName],
        }),
      })),
  )
  const nextRecords = {}
  for (const { packageName, result } of linked) {
    nextRecords[packageName] = result.record
    changed = result.changed || changed
  }
  const skinAlias = await ensureBundledSkinAlias({
    selection: bundledSkinSelection,
    profileDir,
    previous: bundledSkinSelection === undefined
      ? undefined
      : previousRecords[bundledSkinSelection.packageName],
  })
  if (skinAlias.record !== undefined) nextRecords[skinAlias.packageName] = skinAlias.record
  changed = skinAlias.changed || changed
  changed = (await writeIfChanged(recordPath, `${JSON.stringify(nextRecords, null, 2)}\n`)) || changed

  return { changed, manifest, profileDir }
}

function resolvePackageRoot(packageName, anchors) {
  for (const anchor of anchors) {
    const require = createRequire(anchor)
    try {
      return materializeFilesystemPath(dirname(require.resolve(`${packageName}/package.json`)))
    } catch {
      // Package exports may hide package.json; resolve the entry and walk upward.
    }
    try {
      let cursor = dirname(require.resolve(packageName))
      for (;;) {
        const manifest = readJsonSync(join(cursor, 'package.json'))
        if (manifest?.name === packageName) return materializeFilesystemPath(cursor)
        const parent = dirname(cursor)
        if (parent === cursor) break
        cursor = parent
      }
    } catch {
      // Try the next anchor.
    }
    let cursor
    try {
      const anchorPath = String(anchor).startsWith('file:') ? fileURLToPath(anchor) : String(anchor)
      cursor = dirname(anchorPath)
    } catch {
      cursor = undefined
    }
    while (cursor) {
      const candidate = join(cursor, 'node_modules', ...packagePathSegments(packageName))
      if (readJsonSync(join(candidate, 'package.json'))?.name === packageName) {
        return materializeFilesystemPath(candidate)
      }
      const parent = dirname(cursor)
      if (parent === cursor) break
      cursor = parent
    }
  }
  return undefined
}

function readJsonSync(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

export function resolveRuntimePackages(
  packageNames = MANAGED_RUNTIME_PACKAGES,
  initialAnchor = import.meta.url,
) {
  const pending = new Set([...packageNames].toSorted())
  const anchors = [initialAnchor]
  const resolved = new Map()

  // Resolve the published aggregate first and prefer its dependency tree for
  // every package that it owns. In a workspace checkout, resolving all names
  // from this source file first would silently select older local packages
  // instead of the release pinned by the desktop application.
  const aggregateName = '@linxin666/dsh-web-ui-all'
  if (pending.has(aggregateName)) {
    const aggregateRoot = resolvePackageRoot(aggregateName, anchors)
    if (aggregateRoot !== undefined) {
      resolved.set(aggregateName, aggregateRoot)
      pending.delete(aggregateName)
      anchors.unshift(join(aggregateRoot, 'package.json'))
    }
  }

  while (pending.size > 0) {
    let madeProgress = false
    for (const packageName of [...pending]) {
      const root = resolvePackageRoot(packageName, anchors)
      if (root === undefined) continue
      resolved.set(packageName, root)
      anchors.push(join(root, 'package.json'))
      pending.delete(packageName)
      madeProgress = true
    }
    if (!madeProgress) {
      throw new Error(`desktop runtime packages are missing: ${[...pending].join(', ')}`)
    }
  }

  return new Map([...resolved].toSorted(([left], [right]) => left.localeCompare(right)))
}

export function resolveDshCliPath(initialAnchor = import.meta.url) {
  const root = resolvePackageRoot('@deepseek-ai/dsh', [initialAnchor])
  if (root === undefined) throw new Error('the official @deepseek-ai/dsh runtime is missing')
  return join(root, 'lib', 'bin.js')
}

export function isPathInside(parent, child) {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith('..') && !path.includes(':'))
}
