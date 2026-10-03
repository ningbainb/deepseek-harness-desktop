import { EventEmitter } from 'node:events'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { isMap, isSeq, parseDocument } from 'yaml'

import { emitBestEffort } from '../best-effort-events.mjs'
import { renderQrDataUrl } from '../optional-integrations.mjs'

export const QQBOT_PACKAGE = '@tencent-connect/dsh-qqbot'
export const QQBOT_PATCH_START = '# --- dsh-desktop qqbot (auto-generated; do not edit) ---'
export const QQBOT_PATCH_END = '# --- end dsh-desktop qqbot ---'

function assertCredentials(credentials) {
  if (
    credentials === null
    || typeof credentials !== 'object'
    || typeof credentials.appId !== 'string'
    || credentials.appId.trim().length === 0
    || typeof credentials.appSecret !== 'string'
    || credentials.appSecret.length === 0
  ) {
    throw new TypeError('QQ Bot credentials are invalid')
  }
  return { appId: credentials.appId.trim(), appSecret: credentials.appSecret }
}

async function atomicWrite(path, content, options = {}) {
  await mkdir(dirname(path), { recursive: true })
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const temporary = `${path}.tmp-${suffix}`
  const backup = `${path}.bak-${suffix}`
  await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx', ...options })
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

export function qqBotPatchSection(enabled) {
  return `${QQBOT_PATCH_START}\n- id: im-qqbot\n  disabled: ${enabled ? 'false' : 'true'}\n${QQBOT_PATCH_END}\n`
}

function patchDocument(source) {
  const document = parseDocument(source)
  if (document.errors.length || (document.contents !== null && !isSeq(document.contents))) {
    throw new Error('managed patch must be a valid YAML sequence')
  }
  document.toJS()
  return document
}

export function reconcileManagedPatch(existing, template, startMarker, endMarker) {
  const source = String(existing)
  const start = source.indexOf(startMarker)
  if (start === -1) {
    if (source.includes(endMarker)) throw new Error('managed patch section boundaries are ambiguous')
    return { managed: template, remainder: source }
  }
  const end = source.indexOf(endMarker, start)
  if (end === -1) throw new Error('managed patch section is unterminated')
  if (source.indexOf(startMarker, start + startMarker.length) !== -1
    || source.indexOf(endMarker, end + endMarker.length) !== -1
    || (start !== 0 && source[start - 1] !== '\n')) {
    throw new Error('managed patch section boundaries are ambiguous')
  }
  patchDocument(source)
  const previous = patchDocument(source.slice(start + startMarker.length, end))
  const defaults = patchDocument(template.slice(template.indexOf(startMarker) + startMarker.length, template.indexOf(endMarker)))
  const preserved = parseDocument('[]')
  preserved.contents.flow = false
  const claimed = new Set()
  let changed = false
  if (previous.commentBefore || previous.commentAfter) {
    defaults.commentBefore = previous.commentBefore
    defaults.commentAfter = previous.commentAfter
    changed = true
  }
  for (const row of previous.contents?.items ?? []) {
    if (!isMap(row)) throw new Error('managed patch row must be a YAML mapping')
    const id = row.get('id')
    const insertion = row.get('insert', true)
    let target = typeof id === 'string'
      ? defaults.contents.items.findIndex(candidate => candidate.get('id') === id)
      : -1
    if (insertion !== undefined) {
      if (!isSeq(insertion)) throw new Error('managed patch insert must be a YAML sequence')
      const matches = defaults.contents.items.flatMap((candidate, index) => {
        const children = candidate.get('insert', true)
        return isSeq(children) && children.items.some(child => insertion.items.some(actual =>
          isMap(actual) && actual.get('id') === child.get('id'))) ? [index] : []
      })
      if (matches.length > 1) throw new Error('managed patch insert ownership is ambiguous')
      target = matches[0] ?? -1
    }
    if (target === -1) {
      preserved.contents.items.push(row.clone())
      continue
    }
    if (claimed.has(target)) throw new Error('managed patch row ownership is ambiguous')
    claimed.add(target)
    const candidate = defaults.contents.items[target]
    const replacement = row.clone()
    if (isSeq(insertion)) {
      const expected = candidate.get('insert', true)
      const children = replacement.get('insert', true)
      const identities = new Set()
      for (const child of children.items) {
        if (!isMap(child) || typeof child.get('id') !== 'string' || identities.has(child.get('id'))) {
          throw new Error('managed patch insert identities are ambiguous')
        }
        identities.add(child.get('id'))
      }
      for (const child of expected.items) {
        if (!identities.has(child.get('id'))) children.items.push(child.clone())
      }
    }
    if (!isDeepStrictEqual(candidate.toJSON(), replacement.toJSON())
      || String(candidate) !== String(replacement)) changed = true
    defaults.contents.items[target] = replacement
  }
  const managed = changed ? `${startMarker}\n${String(defaults).trimEnd()}\n${endMarker}\n` : template
  const outside = [source.slice(0, start).trimEnd(), source.slice(end + endMarker.length).trimStart()]
    .filter(Boolean).join('\n\n')
  const extra = preserved.contents.items.length ? String(preserved).trimEnd() : ''
  const remainder = [outside, extra].filter(Boolean).join('\n\n')
  patchDocument([managed, remainder].join('\n'))
  return { managed, remainder }
}

export function mergeQqBotPatch(existing = '', enabled = false) {
  const reconciled = reconcileManagedPatch(existing, qqBotPatchSection(enabled), QQBOT_PATCH_START, QQBOT_PATCH_END)
  const document = patchDocument(reconciled.managed.slice(QQBOT_PATCH_START.length, reconciled.managed.indexOf(QQBOT_PATCH_END)))
  document.contents.items.find(row => row.get('id') === 'im-qqbot').set('disabled', !enabled)
  const managed = `${QQBOT_PATCH_START}\n${String(document).trimEnd()}\n${QQBOT_PATCH_END}\n`
  const remainder = reconciled.remainder
  const prefix = remainder.trim()
  return prefix ? `${prefix}\n\n${managed}` : managed
}

export function readQqBotPatchEnabled(content = '') {
  const start = String(content).indexOf(QQBOT_PATCH_START)
  if (start === -1) return undefined
  const end = String(content).indexOf(QQBOT_PATCH_END, start)
  if (end === -1) throw new Error('QQ Bot managed patch section is unterminated')
  const section = patchDocument(String(content).slice(start + QQBOT_PATCH_START.length, end))
  const states = (section.contents?.items ?? []).filter(row => isMap(row) && row.get('id') === 'im-qqbot')
  if (states.length !== 1 || typeof states[0].get('disabled') !== 'boolean') {
    throw new Error('QQ Bot managed patch section has no unambiguous disabled state')
  }
  return !states[0].get('disabled')
}

export async function setQqBotProfileEnabled({ profileDir, enabled }) {
  if (typeof profileDir !== 'string' || profileDir.length === 0) {
    throw new TypeError('profileDir is required')
  }
  const patchPath = join(profileDir, 'cordis.patch.yml')
  const existing = await readFile(patchPath, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return ''
    throw error
  })
  const next = mergeQqBotPatch(existing, Boolean(enabled))
  if (next === existing) return false
  await atomicWrite(patchPath, next)
  return true
}

