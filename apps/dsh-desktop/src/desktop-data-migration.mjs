import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, rmdir, readlink, stat, statfs, symlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { checkDesktopDataOwnership, DESKTOP_DATA_LOCATION_FILE, validateDesktopDataPath, writeDesktopDataLocation } from './desktop-data-location.mjs'

const journalName = 'desktop-data-migration.json'

async function optional(operation) {
  try { return await operation() } catch (error) { if (error.code !== 'ENOENT') throw error }
}

async function atomicWrite(path, contents) {
  const temporary = path + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(temporary, contents, { flag: 'wx', mode: 0o600 })
    await rename(temporary, path)
  } finally { await rm(temporary, { force: true }) }
}

function contains(parent, child) {
  const rel = relative(parent, child)
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))
}

async function hash(path) {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(path)) digest.update(chunk)
  return digest.digest('hex')
}

async function scan(home, destination, roots) {
  let bytes = 0
  for (const name of await readdir(home)) {
    const source = join(home, name)
    const info = await lstat(source)
    const target = destination && join(destination, name)
    if (info.isSymbolicLink()) {
      if (target) {
        const link = await readlink(source)
        const absolute = resolve(dirname(source), link)
        const mapped = contains(roots.source, absolute) ? resolve(roots.target, relative(roots.source, absolute)) : absolute
        const type = process.platform === 'win32' && (await optional(() => stat(source)))?.isDirectory() ? 'junction' : 'file'
        // Never copy the contents of a junction or symlink.
        await symlink(mapped, target, type)
        if (relative(resolve(await readlink(target)), mapped) !== '') {
          throw Error('A path link failed verification')
        }
      }
    } else if (info.isDirectory()) {
      if (target) await mkdir(target, { mode: info.mode & 0o777 })
      bytes += await scan(source, target, roots)
    } else if (info.isFile()) {
      bytes += info.size
      if (target) {
        const expected = await hash(source)
        await copyFile(source, target, constants.COPYFILE_EXCL)
        if ((await lstat(target)).size !== info.size || await hash(target) !== expected || await hash(source) !== expected) {
          throw Error('A file changed during copy or failed integrity verification')
        }
      }
    } else {
      throw Error('The data directory contains a special file')
    }
  }
  return bytes
}

