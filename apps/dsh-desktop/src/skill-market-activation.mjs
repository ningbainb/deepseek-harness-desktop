import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { lstat, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { composeEntries, defaultAgentsHome, expandHomePath } from './skill-market-sdk-adapter.mjs'
import { withFileLock } from './atomic-write-adapter.mjs'
import { isSeq, parseDocument } from 'yaml'
import { DESKTOP_PATCH_START, mergeDesktopPatch } from './profile.mjs'
import { mergeQqBotPatch, QQBOT_PATCH_START, readQqBotPatchEnabled } from './extensions/qqbot.mjs'

const MARKET = 'dsh-agent-plugins-market'
const PACKAGE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).dependencies[MARKET]
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

async function regularBytes(path, optional = false) {
  try {
    const metadata = await lstat(path)
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('market activation requires regular configuration files')
    return await readFile(path)
  } catch (error) {
    if (optional && error.code === 'ENOENT') return undefined
    throw error
  }
}

function documentOf(bytes) {
  const document = parseDocument(bytes?.toString('utf8') ?? '[]')
  if (document.errors.length || (document.contents && !isSeq(document.contents))) throw new Error('market activation requires a YAML patch array')
  return document
}

function marketRow(entries) {
  for (const entry of entries) {
    if (entry.id === MARKET) return entry
    if (entry.group && Array.isArray(entry.config)) {
      const nested = marketRow(entry.config)
      if (nested) return nested
    }
  }
}

function enabledFor(profile, home) {
  const patches = [...(documentOf(profile).toJS() ?? []), ...(documentOf(home).toJS() ?? [])]
  const actual = marketRow(composeEntries(patches))
    ?? marketRow(composeEntries([{ insert: [{ id: MARKET, name: MARKET }] }, ...patches]))
  if (!actual || actual.name !== MARKET || (actual.disabled !== undefined && typeof actual.disabled !== 'boolean')) {
    throw new Error('market activation has an unsupported configuration owner or disabled expression')
  }
  return actual.disabled !== true
}

