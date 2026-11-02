import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const SECRET_ASSIGNMENT = /\b(NPM_TOKEN|DEEPSEEK_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|QQBOT_SECRET|APP_SECRET|APPSECRET|API_KEY|ACCESS_TOKEN|AUTH_TOKEN)=([^\s]+)/gi
const BEARER_TOKEN = /(Authorization:\s*Bearer\s+)([^\s]+)/gi
const DEFAULT_FILE_SYSTEM = { mkdir, readFile, rename, rm, stat, writeFile }

export function sanitizeLogLine(value) {
  return String(value)
    .replace(BEARER_TOKEN, '$1[redacted]')
    .replace(SECRET_ASSIGNMENT, '$1=[redacted]')
    .replaceAll('\u0000', '')
}

async function fileSize(path, fileSystem) {
  try {
    return (await fileSystem.stat(path)).size
  } catch (error) {
    if (error?.code === 'ENOENT') return 0
    throw error
  }
}

async function readIfPresent(path, fileSystem) {
  try {
    return await fileSystem.readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return ''
    throw error
  }
}

export class BoundedLogStore {
  constructor({
    directory,
    baseName = 'runtime.log',
    maxBytes = 1_048_576,
    maxFiles = 4,
    fileSystem = DEFAULT_FILE_SYSTEM,
  }) {
    if (!directory) throw new TypeError('log directory is required')
    if (!Number.isInteger(maxBytes) || maxBytes < 32) throw new TypeError('maxBytes must be at least 32')
    if (!Number.isInteger(maxFiles) || maxFiles < 1) throw new TypeError('maxFiles must be positive')
    this.directory = directory
    this.path = join(directory, baseName)
    this.maxBytes = maxBytes
    this.maxFiles = maxFiles
    this.fileSystem = fileSystem
    this.queue = Promise.resolve()
    this.directoryReady = undefined
    this.currentSize = undefined
    this.lastWriteError = undefined
    this.accepting = true
    this.closePromise = undefined
  }

  append(value) {
    if (!this.accepting) return Promise.resolve(false)
    const operation = this.queue.then(() => this.#append(value)).then(
      () => {
        this.lastWriteError = undefined
        return true
      },
      (error) => {
        this.directoryReady = undefined
        this.currentSize = undefined
        this.lastWriteError = error
        return false
      },
    )
    this.queue = operation
    return operation
  }

  close() {
    if (this.closePromise) return this.closePromise
    this.accepting = false
    this.closePromise = this.queue.then(() => this.lastWriteError === undefined)
    return this.closePromise
  }

  resume() {
    this.accepting = true
    this.closePromise = undefined
  }

  async #append(value) {
    this.directoryReady ??= this.fileSystem.mkdir(this.directory, { recursive: true })
    await this.directoryReady
    let entry = Buffer.from(`${sanitizeLogLine(value).replace(/[\r\n]+$/u, '')}\n`, 'utf8')
    if (entry.byteLength > this.maxBytes) entry = entry.subarray(entry.byteLength - this.maxBytes)
    this.currentSize ??= await fileSize(this.path, this.fileSystem)
    if (this.currentSize + entry.byteLength > this.maxBytes) {
      await this.#rotate()
      this.currentSize = 0
    }
    await this.fileSystem.writeFile(this.path, entry, { flag: 'a' })
    this.currentSize += entry.byteLength
  }

  async #rotate() {
    if (this.maxFiles === 1) {
      await this.fileSystem.writeFile(this.path, '')
      return
    }
    for (let index = this.maxFiles - 1; index >= 1; index -= 1) {
      const source = index === 1 ? this.path : `${this.path}.${index - 1}`
      const destination = `${this.path}.${index}`
      await this.fileSystem.rm(destination, { force: true })
      try {
        await this.fileSystem.rename(source, destination)
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
  }

  async tail(maxLines = 200) {
    await this.queue
    const chunks = []
    for (let index = this.maxFiles - 1; index >= 1; index -= 1) {
      chunks.push(await readIfPresent(`${this.path}.${index}`, this.fileSystem))
    }
    chunks.push(await readIfPresent(this.path, this.fileSystem))
    return chunks
      .join('')
      .split(/\r?\n/u)
      .filter(Boolean)
      .slice(-maxLines)
      .join('\n')
  }
}