export function maskAppId(appId) {
  const value = String(appId)
  if (value.length <= 4) return '*'.repeat(value.length)
  return `${value.slice(0, 2)}${'*'.repeat(Math.min(8, value.length - 4))}${value.slice(-2)}`
}

export class QqBotCredentialStore {
  constructor({ path, safeStorage }) {
    if (typeof path !== 'string' || path.length === 0) throw new TypeError('credential path is required')
    if (!safeStorage) throw new TypeError('safeStorage is required')
    this.path = path
    this.safeStorage = safeStorage
  }

  async load() {
    const content = await readFile(this.path, 'utf8').catch((error) => {
      if (error?.code === 'ENOENT') return undefined
      throw error
    })
    if (content === undefined) return undefined
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error('operating-system credential encryption is unavailable')
    }
    let envelope
    try {
      envelope = JSON.parse(content)
      if (envelope.version !== 1 || typeof envelope.payload !== 'string') throw new Error('unsupported envelope')
      const plaintext = this.safeStorage.decryptString(Buffer.from(envelope.payload, 'base64'))
      return assertCredentials(JSON.parse(plaintext))
    } catch (error) {
      throw new Error(`QQ Bot credential store is invalid: ${error.message}`)
    }
  }

  async save(credentials) {
    const normalized = assertCredentials(credentials)
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error('operating-system credential encryption is unavailable')
    }
    const encrypted = this.safeStorage.encryptString(JSON.stringify(normalized))
    const envelope = `${JSON.stringify({ version: 1, payload: encrypted.toString('base64') }, null, 2)}\n`
    await atomicWrite(this.path, envelope)
  }

  async clear() {
    await rm(this.path, { force: true })
  }
}

export function createQrDataUrl(url) {
  return renderQrDataUrl(url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 360,
    color: { dark: '#061017ff', light: '#ffffffff' },
  })
}

