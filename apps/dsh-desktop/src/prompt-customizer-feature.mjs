import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { composeEntries } from './skill-market-sdk-adapter.mjs'
import { withFileLock } from './atomic-write-adapter.mjs'
import { DESKTOP_PATCH_START, DESKTOP_PATCH_END, mergeDesktopPatch } from './profile.mjs'
import { mergeQqBotPatch, QQBOT_PATCH_START, readQqBotPatchEnabled } from './extensions/qqbot.mjs'
import { parseDocument } from 'yaml'

const PACKAGE = 'dsh-prompt-customizer'
const ROW = 'prompt-customizer'

async function bytes(path, optional = false) {
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('P2 configuration must be a regular file')
    return await readFile(path)
  } catch (error) {
    if (optional && error.code === 'ENOENT') return undefined
    throw error
  }
}

function patches(source) {
  const document = parseDocument(source?.toString('utf8') ?? '[]', { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] })
  if (document.errors.length) throw new Error('P2 profile patch is invalid')
  const value = document.toJS() ?? []
  if (!Array.isArray(value)) throw new Error('P2 profile patch must be an array')
  return value
}

function findRows(entries, parentDisabled = false) {
  const found = []
  for (const entry of entries) {
    if (entry.id === ROW) found.push({ ...entry, disabled: parentDisabled || entry.disabled })
    if (entry.group === true && Array.isArray(entry.config)) {
      found.push(...findRows(entry.config, parentDisabled || entry.disabled === true))
    }
  }
  return found
}

function effective(profilePatch, homePatch) {
  const rows = findRows(composeEntries([{ insert: [{ id: ROW, name: PACKAGE }] }, ...patches(profilePatch), ...patches(homePatch)]))
  const [row] = rows
  if (rows.length !== 1 || row.name !== PACKAGE) throw new Error('P2 row owner is occupied by a third-party plugin; its configuration was preserved')
  if (row.disabled !== undefined && typeof row.disabled !== 'boolean') throw new Error('P2 disabled override is not a fixed boolean')
  return row.disabled !== true
}

function renderPolicy(patch, profile) {
  let rendered = mergeDesktopPatch(patch.toString('utf8'), undefined, {
    minimalDefaults: profile.desktopDefaults === 'minimal-v1',
    contextDefaults: profile.desktopContextDefaults === 'sidebar',
    agentTeamEnabled: profile.desktopAgentTeamEnabled,
    optionalPlugins: profile.desktopOptionalPlugins,
  })
  if (rendered.includes(QQBOT_PATCH_START)) rendered = mergeQqBotPatch(rendered, readQqBotPatchEnabled(rendered) ?? false)
  return Buffer.from(rendered)
}

function toggleManagedPatch(patch, enabled) {
  const source = patch.toString('utf8')
  const start = source.indexOf(DESKTOP_PATCH_START) + DESKTOP_PATCH_START.length
  const end = source.indexOf(DESKTOP_PATCH_END, start)
  if (start < DESKTOP_PATCH_START.length || end < start) throw new Error('P2 managed configuration is unavailable')
  const document = parseDocument(source.slice(start, end))
  const row = document.contents?.items?.find(item => item.get?.('id') === ROW)
  const disabled = row?.get('disabled', true)
  if (!disabled?.range) throw new Error('P2 managed disabled configuration is unavailable')
  return Buffer.from(source.slice(0, start + disabled.range[0]) + String(!enabled) + source.slice(start + disabled.range[1]))
}

async function replaceChecked(path, next, expected) {
  if (!(await bytes(path)).equals(expected)) throw new Error('P2 configuration changed; reload before retrying')
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, next, { flag: 'wx', mode: 0o600 })
    if (!(await bytes(path)).equals(expected)) throw new Error('P2 configuration changed while saving')
    await rename(temporary, path)
  } finally { await rm(temporary, { force: true }) }
}

