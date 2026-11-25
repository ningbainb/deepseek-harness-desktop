import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

interface EncryptedBlob {
  iv: string
  tag: string
  data: string
}

interface SecretVaultFile {
  version: 1
  entries: Record<string, EncryptedBlob>
}

export interface SecretCipherAdapter {
  encrypt(plaintext: string): EncryptedBlob
  decrypt(blob: EncryptedBlob): string
}

async function atomicWriteSecure(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const backup = `${filePath}.bak-${process.pid}-${Date.now()}`
  await writeFile(temp, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  let moved = false
  try {
    try {
      await rename(filePath, backup)
      moved = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
    }
    await rename(temp, filePath)
    if (moved) await rm(backup, { force: true })
  } catch (error) {
    await rm(temp, { force: true })
    if (moved) {
      await rm(filePath, { force: true })
      await rename(backup, filePath)
    }
    throw error
  }
}

function makeRecordKey(connectorId: string, profileId: string, fieldKey: string): string {
  return `${connectorId}/${profileId || 'default'}/${fieldKey}`
}

export class ConnectorSecretVault {
  private readonly vaultPath: string
  private readonly keyPath: string
  private key?: Buffer
  private entries: Record<string, EncryptedBlob> = {}
  private loaded = false

  constructor(
    homeDir: string,
    private readonly customCipher?: SecretCipherAdapter,
  ) {
    this.vaultPath = join(homeDir, 'connectors', 'secrets.enc.json')
    this.keyPath = join(homeDir, 'connectors', '.vault.key')
  }

  private async ensureKey(): Promise<Buffer> {
    if (this.key) return this.key
    const raw = await readFile(this.keyPath, 'utf8').catch(() => undefined)
    if (raw) {
      const parsed = Buffer.from(raw.trim(), 'hex')
      if (parsed.length === 32) {
        this.key = parsed
        return parsed
      }
    }
    const generated = randomBytes(32)
    await atomicWriteSecure(this.keyPath, `${generated.toString('hex')}\n`)
    this.key = generated
    return generated
  }

  private async encryptValue(plaintext: string): Promise<EncryptedBlob> {
    if (this.customCipher) return this.customCipher.encrypt(plaintext)
    const key = await this.ensureKey()
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    return {
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: encrypted.toString('base64'),
    }
  }

  private async decryptValue(blob: EncryptedBlob): Promise<string | undefined> {
    if (this.customCipher) return this.customCipher.decrypt(blob)
    const key = await this.ensureKey()
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'))
      decipher.setAuthTag(Buffer.from(blob.tag, 'base64'))
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(blob.data, 'base64')),
        decipher.final(),
      ])
      return decrypted.toString('utf8')
    } catch {
      return undefined
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    const raw = await readFile(this.vaultPath, 'utf8').catch(() => undefined)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<SecretVaultFile>
        if (parsed.version === 1 && parsed.entries && typeof parsed.entries === 'object') {
          this.entries = { ...parsed.entries }
        }
      } catch {
        this.entries = {}
      }
    }
    this.loaded = true
  }

  private async save(): Promise<void> {
    await atomicWriteSecure(this.vaultPath, `${JSON.stringify({ version: 1, entries: this.entries }, null, 2)}\n`)
  }

  async setSecret(connectorId: string, profileId: string, fieldKey: string, value: string): Promise<void> {
    await this.ensureLoaded()
    const key = makeRecordKey(connectorId, profileId, fieldKey)
    const trimmed = value.trim()
    if (!trimmed) return
    this.entries[key] = await this.encryptValue(trimmed)
    await this.save()
  }

  async hasSecret(connectorId: string, profileId: string, fieldKey: string): Promise<boolean> {
    await this.ensureLoaded()
    return Boolean(this.entries[makeRecordKey(connectorId, profileId, fieldKey)])
  }

  async getSecret(connectorId: string, profileId: string, fieldKey: string): Promise<string | undefined> {
    await this.ensureLoaded()
    const blob = this.entries[makeRecordKey(connectorId, profileId, fieldKey)]
    if (!blob) return undefined
    return this.decryptValue(blob)
  }

  async listPresentKeys(connectorId: string, profileId: string): Promise<Record<string, boolean>> {
    await this.ensureLoaded()
    const prefix = `${connectorId}/${profileId || 'default'}/`
    const result: Record<string, boolean> = {}
    for (const fullKey of Object.keys(this.entries)) {
      if (fullKey.startsWith(prefix)) {
        result[fullKey.slice(prefix.length)] = true
      }
    }
    return result
  }

  async deleteConnectorSecrets(connectorId: string): Promise<void> {
    await this.ensureLoaded()
    const prefix = `${connectorId}/`
    let changed = false
    for (const fullKey of Object.keys(this.entries)) {
      if (fullKey.startsWith(prefix)) {
        delete this.entries[fullKey]
        changed = true
      }
    }
    if (changed) await this.save()
  }

  async resolveTemplates(
    template: Record<string, string>,
    connectorId: string,
    profileId: string,
    nonSecretFields?: Record<string, string>,
  ): Promise<Record<string, string>> {
    await this.ensureLoaded()
    const resolved: Record<string, string> = {}
    const placeholder = /\$\{credential:connector\/([^/]+)\/([^/]+)\/([^}]+)\}/gu

    for (const [headerOrEnv, rawPattern] of Object.entries(template)) {
      let missing = false
      const parts: string[] = []
      let lastIndex = 0
      placeholder.lastIndex = 0
      for (const match of rawPattern.matchAll(placeholder)) {
        const index = match.index ?? 0
        parts.push(rawPattern.slice(lastIndex, index))
        const [, targetConn, targetProfile, fieldKey] = match
        const secretVal = await this.getSecret(
          targetConn || connectorId,
          targetProfile || profileId,
          fieldKey,
        )
        const fallbackNonSecret = nonSecretFields?.[fieldKey]
        const value = secretVal ?? fallbackNonSecret
        if (!value) missing = true
        parts.push(value ?? '')
        lastIndex = index + match[0].length
      }
      parts.push(rawPattern.slice(lastIndex))
      const finalValue = parts.join('')
      if (!missing && finalValue.trim().length > 0) {
        resolved[headerOrEnv] = finalValue
      }
    }
    return resolved
  }
}