function errorMessage(error) {
  return String(error instanceof Error ? error.message : error).slice(0, 1_000)
}

class QqBotOperationCanceledError extends Error {
  constructor() {
    super('QQ Bot operation was canceled')
    this.name = 'QqBotOperationCanceledError'
  }
}

function isQqBotOperationCanceled(error) {
  return error instanceof QqBotOperationCanceledError
}

async function rollbackStateChange({ label, error, steps, restartRuntime, restartRequired }) {
  const rollbackErrors = []
  for (const step of [...steps].reverse()) {
    try {
      await step()
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError)
    }
  }
  if (restartRequired) {
    try {
      await restartRuntime()
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError)
    }
  }
  if (rollbackErrors.length === 0) return error
  return new Error(
    `${label} failed and rollback failed: ${errorMessage(error)}; ${rollbackErrors.map(errorMessage).join('; ')}`,
    { cause: new AggregateError([error, ...rollbackErrors]) },
  )
}

export class QqBotBindingService extends EventEmitter {
  constructor({
    initialCredentials,
    credentialStore,
    startQrConnect,
    renderQr = createQrDataUrl,
    setProfileEnabled,
    setRuntimeCredentials,
    restartRuntime,
    onEventError = () => {},
  }) {
    super()
    if (!credentialStore || typeof startQrConnect !== 'function') {
      throw new TypeError('credentialStore and startQrConnect are required')
    }
    if (typeof onEventError !== 'function') throw new TypeError('onEventError must be a function')
    this.credentials = initialCredentials ? assertCredentials(initialCredentials) : undefined
    this.credentialStore = credentialStore
    this.startQrConnect = startQrConnect
    this.renderQr = renderQr
    this.setProfileEnabled = setProfileEnabled
    this.setRuntimeCredentials = setRuntimeCredentials
    this.restartRuntime = restartRuntime
    this.onEventError = onEventError
    this.binding = false
    this.settling = false
    this.qrImage = undefined
    this.stopQr = undefined
    this.operationPromise = undefined
    this.generation = 0
    this.quiesced = false
    this.disposed = false
  }

  status() {
    return Object.freeze({
      bound: Boolean(this.credentials),
      binding: this.binding,
      pending: this.settling,
      appId: this.credentials ? maskAppId(this.credentials.appId) : undefined,
      qrImage: this.qrImage,
    })
  }

