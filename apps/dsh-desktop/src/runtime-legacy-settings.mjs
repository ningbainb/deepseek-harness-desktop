import { createHash, randomUUID } from 'node:crypto'
import { link, lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { parseDocument, stringify } from 'yaml'
import { composeEntries } from '@deepseek-ai/dsh-app-boot'
import SettingsForms from '@deepseek-ai/dsh-settings'

const SDK_SETTINGS = '@deepseek-ai/dsh-settings'
const ADAPTER_SETTINGS = import.meta.url
const TRANSACTION_DIRECTORY = '.desktop-legacy-settings-transaction'
const migrationHealthTargets = new WeakMap()
const SECTION_ENTRIES = {
  'ui-developer-tools': 'ui-settings',
  'ui-onboarding': 'ui-settings-general',
  shell: process.platform === 'win32' ? 'pwsh-sandbox' : 'bash-sandbox',
}

export default class DesktopLegacySettings extends SettingsForms {
  get(namespace) {
    const target = this.ownerContext.configEditor.configuration().find(({ entry }) =>
      entry.options.id === namespace && entry.fiber?.state === 2)
    if (!target) return {}
    const live = this.describe().find(descriptor => descriptor.ns === namespace)?.value ?? {}
    return merge(target.entry.options.config ?? {}, live)
  }

  get documentPath() {
    return join(this.ownerContext.profileContext.home, 'settings.yaml')
  }

  async importLegacyDocument() {}
}

export function legacySettingsDigest(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function merge(under, over) {
  if (!record(under) || !record(over) || Object.hasOwn(over, '__jsExpr')) return structuredClone(over)
  return Object.fromEntries([...new Set([...Object.keys(under), ...Object.keys(over)])].map(key => [
    key,
    Object.hasOwn(over, key) ? merge(under[key], over[key]) : structuredClone(under[key]),
  ]))
}

function parseYaml(bytes, kind) {
  const document = parseDocument(bytes.toString('utf8'))
  if (document.errors.length) throw new Error(`Invalid legacy settings ${kind} YAML`)
  return document.toJS()
}

async function bytesAt(path) {
  try {
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Legacy settings paths must be regular files')
    return await readFile(path)
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

async function writeSynced(path, bytes) {
  const handle = await open(path, 'wx', 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function atomicRestore(path, bytes) {
  if (bytes === undefined) {
    await rm(path, { force: true })
    return
  }
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeSynced(temporary, bytes)
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

function within(home, path) {
  const result = relative(home, resolve(path))
  if (!result || isAbsolute(result) || result.startsWith('..') || resolve(home, result) !== resolve(path)) {
    throw new Error('Legacy settings profile patch must be inside the selected home')
  }
}

export function adaptRuntimeLegacySettingsPatches(patches) {
  const adapt = row => {
    const result = { ...row }
    if (row.name === SDK_SETTINGS) result.name = ADAPTER_SETTINGS
    if (Array.isArray(row.insert)) result.insert = row.insert.map(adapt)
    if (row.group && Array.isArray(row.config)) result.config = row.config.map(adapt)
    return result
  }
  return patches.map(adapt)
}

function indexEntries(entries, result = new Map()) {
  for (const entry of entries) {
    if (entry.id) result.set(entry.id, entry)
    if (entry.group && Array.isArray(entry.config)) indexEntries(entry.config, result)
  }
  return result
}

function activeServiceIdentity(ctx, name) {
  const implementation = ctx.reflect?._getImpl(name)
  if (implementation?.fiber?.state !== 2 || implementation.value === undefined) return undefined
  return { fiber: implementation.fiber, value: implementation.value }
}

function sameActiveService(ctx, name, identity) {
  const current = activeServiceIdentity(ctx, name)
  return current !== undefined && current.fiber === identity.fiber && current.value === identity.value
}

export async function diagnoseRuntimeLegacySettingsHealth(ctx, { patches } = {}) {
  const checks = {}
  const fail = (reason, id) => ({ healthy: false, reason, checks, ...(typeof id === 'string' && /^[\w:@./-]{1,160}$/u.test(id) ? { id } : {}) })
  const check = (name, value) => (checks[name] = Boolean(value))
  try {
    if (!check('rootActive', ctx?.fiber?.state === 2)) return fail('rootActive')
    if (!check('patchesPresent', Array.isArray(patches))) return fail('patchesPresent')
    const loaderIdentity = activeServiceIdentity(ctx, 'loader')
    if (!check('loaderActive', loaderIdentity !== undefined)) return fail('loaderActive')
    const loader = ctx.get('loader')
    if (!check('loaderContract', typeof loader?.await === 'function' && typeof loader.entries === 'function' && typeof loader.getTasks === 'function')) return fail('loaderContract')
    await loader.await()
    if (!check('rootStillActive', ctx.fiber.state === 2)) return fail('rootStillActive')
    if (!check('loaderSameImplementation', sameActiveService(ctx, 'loader', loaderIdentity))) return fail('loaderSameImplementation')
    if (!check('loaderSettled', loader.getTasks().length === 0)) return fail('loaderSettled')
    const settingsIdentity = activeServiceIdentity(ctx, 'settings')
    if (!check('settingsActive', settingsIdentity !== undefined)) return fail('settingsActive')
    const settings = ctx.get('settings')
    if (!check('settingsAdapter', settings instanceof DesktopLegacySettings)) return fail('settingsAdapter')
    const profile = ctx.get('profileContext')
    if (!check('profilePresent', typeof profile?.dir === 'string')) return fail('profilePresent')
    const rootUrl = pathToFileURL(join(profile.dir, 'cordis.yml')).href
    const roots = [...loader.entries()].filter(entry => entry.options.name === 'cordis:include' && entry.options.config?.path === rootUrl)
    if (!check('rootIncludeUnique', roots.length === 1)) return fail('rootIncludeUnique')
    if (!check('rootIncludeActive', roots[0].fiber?.state === 2)) return fail('rootIncludeActive')
    if (!check('rootIncludeTree', typeof roots[0].subtree?.entries === 'function')) return fail('rootIncludeTree')
    const expected = indexEntries(composeEntries(patches))
    const targets = new Set(migrationHealthTargets.get(patches) ?? patches.filter(patch => patch.id && !patch.insert && Object.hasOwn(patch, 'config')).map(patch => patch.id))
    targets.add('settings')
    for (const id of ['agent-default-model', 'llm-pi-ai']) if (expected.has(id)) targets.add(id)
    const actual = new Map()
    for (const entry of roots[0].subtree.entries()) {
      const id = entry.options.id
      if (!targets.has(id)) continue
      if (!check('targetUnique', !actual.has(id))) return fail('targetUnique', id)
      actual.set(id, entry)
    }
    const moduleName = name => typeof name === 'string' && isAbsolute(name) ? pathToFileURL(name).href : name
    for (const id of targets) {
      const planned = expected.get(id)
      const running = actual.get(id)
      if (!check('targetPresent', planned !== undefined && running !== undefined)) return fail('targetPresent', id)
      if (!check('targetEnabled', planned.disabled !== true && !running.disabled)) return fail('targetEnabled', id)
      if (!check('targetActive', running.fiber?.state === 2)) return fail('targetActive', id)
      if (!check('targetModule', moduleName(running.options.name) === moduleName(planned.name))) return fail('targetModule', id)
      if (!check('targetConfig', isDeepStrictEqual(running.options.config ?? {}, planned.config ?? {}))) return fail('targetConfig', id)
      if (id === 'settings' && !check('settingsOwner', settings.ownerContext?.fiber === running.fiber && settingsIdentity.fiber === running.fiber)) return fail('settingsOwner', id)
    }
    if (!check('rootFinallyActive', ctx.fiber.state === 2)) return fail('rootFinallyActive')
    if (!check('loaderFinallySame', sameActiveService(ctx, 'loader', loaderIdentity))) return fail('loaderFinallySame')
    if (!check('settingsFinallySame', sameActiveService(ctx, 'settings', settingsIdentity))) return fail('settingsFinallySame')
    if (!check('loaderFinallySettled', loader.getTasks().length === 0)) return fail('loaderFinallySettled')
    return { healthy: true, checks }
  } catch {
    check('inspectionCompleted', false)
    return fail('inspectionCompleted')
  }
}

export async function verifyRuntimeLegacySettingsHealth(ctx, options) {
  return (await diagnoseRuntimeLegacySettingsHealth(ctx, options)).healthy
}

export function planRuntimeLegacySettings(sections, patches) {
  if (!record(sections)) throw new Error('Legacy settings must contain a section object')
  const entries = indexEntries(composeEntries(patches))
  const overrides = new Map()
  const explicit = new Map()
  for (const patch of patches) {
    if (patch.id && !patch.insert && Object.hasOwn(patch, 'config')) explicit.set(patch.id, patch.config)
  }
  const deferredSections = []
  for (const [section, values] of Object.entries(sections)) {
    const id = SECTION_ENTRIES[section] ?? section
    const entry = entries.get(id)
    if (!entry || entry.disabled === true || !record(entry.config ?? {}) || Object.hasOwn(entry.config ?? {}, '__jsExpr')) {
      deferredSections.push(section)
      continue
    }
    if (!record(values)) throw new Error('Legacy settings sections must contain objects')
    const inherited = overrides.get(id)?.config ?? entry.config ?? {}
    const current = explicit.get(id)
    const config = current === undefined ? merge(inherited, values) : merge(merge(inherited, values), current)
    if (!isDeepStrictEqual(config, inherited)) overrides.set(id, { id, config })
  }
  return { overrides: [...overrides.values()], deferredSections }
}

async function restoreTransaction(directory, metadata) {
  const readOriginal = async name => {
    const original = metadata[name]
    if (original === null) return undefined
    const bytes = await readFile(join(directory, `${name}.original`))
    if (legacySettingsDigest(bytes) !== original) throw new Error('Legacy settings recovery checksum mismatch')
    return bytes
  }
  const source = await readOriginal('source')
  const patch = await readOriginal('patch')
  await atomicRestore(metadata.profilePatchPath, patch)
  await atomicRestore(join(dirname(directory), 'settings.yaml'), source)
  for (const created of metadata.created ?? []) {
    const bytes = await bytesAt(created.path)
    if (bytes !== undefined && legacySettingsDigest(bytes) === created.sha256) {
      const stat = await lstat(created.path, { bigint: true })
      if (stat.ino.toString() === created.inode) await rm(created.path)
    }
  }
  await rm(directory, { recursive: true })
}

export async function recoverRuntimeLegacySettings({ home }) {
  home = resolve(home)
  const directory = join(home, TRANSACTION_DIRECTORY)
  try {
    const stat = await lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Legacy settings transaction directory must not be a link')
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
  const journal = await bytesAt(join(directory, 'journal.json'))
  if (journal === undefined) {
    try {
      await lstat(directory)
      throw new Error('Incomplete legacy settings journal requires manual recovery; originals are retained')
    } catch (error) {
      if (error.code === 'ENOENT') return false
      throw error
    }
  }
  const metadata = JSON.parse(journal)
  within(home, metadata.profilePatchPath)
  if (metadata.status === 'committed') {
    await rm(directory, { recursive: true })
    return true
  }
  try {
    process.kill(metadata.pid, 0)
    throw new Error('Legacy settings transaction is owned by a live process')
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
  for (const created of metadata.created ?? []) within(home, created.path)
  await restoreTransaction(directory, metadata)
  return true
}

export async function prepareRuntimeLegacySettings({ home, profilePatchPath, patches }) {
  home = resolve(home)
  profilePatchPath = resolve(profilePatchPath)
  within(home, profilePatchPath)
  const directory = join(home, TRANSACTION_DIRECTORY)
  await recoverRuntimeLegacySettings({ home })
  await mkdir(directory, { mode: 0o700 })
  const sourcePath = join(home, 'settings.yaml')
  const importedPath = `${sourcePath}.imported`
  let metadata
  let state = 'preparing'
  let commitOperation
  let resultPatches = adaptRuntimeLegacySettingsPatches(patches)
  let deferredSections = []
  const saveJournal = () => atomicRestore(join(directory, 'journal.json'), Buffer.from(JSON.stringify(metadata)))
  const rollback = async () => {
    if (commitOperation) await commitOperation.catch(() => {})
    if (state === 'rolled-back') return
    if (state === 'committed') throw new Error('Legacy settings transaction is already committed')
    if (metadata) await restoreTransaction(directory, metadata)
    else await rm(directory, { recursive: true })
    state = 'rolled-back'
  }
  try {
    const source = await bytesAt(sourcePath)
    const imported = await bytesAt(importedPath)
    const originalPatch = await bytesAt(profilePatchPath)
    const legacy = source ?? imported
    const plan = legacy === undefined ? { overrides: [], deferredSections: [] } : planRuntimeLegacySettings(parseYaml(legacy, 'source'), patches)
    deferredSections = plan.deferredSections
    if (source !== undefined) await writeSynced(join(directory, 'source.original'), source)
    if (originalPatch !== undefined) await writeSynced(join(directory, 'patch.original'), originalPatch)
    if (legacy !== undefined) await writeSynced(join(directory, 'legacy.original'), legacy)
    metadata = {
      version: 1, pid: process.pid, status: 'pending', profilePatchPath,
      source: source === undefined ? null : legacySettingsDigest(source),
      patch: originalPatch === undefined ? null : legacySettingsDigest(originalPatch),
      legacy: legacy === undefined ? null : legacySettingsDigest(legacy),
      created: [],
    }
    await saveJournal()
    if (plan.overrides.length) {
      const document = originalPatch === undefined ? parseDocument('[]\n') : parseDocument(originalPatch.toString('utf8'), { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] })
      if (document.errors.length || !Array.isArray(document.toJS())) throw new Error('Legacy settings profile patch must be a YAML patch list')
      for (const override of plan.overrides) document.add(override)
      await atomicRestore(profilePatchPath, Buffer.from(document.toString()))
      resultPatches = adaptRuntimeLegacySettingsPatches([...patches, ...plan.overrides])
    }
    if (legacy !== undefined && source === undefined) await atomicRestore(sourcePath, legacy)
    migrationHealthTargets.set(resultPatches, plan.overrides.map(override => override.id))
    state = 'prepared'
    const commit = ({ verify } = {}) => {
      if (commitOperation) return commitOperation
      commitOperation = (async () => {
        if (state !== 'prepared') throw new Error('Legacy settings transaction is not prepared')
        try {
          if (typeof verify !== 'function' || await verify({ patches: resultPatches, deferredSections }) !== true) {
            throw new Error('Legacy settings boot health verification failed')
          }
          if (legacy !== undefined) {
            const patchBytes = await bytesAt(profilePatchPath)
            const receipt = Buffer.from(stringify({ version: 1, status: 'verified', sourceSha256: metadata.legacy, profilePatchSha256: patchBytes === undefined ? null : legacySettingsDigest(patchBytes), deferredSections }))
            const receiptPath = join(home, `.desktop-legacy-settings-${metadata.legacy}-${legacySettingsDigest(receipt)}.receipt.yaml`)
            const publish = async (path, bytes) => {
              if (await bytesAt(path) !== undefined) return
              const temporary = join(directory, randomUUID())
              await writeSynced(temporary, bytes)
              const stat = await lstat(temporary, { bigint: true })
              metadata.created.push({ path, sha256: legacySettingsDigest(bytes), inode: stat.ino.toString() })
              await saveJournal()
              try { await link(temporary, path) } catch (error) {
                if (error.code !== 'EEXIST') throw error
                metadata.created.pop()
                await saveJournal()
              } finally { await rm(temporary, { force: true }) }
            }
            await publish(importedPath, legacy)
            await publish(receiptPath, receipt)
          }
          metadata.status = 'committed'
          await saveJournal()
          state = 'committed'
        } catch (error) {
          throw error
        }
        await rm(directory, { recursive: true })
      })()
      return commitOperation
    }
    return { patches: resultPatches, deferredSections, commit, rollback }
  } catch (error) {
    await rollback()
    throw error
  }
}
