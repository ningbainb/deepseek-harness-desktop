import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  SETTINGS_FILE,
  defaultSettings,
  normalizeSettings,
  type FastOpsSettings,
} from '../core/settings.ts'

export function resolveDshHome(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = String(env.DSH_HOME ?? '').trim()
  return fromEnv === '' ? join(homedir(), '.dsh') : fromEnv
}

export function settingsFilePath(home: string = resolveDshHome()): string {
  return join(home, SETTINGS_FILE)
}

export async function readSettings(home: string = resolveDshHome()): Promise<FastOpsSettings> {
  try {
    const raw = await readFile(settingsFilePath(home), 'utf8')
    return normalizeSettings(JSON.parse(raw)).settings
  } catch {
    return defaultSettings()
  }
}

export async function writeSettingsAtomic(
  input: unknown,
  home: string = resolveDshHome(),
  platform: NodeJS.Platform = process.platform,
): Promise<{ settings: FastOpsSettings; problems: string[] }> {
  const normalized = normalizeSettings(input)
  const target = settingsFilePath(home)
  await mkdir(dirname(target), { recursive: true })
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const tmpPath = `${target}.tmp-${suffix}`
  const backupPath = `${target}.backup-${suffix}`
  const content = `${JSON.stringify(normalized.settings, null, 2)}\n`

  await writeFile(tmpPath, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  let backedUp = false
  try {
    try {
      await rename(target, backupPath)
      backedUp = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT' && platform !== 'win32') throw error
    }
    await rename(tmpPath, target).catch(async (error) => {
      if (platform !== 'win32' || (error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error
      if (!backedUp) {
        await rename(target, backupPath)
        backedUp = true
      }
      await rename(tmpPath, target)
    })
    if (backedUp) await rm(backupPath, { force: true })
  } catch (error) {
    await rm(tmpPath, { force: true }).catch(() => {})
    if (backedUp) await rename(backupPath, target).catch(() => {})
    throw error
  }
  return normalized
}
