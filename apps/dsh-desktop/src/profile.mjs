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
import { parse } from 'yaml'

import { mergeQqBotPatch, readQqBotPatchEnabled } from './extensions/qqbot.mjs'

export const BUILTIN_BUNDLES = Object.freeze([
  '@deepseek-ai/dsh-base',
  '@linxin666/dsh-desktop-compat',
  '@deepseek-ai/dsh-web-app',
  '@linxin666/dsh-value-mode',
  '@linxin666/dsh-web-ui-all',
  '@tencent-connect/dsh-qqbot',
  'reasoning-slider',
])

export const DESKTOP_REPAIR_BUNDLE = '@linxin666/dsh-desktop-repair'

// Packages expanded by @linxin666/dsh-web-ui-all. Older desktop profiles
// listed some of these as top-level bundles as well, which makes Cordis
// register their patch ids twice. Keep the packages installed for the
// aggregate's dependency graph, but migrate the duplicate bundle entries
// away whenever the desktop profile is refreshed.
export const AGGREGATED_BUNDLES = Object.freeze([
  '@linxin666/dsh-client-ui-aionui-panel',
  '@linxin666/dsh-client-ui-community-plugins',
  '@linxin666/dsh-chat-recovery',
  '@linxin666/dsh-client-ui-git-graph',
  '@linxin666/dsh-desktop-launcher',
  '@linxin666/dsh-client-ui-plugin-manager',
  '@linxin666/dsh-client-ui-skin-center',
  '@linxin666/dsh-client-ui-skill-explorer',
  '@linxin666/dsh-client-ui-task-board',
  '@linxin666/dsh-client-ui-web-ui-settings',
  '@linxin666/dsh-liangshen',
  '@linxin666/dsh-live-stats',
  '@linxin666/dsh-pet',
  '@linxin666/dsh-remote-web-ui',
  '@linxin666/dsh-skins',
  '@linxin666/dsh-ssh',
  '@linxin666/dsh-tool-describe-image',
  'dsh-better-sidebar',
].toSorted())

