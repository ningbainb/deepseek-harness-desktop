import { readFileIfPresent } from './read-file-if-present.mjs'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import semver from 'semver'
import YAML from 'yaml'

import { validatePluginSpec } from './extensions/plugins.mjs'

const PLAN_TTL_MS = 15 * 60 * 1_000
const MIGRATION_PATCH_START = '# --- dsh-web-profile-migration managed (reviewed by Desktop) ---'
const MIGRATION_PATCH_END = '# --- end dsh-web-profile-migration managed ---'
const SENSITIVE_KEY = /(?:api[-_]?key|credential|password|private[-_]?key|secret|token|cookie)/iu

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw new Error(`web profile manifest is invalid: ${path}`, { cause: error })
  }
}

function parsePatch(raw, label) {
  if (raw === undefined || raw.length === 0) return []
  let value
  try {
    value = YAML.parse(raw.toString('utf8'))
  } catch (error) {
    throw new Error(`${label} is invalid YAML`, { cause: error })
  }
  if (value === null) return []
  if (!Array.isArray(value)) throw new Error(`${label} must contain a patch array`)
  return value
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function containsSensitiveKey(value, depth = 0) {
  if (depth > 24) return true
  if (Array.isArray(value)) return value.some((item) => containsSensitiveKey(item, depth + 1))
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, item]) => SENSITIVE_KEY.test(key) || containsSensitiveKey(item, depth + 1))
}

function collectPatchIds(value, ids = new Set(), depth = 0) {
  if (depth > 24) return ids
  if (Array.isArray(value)) {
    for (const item of value) collectPatchIds(item, ids, depth + 1)
  } else if (isRecord(value)) {
    if (typeof value.id === 'string' && /^[a-z0-9][a-z0-9._:-]{0,127}$/iu.test(value.id)) ids.add(value.id)
    for (const item of Object.values(value)) collectPatchIds(item, ids, depth + 1)
  }
  return ids
}

