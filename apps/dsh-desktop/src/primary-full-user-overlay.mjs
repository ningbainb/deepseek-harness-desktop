import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'

export const PRIMARY_FULL_USER_OVERLAY_FILENAME = 'primary-full-user.yml'
export const FULL_USER_RUNTIME_OVERLAY = `- id: sandbox-policy
  name: '@deepseek-ai/dsh-sandbox-policy'
  disabled: false
  config:
    mode: danger-full-access
- id: approval
  name: '@deepseek-ai/dsh-user-approval'
  disabled: false
  config:
    policy: never
`

function assertDesktopStateDirectory(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new TypeError('full-user overlay Desktop state directory must be an absolute path')
  }
  return value
}

function assertFs(value) {
  if (!value || typeof value.mkdir !== 'function' || typeof value.readFile !== 'function'
    || typeof value.rename !== 'function' || typeof value.rm !== 'function'
    || typeof value.writeFile !== 'function') {
    throw new TypeError('full-user overlay requires file operations')
  }
  return value
}

export function primaryFullUserOverlayPath({ userData } = {}) {
  return join(assertDesktopStateDirectory(userData), 'runtime-overlays', PRIMARY_FULL_USER_OVERLAY_FILENAME)
}

export async function writePrimaryFullUserOverlay({
  userData,
  fs = { mkdir, readFile, rename, rm, writeFile },
  idFactory = () => `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
} = {}) {
  const fileSystem = assertFs(fs)
  const path = primaryFullUserOverlayPath({ userData })
  if (typeof idFactory !== 'function') throw new TypeError('primary Runtime overlay ID factory must be a function')
  const id = String(idFactory())
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(id)) throw new TypeError('primary Runtime overlay ID is invalid')
  const temporary = `${path}.tmp-${id}`
  const backup = `${path}.bak-${id}`
  await fileSystem.mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await fileSystem.writeFile(temporary, FULL_USER_RUNTIME_OVERLAY, {
    encoding: 'utf8', flag: 'wx', mode: 0o600,
  })
  let replaced = false
  try {
    try {
      await fileSystem.rename(path, backup)
      replaced = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await fileSystem.rename(temporary, path)
    if (await fileSystem.readFile(path, 'utf8') !== FULL_USER_RUNTIME_OVERLAY) {
      throw new Error('primary Runtime full-user overlay did not verify after atomic write')
    }
    if (replaced) await fileSystem.rm(backup, { force: true })
    return path
  } catch (error) {
    await fileSystem.rm(temporary, { force: true }).catch(() => {})
    if (replaced) {
      await fileSystem.rm(path, { force: true }).catch(() => {})
      await fileSystem.rename(backup, path).catch(() => {})
    }
    throw error
  }
}

