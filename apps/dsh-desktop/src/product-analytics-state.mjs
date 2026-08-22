import { createHmac, randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const STATE_SCHEMA_VERSION = 1
const SECRET_BYTES = 32
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/u

function normalizeState(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).length !== 2
    || value.schemaVersion !== STATE_SCHEMA_VERSION
    || typeof value.secret !== 'string'
    || !SECRET_PATTERN.test(value.secret)
  ) return undefined
  const secret = Buffer.from(value.secret, 'base64url')
  return secret.length === SECRET_BYTES ? secret : undefined
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

function periodActor(secret, period) {
  return createHmac('sha256', secret).update(`dsh-desktop-product-analytics-v1:${period}`, 'utf8').digest('hex')
}

export class ProductAnalyticsIdentity {
  #secret

  constructor(secret) {
    if (!Buffer.isBuffer(secret) || secret.length !== SECRET_BYTES) {
      throw new TypeError('product analytics secret is invalid')
    }
    this.#secret = Buffer.from(secret)
  }

  actorsAt(date = new Date()) {
    if (!(date instanceof Date) || !Number.isFinite(date.valueOf())) {
      throw new TypeError('product analytics actor date is invalid')
    }
    const day = date.toISOString().slice(0, 10)
    const month = day.slice(0, 7)
    return Object.freeze({
      dailyActor: periodActor(this.#secret, `day:${day}`),
      monthlyActor: periodActor(this.#secret, `month:${month}`),
    })
  }
}

export class ProductAnalyticsIdentityStore {
  constructor({ path } = {}) {
    if (typeof path !== 'string' || path.length === 0) {
      throw new TypeError('product analytics state path is required')
    }
    this.path = path
    this.operation = undefined
  }

  loadOrCreate() {
    this.operation ??= this.#loadOrCreate()
    return this.operation
  }

  async #loadOrCreate() {
    try {
      const secret = normalizeState(JSON.parse(await readFile(this.path, 'utf8')))
      if (secret !== undefined) return new ProductAnalyticsIdentity(secret)
    } catch {
      // Missing and malformed product-only state both receive a new identity.
    }
    const secret = randomBytes(SECRET_BYTES)
    await atomicWrite(this.path, `${JSON.stringify({
      schemaVersion: STATE_SCHEMA_VERSION,
      secret: secret.toString('base64url'),
    }, null, 2)}\n`)
    return new ProductAnalyticsIdentity(secret)
  }
}