  #publish(type, details = {}) {
    emitBestEffort(
      this,
      'event',
      [Object.freeze({ type, ...details, status: this.status() })],
      (error) => this.onEventError(error),
    )
  }

  #operationIsCurrent(generation) {
    return !this.disposed && !this.quiesced && generation === this.generation
  }

  #assertOperationCurrent(generation) {
    if (!this.#operationIsCurrent(generation)) throw new QqBotOperationCanceledError()
  }

  #trackOperation(operation) {
    this.operationPromise = operation
    void operation.then(
      () => {
        if (this.operationPromise === operation) this.operationPromise = undefined
      },
      () => {
        if (this.operationPromise === operation) this.operationPromise = undefined
      },
    )
    return operation
  }

  #invalidateQr({ publish = false } = {}) {
    const stop = this.stopQr
    const wasBinding = this.binding
    this.binding = false
    this.qrImage = undefined
    this.stopQr = undefined
    this.generation += 1
    try {
      stop?.()
    } catch (error) {
      this.onEventError(error)
    }
    if (publish && wasBinding) this.#publish('canceled')
  }

  start() {
    if (this.disposed || this.quiesced || this.credentials || this.binding || this.settling) return this.status()
    this.binding = true
    this.qrImage = undefined
    const generation = ++this.generation
    const current = () => this.binding && generation === this.generation
    try {
      const connector = this.startQrConnect({
        onQrDisplayed: (url) => {
          void Promise.resolve(this.renderQr(url)).then((image) => {
            if (!current()) return
            this.qrImage = image
            this.#publish('qr')
          }).catch((error) => {
            if (current()) this.#fail(error)
          })
        },
        onQrExpired: () => {
          if (!current()) return
          this.qrImage = undefined
          this.#publish('refreshing')
        },
        onSuccess: (credentials) => {
          if (!current()) return
          this.binding = false
          this.settling = true
          this.qrImage = undefined
          this.stopQr = undefined
          this.#publish('saving')
          this.#trackOperation(this.#complete(credentials?.[0], generation))
        },
        onFailure: (error) => {
          if (current()) this.#fail(error)
        },
      }, {
        displayQrCodeToConsole: false,
        source: 'dsh-desktop',
      })
      if (connector && typeof connector.then === 'function') {
        void Promise.resolve(connector).then((stop) => {
          if (typeof stop !== 'function') throw new TypeError('QQ Bot connector did not return a stop function')
          if (!current()) {
            stop()
            return
          }
          this.stopQr = stop
        }).catch((error) => {
          if (current()) this.#fail(error)
        })
      } else {
        if (typeof connector !== 'function') throw new TypeError('QQ Bot connector did not return a stop function')
        if (!current()) {
          connector()
          return this.status()
        }
        this.stopQr = connector
      }
      if (current()) this.#publish('waiting')
    } catch (error) {
      this.#fail(error)
    }
    return this.status()
  }

  async #complete(credentials, generation) {
    const rollbackSteps = []
    let restartRequired = false
    try {
      const normalized = assertCredentials(credentials)
      await this.credentialStore.save(normalized)
      rollbackSteps.push(() => this.credentialStore.clear())
      this.#assertOperationCurrent(generation)
      const profileChanged = await this.setProfileEnabled(true)
      if (profileChanged) {
        restartRequired = true
        rollbackSteps.push(() => this.setProfileEnabled(false))
      }
      this.#assertOperationCurrent(generation)
      this.setRuntimeCredentials(normalized)
      restartRequired = true
      rollbackSteps.push(() => this.setRuntimeCredentials(undefined))
      this.#assertOperationCurrent(generation)
      this.#publish('restarting')
      await this.restartRuntime()
      this.#assertOperationCurrent(generation)
      this.credentials = normalized
      this.settling = false
      this.#publish('bound')
    } catch (error) {
      const canceled = isQqBotOperationCanceled(error) || !this.#operationIsCurrent(generation)
      const restoredError = await rollbackStateChange({
        label: 'QQ Bot binding',
        error,
        steps: rollbackSteps,
        restartRuntime: this.restartRuntime,
        restartRequired: restartRequired && !canceled,
      })
      if (canceled) {
        this.settling = false
        return
      }
      if (generation === this.generation) this.#fail(restoredError)
    }
  }

  #fail(error) {
    const stop = this.stopQr
    this.binding = false
    this.settling = false
    this.qrImage = undefined
    this.stopQr = undefined
    this.generation += 1
    stop?.()
    this.#publish('error', { error: error instanceof Error ? error.message : String(error) })
  }

  cancel() {
    if (!this.binding) return this.status()
    this.#invalidateQr({ publish: true })
    return this.status()
  }

  async #unbind(previousOperation) {
    this.settling = true
    await previousOperation?.catch(() => {})
    if (this.quiesced || this.disposed) {
      this.settling = false
      return this.status()
    }
    if (this.binding) this.#invalidateQr()
    const generation = this.generation
    const previousCredentials = this.credentials
    const rollbackSteps = []
    let restartRequired = false
    try {
      await this.credentialStore.clear()
      if (previousCredentials) rollbackSteps.push(() => this.credentialStore.save(previousCredentials))
      this.#assertOperationCurrent(generation)
      const profileChanged = await this.setProfileEnabled(false)
      if (profileChanged) {
        restartRequired = true
        rollbackSteps.push(() => this.setProfileEnabled(true))
      }
      this.#assertOperationCurrent(generation)
      this.setRuntimeCredentials(undefined)
      restartRequired = true
      rollbackSteps.push(() => this.setRuntimeCredentials(previousCredentials))
      this.#assertOperationCurrent(generation)
      this.#publish('restarting')
      await this.restartRuntime()
      this.#assertOperationCurrent(generation)
      this.credentials = undefined
      this.settling = false
      this.#publish('unbound')
      return this.status()
    } catch (error) {
      const canceled = isQqBotOperationCanceled(error) || !this.#operationIsCurrent(generation)
      const restoredError = await rollbackStateChange({
        label: 'QQ Bot unbind',
        error,
        steps: rollbackSteps,
        restartRuntime: this.restartRuntime,
        restartRequired: restartRequired && !canceled,
      })
      this.settling = false
      if (canceled) return this.status()
      throw restoredError
    }
  }

  unbind() {
    const previousOperation = this.operationPromise
    return this.#trackOperation(this.#unbind(previousOperation))
  }

  async quiesce() {
    this.quiesced = true
    this.#invalidateQr()
    const operation = this.operationPromise
    await operation?.catch(() => {})
    this.settling = false
    return this.status()
  }

  resume() {
    if (this.disposed) return false
    this.quiesced = false
    return true
  }

  async dispose() {
    this.disposed = true
    await this.quiesce()
    this.removeAllListeners()
  }
}