/** Fixed-package opt-in policy. Prompt content and SQLite remain owned by P2. */
export function createPromptCustomizerFeature({ dshHome, runMutation, verifyHealth, stopRuntime } = {}) {
  if (typeof dshHome !== 'string' || !isAbsolute(dshHome) || typeof runMutation !== 'function'
    || typeof verifyHealth !== 'function' || typeof stopRuntime !== 'function') throw new TypeError('invalid P2 feature arguments')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const manifestPath = join(profileDir, 'package.json')
  const patchPath = join(profileDir, 'cordis.patch.yml')
  const readState = async () => {
    const [manifestBytes, patch, homePatch] = await Promise.all([bytes(manifestPath), bytes(patchPath), bytes(join(dshHome, 'cordis.patch.yml'), true)])
    const manifest = JSON.parse(manifestBytes.toString('utf8'))
    if (!manifest?.dsh?.profile || typeof manifest.dsh.profile !== 'object') throw new Error('P2 desktop profile identity is unavailable')
    const revision = createHash('sha256').update(manifestBytes).update(patch).update(homePatch ?? '').digest('hex')
    return { manifestBytes, manifest, patch, homePatch, revision }
  }
  // Availability describes configuration ownership, not a live health result.
  const status = async () => {
    const state = await readState()
    try {
      return Object.freeze({ available: true, enabled: effective(state.patch, state.homePatch), version: '2.2.0' })
    } catch (error) {
      return Object.freeze({ available: false, enabled: false, version: '2.2.0', reason: error.message })
    }
  }
  const changeEnabled = async (enabled, { onRuntimeEvent } = {}) => {
    if (typeof enabled !== 'boolean') throw new TypeError('P2 enabled state must be a boolean')
    const initial = await readState()
    const check = async () => {
      const state = await readState()
      if (state.revision !== initial.revision) throw new Error('P2 configuration changed; reload before retrying')
      effective(state.patch, state.homePatch)
      const next = structuredClone(state.manifest)
      next.dsh.profile.desktopOptionalPlugins = { ...next.dsh.profile.desktopOptionalPlugins, [PACKAGE]: enabled }
      const nextPatch = toggleManagedPatch(state.patch, enabled)
      if (effective(nextPatch, state.homePatch) !== enabled) {
        throw new Error('An explicit P2 disabled override takes priority; preserve and review that override first')
      }
      return { ...state, next, nextPatch }
    }
    const checked = await check()
    if (effective(checked.patch, checked.homePatch) === enabled) return status()
    return runMutation({
      label: 'P2 advanced prompt setting change', prepare: check, onRuntimeEvent,
      apply: () => withFileLock(manifestPath, async () => {
        const state = await check()
        const backup = join(profileDir, '.desktop-prompt-customizer-backups', 'v1', randomUUID())
        await mkdir(backup, { recursive: true, mode: 0o700 })
        await writeFile(join(backup, 'package.json'), state.manifestBytes, { flag: 'wx', mode: 0o600 })
        await writeFile(join(backup, 'cordis.patch.yml'), state.patch, { flag: 'wx', mode: 0o600 })
        await writeFile(join(backup, 'metadata.json'), JSON.stringify({ schemaVersion: 1, packageName: PACKAGE, enabled, createdAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 })
        const nextBytes = Buffer.from(JSON.stringify(state.next, null, 2) + '\n')
        const reconciledPatch = renderPolicy(state.nextPatch, state.next.dsh.profile)
        const ownedPatch = current => current.equals(state.nextPatch) || current.equals(reconciledPatch)
        await replaceChecked(manifestPath, nextBytes, state.manifestBytes)
        try { await replaceChecked(patchPath, state.nextPatch, state.patch) } catch (error) {
          try { await replaceChecked(manifestPath, state.manifestBytes, nextBytes) } catch (recoveryError) {
            throw new Error(`P2 partial save recovery failed; versioned backup retained at ${backup}`, { cause: new AggregateError([error, recoveryError]) })
          }
          throw new Error(`P2 profile patch was not applied; versioned backup retained at ${backup}`, { cause: error })
        }
        let committed = false
        const validate = async () => {
          const current = await readState()
          if (!current.manifestBytes.equals(nextBytes) || !ownedPatch(current.patch) || current.homePatch?.toString() !== state.homePatch?.toString()
            || effective(current.patch, current.homePatch) !== enabled) throw new Error(`P2 configuration changed; recovery backup retained at ${backup}`)
        }
        return { transactions: [{
          validateActivated: validate,
          markRuntimeHealthy: async () => { await verifyHealth(enabled) },
          commit: async () => { await validate(); committed = true },
          rollback: async () => {
            if (committed) return
            await stopRuntime()
            await withFileLock(manifestPath, async () => {
              const [current, patch] = await Promise.all([bytes(manifestPath), bytes(patchPath)])
              if ((!current.equals(state.manifestBytes) && !current.equals(nextBytes)) || (!patch.equals(state.patch) && !ownedPatch(patch))) {
                throw new Error(`P2 recovery refuses a foreign profile edit; backup retained at ${backup}`)
              }
              if (!current.equals(state.manifestBytes)) await replaceChecked(manifestPath, state.manifestBytes, current)
              if (!patch.equals(state.patch)) await replaceChecked(patchPath, state.patch, patch)
            })
          },
        }], result: Object.freeze({ available: true, enabled, version: '2.2.0' }) }
      }),
    })
  }
  let queue = Promise.resolve()
  const setEnabled = (...args) => {
    const result = queue.then(() => changeEnabled(...args))
    queue = result.catch(() => {})
    return result
  }
  return Object.freeze({ status, setEnabled })
}
