import { readFileIfPresent } from './read-file-if-present.mjs'
import { writeJsonAtomic } from './atomic-write-adapter.mjs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import semver from 'semver'
import { parse as parseYaml } from 'yaml'

import { classifyLegacyHome } from './community-home-migration.mjs'

export const LEGACY_PLUGIN_RECOVERY_SCHEMA_VERSION = 1
export const LEGACY_PLUGIN_RECOVERY_STATUSES = Object.freeze([
  'pending',
  'installing',
  'installed',
  'failed',
  'awaiting-confirmation',
])

const STATUS_SET = new Set(LEGACY_PLUGIN_RECOVERY_STATUSES)
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/iu
const COMMIT = /(?<![a-f0-9])[a-f0-9]{40}(?![a-f0-9])/iu
const GITHUB = /^(?:github:|git\+https:\/\/github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:#(.*))?$/u
const ERROR_LIMIT = 360

function parseJson(source) {
  if (source === undefined) return undefined
  try { return JSON.parse(source) } catch { return undefined }
}

function fingerprint(manifest, lockfile) {
  return createHash('sha256').update(manifest ?? '').update('\0').update(lockfile ?? '').digest('hex')
}

function safeError(error) {
  return String(error instanceof Error ? error.message : error)
    .replace(/(?:_authToken|authorization|token|password)\s*[=:]\s*[^\s]+/giu, '[credential redacted]')
    .replace(/(?:https?:\/\/)[^/@\s]+@/giu, 'https://[redacted]@')
    .replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'`]+/giu, '%USERPROFILE%')
    .slice(0, ERROR_LIMIT)
}

export function classifyPluginInstallFailure(error) {
  const message = safeError(error)
  const lower = message.toLowerCase()
  if (/enotfound|eai_again|econnreset|etimedout|network|fetch failed|offline/u.test(lower)) {
    return Object.freeze({ category: 'network-error', message, suggestion: '检查网络或代理后重试。' })
  }
  if (/err_pnpm_fetch_404|404 not found|no matching version|is not in the npm registry|cannot resolve/u.test(lower)) {
    return Object.freeze({ category: 'dependency-unavailable', message, suggestion: '插件依赖已下架或版本不存在，请联系插件作者更新依赖。' })
  }
  if (/dsh-compact|dsh-client-runtime|legacy sdk|unsupported runtime|plugin_incompatible/u.test(lower)) {
    return Object.freeze({ category: 'legacy-sdk-incompatible', message, suggestion: '该插件仍依赖旧版 DSH SDK，需要作者适配 4.0。' })
  }
  if (/not a dsh bundle|bundle package|dsh\.bundle/u.test(lower)) {
    return Object.freeze({ category: 'missing-dsh-bundle', message, suggestion: '仓库不是可直接安装的 DSH Bundle。' })
  }
  if (/err_pnpm_git_dep_prepare_not_allowed|allow-build|build script|lifecycle script/u.test(lower)) {
    return Object.freeze({ category: 'build-script-restricted', message, suggestion: '插件需要执行构建脚本；请确认来源可信并联系作者发布预构建包。' })
  }
  if (/runtime graph|protected .* conflict|singleton|version conflict/u.test(lower)) {
    return Object.freeze({ category: 'runtime-graph-conflict', message, suggestion: '插件携带了与 Desktop 冲突的 Runtime 依赖。' })
  }
  return Object.freeze({ category: 'unknown-error', message, suggestion: '可重试并导出插件诊断。' })
}

function gitDescriptor(spec) {
  if (typeof spec !== 'string') return undefined
  const match = GITHUB.exec(spec)
  if (match === null) return undefined
  return {
    owner: match[1],
    repository: match[2],
    selector: match[3],
  }
}

function lockedVersion(lockfile, name) {
  if (lockfile === undefined) return undefined
  let parsed
  try { parsed = parseYaml(lockfile) } catch { return undefined }
  const importers = parsed?.importers
  if (importers === null || typeof importers !== 'object') return undefined
  for (const importer of Object.values(importers)) {
    const entry = importer?.dependencies?.[name] ?? importer?.optionalDependencies?.[name]
    const version = typeof entry === 'string' ? entry : entry?.version
    if (typeof version === 'string') return version
  }
  return undefined
}

function pinnedGitSpec(spec, lockfile, name) {
  const git = gitDescriptor(spec)
  if (git === undefined) return undefined
  const directCommit = git.selector?.match(COMMIT)?.[0]
  const locked = lockedVersion(lockfile, name)
  const lockedCommit = locked?.match(COMMIT)?.[0]
  const commit = directCommit ?? lockedCommit
  if (commit === undefined) return undefined
  const path = git.selector?.match(/(?:^|&)path:(\/[A-Za-z0-9._~\/-]+)$/u)?.[1]
  return `github:${git.owner}/${git.repository}#${commit}${path === undefined ? '' : `&path:${path}`}`
}

function sourceKind(spec) {
  if (gitDescriptor(spec) !== undefined) return 'git'
  return semver.valid(spec) === null ? 'unsupported' : 'npm'
}

function publicPlugin(plugin) {
  return Object.freeze({
    id: plugin.id,
    name: plugin.name,
    sourceKind: plugin.sourceKind,
    enabled: plugin.enabled,
    status: plugin.status,
    ...(plugin.failureCategory === undefined ? {} : { failureCategory: plugin.failureCategory }),
    ...(plugin.error === undefined ? {} : { error: plugin.error }),
  })
}

function validateRecord(value) {
  return value !== null
    && typeof value === 'object'
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && PACKAGE_NAME.test(value.name)
    && ['npm', 'git', 'unsupported'].includes(value.sourceKind)
    && typeof value.enabled === 'boolean'
    && STATUS_SET.has(value.status)
}

export class LegacyPluginRecovery {
  constructor({ sourceHome, targetProfileDir, statePath, protectedNames = [], now = () => new Date().toISOString() }) {
    this.sourceHome = resolve(sourceHome)
    this.sourceProfileDir = join(this.sourceHome, 'profiles', 'desktop')
    this.targetProfileDir = resolve(targetProfileDir)
    this.statePath = resolve(statePath)
    this.protectedNames = new Set(protectedNames)
    this.now = now
    this.queue = Promise.resolve()
  }

  #enqueue(operation) {
    const result = this.queue.then(operation, operation)
    this.queue = result.catch(() => {})
    return result
  }

  async #readSource() {
    const manifestSource = await readFileIfPresent(join(this.sourceProfileDir, 'package.json'), 'utf8')
    const lockfile = await readFileIfPresent(join(this.sourceProfileDir, 'pnpm-lock.yaml'), 'utf8')
    return { manifestSource, lockfile, manifest: parseJson(manifestSource) }
  }

  async #readTargetNames() {
    const target = parseJson(await readFileIfPresent(join(this.targetProfileDir, 'package.json'), 'utf8'))
    return new Set(Object.keys(target?.dependencies ?? {}))
  }

  async #readState() {
    const state = parseJson(await readFileIfPresent(this.statePath, 'utf8'))
    if (
      state?.schemaVersion !== LEGACY_PLUGIN_RECOVERY_SCHEMA_VERSION
      || typeof state.sourceFingerprint !== 'string'
      || !Array.isArray(state.plugins)
      || state.plugins.some((plugin) => !validateRecord(plugin))
    ) return undefined
    return state
  }

  async #writeState(state) {
    state.updatedAt = this.now()
    await writeJsonAtomic(this.statePath, state)
  }

  async #initialize() {
    const classification = await classifyLegacyHome(this.sourceHome)
    const source = await this.#readSource()
    const sourceFingerprint = fingerprint(source.manifestSource, source.lockfile)
    const current = await this.#readState()
    if (current?.sourceFingerprint === sourceFingerprint) {
      const targetNames = await this.#readTargetNames()
      let changed = false
      for (const plugin of current.plugins) {
        if (targetNames.has(plugin.name) && plugin.status !== 'installed') {
          plugin.status = 'installed'
          delete plugin.failureCategory
          delete plugin.error
          changed = true
        } else if (!targetNames.has(plugin.name) && plugin.status === 'installing') {
          plugin.status = plugin.sourceKind === 'git' ? 'awaiting-confirmation' : 'pending'
          changed = true
        }
      }
      if (changed) await this.#writeState(current)
      return current
    }
    if (classification !== 'legacy-community' || source.manifest === undefined) {
      const empty = {
        schemaVersion: LEGACY_PLUGIN_RECOVERY_SCHEMA_VERSION,
        sourceFingerprint,
        sourceClassification: classification,
        createdAt: this.now(),
        updatedAt: this.now(),
        plugins: [],
      }
      await this.#writeState(empty)
      return empty
    }

    const targetNames = await this.#readTargetNames()
    const enabled = new Set(source.manifest.dsh?.profile?.bundles ?? [])
    const plugins = []
    for (const [name, requested] of Object.entries(source.manifest.dependencies ?? {}).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
      if (
        !PACKAGE_NAME.test(name)
        || name.startsWith('@deepseek-ai/')
        || this.protectedNames.has(name)
        || typeof requested !== 'string'
      ) continue
      const kind = sourceKind(requested)
      const pinnedSpec = kind === 'git' ? pinnedGitSpec(requested, source.lockfile, name) : undefined
      const installed = targetNames.has(name)
      const unsupported = kind === 'unsupported' || (kind === 'git' && pinnedSpec === undefined)
      plugins.push({
        id: createHash('sha256').update(`${name}\0${requested}\0${pinnedSpec ?? ''}`).digest('base64url').slice(0, 24),
        name,
        sourceKind: kind,
        requested,
        ...(pinnedSpec === undefined ? {} : { pinnedSpec }),
        enabled: enabled.has(name),
        status: installed ? 'installed' : kind === 'git' && !unsupported ? 'awaiting-confirmation' : unsupported ? 'failed' : 'pending',
        ...(unsupported ? {
          failureCategory: kind === 'git' ? 'git-commit-unavailable' : 'legacy-source-unsupported',
          error: kind === 'git'
            ? '旧锁文件中没有可验证的 Git commit，不能安全恢复。'
            : '旧插件来源不是精确 NPM 版本或受支持的 GitHub 来源。',
        } : {}),
      })
    }
    const state = {
      schemaVersion: LEGACY_PLUGIN_RECOVERY_SCHEMA_VERSION,
      sourceFingerprint,
      sourceClassification: classification,
      createdAt: this.now(),
      updatedAt: this.now(),
      plugins,
    }
    await this.#writeState(state)
    return state
  }

  initialize() {
    return this.#enqueue(() => this.#initialize())
  }

  getState() {
    return this.#enqueue(async () => {
      const state = await this.#initialize()
      return Object.freeze({
        schemaVersion: state.schemaVersion,
        sourceClassification: state.sourceClassification,
        plugins: Object.freeze(state.plugins.map(publicPlugin)),
      })
    })
  }

  restoreNpm(install) {
    if (typeof install !== 'function') return Promise.reject(new TypeError('legacy NPM installer is required'))
    return this.#enqueue(async () => {
      const state = await this.#initialize()
      const candidates = state.plugins.filter((plugin) => plugin.sourceKind === 'npm' && ['pending', 'failed'].includes(plugin.status))
      if (candidates.length === 0) return Object.freeze({ restored: false, plugins: Object.freeze([]) })
      for (const plugin of candidates) plugin.status = 'installing'
      await this.#writeState(state)
      try {
        const result = await install(Object.freeze({
          specs: Object.freeze(candidates.map((plugin) => `${plugin.name}@${plugin.requested}`)),
          enabledNames: Object.freeze(candidates.filter((plugin) => plugin.enabled).map((plugin) => plugin.name)),
        }))
        for (const plugin of candidates) {
          plugin.status = 'installed'
          delete plugin.failureCategory
          delete plugin.error
        }
        await this.#writeState(state)
        return Object.freeze({ restored: true, plugins: Object.freeze(candidates.map(publicPlugin)), result })
      } catch (error) {
        const failure = classifyPluginInstallFailure(error)
        for (const plugin of candidates) {
          plugin.status = 'failed'
          plugin.failureCategory = failure.category
          plugin.error = `${failure.message} ${failure.suggestion}`.trim().slice(0, ERROR_LIMIT)
        }
        await this.#writeState(state)
        throw error
      }
    })
  }

  prepareGitRestore(id) {
    return this.#enqueue(async () => {
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{24}$/u.test(id)) throw new TypeError('invalid legacy plugin recovery identifier')
      const source = await this.#readSource()
      const state = await this.#readState()
      if (state === undefined) throw new Error('旧插件恢复清单不可用，请重新打开扩展管理页。')
      if (state.sourceFingerprint !== fingerprint(source.manifestSource, source.lockfile)) {
        throw new Error('旧插件来源已发生变化，请重新打开扩展管理页确认。')
      }
      const plugin = state.plugins.find((candidate) => candidate.id === id)
      if (plugin?.sourceKind !== 'git' || typeof plugin.pinnedSpec !== 'string') {
        throw new TypeError('legacy Git plugin recovery record is invalid')
      }
      if (!['awaiting-confirmation', 'failed'].includes(plugin.status)) {
        throw new Error('legacy Git plugin is not awaiting recovery')
      }
      plugin.status = 'installing'
      delete plugin.failureCategory
      delete plugin.error
      await this.#writeState(state)
      return Object.freeze({ id: plugin.id, name: plugin.name, spec: plugin.pinnedSpec, enabled: plugin.enabled })
    })
  }

  finishGitRestore(id, error) {
    return this.#enqueue(async () => {
      const state = await this.#initialize()
      const plugin = state.plugins.find((candidate) => candidate.id === id)
      if (plugin?.sourceKind !== 'git') throw new TypeError('legacy Git plugin recovery record is invalid')
      if (error === undefined) {
        plugin.status = 'installed'
        delete plugin.failureCategory
        delete plugin.error
      } else if (error?.code === 'EXTERNAL_PLUGIN_PERMISSION_DENIED') {
        plugin.status = 'awaiting-confirmation'
        delete plugin.failureCategory
        delete plugin.error
      } else {
        const failure = classifyPluginInstallFailure(error)
        plugin.status = 'failed'
        plugin.failureCategory = failure.category
        plugin.error = `${failure.message} ${failure.suggestion}`.trim().slice(0, ERROR_LIMIT)
      }
      await this.#writeState(state)
      return publicPlugin(plugin)
    })
  }
}
