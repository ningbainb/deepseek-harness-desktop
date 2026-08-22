import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'

/**
 * A DSH `--patch` overlay applied only after native full-user confirmation.
 * Desktop main owns both the fixed content and every destination path. This
 * final patch layer keeps profile or home configuration from downgrading the
 * confirmed sandbox and approval policy without modifying user configuration.
 */
export const FREE_MODE_FULL_USER_OVERLAY_FILENAME = '.desktop-free-full-user-overlay.yml'
export const PRIMARY_FULL_USER_OVERLAY_FILENAME = 'primary-full-user.yml'
export const ISOLATED_RECOVERY_FULL_USER_OVERLAY_FILENAME = 'isolated-recovery-full-user.yml'
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
export const FREE_MODE_FULL_USER_OVERLAY = FULL_USER_RUNTIME_OVERLAY

function assertDshHome(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new TypeError('free-mode overlay DSH home must be an absolute path')
  }
  return value
}

function assertDesktopStateDirectory(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new TypeError('full-user overlay Desktop state directory must be an absolute path')
  }
  return value
}

function assertFs(value) {
  if (
    !value
    || typeof value.mkdir !== 'function'
    || typeof value.readFile !== 'function'
    || typeof value.rename !== 'function'
    || typeof value.rm !== 'function'
    || typeof value.writeFile !== 'function'
  ) {
    throw new TypeError('free-mode overlay requires file operations')
  }
  return value
}

export function freeModeFullUserOverlayPath({ dshHome } = {}) {
  return join(assertDshHome(dshHome), FREE_MODE_FULL_USER_OVERLAY_FILENAME)
}

export function primaryFullUserOverlayPath({ userData } = {}) {
  return join(assertDesktopStateDirectory(userData), 'runtime-overlays', PRIMARY_FULL_USER_OVERLAY_FILENAME)
}

export function isolatedRecoveryFullUserOverlayPath({ userData } = {}) {
  return join(assertDesktopStateDirectory(userData), 'runtime-overlays', ISOLATED_RECOVERY_FULL_USER_OVERLAY_FILENAME)
}

async function writeFixedFullUserOverlay({
  path,
  fs,
  idFactory,
  label,
}) {
  const fileSystem = assertFs(fs)
  if (typeof idFactory !== 'function') throw new TypeError(`${label} overlay ID factory must be a function`)
  const id = String(idFactory())
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(id)) throw new TypeError(`${label} overlay ID is invalid`)
  const temporary = `${path}.tmp-${id}`
  const backup = `${path}.bak-${id}`
  await fileSystem.mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await fileSystem.writeFile(temporary, FULL_USER_RUNTIME_OVERLAY, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
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
    const verified = await fileSystem.readFile(path, 'utf8')
    if (verified !== FULL_USER_RUNTIME_OVERLAY) {
      throw new Error(`${label} full-user overlay did not verify after atomic write`)
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

export function writePrimaryFullUserOverlay({
  userData,
  fs = { mkdir, readFile, rename, rm, writeFile },
  idFactory = () => `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
} = {}) {
  return writeFixedFullUserOverlay({
    path: primaryFullUserOverlayPath({ userData }),
    fs,
    idFactory,
    label: 'primary Runtime',
  })
}

export function writeIsolatedRecoveryFullUserOverlay({
  userData,
  fs = { mkdir, readFile, rename, rm, writeFile },
  idFactory = () => `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
} = {}) {
  return writeFixedFullUserOverlay({
    path: isolatedRecoveryFullUserOverlayPath({ userData }),
    fs,
    idFactory,
    label: 'isolated recovery Runtime',
  })
}

/**
 * Legacy compatibility wrapper for callers that still create an overlay in
 * an isolated DSH home. Production primary and recovery launches use the
 * fixed Desktop-state paths above. No renderer or plugin can choose the path
 * or content used by those production launchers.
 */
export async function writeFreeModeFullUserOverlay({
  dshHome,
  fs = { mkdir, readFile, rename, rm, writeFile },
  idFactory = () => `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
} = {}) {
  const home = assertDshHome(dshHome)
  return writeFixedFullUserOverlay({
    path: freeModeFullUserOverlayPath({ dshHome: home }),
    fs,
    idFactory,
    label: 'free-mode',
  })
}