// Skin Center v1 exposed every shipped theme as a separate Cordis package.
// Version 2 ships all of them as static directories in the one Skin Center
// package, so these names exist only to retire/migrate old Desktop profiles.
export const LEGACY_SKIN_PACKAGES = Object.freeze([
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

// Built-in Skin Center v2 catalog ids. These are deliberately ids, not
// package names: Skin Center v2 serves their assets from its own skins/ tree.
export const BUILTIN_SKIN_IDS = Object.freeze([
  'blue-fantasy',
  'cyber-night',
  'dragon-heir',
  'furina',
  'harbor',
  'maid-atelier',
  'matrix',
  'miku',
  'minecraft',
  'mint',
  'summer-liquid-glass',
  'trading',
  'whale-mom',
  'whale-song',
  'xp',
].toSorted())

// These packages were linked directly by older desktop releases. They are
// either supplied by the aggregate now or replaced by Desktop-native features.
// Leaving them in dependencies lets DSH's bundle reconciler load them a second
// time or retain an obsolete runtime-owned surface.
export const RETIRED_MANAGED_PACKAGES = Object.freeze([
  '@linxin666/dsh-client-ui-skin-qq2006',
  '@linxin666/dsh-web-ui-compat',
  '@vectorize-io/hindsight-coding-agents',
  ...LEGACY_SKIN_PACKAGES,
  'dsh-plugin-hub',
  'dshmarket',
].toSorted())

// RC.1's @deepseek-ai/dsh-base owns the native llm-pi-ai adapter, including
// openai-codex. These older add-ons declared the same provider and now make the
// Cordis tree fail before readiness. Retire only their profile rows/managed
// links; user package bytes outside Desktop's link ledger remain untouched.
export const CODEX_PROVIDER_CONFLICTS = Object.freeze([
  'dsh-codex',
  'dsh-codex-auth',
  'dsh-codex-connect',
].toSorted())

export const WEB_UI_SETTINGS_NAMESPACES = Object.freeze([
  'llm-pi-ai',
  'live-stats',
  'pet',
  'remote-web-ui',
  'skin-background',
  'task-board',
  'value-mode',
].toSorted())

export const BUILTIN_RUNTIME_PACKAGES = Object.freeze([
  '@linxin666/dsh-desktop-compat',
  '@linxin666/dsh-desktop-client',
  '@linxin666/dsh-client-ui-aionui-panel',
  '@linxin666/dsh-client-ui-community-plugins',
  '@linxin666/dsh-chat-recovery',
  '@linxin666/dsh-client-ui-git-graph',
  '@linxin666/dsh-desktop-launcher',
  '@linxin666/dsh-client-ui-mode-switcher',
  '@linxin666/dsh-client-ui-plugin-manager',
  '@linxin666/dsh-client-ui-skin-center',
  '@linxin666/dsh-client-ui-skill-explorer',
  '@linxin666/dsh-client-ui-task-board',
  '@linxin666/dsh-client-ui-web-ui-settings',
  '@linxin666/dsh-liangshen',
  '@linxin666/dsh-live-stats',
  '@linxin666/dsh-pet',
  '@linxin666/dsh-particle-theme',
  '@linxin666/dsh-remote-web-ui',
  '@linxin666/dsh-skins',
  '@linxin666/dsh-ssh',
  '@linxin666/dsh-tool-describe-image',
  '@linxin666/dsh-value-mode',
  '@linxin666/dsh-web-ui-all',
  '@tencent-connect/dsh-qqbot',
  'dsh-better-sidebar',
  'reasoning-slider',
].toSorted())

export const DESKTOP_SUPPORT_PACKAGES = Object.freeze([
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-agent-default-model',
  '@deepseek-ai/dsh-client-ui-directory-picker-browse',
  '@deepseek-ai/dsh-host-directory-picker-browse',
  '@deepseek-ai/dsh-host-webserver',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-session-persistence',
  '@deepseek-ai/dsh-workspace',
].toSorted())

const LEGACY_SKIN_PACKAGE_PREFIXES = Object.freeze([
  '@deepseek-ai/dsh-client-ui-skin-',
  '@linxin666/dsh-client-ui-skin-',
])

function isRetiredLegacySkinPackage(packageName) {
  if (typeof packageName !== 'string') return false
  return LEGACY_SKIN_PACKAGE_PREFIXES.some(prefix =>
    packageName.startsWith(prefix) && packageName !== prefix + 'center')
}

function isRetiredManagedPackage(packageName) {
  return RETIRED_MANAGED_PACKAGES.includes(packageName)
    || CODEX_PROVIDER_CONFLICTS.includes(packageName)
    || isRetiredLegacySkinPackage(packageName)
}

// Desktop-owned packages supplied to another bundle's composition instead of
// mounted as top-level bundles. Old top-level rows must still be migrated away.
export const DEPENDENCY_ONLY_BUNDLES = Object.freeze([
  '@linxin666/dsh-client-ui-mode-switcher',
  '@linxin666/dsh-particle-theme',
].toSorted())

// Compatibility dependencies for supported community plugins whose published
// manifests omit a package that they import at runtime. Link these directly
// into the isolated desktop profile so pnpm's strict resolution can find them.
export const DESKTOP_PLUGIN_COMPAT_PACKAGES = Object.freeze([
  'schemastery',
].toSorted())

// Desktop carries a newer compatibility bridge than the released aggregate.
// It also restores Live Stats, which the published aggregate does not declare.
// Resolve these direct application dependencies before consulting the pinned
// aggregate's dependency tree so fresh and packaged profiles use them.
export const DESKTOP_RUNTIME_OVERRIDE_PACKAGES = Object.freeze([
  '@linxin666/dsh-client-ui-web-ui-settings',
  '@linxin666/dsh-live-stats',
].toSorted())

// These bundles deliberately resolve through the workspace overrides in
// pnpm-workspace.yaml. They carry Desktop-owned workspace-open, Worktree,
// and Evidence fixes, so their package version is not used as evidence of the
// aggregate release.
export const DESKTOP_AGGREGATE_WORKSPACE_OVERRIDE_PACKAGES = Object.freeze([
  '@linxin666/dsh-client-ui-aionui-panel',
  '@linxin666/dsh-client-ui-git-graph',
  '@linxin666/dsh-client-ui-task-board',
  '@linxin666/dsh-ssh',
].toSorted())

// Desktop 2.1 first claimed this package as a managed compatibility link, but
// a 2.0 profile can already contain pnpm's ordinary materialized copy. Adopt
// only the exact release known to have been left by that upgrade path.
export const MANAGED_RUNTIME_PACKAGES = Object.freeze([
  ...BUILTIN_RUNTIME_PACKAGES,
  ...DESKTOP_SUPPORT_PACKAGES,
  ...DESKTOP_PLUGIN_COMPAT_PACKAGES,
  DESKTOP_REPAIR_BUNDLE,
].toSorted())

// DSH v0.1.1-rc.1 exposes these runtime modules as peers. Keep them explicit so the
// packaged host is hermetic instead of resolving through a developer machine.
export const DSH_BOOT_RUNTIME_PACKAGES = Object.freeze([
  '@deepseek-ai/cordis-plugin-group',
  '@deepseek-ai/dsh',
  '@deepseek-ai/dsh-anonymous-user-id',
  '@deepseek-ai/dsh-app-boot',
  '@deepseek-ai/dsh-attachment',
  '@deepseek-ai/dsh-atomic-write',
  '@deepseek-ai/dsh-authorization',
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-bash-local',
  '@deepseek-ai/dsh-brand',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-slots',
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
  '@deepseek-ai/dsh-web',
  '@deepseek-ai/dsh-web-app',
].toSorted())

const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/
const ROOT_CONFIG = '[]\n'
export const DESKTOP_PROFILE_BOOTSTRAP_ERROR = 'desktop-profile-bootstrap-invalid'
export const DESKTOP_PROFILE_FAILURE_CATEGORIES = Object.freeze({
  PROFILE_REPAIRABLE: 'PROFILE_REPAIRABLE',
  INSTALLATION_FAILURE: 'INSTALLATION_FAILURE',
  PERMISSION_FAILURE: 'PERMISSION_FAILURE',
  UNKNOWN_FATAL: 'UNKNOWN_FATAL',
})
const INSTALLATION_FAILURE_CODES = new Set([
  'DSH_DESKTOP_INSTALLATION_INCOMPLETE',
  'MANAGED_GIT_INSTALL_INVALID',
  'MANAGED_GIT_INSTALL_UNAVAILABLE',
  'runtime-file-integrity-not-in-matrix',
  'runtime-lockfile-not-in-matrix',
  'runtime-matrix-unavailable',
  'runtime-patch-evidence-not-in-matrix',
])
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
- insert:
    - id: authorization
      name: '@deepseek-ai/dsh-authorization'
- id: llm-pi-ai
  config:
    providers:
      openai-codex: {}
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
${DESKTOP_PATCH_END}
`
const WORKSPACE_CONFIG = `packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n`

/** Identify patch files that carry no loader entries, including legacy `{}` placeholders. */
export function isSemanticallyEmptyPatch(source) {
  if (typeof source !== 'string') return false
  let parsed
  try {
    parsed = parse(source)
  } catch {
    return false
  }
  if (parsed === null || parsed === undefined) return true
  if (Array.isArray(parsed)) return parsed.length === 0
  return typeof parsed === 'object'
    && Object.getPrototypeOf(parsed) === Object.prototype
    && Object.keys(parsed).length === 0
}

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
  const existingDsh = existing.dsh !== null && typeof existing.dsh === 'object' && !Array.isArray(existing.dsh)
    ? existing.dsh
    : {}
  const existingProfile = existingDsh.profile !== null
    && typeof existingDsh.profile === 'object'
    && !Array.isArray(existingDsh.profile)
    ? existingDsh.profile
    : {}
  const existingBundles = existingProfile.bundles
  const existingDependencies = existing.dependencies ?? {}
  const managedBundles = new Set([
    ...BUILTIN_BUNDLES,
    ...DEPENDENCY_ONLY_BUNDLES,
    ...AGGREGATED_BUNDLES,
    DESKTOP_REPAIR_BUNDLE,
  ])
  const seenBundles = new Set(BUILTIN_BUNDLES)
  const communityBundles = []
  for (const name of Array.isArray(existingBundles) ? existingBundles : []) {
    if (managedBundles.has(name) || isRetiredManagedPackage(name) || seenBundles.has(name)) continue
    seenBundles.add(name)
    communityBundles.push(name)
  }
  const dependencies = Object.fromEntries(
    Object.entries(existingDependencies)
      .filter(([name]) =>
        !isRetiredManagedPackage(name)),
  )

  return {
    ...existing,
    name: 'dsh-profile-desktop',
    private: true,
    dependencies,
    dsh: {
      ...existingDsh,
      profile: {
        ...existingProfile,
        bundles: [...BUILTIN_BUNDLES, ...communityBundles],
      },
    },
  }
}

function errorChain(error) {
  const chain = []
  const seen = new Set()
  let current = error
  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current)
    chain.push(current)
    current = current.cause
  }
  return chain
}

/** Classify only bounded startup facts; no error messages or paths are returned. */
export function classifyDesktopProfileBootstrapFailure(error) {
  const chain = errorChain(error)
  if (chain.some((entry) => ['EACCES', 'EPERM', 'EBUSY'].includes(entry?.code))) {
    return DESKTOP_PROFILE_FAILURE_CATEGORIES.PERMISSION_FAILURE
  }
  if (chain.some((entry) => INSTALLATION_FAILURE_CODES.has(entry?.code))) {
    return DESKTOP_PROFILE_FAILURE_CATEGORIES.INSTALLATION_FAILURE
  }
  if (chain.some((entry) => entry?.code === DESKTOP_PROFILE_BOOTSTRAP_ERROR)) {
    return DESKTOP_PROFILE_FAILURE_CATEGORIES.PROFILE_REPAIRABLE
  }
  return DESKTOP_PROFILE_FAILURE_CATEGORIES.UNKNOWN_FATAL
}

export function createDesktopRepairProfileManifest() {
  return {
    name: 'dsh-profile-desktop-repair',
    private: true,
    dependencies: {},
    dsh: {
      profile: {
        bundles: [DESKTOP_REPAIR_BUNDLE],
      },
    },
  }
}

function managedSectionBounds(text, startMarker, endMarker) {
  const source = String(text)
  const start = source.indexOf(startMarker)
  if (start === -1) return undefined
  const markerEnd = source.indexOf(endMarker, start)
  return {
    start,
    end: markerEnd === -1 ? source.length : markerEnd + endMarker.length,
    complete: markerEnd !== -1,
  }
}

function legacySkinSectionBounds(existing = '') {
  return managedSectionBounds(existing, SKIN_PATCH_START, SKIN_PATCH_END)
}

export function extractManagedSkinSection(existing = '') {
  const source = String(existing)
  const bounds = legacySkinSectionBounds(source)
  return bounds === undefined ? undefined : source.slice(bounds.start, bounds.end)
}

export function stripManagedSkinSection(existing = '') {
  const source = String(existing)
  const bounds = legacySkinSectionBounds(source)
  if (bounds === undefined) return source
  if (bounds.complete) return source.slice(0, bounds.start) + source.slice(bounds.end)

  // The marker is a Desktop-owned comment, not YAML syntax. If a previous
  // version left it unterminated, retain the rest of the file and let the
  // loader-row cleanup remove only unsafe legacy skin entries.
  const markerLineEnd = source.indexOf('\n', bounds.start)
  return source.slice(0, bounds.start) + source.slice(markerLineEnd === -1 ? source.length : markerLineEnd + 1)
}

const LEGACY_SKIN_SELECTION_ARCHIVE = '.dsh-desktop-retired-skin.json'
export const DESKTOP_SKIN_STATE_START = '# --- dsh-desktop skin state (auto-generated; do not edit) ---'
export const DESKTOP_SKIN_STATE_END = '# --- end dsh-desktop skin state ---'
const LEGACY_SKIN_PACKAGE_NAME = /^\s*name:\s*['"]?(@(?:deepseek-ai|linxin666)\/dsh-client-ui-skin-([a-z0-9-]+))['"]?\s*$/u
const LOADER_ROW_ID = /^\s*-\s+id:\s*['"]?([A-Za-z0-9._/@-]+)['"]?\s*$/u
const LOADER_DISABLED = /^\s+disabled:\s*(true|false)\s*$/u

function legacySkinPackageMatch(line) {
  const match = LEGACY_SKIN_PACKAGE_NAME.exec(line)
  return match === null || match[2] === 'center' ? undefined : match
}

function lineIndentation(line) {
  return /^\s*/u.exec(line)?.[0].length ?? 0
}

function dropEmptyInsertBlocks(text) {
  const lines = text.split(/\r?\n/u)
  const output = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()
    if (!/^-\s*insert:\s*$/u.test(trimmed)) {
      output.push(line)
      index += 1
      continue
    }
    const indentation = lineIndentation(line)
    let end = index + 1
    let hasRow = false
    while (end < lines.length) {
      const candidate = lines[end]
      const candidateTrimmed = candidate.trim()
      if (candidateTrimmed === '') {
        end += 1
        continue
      }
      if (lineIndentation(candidate) <= indentation) break
      if (!candidateTrimmed.startsWith('#') && /^-\s+id:/u.test(candidateTrimmed)) hasRow = true
      end += 1
    }
    if (hasRow) output.push(...lines.slice(index, end))
    index = end
  }
  return output.join('\n').replace(/\n{3,}/gu, '\n\n')
}

function loaderRows(text) {
  const lines = String(text).split(/\r?\n/u)
  const rows = []
  let index = 0
  while (index < lines.length) {
    const id = LOADER_ROW_ID.exec(lines[index])
    if (id === null) {
      index += 1
      continue
    }
    const indentation = lineIndentation(lines[index])
    let end = index + 1
    while (end < lines.length) {
      const candidate = lines[end]
      if (candidate.trim() !== '' && lineIndentation(candidate) <= indentation) break
      end += 1
    }
    const rowLines = lines.slice(index, end)
    const packageMatch = rowLines
      .map(legacySkinPackageMatch)
      .find(match => match !== undefined)
    const disabled = rowLines
      .map(line => LOADER_DISABLED.exec(line)?.[1])
      .find(value => value !== undefined)
    rows.push({
      id: id[1],
      indentation,
      packageName: packageMatch?.[1],
      skinId: packageMatch?.[2],
      hasName: rowLines.some(line => /^\s*name:\s*/u.test(line)),
      disabled: disabled === undefined ? undefined : disabled === 'true',
    })
    index = end
  }
  return rows
}

function isLegacySkinLoaderId(id) {
  const match = /^ui-skin-([a-z0-9-]+)$/u.exec(id)
  return match !== null && match[1] !== 'center'
}

function skinIdFromLegacyLoaderId(id) {
  return /^ui-skin-([a-z0-9-]+)$/u.exec(id)?.[1]
}

function legacySkinPackageName(skinId) {
  return LEGACY_SKIN_PACKAGE_PREFIXES[1] + skinId
}

function legacySkinSelection(section) {
  if (section === undefined) return undefined
  const named = [...String(section).matchAll(new RegExp(LEGACY_SKIN_PACKAGE_NAME.source, 'gmu'))]
    .map(match => ({ packageName: match[1], skinId: match[2] }))
    .filter(selection => selection.skinId !== 'center')
    .at(-1)
  if (named !== undefined) return named

  const enabledIds = new Set(
    loaderRows(section)
      .filter(row => isLegacySkinLoaderId(row.id) && row.disabled !== true)
      .map(row => skinIdFromLegacyLoaderId(row.id))
      .filter(skinId => skinId !== undefined),
  )
  if (enabledIds.size !== 1) return undefined
  const skinId = [...enabledIds][0]
  return { packageName: legacySkinPackageName(skinId), skinId }
}

function safeDesktopMarketRows(section) {
  const rows = new Map()
  if (section === undefined) return rows
  for (const row of loaderRows(section)) {
    if (row.indentation !== 0
      || row.hasName
      || row.disabled === undefined
      || /^ui-skin-/u.test(row.id)) continue
    rows.set(row.id, row.disabled)
  }
  return rows
}

function mergeDesktopMarketRows(...rowSets) {
  const merged = new Map()
  for (const rows of rowSets) {
    for (const [id, disabled] of rows) {
      if (!merged.has(id)) merged.set(id, disabled)
    }
  }
  return merged
}

function renderDesktopMarketState(rows) {
  const lines = [DESKTOP_SKIN_STATE_START]
  for (const [id, disabled] of [...rows].sort(([left], [right]) => left.localeCompare(right))) {
    lines.push('- id: ' + id, '  disabled: ' + (disabled ? 'true' : 'false'))
  }
  lines.push(DESKTOP_SKIN_STATE_END)
  return lines.join('\n')
}

function stripLegacySkinLoaderRows(text) {
  const lines = String(text).split(/\r?\n/u)
  const output = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    const id = LOADER_ROW_ID.exec(line)
    if (id === null) {
      if (legacySkinPackageMatch(line) === undefined) output.push(line)
      index += 1
      continue
    }
    const indentation = lineIndentation(line)
    let end = index + 1
    while (end < lines.length) {
      const candidate = lines[end]
      if (candidate.trim() !== '' && lineIndentation(candidate) <= indentation) break
      end += 1
    }
    const rowLines = lines.slice(index, end)
    const hasLegacyPackage = rowLines.some(candidate => legacySkinPackageMatch(candidate) !== undefined)
    if (!isLegacySkinLoaderId(id[1]) && !hasLegacyPackage) output.push(...rowLines)
    index = end
  }
  return dropEmptyInsertBlocks(output.join('\n'))
}

function stripDesktopMarketStateRows(text) {
  const lines = String(text).split(/\r?\n/u)
  const output = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    const id = LOADER_ROW_ID.exec(line)
    if (id === null) {
      output.push(line)
      index += 1
      continue
    }
    const indentation = lineIndentation(line)
    let end = index + 1
    while (end < lines.length) {
      const candidate = lines[end]
      if (candidate.trim() !== '' && lineIndentation(candidate) <= indentation) break
      end += 1
    }
    const rowLines = lines.slice(index, end)
    const hasName = rowLines.some(candidate => /^\s*name:\s*/u.test(candidate))
    const hasDisabled = rowLines.some(candidate => LOADER_DISABLED.test(candidate))
    const isMarketState = indentation === 0
      && !hasName
      && hasDisabled
      && !/^ui-skin-/u.test(id[1])
    if (!isMarketState) output.push(...rowLines)
    index = end
  }
  return dropEmptyInsertBlocks(output.join('\n'))
}

function legacySectionPayload(section, complete) {
  if (section === undefined || !complete) return ''
  const payload = section.slice(SKIN_PATCH_START.length, -SKIN_PATCH_END.length)
  return stripDesktopMarketStateRows(stripLegacySkinLoaderRows(payload)).trim()
}

function removeLegacySkinSection(source, bounds) {
  if (bounds === undefined) return String(source)
  if (!bounds.complete) return stripManagedSkinSection(source)
  return String(source).slice(0, bounds.start) + String(source).slice(bounds.end)
}

function appendPreservedPatchRows(source, payload) {
  const retained = String(payload).trim()
  if (retained === '') return String(source)
  const outside = String(source).trim()
  if (outside === '' || outside === '[]') return retained + '\n'
  return outside + '\n\n' + retained + '\n'
}

function replaceDesktopMarketState(text, rows) {
  const source = String(text)
  const bounds = managedSectionBounds(source, DESKTOP_SKIN_STATE_START, DESKTOP_SKIN_STATE_END)
  const withoutState = bounds === undefined
    ? source
    : source.slice(0, bounds.start) + source.slice(bounds.end)
  if (rows.size === 0) return withoutState
  const outside = withoutState.trim()
  const section = renderDesktopMarketState(rows)
  if (outside === '' || outside === '[]') return section + '\n'
  return outside + '\n\n' + section + '\n'
}

async function migrateLegacySkinState({ profilePatch, homePatch, dshHome, profileDir }) {
  const profileBounds = legacySkinSectionBounds(profilePatch)
  const homeBounds = homePatch === undefined ? undefined : legacySkinSectionBounds(homePatch)
  const profileSection = profileBounds === undefined
    ? undefined
    : String(profilePatch).slice(profileBounds.start, profileBounds.end)
  const homeSection = homeBounds === undefined
    ? undefined
    : String(homePatch).slice(homeBounds.start, homeBounds.end)
  const profileSelection = legacySkinSelection(profileSection) ?? legacySkinSelection(profilePatch)
  const homeSelection = legacySkinSelection(homeSection) ?? legacySkinSelection(homePatch)
  const selection = profileBounds === undefined
    ? profileSelection ?? homeSelection
    : profileSelection
  let changed = false
  const activeStatePath = join(dshHome, 'skin-center-active.json')

  if (selection !== undefined) {
    if (BUILTIN_SKIN_IDS.includes(selection.skinId)) {
      if (!await pathExists(activeStatePath)) {
        changed = (await writeIfChanged(
          activeStatePath,
          JSON.stringify({ active: selection.skinId }, null, 2) + '\n',
        )) || changed
      }
    } else {
      changed = (await writeIfChanged(
        join(profileDir, LEGACY_SKIN_SELECTION_ARCHIVE),
        JSON.stringify({
          schemaVersion: 1,
          packageName: selection.packageName,
          skinId: selection.skinId,
          reason: 'not-bundled-by-skin-center-v2',
        }, null, 2) + '\n',
      )) || changed
    }
  }

  const desktopBounds = managedSectionBounds(profilePatch, DESKTOP_SKIN_STATE_START, DESKTOP_SKIN_STATE_END)
  const desktopSection = desktopBounds === undefined
    ? undefined
    : String(profilePatch).slice(desktopBounds.start, desktopBounds.end)
  const marketRows = mergeDesktopMarketRows(
    safeDesktopMarketRows(desktopSection),
    profileBounds?.complete ? safeDesktopMarketRows(profileSection) : new Map(),
    homeBounds?.complete ? safeDesktopMarketRows(homeSection) : new Map(),
  )

  const profilePayload = legacySectionPayload(profileSection, profileBounds?.complete === true)
  const homePayload = legacySectionPayload(homeSection, homeBounds?.complete === true)
  let nextProfilePatch = removeLegacySkinSection(profilePatch, profileBounds)
  nextProfilePatch = appendPreservedPatchRows(nextProfilePatch, profilePayload)
  nextProfilePatch = appendPreservedPatchRows(nextProfilePatch, homePayload)
  nextProfilePatch = stripLegacySkinLoaderRows(nextProfilePatch)
  nextProfilePatch = replaceDesktopMarketState(nextProfilePatch, marketRows)
  let nextHomePatch = homePatch
  if (homePatch !== undefined) {
    nextHomePatch = stripLegacySkinLoaderRows(removeLegacySkinSection(homePatch, homeBounds))
  }

  return {
    profilePatch: nextProfilePatch,
    homePatch: nextHomePatch,
    stateChanged: changed,
  }
}

export function mergeDesktopPatch(existing = '') {
  // The skin selector belongs to this isolated profile. Only replace the
  // desktop-owned block; skin and community rows must survive unchanged.
  let userPatch = String(existing)
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

async function readDesktopProfileJson(path, label) {
  try {
    return await readJsonIfPresent(path)
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    const wrapped = new Error(`desktop profile ${label} is invalid`, { cause: error })
    wrapped.code = DESKTOP_PROFILE_BOOTSTRAP_ERROR
    throw wrapped
  }
}

function profileBootstrapError(message, cause) {
  const error = new Error(message, { cause })
  error.code = DESKTOP_PROFILE_BOOTSTRAP_ERROR
  return error
}

function desktopProfileRecord(value, label) {
  if (value === undefined) return value
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype) {
    return value
  }
  throw profileBootstrapError(`desktop profile ${label} must be a JSON object`)
}

function throwProfileNodeModulesBootstrapError(message, error) {
  // A filesystem permission failure cannot be repaired by moving a profile
  // dependency tree, so retain its normal host/permission error path.
  if (['EACCES', 'EPERM'].includes(error?.code)) throw error
  throw profileBootstrapError(message, error)
}

async function readDesktopManagedPackageJson(path) {
  try {
    return await readJsonIfPresent(path)
  } catch (error) {
    throwProfileNodeModulesBootstrapError('desktop profile managed package metadata is invalid', error)
  }
}

function validateDesktopPatchSyntax(source, label) {
  if (typeof source !== 'string' || source.trim() === '') return
  try {
    parse(source)
  } catch (error) {
    throw profileBootstrapError(`desktop profile ${label} is invalid`, error)
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
  let targetExists
  try {
    await mkdir(dirname(target), { recursive: true })
    targetExists = await pathExists(target)
  } catch (error) {
    throwProfileNodeModulesBootstrapError('desktop profile managed package path is invalid', error)
  }
  if (targetExists) {
    if (await linkTargetsSource(target, sourceDir)) {
      return { changed: false, record: { mode: 'link', source: sourceDir } }
    }
    let metadata
    try {
      metadata = await lstat(target)
    } catch (error) {
      throwProfileNodeModulesBootstrapError('desktop profile managed package path is invalid', error)
    }
    // This lives in the profile's mutable node_modules tree.  A malformed
    // package manifest is therefore a recoverable Desktop bootstrap failure,
    // unlike a malformed bundled runtime package at sourceDir.
    const installed = await readDesktopManagedPackageJson(join(target, 'package.json'))
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
    const migratableLegacyInstall = (metadata.isDirectory() || metadata.isSymbolicLink())
      && packaged?.name === packageName
      && (installed === undefined || installed.name === packageName)
      && (matchingLegacyVersion || declaredByLegacyProfile)
    if (!ownedLink && !ownedCopy && !migratableLegacyInstall) {
      // An unrecorded managed-package path is part of the Desktop profile
      // bootstrap surface. Adopt only an exact package identity or a dangling
      // link already declared by the older Desktop manifest. Unrelated local
      // packages remain untouched.
      throw profileBootstrapError(`refusing to replace unmanaged package at ${target}`)
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
    throwProfileNodeModulesBootstrapError('desktop profile managed package path is invalid', error)
  }

  if (previous.mode === 'link' && metadata.isSymbolicLink()) {
    const owned = await linkTargetsSource(target, previous.source)
    if (!owned) return false
    await rm(target, { recursive: true, force: true })
    return true
  }

  if (previous.mode === 'copy' && metadata.isDirectory()) {
    const installed = await readDesktopManagedPackageJson(join(target, 'package.json'))
    if (installed?.name !== packageName || previous.source === undefined) return false
    await rm(target, { recursive: true, force: true })
    return true
  }
  return false
}

export async function ensureDesktopProfile({
  dshHome,
  packageRoots = resolveRuntimePackages(),
  profileName,
  mode = 'full',
} = {}) {
  if (typeof dshHome !== 'string' || dshHome.length === 0) {
    throw new TypeError('dshHome must be a non-empty absolute path')
  }
  if (!['full', 'builtins', 'repair'].includes(mode)) {
    throw new TypeError('desktop profile mode must be full, builtins, or repair')
  }
  const managedProfileName = {
    full: 'desktop',
    builtins: 'desktop-builtins',
    repair: 'desktop-repair',
  }[mode]
  const selectedProfileName = profileName ?? managedProfileName
  if (typeof selectedProfileName !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/iu.test(selectedProfileName)) {
    throw new TypeError('desktop profile name is invalid')
  }
  if (mode !== 'full' && profileName !== undefined && profileName !== managedProfileName) {
    throw new TypeError('managed fallback profile name cannot be overridden')
  }
  const preserveUserProfile = mode === 'full'
  const profileDir = join(dshHome, 'profiles', selectedProfileName)
  await mkdir(profileDir, { recursive: true })
  const manifestPath = join(profileDir, 'package.json')
  const recordPath = join(profileDir, '.dsh-desktop-links.json')
  const storedRecords = await readDesktopProfileJson(recordPath, 'link record')
  const previousRecords = storedRecords === undefined
    ? {}
    : desktopProfileRecord(storedRecords, 'link record')
  const existing = desktopProfileRecord(
    await readDesktopProfileJson(manifestPath, 'manifest'),
    'manifest',
  )
  const manifest = mode === 'repair'
    ? createDesktopRepairProfileManifest()
    : createDesktopProfileManifest(preserveUserProfile ? existing : {})
  const activePackageRoots = new Map(packageRoots)
  for (const packageName of CODEX_PROVIDER_CONFLICTS) activePackageRoots.delete(packageName)
  for (const packageName of activePackageRoots.keys()) {
    if (isRetiredLegacySkinPackage(packageName)) activePackageRoots.delete(packageName)
  }

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
  let existingPatch = await readFile(patchPath, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return ''
    throw error
  })
  if (!preserveUserProfile) existingPatch = ''
  validateDesktopPatchSyntax(existingPatch, 'profile patch')
  if (isSemanticallyEmptyPatch(existingPatch)) existingPatch = ''
  const homePatchPath = join(dshHome, 'cordis.patch.yml')
  let homePatch = await readFile(homePatchPath, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return undefined
    throw error
  })
  validateDesktopPatchSyntax(homePatch, 'home patch')
  const originalHomePatch = homePatch
  if (preserveUserProfile) {
    const legacySkinMigration = await migrateLegacySkinState({
      profilePatch: existingPatch,
      homePatch,
      dshHome,
      profileDir,
    })
    existingPatch = legacySkinMigration.profilePatch
    homePatch = legacySkinMigration.homePatch
    changed = legacySkinMigration.stateChanged || changed
  }
  // DSH requires a top-level patch array. Repair only documents with no
  // semantic entries: blank/comment-only files, empty arrays, and legacy empty
  // mappings. Non-empty or malformed user configuration remains untouched.
  if (homePatch !== undefined && isSemanticallyEmptyPatch(homePatch) && homePatch !== ROOT_CONFIG) {
    homePatch = ROOT_CONFIG
  }
  if (preserveUserProfile && homePatch !== originalHomePatch) {
    changed = (await writeIfChanged(homePatchPath, homePatch)) || changed
  }
  let managedPatch = ROOT_CONFIG
  if (mode !== 'repair') {
    try {
      const qqBotEnabled = readQqBotPatchEnabled(existingPatch) ?? false
      managedPatch = mergeQqBotPatch(mergeDesktopPatch(existingPatch), qqBotEnabled)
    } catch (error) {
      throw profileBootstrapError('desktop profile patch is invalid', error)
    }
  }
  changed = (await writeIfChanged(patchPath, managedPatch)) || changed
  changed = (await writeIfChanged(join(profileDir, 'pnpm-workspace.yaml'), WORKSPACE_CONFIG)) || changed
  changed = (await writeIfChanged(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)) || changed

  const legacyProfilePackages = [
    ...Object.keys(existing?.dependencies ?? {}),
    ...(Array.isArray(existing?.dsh?.profile?.bundles) ? existing.dsh.profile.bundles : []),
    ...Object.keys(previousRecords),
  ].filter(isRetiredLegacySkinPackage)
  const packagesToRetire = new Set([
    ...RETIRED_MANAGED_PACKAGES,
    ...CODEX_PROVIDER_CONFLICTS,
    ...legacyProfilePackages,
  ])
  const retired = await Promise.all([...packagesToRetire]
    .toSorted()
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

  for (const packageName of DESKTOP_RUNTIME_OVERRIDE_PACKAGES) {
    if (!pending.has(packageName)) continue
    const overrideRoot = resolvePackageRoot(packageName, [initialAnchor])
    if (overrideRoot === undefined) continue
    resolved.set(packageName, overrideRoot)
    pending.delete(packageName)
    anchors.push(join(overrideRoot, 'package.json'))
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
