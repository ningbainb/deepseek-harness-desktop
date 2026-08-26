import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const VERSION_PATTERN = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,20})?$/u

function validVersion(value) {
  return typeof value === 'string' && VERSION_PATTERN.test(value)
}

function normalizeReceipt(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).length !== 5
    || value.schemaVersion !== 1
    || value.phase !== 'install-requested'
    || !validVersion(value.sourceVersion)
    || !validVersion(value.targetVersion)
    || value.sourceVersion === value.targetVersion
    || typeof value.updatedAt !== 'string'
    || !Number.isFinite(Date.parse(value.updatedAt))
  ) return undefined
  return Object.freeze({ ...value })
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const suffix = `${process.pid}-${Date.now()}-${randomBytes(6).toString('hex')}`
  const temporary = `${path}.tmp-${suffix}`
  const backup = `${path}.bak-${suffix}`
  await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
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
    await rm(temporary, { force: true }).catch(() => {})
    if (movedExisting) {
      await rm(path, { force: true }).catch(() => {})
      await rename(backup, path).catch(() => {})
    }
    throw error
  }
}

export class UpdateAnalyticsReceiptStore {
  constructor({ path, now = () => new Date() } = {}) {
    if (typeof path !== 'string' || path.length === 0 || typeof now !== 'function') {
      throw new TypeError('update analytics receipt path and clock are required')
    }
    this.path = path
    this.now = now
    this.queue = Promise.resolve()
  }

  #enqueue(operation) {
    const result = this.queue.then(operation, operation)
    this.queue = result.catch(() => {})
    return result
  }

  recordInstallRequested({ sourceVersion, targetVersion } = {}) {
    if (!validVersion(sourceVersion) || !validVersion(targetVersion) || sourceVersion === targetVersion) {
      return Promise.reject(new TypeError('update analytics receipt version is invalid'))
    }
    return this.#enqueue(async () => {
      const updatedAt = this.now()
      if (!(updatedAt instanceof Date) || !Number.isFinite(updatedAt.valueOf())) {
        throw new TypeError('update analytics receipt clock is invalid')
      }
      await atomicWrite(this.path, `${JSON.stringify({
        schemaVersion: 1,
        sourceVersion,
        targetVersion,
        phase: 'install-requested',
        updatedAt: updatedAt.toISOString(),
      }, null, 2)}\n`)
      return true
    })
  }

  consumeCompleted(currentVersion) {
    if (!validVersion(currentVersion)) return Promise.resolve(false)
    return this.#enqueue(async () => {
      let receipt
      try {
        receipt = normalizeReceipt(JSON.parse(await readFile(this.path, 'utf8')))
      } catch {
        return false
      }
      if (receipt?.targetVersion !== currentVersion) return false
      await rm(this.path, { force: true })
      return true
    })
  }
}
