import { lstat, readFile, readdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { parseDocument } from 'yaml'
import { createBrowserComponentManager } from './browser-component.mjs'

export async function assertBrowserPreflightPath(path) {
  for (let ancestor = resolve(path); ; ancestor = dirname(ancestor)) {
    try { if ((await lstat(ancestor)).isSymbolicLink()) throw Error('Browser preflight path contains a link') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    if (ancestor === dirname(ancestor)) break
  }
}
export async function validateInstalledBrowserHome(home) {
  if (typeof home !== 'string' || !isAbsolute(home) || resolve(home) === dirname(resolve(home))) throw Error('Browser upgrade Home must be an explicit absolute directory')
  await assertBrowserPreflightPath(home)
  const path = join(home, 'profiles/desktop/package.json')
  await assertBrowserPreflightPath(path)
  let manifest
  try { manifest = JSON.parse(await readFile(path, 'utf8')) } catch { throw Error('Browser upgrade Home cannot be located: a readable desktop profile is required') }
  if (manifest.name !== 'dsh-profile-desktop' || !Array.isArray(manifest.dsh?.profile?.bundles)) throw Error('Browser upgrade Home identity is ambiguous; select the existing desktop Home')
  return manifest
}
/** Resolve only definite disabled states using the published loader patch/group shape.
 * The vendor's inert dsh-builtin-browser/client row is a sibling, not an owner.
 * Unknown expressions or unsupported insertion targets require preparation.
 */
export function browserDisabledByPatches(patches) {
  const entries = new Map([
    ['dsh-builtin-browser', { id: 'dsh-builtin-browser', name: 'dsh-builtin-browser' }],
    ['browser', { id: 'browser', name: 'dsh-builtin-browser/browser' }],
    ['browser-electron', { id: 'browser-electron', name: 'dsh-builtin-browser/browser-electron' }],
  ])
  let unknown = false
  const index = (rows, parent) => {
    for (const row of rows) {
      if (!row || typeof row.id !== 'string') { unknown = true; continue }
      const entry = { ...row, parent }
      entries.set(row.id, entry)
      if (entry.group === true && Array.isArray(entry.config)) index(entry.config, entry.id)
    }
  }
  for (const patch of patches) {
    if (!patch || typeof patch !== 'object') { unknown = true; continue }
    if (patch.insert !== undefined) {
      if (!Array.isArray(patch.insert)) { unknown = true; continue }
      const parent = patch.id && entries.get(patch.id)
      if (patch.id && (!parent || parent.group !== true)) { unknown = true; continue }
      index(patch.insert, parent?.id)
      continue
    }
    const entry = entries.get(patch.id)
    if (!entry) continue
    if (patch.name && patch.name !== entry.name) continue
    for (const [key, value] of Object.entries(patch)) if (!['id', 'name', 'insert'].includes(key)) entry[key] = value
    if (entry.group === true && Array.isArray(patch.config)) index(patch.config, entry.id)
  }
  if (unknown) return false
  const disabled = (entry, seen = new Set()) => {
    if (!entry || seen.has(entry.id)) return false
    if (entry.disabled === true) return true
    seen.add(entry.id)
    return entry.parent ? disabled(entries.get(entry.parent), seen) : false
  }
  return disabled(entries.get('browser')) || disabled(entries.get('browser-electron'))
}
async function explicitlyDisabled(home) {
  const patches = []
  for (const path of [join(home, 'profiles/desktop/cordis.patch.yml'), join(home, 'cordis.patch.yml')]) {
    await assertBrowserPreflightPath(path)
    let source
    try { source = await readFile(path, 'utf8') } catch (error) { if (error.code === 'ENOENT') continue; throw error }
    const doc = parseDocument(source)
    if (doc.errors.length) return false
    const rows = doc.toJS()
    if (rows !== null && !Array.isArray(rows)) return false
    patches.push(...(rows ?? []))
  }
  return browserDisabledByPatches(patches)
}

export function browserUpgradeComponentPaths(home, env = process.env) {
  return {
    componentRoot: env.DSH_DESKTOP_BROWSER_COMPONENT_ROOT || join(home, 'desktop-components/browser-electron'),
    cacheRoot: env.DSH_DESKTOP_BROWSER_COMPONENT_CACHE || join(home, 'cache/browser-component'),
  }
}
/** Read existing profile only; complete resources before any caller stops or replaces the old app. */
export async function prepareInstalledBrowserUpgrade({ home, archivePath, onProgress, signal, env = process.env, createManager = createBrowserComponentManager } = {}) {
  signal?.throwIfAborted()
  const manifest = await validateInstalledBrowserHome(home)
  const paths = browserUpgradeComponentPaths(home, env)
  for (const path of Object.values(paths)) {
    if (!isAbsolute(path)) throw Error('Browser component overrides must be absolute paths')
    await assertBrowserPreflightPath(path)
  }
  if (await explicitlyDisabled(home)) return { prepared: false, reason: 'disabled' }
  let entries
    try { entries = await readdir(paths.componentRoot, { withFileTypes: true }) }
    catch (error) { if (error.code !== 'ENOENT') throw error; entries = [] }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw Error('Browser component active directory contains a link')
  }
  if (manifest.dsh.profile.desktopDefaults === 'minimal-v1') {
    const used = entries.some(entry => entry.isDirectory() && /^\d+\.\d+\.\d+-(?:win32|darwin|linux)-(?:x64|arm64)$/.test(entry.name))
    if (!used) return { prepared: false, reason: 'unused-minimal' }
  }
  const manager = createManager(paths)
  const ready = await manager.prepare({ archivePath, onProgress, signal })
  signal?.throwIfAborted()
  if (manager.status().phase !== 'ready') throw Error('Browser component preflight did not reach ready')
  return { prepared: true, phase: 'ready', ...ready }
}
