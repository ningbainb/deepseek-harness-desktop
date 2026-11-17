import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, openSync, writeSync, closeSync, mkdirSync, chmodSync, createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile, rename, rm, stat, lstat, readlink, symlink } from 'node:fs/promises'
import { dirname, join, resolve, relative, isAbsolute, sep } from 'node:path'
import { setTimeout as delay, setImmediate as nextTurn } from 'node:timers/promises'
import { Unzip, UnzipInflate } from 'fflate'

export const browserComponentManifest = JSON.parse(readFileSync(new URL('../runtime-support/browser-component.json', import.meta.url), 'utf8'))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const receiptName = '.desktop-component.json'

function childPath(root, name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || name.includes(':') || name.includes('\0') || name.split('/').includes('..') || isAbsolute(name)) throw Error('unsafe browser component path')
  const target = resolve(root, name)
  const rel = relative(root, target)
  if (!rel || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw Error('unsafe browser component path')
  return target
}

function metadata(bytes) {
  let end = -1
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) { end = offset; break }
  }
  if (end < 0) throw Error('invalid browser component ZIP directory')
  const entries = new Map()
  let cursor = bytes.readUInt32LE(end + 16)
  let total = 0
  for (let i = 0; i < bytes.readUInt16LE(end + 10); i++) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== 0x02014b50) throw Error('invalid browser component ZIP entry')
    const size = bytes.readUInt32LE(cursor + 24)
    const nameLength = bytes.readUInt16LE(cursor + 28)
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8')
    const mode = bytes.readUInt32LE(cursor + 38) >>> 16
    if (entries.has(name) || name === receiptName) throw Error('duplicate/reserved browser component ZIP entry')
    total += size
    if (total > 2 * 1024 ** 3 || entries.size > 100000) throw Error('browser component ZIP exceeds extraction limit')
    entries.set(name, { mode, size })
    cursor += 46 + nameLength + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32)
  }
  if (!entries.size) throw Error('empty browser component ZIP')
  return entries
}

/** Stream inflate in bounded chunks, preserving Unix executable modes and macOS framework links. */
export async function extractBrowserComponentArchive(archivePath, destination, { signal } = {}) {
  const bytes = await readFile(archivePath)
  const entries = metadata(bytes)
  const links = []
  const descriptors = new Set()
  for (const [name, info] of entries) {
    childPath(destination, name)
    if ((info.mode & 0xf000) === 0xa000) links.push(name)
  }
  for (const name of entries.keys()) {
    if (links.some(link => name.startsWith(`${link}/`))) throw Error('browser component ZIP writes through a symlink')
  }
  const records = []
  let failure
  let completed = 0
  const unzip = new Unzip(file => {
    try {
      const info = entries.get(file.name)
      if (!info) throw Error('unlisted browser component ZIP entry')
      const path = childPath(destination, file.name)
      const isLink = (info.mode & 0xf000) === 0xa000
      if (file.name.endsWith('/')) {
        mkdirSync(path, { recursive: true })
        completed++
        file.ondata = error => { if (error) failure = error }
        file.start()
        return
      }
      mkdirSync(dirname(path), { recursive: true })
      const fd = isLink ? undefined : openSync(path, 'wx', info.mode & 0o777 || 0o644)
      if (fd !== undefined) descriptors.add(fd)
      const hash = createHash('sha256')
      const chunks = []
      let size = 0
      file.ondata = (error, chunk, final) => {
        if (error) { failure = error; return }
        size += chunk.length
        if (size > info.size) { failure = Error('browser component ZIP size mismatch'); file.terminate(); return }
        hash.update(chunk)
        if (isLink) chunks.push(Buffer.from(chunk))
        else writeSync(fd, chunk)
        if (final) {
          if (size !== info.size) { failure = Error('browser component ZIP size mismatch'); return }
          if (fd !== undefined) { closeSync(fd); descriptors.delete(fd); if (process.platform !== 'win32') chmodSync(path, info.mode & 0o777 || 0o644) }
          records.push({ path: file.name, size, sha256: hash.digest('hex'), ...(isLink ? { link: Buffer.concat(chunks).toString('utf8') } : {}) })
          completed++
        }
      }
      file.start()
    } catch (error) { failure = error }
  })
  unzip.register(UnzipInflate)
  try {
    for (let offset = 0; offset < bytes.length; offset += 1024 * 1024) {
      signal?.throwIfAborted()
      unzip.push(bytes.subarray(offset, offset + 1024 * 1024), offset + 1024 * 1024 >= bytes.length)
      if (failure) throw failure
      await nextTurn()
    }
    if (completed !== entries.size) throw Error('incomplete browser component ZIP')
    for (const record of records.filter(record => record.link !== undefined)) {
      const path = childPath(destination, record.path)
      const target = resolve(dirname(path), record.link)
      if (isAbsolute(record.link) || relative(destination, target).startsWith('..') || record.link.includes('\\')) throw Error('unsafe browser component symlink')
      await symlink(record.link, path)
    }
    return records
  } finally { for (const fd of descriptors) closeSync(fd) }
}

