import { copyFile, lstat, readdir, readFile, rename, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { parse as parseYaml } from 'yaml'

const BACKUP_INFIXES = Object.freeze(['.bak-', '.backup-', '.previous-'])

/**
 * Sudden power loss on NTFS commonly leaves zero-byte or all-NUL files behind.
 */
export function isPowerLossCorruptBytes(bytes) {
  if (!bytes || bytes.length === 0) return true
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0) return false
  }
  return true
}

export function isValidJsonObjectBytes(bytes) {
  if (isPowerLossCorruptBytes(bytes)) return false
  try {
    const text = Buffer.from(bytes).toString('utf8')
    if (text.includes('\0')) return false
    const parsed = JSON.parse(text)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
  } catch {
    return false
  }
}

export function isValidYamlBytes(bytes) {
  if (isPowerLossCorruptBytes(bytes)) return false
  try {
    const text = Buffer.from(bytes).toString('utf8')
    if (text.includes('\0')) return false
    parseYaml(text)
    return true
  } catch {
    return false
  }
}

async function listSiblingBackups(targetPath) {
  const dir = dirname(targetPath)
  const base = basename(targetPath)
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const candidates = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!BACKUP_INFIXES.some(infix => entry.name.startsWith(`${base}${infix}`))) continue
    const fullPath = join(dir, entry.name)
    try {
      const info = await lstat(fullPath)
      if (!info.isFile() || info.isSymbolicLink()) continue
      candidates.push({ path: fullPath, name: entry.name, mtimeMs: info.mtimeMs, move: true })
    } catch {
      // Ignore vanished entries.
    }
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)
  return candidates
}

async function resolveExtraBackups(extraPaths) {
  const resolved = []
  for (const cand of extraPaths) {
    try {
      const info = await lstat(cand)
      if (!info.isFile() || info.isSymbolicLink()) continue
      resolved.push({ path: cand, name: basename(cand), mtimeMs: info.mtimeMs, move: false })
    } catch {
      // Ignore missing paths.
    }
  }
  resolved.sort((left, right) => right.mtimeMs - left.mtimeMs)
  return resolved
}

/**
 * Inspect one critical Desktop state file. If it is missing or damaged by an
 * interrupted write / sudden power loss, restore a valid sibling atomic-write
 * backup first; otherwise optionally quarantine corrupt bytes aside as
 * `.corrupt-<ts>` so Desktop rebuilds clean defaults without blocking boot.
 */