function enablePatch(bytes) {
  const document = documentOf(bytes)
  const row = { id: MARKET, name: MARKET, disabled: false }
  if (document.contents && !document.contents.flow && !/^\.\.\.[ \t]*(?:#.*)?$/mu.test(bytes.toString('utf8'))) {
    return Buffer.from(`${bytes.toString('utf8')}${bytes.at(-1) === 10 ? '' : '\n'}\n- id: ${MARKET}\n  name: ${MARKET}\n  disabled: false\n`)
  }
  if (!document.contents) document.contents = document.createNode([])
  document.add(row)
  document.contents.flow = false
  return Buffer.from(String(document))
}

function reconciledPatch(bytes) {
  let patch = bytes.toString('utf8')
  if (patch.includes(DESKTOP_PATCH_START)) patch = mergeDesktopPatch(patch)
  if (patch.includes(QQBOT_PATCH_START)) patch = mergeQqBotPatch(patch, readQqBotPatchEnabled(patch))
  return Buffer.from(patch)
}

async function replaceChecked(path, bytes, expected) {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    const handle = await open(temporary, 'wx', 0o600)
    try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
    const current = await regularBytes(path, true)
    if ((current === undefined) !== (expected === undefined) || (current && !current.equals(expected))) {
      throw new Error('market configuration changed while writing; reload and confirm again')
    }
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

export function createSkillMarketActivation({ dshHome, profileDir = join(dshHome, 'profiles', 'desktop'), agentsHome,
  runtimeCwd = process.cwd(), runMutation, verifyHealth, stopRuntime } = {}) {
  if (typeof dshHome !== 'string' || !isAbsolute(dshHome) || typeof runMutation !== 'function'
    || typeof verifyHealth !== 'function' || typeof stopRuntime !== 'function') throw new TypeError('invalid market activation service arguments')
  const home = resolve(dshHome)
  const profile = resolve(profileDir)
  const within = relative(home, profile)
  if (!within || within.startsWith('..') || isAbsolute(within)) throw new TypeError('market activation profile must stay in DSH_HOME')
  const agents = resolve(runtimeCwd, expandHomePath(typeof agentsHome === 'string' && agentsHome.trim() ? agentsHome : defaultAgentsHome()))
  const writerPath = join(profile, 'package.json')
  const patchPath = join(profile, 'cordis.patch.yml')
  const receiptPath = join(profile, '.desktop-skill-market-activation.json')
  const readState = async () => {
    const [patch, homePatch] = await Promise.all([regularBytes(patchPath), regularBytes(join(home, 'cordis.patch.yml'), true)])
    const revision = hash(Buffer.concat([Buffer.from(`${PACKAGE_VERSION}\0`), patch, Buffer.from('\0'), homePatch ?? Buffer.alloc(0)]))
    return { patch, homePatch, revision, enabled: enabledFor(patch, homePatch) }
  }
  const describe = async () => {
    const state = await readState()
    const available = state.enabled ? await verifyHealth().then(() => true, () => false) : false
    return Object.freeze({ enabled: state.enabled, available, packageVersion: PACKAGE_VERSION, dshHome: home, agentsHome: agents, revision: state.revision })
  }
  const check = async expectedRevision => {
    const state = await readState()
    if (state.revision !== expectedRevision) throw new Error('market configuration changed; reload and confirm again')
    if (!state.enabled && !enabledFor(enablePatch(state.patch), state.homePatch)) {
      throw new Error('a higher-priority home override disables the market; update that explicit configuration first')
    }
    return state
  }
  const activate = async request => {
    if (!request || typeof request !== 'object' || Array.isArray(request)
      || Object.keys(request).some(key => !['confirmed', 'expectedRevision'].includes(key))) throw new TypeError('invalid market activation argument fields')
    if (request.confirmed !== true) throw new Error('market activation requires explicit confirmation')
    if (typeof request.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/u.test(request.expectedRevision)) throw new TypeError('invalid market activation revision argument')
    const initial = await check(request.expectedRevision)
    if (initial.enabled) {
      await verifyHealth()
      return Object.freeze({ enabled: true, restartRequired: false })
    }
    return runMutation({
      label: 'skill market activation',
      prepare: () => check(request.expectedRevision),
      apply: async () => withFileLock(writerPath, async () => {
        const state = await check(request.expectedRevision)
        const next = enablePatch(state.patch)
        const reconciled = reconciledPatch(next)
        const ownedPatch = bytes => bytes.equals(next) || bytes.equals(reconciled)
        const snapshot = join(profile, `.desktop-skill-market-backup-${randomUUID()}`)
        await mkdir(snapshot, { mode: 0o700 })
        await writeFile(join(snapshot, 'cordis.patch.yml'), state.patch, { flag: 'wx', mode: 0o600 })
        await writeFile(join(snapshot, 'metadata.json'), JSON.stringify({ revision: state.revision, packageVersion: PACKAGE_VERSION }), { flag: 'wx', mode: 0o600 })
        const previousReceipt = await regularBytes(receiptPath, true)
        try { await replaceChecked(patchPath, next, state.patch) } catch (error) {
          throw new Error(`market activation was not applied; recovery backup retained at ${snapshot}`, { cause: error })
        }
        let committed = false
        const transaction = {
          async validateActivated() {
            const current = await readState()
            if (!current.enabled || !ownedPatch(current.patch) || current.homePatch?.toString() !== state.homePatch?.toString()) {
              throw new Error(`market activation changed before restart; recovery backup retained at ${snapshot}`)
            }
          },
          async markRuntimeHealthy() {
            await verifyHealth()
          },
          async commit() {
            await withFileLock(writerPath, async () => {
              await transaction.validateActivated()
              const current = await readState()
              await replaceChecked(receiptPath, Buffer.from(JSON.stringify({ packageVersion: PACKAGE_VERSION, revision: current.revision, activatedAt: new Date().toISOString() })), previousReceipt)
              committed = true
            })
          },
          async rollback() {
            if (committed) return
            try {
              await stopRuntime()
              await withFileLock(writerPath, async () => {
                const current = await regularBytes(patchPath)
                if (current.equals(state.patch)) return
                if (!ownedPatch(current)) throw new Error('market recovery refuses to overwrite a foreign edit')
                await replaceChecked(patchPath, state.patch, current)
              })
            } catch (error) {
              throw new Error(`market recovery could not restore the profile; backup retained at ${snapshot}`, { cause: error })
            }
          },
        }
        return { transactions: [transaction], result: Object.freeze({ enabled: true, restartRequired: false }) }
      }),
    })
  }
  return Object.freeze({ describe, activate })
}
