import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const SAFE_SEGMENT_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/u
const STORE_VERSION = 1

export class ConnectorSecretStoreError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ConnectorSecretStoreError'
    this.code = code
  }
}

function assertSegment(value, label) {
  if (typeof value !== 'string' || !SAFE_SEGMENT_PATTERN.test(value) || value === '.' || value === '..') {
    throw new ConnectorSecretStoreError('INVALID_IDENTIFIER', `${label} is invalid`)
  }
  return value
}

function normalizeSecretsMap(secrets) {
  if (secrets === null || typeof secrets !== 'object' || Array.isArray(secrets)) {
    throw new ConnectorSecretStoreError('INVALID_SECRETS', 'secrets must be a plain object')
  }
  const normalized = {}
  for (const [key, value] of Object.entries(secrets)) {
    assertSegment(key, 'secret field key')
    if (typeof value !== 'string') {
      throw new ConnectorSecretStoreError('INVALID_SECRETS', `secret field "${key}" must be a string`)
    }
    if (value.length > 0) normalized[key] = value
  }
  return normalized
}

async function atomicWrite(filePath, content) {
  await mkdir(dirname(filePath), { recursive: true })
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const temporary = `${filePath}.tmp-${suffix}`
  const backup = `${filePath}.bak-${suffix}`
  await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  let movedExisting = false
  try {
    try {
      await rename(filePath, backup)
      movedExisting = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await rename(temporary, filePath)
    if (movedExisting) await rm(backup, { force: true })
  } catch (error) {
    await rm(temporary, { force: true })
    if (movedExisting) {
      await rm(filePath, { force: true })
      await rename(backup, filePath)
    }
    throw error
  }
}

export function redactSecretValues(text, secrets) {
  let output = String(text ?? '')
  if (!secrets || typeof secrets !== 'object') return output
  const values = Object.values(secrets)
    .filter(value => typeof value === 'string' && value.length > 0)
    .sort((left, right) => right.length - left.length)
  for (const secret of values) {
    output = output.split(secret).join('[REDACTED]')
  }
  return output
}

export class ConnectorSecretStore {
  constructor({ path, safeStorage }) {
    if (typeof path !== 'string' || path.trim().length === 0) {
      throw new TypeError('credential store path is required')
    }
    if (!safeStorage) {
      throw new TypeError('safeStorage is required')
    }
    this.path = path
    this.safeStorage = safeStorage
  }

  #assertEncryptionAvailable() {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new ConnectorSecretStoreError(
        'ENCRYPTION_UNAVAILABLE',
        'operating-system credential encryption is unavailable',
      )
    }
  }

  async #readAll() {
    const content = await readFile(this.path, 'utf8').catch((error) => {
      if (error?.code === 'ENOENT') return undefined
      throw error
    })
    if (content === undefined) return {}
    this.#assertEncryptionAvailable()
    try {
      const envelope = JSON.parse(content)
      if (
        envelope === null
        || typeof envelope !== 'object'
        || envelope.version !== STORE_VERSION
        || typeof envelope.payload !== 'string'
        || envelope.payload.length === 0
      ) {
        throw new Error('unsupported secret store envelope')
      }
      const plaintext = this.safeStorage.decryptString(Buffer.from(envelope.payload, 'base64'))
      const parsed = JSON.parse(plaintext)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('corrupted secret payload')
      }
      return parsed
    } catch (error) {
      if (error instanceof ConnectorSecretStoreError) throw error
      throw new ConnectorSecretStoreError(
        'CORRUPTED_STORE',
        `connector secret store is invalid: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async #writeAll(records) {
    this.#assertEncryptionAvailable()
    const keys = Object.keys(records)
    if (keys.length === 0) {
      await rm(this.path, { force: true })
      return
    }
    const encrypted = this.safeStorage.encryptString(JSON.stringify(records))
    const envelope = `${JSON.stringify({ version: STORE_VERSION, payload: encrypted.toString('base64') }, null, 2)}\n`
    await atomicWrite(this.path, envelope)
  }

  async getProfileSecrets(connectorId, profileId = 'default') {
    const cid = assertSegment(connectorId, 'connectorId')
    const pid = assertSegment(profileId, 'profileId')
    const all = await this.#readAll()
    const profile = all[cid]?.[pid]
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return undefined
    return { ...profile }
  }

  async hasSecrets(connectorId, profileId = 'default') {
    const secrets = await this.getProfileSecrets(connectorId, profileId)
    return secrets !== undefined && Object.keys(secrets).length > 0
  }

  async listProfiles(connectorId) {
    const cid = assertSegment(connectorId, 'connectorId')
    const all = await this.#readAll()
    const entry = all[cid]
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    return Object.keys(entry)
  }

  async setProfileSecrets(connectorId, profileId = 'default', secrets = {}) {
    const cid = assertSegment(connectorId, 'connectorId')
    const pid = assertSegment(profileId, 'profileId')
    const normalized = normalizeSecretsMap(secrets)
    const all = await this.#readAll()
    if (Object.keys(normalized).length === 0) {
      if (all[cid]) {
        delete all[cid][pid]
        if (Object.keys(all[cid]).length === 0) delete all[cid]
      }
    } else {
      all[cid] ??= {}
      all[cid][pid] = normalized
    }
    await this.#writeAll(all)
    return { ...normalized }
  }

  async deleteProfileSecrets(connectorId, profileId = 'default') {
    const cid = assertSegment(connectorId, 'connectorId')
    const pid = assertSegment(profileId, 'profileId')
    const all = await this.#readAll()
    if (!all[cid] || !(pid in all[cid])) return false
    delete all[cid][pid]
    if (Object.keys(all[cid]).length === 0) delete all[cid]
    await this.#writeAll(all)
    return true
  }

  async deleteConnectorSecrets(connectorId) {
    const cid = assertSegment(connectorId, 'connectorId')
    const all = await this.#readAll()
    if (!(cid in all)) return false
    delete all[cid]
    await this.#writeAll(all)
    return true
  }

  async clearAll() {
    await rm(this.path, { force: true })
  }
}
