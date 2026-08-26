import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'

const ROOT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u
const PROFILE_REPAIR_FILES = Object.freeze([
  'package.json',
  'pnpm-lock.yaml',
  'cordis.patch.yml',
  '.dsh-desktop-links.json',
  'cordis.yml',
  'cordis.yaml',
  'pnpm-workspace.yaml',
  'pnpm-workspace.yml',
])
const EXCLUDED_DIRECTORIES = new Set(['.git'])
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u

function immutable(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable))
  if (value !== null && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutable(item)])))
  }
  return value
}

function isWithin(candidate, parent) {
  const result = relative(parent, candidate)
  return result === '' || (!result.startsWith(`..${sep}`) && result !== '..' && !isAbsolute(result))
}

function toPortablePath(value) {
  return value.split(sep).join('/')
}

function safeRelativePath(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\0')
    || isAbsolute(value)
    || value.split(/[\\/]/u).some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new TypeError('repair relative path is invalid')
  }
  return value.split(/[\\/]/u).join(sep)
}

async function pathState(path) {
  try {
    return await lstat(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

async function installedBundleVersion(profileDir, packageName) {
  if (!PACKAGE_NAME_PATTERN.test(packageName)) return 'unknown'
  try {
    const manifest = JSON.parse(await readFile(
      join(profileDir, 'node_modules', ...packageName.split('/'), 'package.json'),
      'utf8',
    ))
    return typeof manifest?.version === 'string' && manifest.version.length <= 64
      ? manifest.version
      : 'unknown'
  } catch {
    return 'unknown'
  }
}

export async function resolveEnabledRepairRoots({ profileDir, builtInBundles = [] } = {}) {
  if (typeof profileDir !== 'string' || !isAbsolute(profileDir)) {
    throw new TypeError('repair profile directory must be absolute')
  }
  if (!Array.isArray(builtInBundles) || builtInBundles.some(name => typeof name !== 'string')) {
    throw new TypeError('repair built-in bundle list is invalid')
  }
  const resolvedProfile = resolve(profileDir)
  let manifest
  try {
    manifest = JSON.parse(await readFile(join(resolvedProfile, 'package.json'), 'utf8'))
  } catch (error) {
    throw new Error('repair profile manifest is unreadable', { cause: error })
  }
  const enabled = [...new Set(
    Array.isArray(manifest?.dsh?.profile?.bundles)
      ? manifest.dsh.profile.bundles.filter(name => typeof name === 'string' && PACKAGE_NAME_PATTERN.test(name))
      : [],
  )].sort((left, right) => left.localeCompare(right, 'en'))
  const builtIns = new Set(builtInBundles)
  const roots = [{ id: 'profile', kind: 'profile', path: resolvedProfile }]
  for (const packageName of enabled) {
    if (builtIns.has(packageName)) continue
    const installedPath = join(resolvedProfile, 'node_modules', ...packageName.split('/'))
    try {
      const installedReal = await realpath(installedPath)
      if (!(await lstat(installedReal)).isDirectory()) continue
      roots.push({
        id: `plugin-${createHash('sha256').update(packageName).digest('hex').slice(0, 16)}`,
        kind: 'plugin',
        path: installedReal,
        packageName,
      })
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  const bundles = await Promise.all(enabled.map(async name => ({
    name,
    version: await installedBundleVersion(resolvedProfile, name),
    enabled: true,
  })))
  return immutable({ roots, bundles })
}

async function hashFile(path, budget) {
  const before = await lstat(path)
  if (!before.isFile()) throw new Error('repair workspace expected a regular file')
  budget.files += 1
  budget.bytes += before.size
  if (budget.files > budget.maxFiles || budget.bytes > budget.maxBytes) {
    throw new Error('repair workspace source exceeds its file or byte budget')
  }
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  const after = await lstat(path)
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new Error('repair workspace source changed while hashing')
  }
  return Object.freeze({ kind: 'file', sha256: hash.digest('hex'), size: after.size, mode: after.mode & 0o777 })
}

async function copyMaterialized(source, target, sourceRoot, budget, seenDirectories = new Set()) {
  let stat = await lstat(source)
  let actual = source
  if (stat.isSymbolicLink()) {
    actual = await realpath(source)
    if (!isWithin(actual, sourceRoot)) {
      throw new Error('repair workspace refuses a nested link outside its declared plugin root')
    }
    stat = await lstat(actual)
  }
  if (stat.isDirectory()) {
    const actualReal = await realpath(actual)
    if (seenDirectories.has(actualReal)) throw new Error('repair workspace source contains a directory link cycle')
    seenDirectories.add(actualReal)
    await mkdir(target, { recursive: false, mode: stat.mode & 0o777 })
    const entries = (await readdir(actual, { withFileTypes: true }))
      .filter((entry) => !EXCLUDED_DIRECTORIES.has(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    for (const entry of entries) {
      await copyMaterialized(join(actual, entry.name), join(target, entry.name), sourceRoot, budget, seenDirectories)
    }
    seenDirectories.delete(actualReal)
    return
  }
  if (!stat.isFile()) throw new Error('repair workspace refuses a special filesystem entry')
  await hashFile(actual, budget)
  await copyFile(actual, target)
  await chmod(target, stat.mode & 0o777)
}

async function copyRoot(sourceRoot, targetRoot, kind, budget) {
  await mkdir(targetRoot, { recursive: false })
  if (kind === 'profile') {
    for (const relativePath of PROFILE_REPAIR_FILES) {
      const source = join(sourceRoot, relativePath)
      if (await pathState(source) === undefined) continue
      await copyMaterialized(source, join(targetRoot, relativePath), sourceRoot, budget)
    }
    return
  }
  const entries = (await readdir(sourceRoot, { withFileTypes: true }))
    .filter((entry) => !EXCLUDED_DIRECTORIES.has(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
  for (const entry of entries) {
    await copyMaterialized(join(sourceRoot, entry.name), join(targetRoot, entry.name), sourceRoot, budget)
  }
}

async function inventory(root, budget, prefix = '', output = new Map()) {
  const entries = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => !EXCLUDED_DIRECTORIES.has(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
  for (const entry of entries) {
    const path = join(root, entry.name)
    const logical = prefix === '' ? entry.name : join(prefix, entry.name)
    const stat = await lstat(path)
    if (stat.isSymbolicLink()) throw new Error('repair candidate cannot contain filesystem links')
    if (stat.isDirectory()) {
      output.set(toPortablePath(logical), Object.freeze({ kind: 'directory' }))
      await inventory(path, budget, logical, output)
      continue
    }
    if (!stat.isFile()) throw new Error('repair candidate contains a special filesystem entry')
    output.set(toPortablePath(logical), await hashFile(path, budget))
  }
  return output
}

function inventoryEqual(first, second) {
  if (first.size !== second.size) return false
  for (const [path, entry] of first) {
    const other = second.get(path)
    if (other === undefined || JSON.stringify(entry) !== JSON.stringify(other)) return false
  }
  return true
}

function changedEntries(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()])
  const changes = []
  for (const path of [...paths].sort()) {
    const prior = before.get(path)
    const next = after.get(path)
    if (prior?.kind === 'directory' && next?.kind === 'directory') continue
    if (JSON.stringify(prior) === JSON.stringify(next)) continue
    if (prior?.kind === 'directory' || next?.kind === 'directory') continue
    changes.push({
      relativePath: path,
      beforeSha256: prior?.sha256 ?? null,
      candidateSha256: next?.sha256 ?? null,
    })
  }
  return changes
}

async function writeFileAtomically(source, target, mode) {
  await mkdir(dirname(target), { recursive: true })
  const temporary = join(dirname(target), `.repair-${process.pid}-${randomUUID()}.tmp`)
  try {
    await copyFile(source, temporary)
    if (mode !== undefined) await chmod(temporary, mode)
    await rename(temporary, target)
  } finally {
    await rm(temporary, { force: true }).catch(() => {})
  }
}

async function assertNoLinkedParent(root, portableRelativePath) {
  const parts = portableRelativePath.split('/')
  let current = root
  for (const part of parts.slice(0, -1)) {
    current = join(current, part)
    const stat = await pathState(current)
    if (stat === undefined) return
    if (stat.isSymbolicLink()) throw new Error('repair apply refuses a linked target parent')
    if (!stat.isDirectory()) throw new Error('repair apply target parent is not a directory')
  }
}

function normalizeRootDescriptor(root) {
  if (root === null || typeof root !== 'object' || Array.isArray(root)) {
    throw new TypeError('repair root descriptor is invalid')
  }
  if (typeof root.id !== 'string' || !ROOT_ID_PATTERN.test(root.id)) {
    throw new TypeError('repair root id is invalid')
  }
  if (!['profile', 'plugin'].includes(root.kind) || typeof root.path !== 'string' || !isAbsolute(root.path)) {
    throw new TypeError('repair root kind or path is invalid')
  }
  if (root.kind === 'plugin' && (typeof root.packageName !== 'string' || root.packageName.length === 0)) {
    throw new TypeError('repair plugin package name is required')
  }
  return Object.freeze({
    id: root.id,
    kind: root.kind,
    path: resolve(root.path),
    ...(root.kind === 'plugin' ? { packageName: root.packageName } : {}),
  })
}

export class RepairWorkspace {
  constructor({
    incidentDir,
    profileDir,
    roots,
    maxFiles = 20_000,
    maxBytes = 512 * 1024 * 1024,
  } = {}) {
    if (typeof incidentDir !== 'string' || !isAbsolute(incidentDir)) {
      throw new TypeError('repair incident directory must be absolute')
    }
    if (typeof profileDir !== 'string' || !isAbsolute(profileDir)) {
      throw new TypeError('repair profile directory must be absolute')
    }
    if (!Array.isArray(roots) || roots.length === 0) throw new TypeError('repair roots are required')
    if (!Number.isSafeInteger(maxFiles) || maxFiles < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      throw new TypeError('repair workspace budgets are invalid')
    }
    this.incidentDir = resolve(incidentDir)
    this.profileDir = resolve(profileDir)
    this.workspace = join(this.incidentDir, 'staging')
    this.originals = join(this.incidentDir, 'originals')
    this.rootDescriptors = roots.map(normalizeRootDescriptor)
    if (new Set(this.rootDescriptors.map((root) => root.id)).size !== this.rootDescriptors.length) {
      throw new TypeError('repair root ids must be unique')
    }
    if (this.rootDescriptors.filter((root) => root.kind === 'profile').length !== 1) {
      throw new TypeError('repair workspace requires exactly one profile root')
    }
    this.maxFiles = maxFiles
    this.maxBytes = maxBytes
    this.records = undefined
    this.appliedChanges = undefined
    this.dependencyRewrites = new Map()
  }

  #budget() {
    return { files: 0, bytes: 0, maxFiles: this.maxFiles, maxBytes: this.maxBytes }
  }

  #record(id) {
    const record = this.records?.find((item) => item.id === id)
    if (record === undefined) throw new Error('repair workspace root is unavailable')
    return record
  }

  async #rewriteCandidateManifest(records) {
    const profile = records.find((record) => record.kind === 'profile')
    const manifestPath = join(profile.stageRoot, 'package.json')
    if (await pathState(manifestPath) === undefined) return
    let manifest
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    } catch (error) {
      throw new Error('repair candidate profile manifest is unreadable', { cause: error })
    }
    if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
      throw new Error('repair candidate profile manifest is invalid')
    }
    manifest.dependencies = manifest.dependencies !== null && typeof manifest.dependencies === 'object' && !Array.isArray(manifest.dependencies)
      ? { ...manifest.dependencies }
      : {}
    for (const plugin of records.filter((record) => record.kind === 'plugin')) {
      const candidateSpec = `link:${posix.join('..', 'plugins', plugin.id)}`
      this.dependencyRewrites.set(plugin.packageName, {
        present: Object.hasOwn(manifest.dependencies, plugin.packageName),
        value: manifest.dependencies[plugin.packageName],
        candidateSpec,
      })
      manifest.dependencies[plugin.packageName] = candidateSpec
    }
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  }

  async #effectiveCandidateBytes(record, relativePath) {
    const candidatePath = join(record.stageRoot, ...relativePath.split('/'))
    const bytes = await readFile(candidatePath)
    if (record.kind !== 'profile' || relativePath !== 'package.json') return bytes
    let manifest
    try {
      manifest = JSON.parse(bytes.toString('utf8'))
    } catch (error) {
      throw new Error('repaired profile manifest is invalid', { cause: error })
    }
    if (manifest.dependencies !== null && typeof manifest.dependencies === 'object' && !Array.isArray(manifest.dependencies)) {
      manifest.dependencies = { ...manifest.dependencies }
      for (const [packageName, rewrite] of this.dependencyRewrites) {
        if (manifest.dependencies[packageName] !== rewrite.candidateSpec) continue
        if (rewrite.present) manifest.dependencies[packageName] = rewrite.value
        else delete manifest.dependencies[packageName]
      }
    }
    return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
  }

  async stage() {
    if (this.records !== undefined) throw new Error('repair workspace is already staged')
    await mkdir(this.incidentDir, { recursive: true })
    if (await pathState(this.workspace) !== undefined || await pathState(this.originals) !== undefined) {
      throw new Error('repair workspace staging directories already exist')
    }
    await mkdir(this.workspace, { recursive: false })
    await mkdir(this.originals, { recursive: false })
    await mkdir(join(this.workspace, 'plugins'), { recursive: false })
    await mkdir(join(this.originals, 'plugins'), { recursive: false })
    const profileReal = await realpath(this.profileDir)
    const records = []
    for (const descriptor of this.rootDescriptors) {
      const sourceReal = await realpath(descriptor.path)
      const sourceStat = await lstat(sourceReal)
      if (!sourceStat.isDirectory()) throw new Error('repair root must resolve to a real directory')
      if (descriptor.kind === 'profile' && sourceReal !== profileReal) {
        throw new Error('repair profile root does not match the selected profile')
      }
      const stageRoot = descriptor.kind === 'profile'
        ? join(this.workspace, 'profile')
        : join(this.workspace, 'plugins', descriptor.id)
      const originalRoot = descriptor.kind === 'profile'
        ? join(this.originals, 'profile')
        : join(this.originals, 'plugins', descriptor.id)
      await copyRoot(sourceReal, originalRoot, descriptor.kind, this.#budget())
      await copyRoot(originalRoot, stageRoot, descriptor.kind, this.#budget())
      const originalInventory = await inventory(originalRoot, this.#budget())
      records.push({
        ...descriptor,
        sourceReal,
        stageRoot,
        originalRoot,
        external: descriptor.kind === 'plugin' && !isWithin(sourceReal, profileReal),
        originalInventory,
      })
    }
    await this.#rewriteCandidateManifest(records)
    for (const record of records) {
      record.candidateInitialInventory = await inventory(record.stageRoot, this.#budget())
    }
    this.records = records
    return immutable({
      workspace: this.workspace,
      roots: records.map((record) => ({
        id: record.id,
        kind: record.kind,
        relativePath: record.kind === 'profile' ? 'profile' : `plugins/${record.id}`,
        ...(record.packageName === undefined ? {} : { packageName: record.packageName }),
      })),
    })
  }

  resolveCandidatePath(rootId, relativePath) {
    const record = this.#record(rootId)
    let safe
    try {
      safe = safeRelativePath(relativePath)
    } catch {
      throw new Error('path is outside repair workspace')
    }
    const candidate = resolve(record.stageRoot, safe)
    if (!isWithin(candidate, record.stageRoot)) throw new Error('path is outside repair workspace')
    return candidate
  }

  async changedFiles() {
    if (this.records === undefined) throw new Error('repair workspace is not staged')
    const changes = []
    for (const record of this.records) {
      const candidate = await inventory(record.stageRoot, this.#budget())
      for (const change of changedEntries(record.candidateInitialInventory, candidate)) {
        let candidateSha256 = change.candidateSha256
        if (candidateSha256 !== null && record.kind === 'profile' && change.relativePath === 'package.json') {
          candidateSha256 = createHash('sha256')
            .update(await this.#effectiveCandidateBytes(record, change.relativePath))
            .digest('hex')
        }
        changes.push({
          rootId: record.id,
          rootKind: record.kind,
          external: record.external,
          relativePath: change.relativePath,
          path: record.kind === 'profile'
            ? `profile/${change.relativePath}`
            : `plugins/${record.id}/${change.relativePath}`,
          beforeSha256: change.beforeSha256,
          candidateSha256,
        })
      }
    }
    return immutable(changes.sort((left, right) => left.path.localeCompare(right.path, 'en')))
  }

  async #currentSourceInventory(record) {
    const temporary = join(this.incidentDir, `.current-${record.id}-${randomUUID()}`)
    try {
      await copyRoot(record.sourceReal, temporary, record.kind, this.#budget())
      return await inventory(temporary, this.#budget())
    } finally {
      await rm(temporary, { recursive: true, force: true }).catch(() => {})
    }
  }

  async verifyOriginalsUnchanged() {
    if (this.records === undefined) throw new Error('repair workspace is not staged')
    for (const record of this.records) {
      const current = await this.#currentSourceInventory(record)
      if (!inventoryEqual(current, record.originalInventory)) {
        throw new Error(`repair source ${record.id} changed after repair staging`)
      }
    }
  }

  async #applyChanges(changes, source = 'candidate') {
    for (const change of changes) {
      const record = this.#record(change.rootId)
      await assertNoLinkedParent(record.sourceReal, change.relativePath)
      const target = join(record.sourceReal, ...change.relativePath.split('/'))
      const sourceRoot = source === 'candidate' ? record.stageRoot : record.originalRoot
      const sourcePath = join(sourceRoot, ...change.relativePath.split('/'))
      const sourceEntry = await pathState(sourcePath)
      if (sourceEntry === undefined) {
        await rm(target, { force: true })
        continue
      }
      if (!sourceEntry.isFile()) throw new Error('repair apply accepts regular files only')
      if (source === 'candidate' && record.kind === 'profile' && change.relativePath === 'package.json') {
        const bytes = await this.#effectiveCandidateBytes(record, change.relativePath)
        await mkdir(dirname(target), { recursive: true })
        const temporary = join(dirname(target), `.repair-${process.pid}-${randomUUID()}.tmp`)
        try {
          await writeFile(temporary, bytes, { flag: 'wx', mode: sourceEntry.mode & 0o777 })
          await rename(temporary, target)
        } finally {
          await rm(temporary, { force: true }).catch(() => {})
        }
      } else {
        await writeFileAtomically(sourcePath, target, sourceEntry.mode & 0o777)
      }
    }
  }

  async apply() {
    await this.verifyOriginalsUnchanged()
    const changes = await this.changedFiles()
    try {
      await this.#applyChanges(changes, 'candidate')
    } catch (error) {
      try {
        await this.#applyChanges(changes, 'original')
      } catch (rollbackError) {
        throw new Error('repair apply failed and automatic external rollback failed', {
          cause: new AggregateError([error, rollbackError]),
        })
      }
      throw error
    }
    this.appliedChanges = changes
    return immutable({ changedFiles: changes })
  }

  async rollbackApplied({ externalOnly = false } = {}) {
    if (this.appliedChanges === undefined) return immutable({ rolledBack: false })
    const changes = externalOnly
      ? this.appliedChanges.filter((change) => change.external)
      : this.appliedChanges
    await this.#applyChanges(changes, 'original')
    this.appliedChanges = undefined
    return immutable({ rolledBack: true, changedFiles: changes })
  }
}