export async function recoverAtomicWriteBackup(targetPath, {
  validate = isValidJsonObjectBytes,
  quarantineIfCorrupt = false,
  onlyRecoverPowerLossBytes = false,
  extraBackupPaths = [],
  now = Date.now,
} = {}) {
  let targetExists = false
  let currentBytes
  try {
    const info = await lstat(targetPath)
    if (info.isSymbolicLink()) return { action: 'skipped-symlink' }
    if (!info.isFile()) return { action: 'skipped-non-file' }
    targetExists = true
    currentBytes = await readFile(targetPath)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  if (targetExists) {
    const powerLossBytes = isPowerLossCorruptBytes(currentBytes)
    if (onlyRecoverPowerLossBytes) {
      if (!powerLossBytes) return { action: 'intact' }
    } else if (!powerLossBytes && validate(currentBytes)) {
      return { action: 'intact' }
    }
  }

  const backups = [
    ...(await listSiblingBackups(targetPath)),
    ...(await resolveExtraBackups(extraBackupPaths)),
  ]
  for (const candidate of backups) {
    let bytes
    try {
      bytes = await readFile(candidate.path)
    } catch {
      continue
    }
    if (!validate(bytes)) continue
    if (targetExists) {
      await rename(targetPath, `${targetPath}.corrupt-${now()}`).catch(() => {})
    }
    if (candidate.move) {
      await rename(candidate.path, targetPath)
    } else {
      await copyFile(candidate.path, targetPath)
    }
    return { action: 'restored-backup', backup: candidate.name }
  }

  if (targetExists && (isPowerLossCorruptBytes(currentBytes) || quarantineIfCorrupt)) {
    await rename(targetPath, `${targetPath}.corrupt-${now()}`)
    return { action: 'quarantined' }
  }

  return { action: 'unchanged' }
}

async function discoverCommunitySettingsBackups(dshHome) {
  const backupsRoot = join(dshHome, 'community', 'backups')
  const paths = []
  let versions
  try {
    versions = await readdir(backupsRoot, { withFileTypes: true })
  } catch {
    return paths
  }
  for (const ver of versions) {
    if (!ver.isDirectory()) continue
    const verDir = join(backupsRoot, ver.name)
    let ids
    try {
      ids = await readdir(verDir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const id of ids) {
      if (!id.isDirectory()) continue
      const candidate = join(verDir, id.name, 'settings.yaml')
      try {
        const info = await stat(candidate)
        if (info.isFile()) paths.push(candidate)
      } catch {
        // Ignore missing settings backup.
      }
    }
  }
  return paths
}

/**
 * Self-heal interrupted atomic writes and NTFS zero-byte / all-NUL corruptions
 * across Desktop `userData` and `dshHome` before startup reads them.
 * Never deletes user data; corrupt files are preserved beside originals.
 */
export async function recoverPowerLossStartupState({
  userData,
  dshHome,
  log = () => {},
  now = Date.now,
} = {}) {
  const restored = []
  const quarantined = []
  const targets = []

  if (typeof userData === 'string' && userData.length > 0) {
    targets.push({
      label: 'desktop-data-location.json',
      path: join(userData, 'desktop-data-location.json'),
      validate: isValidJsonObjectBytes,
      onlyRecoverPowerLossBytes: true,
      quarantineIfCorrupt: false,
    })
    for (const name of [
      'desktop-data-migration.json',
      'desktop-preferences.json',
      'window-state.json',
      'settings-window-state.json',
      'update-check-state.json',
      'update-channel-preferences.json',
      'star-prompt-state.json',
      'release-guide-state.json',
      'dock-nudge-state.json',
      'terminal-shell-preferences.json',
      'product-analytics-state.json',
      'update-analytics-receipt.json',
    ]) {
      targets.push({
        label: name,
        path: join(userData, name),
        validate: isValidJsonObjectBytes,
        quarantineIfCorrupt: true,
      })
    }
  }

  if (typeof dshHome === 'string' && dshHome.length > 0) {
    for (const rel of [
      join('profiles', 'desktop', '.desktop-managed-packages.json'),
      join('profiles', 'desktop', '.dsh-desktop-links.json'),
      join('profiles', 'desktop', '.dsh-desktop-runtime.json'),
      'desktop-control-center.json',
      'skin-center-active.json',
    ]) {
      targets.push({
        label: rel,
        path: join(dshHome, rel),
        validate: isValidJsonObjectBytes,
        quarantineIfCorrupt: true,
      })
    }
    targets.push({
      label: join('profiles', 'desktop', 'package.json'),
      path: join(dshHome, 'profiles', 'desktop', 'package.json'),
      validate: isValidJsonObjectBytes,
      onlyRecoverPowerLossBytes: true,
      quarantineIfCorrupt: false,
    })
    const settingsExtra = await discoverCommunitySettingsBackups(dshHome).catch(() => [])
    targets.push({
      label: 'settings.yaml',
      path: join(dshHome, 'settings.yaml'),
      validate: isValidYamlBytes,
      onlyRecoverPowerLossBytes: true,
      quarantineIfCorrupt: false,
      extraBackupPaths: settingsExtra,
    })
    for (const rel of ['cordis.patch.yml', join('profiles', 'desktop', 'cordis.patch.yml')]) {
      targets.push({
        label: rel,
        path: join(dshHome, rel),
        validate: isValidYamlBytes,
        onlyRecoverPowerLossBytes: true,
        quarantineIfCorrupt: false,
      })
    }
  }

  for (const target of targets) {
    try {
      const result = await recoverAtomicWriteBackup(target.path, {
        validate: target.validate,
        quarantineIfCorrupt: target.quarantineIfCorrupt,
        onlyRecoverPowerLossBytes: target.onlyRecoverPowerLossBytes,
        extraBackupPaths: target.extraBackupPaths,
        now,
      })
      if (result.action === 'restored-backup') {
        restored.push(target.label)
        log(`[startup-recovery] restored ${target.label} from ${result.backup}`)
      } else if (result.action === 'quarantined') {
        quarantined.push(target.label)
        log(`[startup-recovery] quarantined power-loss-corrupt ${target.label}`)
      }
    } catch (error) {
      log(`[startup-recovery] skipped ${target.label}: ${error instanceof Error ? error.name : 'unknown'}`)
    }
  }

  return Object.freeze({ restored, quarantined })
}