async function readBundlePatch(profileDir, name, manifest) {
  const relativePatch = manifest?.dsh?.bundle?.patch
  const normalizedPatch = typeof relativePatch === 'string' && relativePatch.startsWith('./')
    ? relativePatch.slice(2)
    : relativePatch
  if (
    typeof normalizedPatch !== 'string'
    || normalizedPatch.length === 0
    || normalizedPatch.includes('\\')
    || isAbsolute(normalizedPatch)
    || normalizedPatch.split('/').some((part) => part === '..' || part === '.' || part === '')
  ) return []
  const packageRoot = join(profileDir, 'node_modules', ...name.split('/'))
  try {
    const [realRoot, realPatch] = await Promise.all([
      realpath(packageRoot),
      realpath(resolve(packageRoot, ...normalizedPatch.split('/'))),
    ])
    const escaped = relative(realRoot, realPatch)
    if (escaped === '..' || escaped.startsWith(`..${sep}`) || isAbsolute(escaped)) return []
    return parsePatch(await readFile(realPatch), `${name} bundle patch`)
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

function ownersOf(row, idsByPackage, packageNames) {
  const owners = new Set()
  if (!isRecord(row)) return owners
  if (typeof row.name === 'string' && packageNames.has(row.name)) owners.add(row.name)
  if (typeof row.id === 'string') {
    for (const [name, ids] of idsByPackage) if (ids.has(row.id)) owners.add(name)
  }
  return owners
}

function planConfiguration(rows, idsByPackage, packageNames) {
  const items = []
  let skipped = 0
  const add = (value, owners) => {
    if (owners.size === 0) return
    if (containsSensitiveKey(value)) {
      skipped += 1
      return
    }
    items.push(Object.freeze({ packages: Object.freeze([...owners].toSorted()), value: structuredClone(value) }))
  }
  for (const row of rows) {
    const directOwners = ownersOf(row, idsByPackage, packageNames)
    if (directOwners.size > 0) {
      add(row, directOwners)
      continue
    }
    if (!isRecord(row) || !Array.isArray(row.insert)) continue
    for (const child of row.insert) {
      const owners = ownersOf(child, idsByPackage, packageNames)
      if (owners.size > 0) add({ ...row, insert: [child] }, owners)
    }
  }
  return Object.freeze({ items: Object.freeze(items), skipped })
}

function replaceManagedSection(raw, rows) {
  const text = raw?.toString('utf8') ?? ''
  const start = text.indexOf(MIGRATION_PATCH_START)
  const end = text.indexOf(MIGRATION_PATCH_END)
  let retained = text
  if (start >= 0 && end >= start) retained = `${text.slice(0, start)}${text.slice(end + MIGRATION_PATCH_END.length)}`
  retained = retained.trimEnd()
  if (rows.length === 0) return Buffer.from(retained ? `${retained}\n` : '[]\n')
  const block = `${MIGRATION_PATCH_START}\n${YAML.stringify(rows).trimEnd()}\n${MIGRATION_PATCH_END}`
  return Buffer.from(retained && retained !== '[]' ? `${retained}\n\n${block}\n` : `${block}\n`)
}

async function replaceFile(path, content) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.migration-${process.pid}-${Date.now()}.tmp`
  await writeFile(temporary, content, { flag: 'wx', mode: 0o600 })
  try {
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

export class WebProfileMigrationService {
  constructor({ dshHome, pluginManager, now = () => Date.now() }) {
    if (typeof dshHome !== 'string' || typeof pluginManager?.inspect !== 'function') {
      throw new TypeError('web profile migration requires dshHome and plugin manager inspection')
    }
    this.webProfileDir = join(dshHome, 'profiles', 'web')
    this.desktopProfileDir = join(dshHome, 'profiles', 'desktop')
    this.pluginManager = pluginManager
    this.now = now
    this.plans = new Map()
  }

  async preview() {
    const manifest = await readJson(join(this.webProfileDir, 'package.json'))
    if (manifest === undefined) return Object.freeze({ available: false, items: Object.freeze([]) })
    const desktop = new Map((await this.pluginManager.inventory()).map((item) => [item.name, item]))
    const dependencies = manifest.dependencies
    if (dependencies === null || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
      throw new Error('web profile dependencies are invalid')
    }
    const items = []
    const idsByPackage = new Map()
    for (const [name, version] of Object.entries(dependencies).toSorted(([left], [right]) => left.localeCompare(right))) {
      try {
        if (validatePluginSpec(name).name !== name) throw new TypeError('package name includes a version')
      } catch {
        items.push(Object.freeze({ name, requested: version, status: 'incompatible', reason: 'invalid-package-name' }))
        continue
      }
      if (typeof version !== 'string' || semver.valid(version) === null) {
        items.push(Object.freeze({ name, requested: version, status: 'incompatible', reason: 'version-is-not-exact' }))
        continue
      }
      const sourceManifest = await readJson(join(this.webProfileDir, 'node_modules', ...name.split('/'), 'package.json'))
      if (sourceManifest !== undefined) {
        idsByPackage.set(name, collectPatchIds(await readBundlePatch(this.webProfileDir, name, sourceManifest)))
      }
      let inspected
      try {
        inspected = await this.pluginManager.inspect(`${name}@${version}`)
      } catch (error) {
        items.push(Object.freeze({
          name,
          requested: version,
          status: 'missing',
          sourceMissing: sourceManifest === undefined,
          reason: String(error?.message ?? error).slice(0, 500),
        }))
        continue
      }
      if (inspected.status === 'managed') {
        items.push(Object.freeze({ name, requested: version, status: 'managed', reason: 'desktop-managed' }))
        continue
      }
      if (!inspected.bundle || inspected.compatibility.status === 'incompatible') {
        items.push(Object.freeze({
          name,
          requested: version,
          status: 'incompatible',
          sourceMissing: sourceManifest === undefined,
          reasons: inspected.compatibility.reasons,
        }))
        continue
      }
      const current = desktop.get(name)
      const status = current?.version === inspected.version
        ? 'already-installed'
        : inspected.compatibility.status === 'unknown'
          ? 'unknown'
          : current === undefined ? 'install' : 'update'
      items.push(Object.freeze({
        name,
        requested: version,
        version: inspected.version,
        spec: inspected.spec,
        status,
        sourceMissing: sourceManifest === undefined,
        ...(current?.version ? { currentVersion: current.version } : {}),
      }))
    }
    const sourcePatch = parsePatch(await readFileIfPresent(join(this.webProfileDir, 'cordis.patch.yml')), 'web profile cordis.patch.yml')
    const packageNames = new Set(Object.keys(dependencies))
    const configuration = planConfiguration(sourcePatch, idsByPackage, packageNames)
    const id = randomUUID()
    const record = Object.freeze({ id, createdAt: this.now(), items: Object.freeze(items), configuration })
    this.plans.set(id, record)
    return Object.freeze({
      available: true,
      id,
      items: record.items.map((item) => ({ ...item })),
      configuration: Object.freeze({ fragments: configuration.items.length, skipped: configuration.skipped }),
    })
  }

  selectedSpecs(id, selectedNames, { allowUnknown = false } = {}) {
    const { specs } = this.resolveSelection(id, selectedNames, { allowUnknown })
    return specs
  }

  resolveSelection(id, selectedNames, { allowUnknown = false } = {}) {
    const record = this.plans.get(id)
    if (record === undefined || this.now() - record.createdAt > PLAN_TTL_MS) {
      this.plans.delete(id)
      throw new Error('web profile migration preview expired')
    }
    if (!Array.isArray(selectedNames) || selectedNames.some((name) => typeof name !== 'string')) {
      throw new TypeError('web profile migration selection is invalid')
    }
    const selected = new Set(selectedNames)
    if (selected.size !== selectedNames.length) throw new TypeError('web profile migration selection contains duplicates')
    const eligible = new Map(record.items
      .filter((item) => ['install', 'update', 'unknown'].includes(item.status))
      .map((item) => [item.name, item]))
    const specs = []
    for (const name of selected) {
      const item = eligible.get(name)
      if (item === undefined) throw new TypeError(`web profile item cannot be migrated: ${name}`)
      if (item.status === 'unknown' && !allowUnknown) throw new Error(`${name} has unknown Desktop compatibility`)
      specs.push(item.spec)
    }
    return Object.freeze({ record, names: Object.freeze([...selected]), specs: Object.freeze(specs) })
  }

  async stageConfig(record, selectedNames) {
    if (!record || !Array.isArray(selectedNames)) throw new TypeError('web profile configuration selection is invalid')
    const selected = new Set(selectedNames)
    const rows = record.configuration.items
      .filter((item) => item.packages.some((name) => selected.has(name)))
      .map((item) => structuredClone(item.value))
    const target = join(this.desktopProfileDir, 'cordis.patch.yml')
    const before = await readFileIfPresent(target)
    const next = replaceManagedSection(before, rows)
    let active = true
    let applied = false
    return Object.freeze({
      fragments: rows.length,
      apply: async () => {
        if (!active || applied) throw new Error('web profile configuration transaction is not applicable')
        await replaceFile(target, next)
        applied = true
        return true
      },
      rollback: async () => {
        if (!active) return false
        if (applied) {
          if (before === undefined) await rm(target, { force: true })
          else await replaceFile(target, before)
        }
        active = false
        return true
      },
      commit: () => {
        if (!active) return false
        active = false
        return true
      },
    })
  }

  forget(id) {
    return this.plans.delete(id)
  }
}