export function createDesktopDataMigration({ userData, forbidden = [], choose, confirm, stop, restart, relaunch, available = () => true, requiredReadiness = () => 'ready-full' }) {
  const journalPath = join(userData, journalName)
  const metadata = join(userData, DESKTOP_DATA_LOCATION_FILE)
  const excluded = [userData, ...forbidden]
  let chosen
  let approved
  let busy = false
  let phase = 'idle'
  let cleanupIncomplete = false
  const persist = record => atomicWrite(journalPath, JSON.stringify(record) + '\n')
  const read = async ({ recoverCorrupt = false } = {}) => {
    const raw = await optional(() => readFile(journalPath, 'utf8'))
    if (!raw) return undefined
    const quarantine = async () => {
      await rename(journalPath, `${journalPath}.corrupt-${Date.now()}`).catch(() => {})
      return undefined
    }
    if (raw.replace(/\0/gu, '').trim().length === 0) {
      if (recoverCorrupt) return quarantine()
      throw Error('Invalid data migration journal')
    }
    let record
    try {
      record = JSON.parse(raw)
    } catch (error) {
      if (recoverCorrupt) return quarantine()
      throw error
    }
    if (!record || typeof record !== 'object' || !/^[a-f0-9-]{36}$/.test(record.id) || !['copying', 'ready-to-boot', 'booting', 'complete', 'rolled-back'].includes(record.phase)) {
      if (recoverCorrupt) return quarantine()
      throw Error('Invalid data migration journal')
    }
    return record
  }
  const staging = record => join(dirname(record.target), '.dsh-migration-' + record.id)
  const marker = record => join(record.target, '.dsh-migration-' + record.id)
  const checked = path => validateDesktopDataPath(path, excluded)

  async function rollback(record) {
    const previous = record.previous
    if (previous === null) await rm(metadata, { force: true })
    else await atomicWrite(metadata, Buffer.from(previous, 'base64'))
    const target = await checked(record.target).catch(() => undefined)
    const stage = await checked(staging(record)).catch(() => undefined)
    cleanupIncomplete = !target || !stage
    try {
      if (target && await optional(() => readFile(marker(record), 'utf8')) === record.id) {
        await rm(target, { recursive: true })
      }
      if (target && record.existed && !await optional(() => lstat(target))) await mkdir(target)
      if (stage) await rm(stage, { recursive: true, force: true })
    } catch { cleanupIncomplete = true }
    phase = 'rolled-back'
    await persist({ ...record, phase, cleanupIncomplete })
  }

  async function preflight(location, target, { copied = false } = {}) {
    if (location.source === 'environment') throw Error('DSH_HOME controls this directory. Remove the environment override and restart Desktop to change it here.')
    if (location.source === 'legacy-migration' && !await optional(() => lstat(location.home))) throw Error('The initial data migration has not completed')
    const source = await validateDesktopDataPath(location.home, forbidden)
    target = await checked(target)
    if (contains(source, target) || contains(target, source)) throw Error('Data directories cannot overlap')
    const existed = Boolean(await optional(() => lstat(target)))
    if (existed) {
      await checkDesktopDataOwnership(target, { selected: true })
      if ((await readdir(target)).length) throw Error('Choose an empty directory')
    }
    const parent = dirname(target)
    const bytes = await scan(source)
    const space = await statfs(parent, { bigint: true })
    const free = space.bavail * space.bsize
    if (!copied && BigInt(bytes) > free) throw Error('The target disk has insufficient free space')
    return { source, target, existed, bytes, freeBytes: Number(free) }
  }

  return {
    async prepareBoot(env = process.env) {
      if (env.DSH_HOME) return false
      const record = await read({ recoverCorrupt: true })
      if (!record) return false
      phase = record.phase
      cleanupIncomplete = record.cleanupIncomplete === true
      if (phase === 'copying' || phase === 'booting') await rollback(record)
      if (phase !== 'ready-to-boot') return false
      const target = await checked(record.target).catch(() => undefined)
      const selected = await readFile(metadata, 'utf8').then(JSON.parse).catch(() => undefined)
      if (!target || selected?.home !== target || selected.migration?.id !== record.id
        || await readFile(marker(record), 'utf8').catch(() => undefined) !== record.id) {
        await rollback(record)
        return false
      }
      phase = 'booting'
      await persist({ ...record, phase })
      return true
    },
    async finishBoot(state) {
      const record = await read()
      if (record?.phase !== 'booting') return
      if (state !== 'ready-full' && !(state === 'ready-builtins' && record.requiredReadiness === state)) {
        await stop()
        await rollback(record)
        await relaunch()
        return
      }
      phase = 'complete'
      await persist({ ...record, phase })
      await rm(marker(record), { force: true })
    },
    async status(location) {
      const readOnly = location.source === 'environment'
      const bytes = busy ? undefined : await scan(location.home).catch(() => undefined)
      return { ...location, bytes, phase, cleanupIncomplete, canMigrate: !readOnly && !busy && phase !== 'booting' && available(),
        ...(readOnly ? { reason: 'DSH_HOME controls this directory. Remove the environment override and restart Desktop to change it here.' } : {}) }
    },
    async choose(location) {
      if (location.source === 'environment' || busy) return null
      approved = undefined
      chosen = undefined
      chosen = await choose(location.home)
      return chosen ?? null
    },
    async preflight(location) {
      if (busy) throw Error('A data migration is in progress')
      approved = undefined
      const plan = await preflight(location, chosen)
      approved = plan.target
      return plan
    },
    async execute(location) {
      if (busy || !approved || phase === 'booting' || !available()) throw Error('Data migration requires a successful preflight and an idle Desktop')
      busy = true
      let record
      let stopped = false
      try {
        const plan = await preflight(location, approved)
        if (!await confirm(plan)) return { accepted: false }
        approved = undefined
        const required = requiredReadiness()
        stopped = true
        phase = 'stopping'
        cleanupIncomplete = false
        await stop()
        const verified = await preflight(location, plan.target)
        const previous = await optional(() => readFile(metadata))
        record = { id: randomUUID(), phase: 'copying', source: verified.source, target: verified.target,
          existed: verified.existed, previous: previous?.toString('base64') ?? null, requiredReadiness: required }
        await persist(record)
        phase = 'copying'
        const stage = staging(record)
        await mkdir(stage, { mode: 0o700 })
        await writeFile(join(stage, '.dsh-migration-' + record.id), record.id, { flag: 'wx', mode: 0o600 })
        const copiedBytes = await scan(verified.source, stage, verified)
        const finalCheck = await preflight(location, verified.target, { copied: true })
        if (copiedBytes !== verified.bytes || finalCheck.bytes !== verified.bytes || finalCheck.existed !== verified.existed) {
          throw Error('The source or target changed during migration')
        }
        if (verified.existed) await rmdir(verified.target)
        await rename(stage, verified.target)
        phase = 'ready-to-boot'
        await writeDesktopDataLocation(userData, verified.target, { previousHome: verified.source, id: record.id })
        await persist({ ...record, phase })
        await relaunch()
        return { accepted: true }
      } catch (error) {
        try {
          if (record) await rollback(record)
        } finally {
          if (stopped) await restart()
        }
        if (!record) phase = 'idle'
        throw error
      } finally {
        busy = false
      }
    },
  }
}