/** Persistent activation and disposable downloads must have disjoint roots. */
export function createBrowserComponentManager({ componentRoot, cacheRoot, manifest = browserComponentManifest, platform = process.platform, arch = process.arch, fetch: fetchArchive = globalThis.fetch } = {}) {
  if (!componentRoot || !cacheRoot) throw Error('browser component requires persistent and cache roots')
  componentRoot = resolve(componentRoot)
  cacheRoot = resolve(cacheRoot)
  const nested = (a, b) => { const rel = relative(a, b); return !rel || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)) }
  if (nested(componentRoot, cacheRoot) || nested(cacheRoot, componentRoot)) throw Error('browser component and cache roots must be separate')
  const artifact = manifest.artifacts?.find(item => item.platform === platform && item.arch === arch)
  if (!artifact) throw Error(`unsupported browser component platform/architecture: ${platform}/${arch}`)
  if (manifest.schemaVersion !== 1 || !/^\d+\.\d+\.\d+$/.test(artifact.version) || !/^[a-f0-9]{64}$/.test(artifact.sha256) || !Number.isSafeInteger(artifact.size) || artifact.size < 1 || !artifact.url.startsWith(`https://github.com/electron/electron/releases/download/v${artifact.version}/`)) throw Error('invalid browser component manifest')
  const key = `${artifact.version}-${platform}-${arch}`
  const componentPath = childPath(componentRoot, key)
  const executablePath = childPath(componentPath, artifact.executable)
  for (const name of artifact.required ?? []) childPath(componentPath, name)
  const result = { executablePath, componentPath, version: artifact.version, platform, arch }
  let state = { phase: 'idle', receivedBytes: 0, totalBytes: artifact.size, version: artifact.version, platform, arch }
  let pending
  let controller
  const listeners = new Set()
  const publish = patch => { state = { ...state, ...patch }; for (const listener of listeners) { try { listener({ ...state }) } catch {} } }
  async function validActivation() {
    try {
      const receipt = JSON.parse(await readFile(join(componentPath, receiptName), 'utf8'))
      if (receipt.sha256 !== artifact.sha256 || receipt.version !== artifact.version || receipt.platform !== platform || receipt.arch !== arch || !Array.isArray(receipt.files) || !receipt.files.length) return false
      const names = new Set(receipt.files.map(file => file.path))
      if (![artifact.executable, 'version', ...(artifact.required ?? [])].every(name => names.has(name))) return false
      for (const file of receipt.files) {
        const path = childPath(componentPath, file.path)
        const info = await lstat(path)
        if (file.link !== undefined) {
          if (!info.isSymbolicLink() || await readlink(path) !== file.link) return false
        } else if (!info.isFile() || info.size !== file.size || digest(await readFile(path)) !== file.sha256) return false
      }
      return (await readFile(join(componentPath, 'version'), 'utf8')).trim().replace(/^v/, '') === artifact.version
    } catch { return false }
  }
  async function lock(signal) {
    const path = childPath(componentRoot, `${key}.lock`)
    const token = randomUUID()
    for (;;) {
      signal.throwIfAborted()
      try {
        await mkdir(path)
        await writeFile(join(path, 'owner.json'), JSON.stringify({ pid: process.pid, token }))
        return async () => {
          try { if (JSON.parse(await readFile(join(path, 'owner.json'), 'utf8')).token === token) await rm(path, { recursive: true, force: true }) } catch {}
        }
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
        try {
          const owner = JSON.parse(await readFile(join(path, 'owner.json'), 'utf8'))
          if (!Number.isInteger(owner.pid) || owner.pid < 1) throw Error('invalid browser lock owner')
          try { process.kill(owner.pid, 0) } catch (cause) {
            if (cause.code === 'ESRCH') { await rm(path, { recursive: true, force: true }); continue }
          }
        } catch {
          if (Date.now() - (await stat(path).catch(() => ({ mtimeMs: Date.now() }))).mtimeMs > 30000) { await rm(path, { recursive: true, force: true }); continue }
        }
        publish({ phase: 'waiting' })
        await delay(100, undefined, { signal })
      }
    }
  }
  async function run(signal, archivePath) {
    let unlock
    let stage
    let archive
    let ownsArchive = false
    let old
    let activated = false
    try {
      publish({ phase: 'checking', error: null, receivedBytes: 0 })
      await mkdir(componentRoot, { recursive: true })
      unlock = await lock(signal)
      if (await validActivation()) { signal.throwIfAborted(); publish({ phase: 'ready', receivedBytes: artifact.size }); return result }
      await mkdir(cacheRoot, { recursive: true })
      archive = archivePath ? resolve(archivePath) : childPath(cacheRoot, `${key}-${randomUUID()}.zip.part`)
      ownsArchive = !archivePath
      stage = childPath(componentRoot, `${key}-${randomUUID()}.staging`)
      publish({ phase: 'downloading' })
      let body
      if (archivePath) body = createReadStream(archive, { signal })
      else {
        const response = await fetchArchive(artifact.url, { signal, redirect: 'follow' })
        if (!response.ok || !response.body) throw Error(`browser component download failed: HTTP ${response.status}`)
        body = response.body
      }
      const fd = ownsArchive ? openSync(archive, 'wx') : undefined
      let receivedBytes = 0
      const hash = createHash('sha256')
      try {
        for await (const chunk of body) {
          signal.throwIfAborted()
          receivedBytes += chunk.length
          if (receivedBytes > artifact.size) throw Error('browser component archive size mismatch')
          hash.update(chunk)
          if (fd !== undefined) writeSync(fd, chunk)
          publish({ phase: 'downloading', receivedBytes })
        }
      } finally { if (fd !== undefined) closeSync(fd) }
      publish({ phase: 'verifying' })
      if (receivedBytes !== artifact.size) throw Error('browser component archive size mismatch')
      if (hash.digest('hex') !== artifact.sha256) throw Error('browser component SHA256 mismatch')
      signal.throwIfAborted()
      publish({ phase: 'extracting' })
      await mkdir(stage)
      const files = await extractBrowserComponentArchive(archive, stage, { signal })
      for (const name of [artifact.executable, 'version', ...(artifact.required ?? [])]) if (!files.some(file => file.path === name && file.link === undefined)) throw Error(`incomplete browser component: ${name}`)
      if ((await readFile(join(stage, 'version'), 'utf8')).trim().replace(/^v/, '') !== artifact.version) throw Error('browser component version mismatch')
      await writeFile(join(stage, receiptName), JSON.stringify({ ...result, executablePath: undefined, componentPath: undefined, sha256: artifact.sha256, files }))
      signal.throwIfAborted()
      publish({ phase: 'activating' })
      try { await lstat(componentPath); old = childPath(componentRoot, `${key}-${randomUUID()}.replaced`); await rename(componentPath, old) } catch (error) { if (error.code !== 'ENOENT') throw error }
      try { await rename(stage, componentPath); stage = undefined } catch (error) { if (old) { await rename(old, componentPath); old = undefined } throw error }
      activated = true
      publish({ phase: 'ready' })
      return result
    } catch (error) {
      publish({ phase: signal.aborted ? 'cancelled' : 'error', error: signal.aborted ? 'Browser component preparation cancelled' : String(error.message ?? error) })
      throw error
    } finally {
      if (ownsArchive && archive) await rm(archive, { force: true }).catch(() => {})
      if (stage) await rm(stage, { recursive: true, force: true }).catch(() => {})
      // A failed restore leaves the previous payload available for recovery.
      if (old && activated) await rm(old, { recursive: true, force: true }).catch(() => {})
      await unlock?.()
    }
  }
  return {
    status: () => ({ ...state }),
    cancel: () => controller?.abort(new Error('Browser component preparation cancelled')),
    // Cancellation is operation-wide: all callers observe the same preparation.
    prepare({ signal, onProgress, archivePath } = {}) {
      if (signal?.aborted) return Promise.reject(signal.reason)
      if (onProgress) { listeners.add(onProgress); try { onProgress({ ...state }) } catch {} }
      if (!pending) {
        controller = new AbortController()
        pending = run(controller.signal, archivePath).finally(() => { pending = undefined; controller = undefined })
      }
      const abort = () => controller?.abort(signal.reason)
      signal?.addEventListener('abort', abort, { once: true })
      return pending.finally(() => { signal?.removeEventListener('abort', abort); if (onProgress) listeners.delete(onProgress) })
    },
  }
}
