import { createHash, randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'

import YAML from 'yaml'

import { createPresetBuffer, readPresetBuffer, selectPortableSettings } from './preset-archive.mjs'

const PLAN_TTL_MS = 15 * 60 * 1_000
const MAX_OPEN_PLANS = 8
const CONFLICT_CHOICES = new Set(['cancel', 'preset', 'skip'])

function hash(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function readOptional(path) {
  try {
    return await readFile(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

async function readOptionalJson(path, fallback) {
  const value = await readOptional(path)
  if (value === undefined) return fallback
  try {
    return JSON.parse(value.toString('utf8'))
  } catch (error) {
    throw new Error(`preset state file is invalid: ${path}`, { cause: error })
  }
}

async function readOptionalYaml(path, fallback) {
  const value = await readOptional(path)
  if (value === undefined) return fallback
  try {
    return YAML.parse(value.toString('utf8')) ?? fallback
  } catch (error) {
    throw new Error(`preset settings YAML is invalid: ${path}`, { cause: error })
  }
}

async function exists(path) {
  try {
    return await lstat(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

async function replaceFile(path, content) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.preset-${process.pid}-${Date.now()}.tmp`
  const backup = `${path}.preset-${process.pid}-${Date.now()}.bak`
  await writeFile(temporary, content, { flag: 'wx', mode: 0o600 })
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

async function restoreFile(path, content) {
  if (content === undefined) await rm(path, { force: true })
  else await replaceFile(path, content)
}

async function collectSkillFiles(root) {
  const skills = new Map()
  let count = 0
  let bytes = 0
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return skills
    throw error
  }
  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || entry.name === '.system') continue
    const skillRoot = join(root, entry.name)
    const files = new Map()
    const visit = async (directory) => {
      for (const child of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, child.name)
        const metadata = await lstat(path)
        if (metadata.isSymbolicLink()) throw new Error(`preset export refuses symbolic link ${path}`)
        if (metadata.isDirectory()) {
          await visit(path)
          continue
        }
        if (!metadata.isFile()) throw new Error(`preset export refuses special file ${path}`)
        count += 1
        bytes += metadata.size
        if (count > 512 || bytes > 32 * 1024 * 1024) throw new Error('preset skills exceed the export limit')
        files.set(relative(skillRoot, path).split(sep).join('/'), await readFile(path))
      }
    }
    await visit(skillRoot)
    if (files.size > 0) skills.set(entry.name, files)
  }
  return skills
}

function capabilityPlan(required, runtimeProbe) {
  const available = new Set((runtimeProbe?.capabilities ?? [])
    .filter((item) => item.status === 'available')
    .map((item) => item.id))
  return required.map((id) => Object.freeze({ id, available: available.has(id) }))
}

function validateChoice(value, label, fallback = null) {
  const choice = value ?? fallback
  if (!CONFLICT_CHOICES.has(choice)) throw new TypeError(`invalid preset conflict choice for ${label}`)
  if (choice === 'cancel') throw new Error(`preset import canceled at ${label}`)
  return choice
}

function publicPlan(record) {
  const { parsed, id, sha256, packages, skills, capabilities } = record
  return Object.freeze({
    id,
    sha256,
    manifest: structuredClone(parsed.manifest),
    trust: structuredClone(parsed.trust),
    requiredSecrets: [...parsed.manifest.requiredSecrets],
    capabilities: capabilities.map((item) => ({ ...item })),
    packages: packages.map((item) => ({ ...item })),
    settings: Object.keys(parsed.settings).toSorted(),
    taskTemplates: parsed.taskTemplates.length,
    skills: skills.map((item) => ({ ...item })),
  })
}

export class PresetService {
  constructor({
    dshHome,
    desktopVersion,
    runtimeVersion,
    pluginManager,
    runtimeProvider,
    now = () => Date.now(),
  }) {
    if (typeof dshHome !== 'string' || dshHome.length === 0) throw new TypeError('preset service requires dshHome')
    if (typeof pluginManager?.inventory !== 'function' || typeof pluginManager?.portablePackages !== 'function') {
      throw new TypeError('preset service requires a plugin manager')
    }
    if (typeof runtimeProvider?.probe !== 'function') throw new TypeError('preset service requires a runtime provider')
    this.dshHome = dshHome
    this.desktopVersion = desktopVersion
    this.runtimeVersion = runtimeVersion
    this.pluginManager = pluginManager
    this.runtimeProvider = runtimeProvider
    this.now = now
    this.plans = new Map()
    this.settingsPath = join(dshHome, 'settings.yaml')
    this.taskTemplatesPath = join(dshHome, 'task-templates.json')
    this.skillsRoot = join(dshHome, 'skills')
  }

  async exportFile(path, { name = 'DeepSeek Harness Desktop preset', description = '' } = {}) {
    const [packages, rawSettings, taskTemplates, skills] = await Promise.all([
      this.pluginManager.portablePackages(),
      readOptionalYaml(this.settingsPath, {}),
      readOptionalJson(this.taskTemplatesPath, []),
      collectSkillFiles(this.skillsRoot),
    ])
    const { settings, skipped } = selectPortableSettings(rawSettings)
    const buffer = createPresetBuffer({
      manifest: {
        name,
        description,
        createdAt: new Date(this.now()).toISOString(),
        source: { desktopVersion: this.desktopVersion, runtimeVersion: this.runtimeVersion },
        requiredCapabilities: ['runtime.lifecycle', 'profile.paths'],
        requiredSecrets: [],
      },
      packages,
      settings,
      skills,
      taskTemplates,
      readme: '# DeepSeek Harness Desktop preset\n\nIntegrity verified does not establish publisher identity. Review the import plan before applying it.\n',
    })
    await replaceFile(path, buffer)
    return Object.freeze({
      bytes: buffer.length,
      sha256: hash(buffer),
      packages: packages.length,
      skills: skills.size,
      skipped,
    })
  }

  async previewFile(path) {
    return this.previewBuffer(await readFile(path))
  }

  async previewBuffer(buffer) {
    const parsed = readPresetBuffer(buffer)
    const inventory = await this.pluginManager.inventory()
    const installed = new Map(inventory.map((item) => [item.name, item]))
    const inspections = typeof this.pluginManager.inspect === 'function'
      ? await Promise.all(parsed.packages.map(async (item) => {
          try {
            return await this.pluginManager.inspect(`${item.name}@${item.version}`)
          } catch (error) {
            return Object.freeze({
              status: 'unavailable',
              error: String(error?.message ?? error).slice(0, 300),
            })
          }
        }))
      : parsed.packages.map(() => undefined)
    const packages = parsed.packages.map((item, index) => {
      const current = installed.get(item.name)
      const inspection = inspections[index]
      const status = current === undefined
        ? 'install'
        : current.version === item.version
          ? 'skip'
          : 'conflict'
      return Object.freeze({
        ...item,
        status,
        ...(current?.version ? { currentVersion: current.version } : {}),
        review: inspection === undefined
          ? Object.freeze({ status: 'verify-on-prepare' })
          : Object.freeze({
              status: inspection.compatibility?.status ?? inspection.status,
              reasons: [...(inspection.compatibility?.reasons ?? [])],
              bundle: inspection.bundle === true,
              integrityVerified: inspection.integrity === item.integrity,
              ...(inspection.error ? { error: inspection.error } : {}),
            }),
      })
    })
    const skills = []
    for (const name of parsed.skills.keys()) {
      skills.push(Object.freeze({ name, status: await exists(join(this.skillsRoot, name)) ? 'conflict' : 'install' }))
    }
    const capabilities = capabilityPlan(parsed.manifest.requiredCapabilities, this.runtimeProvider.probe())
    const id = randomUUID()
    const record = Object.freeze({
      id,
      sha256: hash(buffer),
      parsed,
      packages: Object.freeze(packages),
      skills: Object.freeze(skills),
      capabilities: Object.freeze(capabilities),
      createdAt: this.now(),
    })
    for (const [planId, candidate] of this.plans) {
      if (this.now() - candidate.createdAt > PLAN_TTL_MS) this.plans.delete(planId)
    }
    while (this.plans.size >= MAX_OPEN_PLANS) this.plans.delete(this.plans.keys().next().value)
    this.plans.set(id, record)
    return publicPlan(record)
  }

  resolvePlan(id) {
    if (typeof id !== 'string') throw new TypeError('preset plan identifier is invalid')
    const record = this.plans.get(id)
    if (record === undefined || this.now() - record.createdAt > PLAN_TTL_MS) {
      this.plans.delete(id)
      throw new Error('preset preview expired; select the file again')
    }
    if (record.capabilities.some((item) => !item.available)) {
      throw new Error('preset requires runtime capabilities that are unavailable')
    }
    return record
  }

  verifyPreparedPackages(record, prepared) {
    if (prepared === null || typeof prepared !== 'object' || !Array.isArray(prepared.items)) {
      throw new TypeError('prepared preset packages are invalid')
    }
    const expected = new Map(record.parsed.packages.map((item) => [item.name, item]))
    const seen = new Set()
    for (const item of prepared.items) {
      const lock = expected.get(item.name)
      if (
        lock === undefined
        || seen.has(item.name)
        || item.version !== lock.version
        || item.integrity !== lock.integrity
        || typeof item.manifest?.dsh?.bundle?.patch !== 'string'
        || item.compatibility?.status !== 'compatible'
      ) {
        throw new Error(`prepared package does not match the reviewed Preset lock: ${String(item?.name ?? 'unknown')}`)
      }
      seen.add(item.name)
    }
    return true
  }

  packageSpecs(record, decisions = {}) {
    return record.packages.flatMap((item) => {
      if (item.status === 'skip') return []
      const reviewedUnsafe = item.review.status !== 'verify-on-prepare' && (
        item.review.status !== 'compatible'
        || item.review.bundle !== true
        || item.review.integrityVerified !== true
      )
      const choice = validateChoice(
        decisions[item.name],
        item.name,
        item.status === 'conflict' || reviewedUnsafe ? undefined : 'preset',
      )
      if (choice === 'skip') return []
      if (reviewedUnsafe) throw new Error(`preset package review failed for ${item.name}`)
      return [`${item.name}@${item.version}`]
    })
  }

  async stageConfig(record, decisions = {}) {
    const parsed = record.parsed
    const settingsChoice = validateChoice(decisions.settings, 'settings', 'preset')
    const templatesChoice = validateChoice(decisions.taskTemplates, 'task templates', 'preset')
    await mkdir(this.dshHome, { recursive: true })
    await mkdir(this.skillsRoot, { recursive: true })
    const settingsBefore = await readOptional(this.settingsPath)
    const templatesBefore = await readOptional(this.taskTemplatesPath)
    let settingsAfter
    if (settingsChoice === 'preset') {
      let current = {}
      if (settingsBefore !== undefined) {
        try {
          current = YAML.parse(settingsBefore.toString('utf8')) ?? {}
        } catch (error) {
          throw new Error(`preset settings YAML is invalid: ${this.settingsPath}`, { cause: error })
        }
      }
      if (current === null || typeof current !== 'object' || Array.isArray(current)) {
        throw new Error('current settings.yaml root must be an object')
      }
      settingsAfter = Buffer.from(YAML.stringify({ ...current, ...parsed.settings }))
    }
    const stageRoot = await mkdtemp(join(this.dshHome, '.dshpreset-stage-'))
    const stagedSkillsRoot = join(stageRoot, 'skills')
    const backupSkillsRoot = join(stageRoot, 'backup-skills')
    await mkdir(stagedSkillsRoot, { recursive: true })
    await mkdir(backupSkillsRoot, { recursive: true })
    const selectedSkills = []
    try {
      for (const item of record.skills) {
        const choice = validateChoice(
          decisions.skills?.[item.name],
          `skill ${item.name}`,
          item.status === 'conflict' ? undefined : 'preset',
        )
        if (choice === 'skip') continue
        const target = join(this.skillsRoot, item.name)
        const targetMetadata = await exists(target)
        if (targetMetadata?.isSymbolicLink()) throw new Error(`skill conflict target is a symbolic link: ${item.name}`)
        if (targetMetadata && !targetMetadata.isDirectory()) throw new Error(`skill conflict target is not a directory: ${item.name}`)
        if (targetMetadata) await cp(target, join(backupSkillsRoot, item.name), { recursive: true, dereference: false })
        const staged = join(stagedSkillsRoot, item.name)
        for (const [relativePath, content] of parsed.skills.get(item.name)) {
          const path = join(staged, ...relativePath.split('/'))
          await mkdir(dirname(path), { recursive: true })
          await writeFile(path, content, { flag: 'wx' })
        }
        selectedSkills.push(Object.freeze({ name: item.name, hadExisting: Boolean(targetMetadata) }))
      }
    } catch (error) {
      await rm(stageRoot, { recursive: true, force: true })
      throw error
    }

    let active = true
    let applied = false
    const rollback = async () => {
      if (!active) return false
      const errors = []
      if (applied) {
        for (const skill of selectedSkills) {
          const target = join(this.skillsRoot, skill.name)
          try {
            await rm(target, { recursive: true, force: true })
            if (skill.hadExisting) {
              await cp(join(backupSkillsRoot, skill.name), target, { recursive: true, dereference: false })
            }
          } catch (error) {
            errors.push(error)
          }
        }
        if (settingsChoice === 'preset') {
          try { await restoreFile(this.settingsPath, settingsBefore) } catch (error) { errors.push(error) }
        }
        if (templatesChoice === 'preset') {
          try { await restoreFile(this.taskTemplatesPath, templatesBefore) } catch (error) { errors.push(error) }
        }
      }
      active = false
      try { await rm(stageRoot, { recursive: true, force: true }) } catch (error) { errors.push(error) }
      if (errors.length > 0) throw new AggregateError(errors, 'preset configuration rollback failed')
      return true
    }
    return Object.freeze({
      apply: async () => {
        if (!active || applied) throw new Error('preset configuration transaction is not applicable')
        applied = true
        if (settingsChoice === 'preset') {
          await replaceFile(this.settingsPath, settingsAfter)
        }
        if (templatesChoice === 'preset') await replaceFile(this.taskTemplatesPath, Buffer.from(`${JSON.stringify(parsed.taskTemplates, null, 2)}\n`))
        for (const skill of selectedSkills) {
          const target = join(this.skillsRoot, skill.name)
          await rm(target, { recursive: true, force: true })
          await rename(join(stagedSkillsRoot, skill.name), target)
        }
        return true
      },
      async commit() {
        if (!active) return false
        active = false
        // Configuration is already active and Runtime health has passed. A
        // temporary-directory cleanup problem must not turn a committed
        // Preset into an impossible partial rollback.
        await rm(stageRoot, { recursive: true, force: true }).catch(() => {})
        return true
      },
      rollback,
    })
  }

  forgetPlan(id) {
    return this.plans.delete(id)
  }
}
