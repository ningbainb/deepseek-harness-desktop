import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  BRIDGE_ROW_ID,
  PINNED_WINDOWS_MCP_VERSION,
  type WinControlSettings,
} from '../core/settings.ts'
import { resolveDshHome } from './settings-store.ts'
import { MIRROR_CANDIDATES, probeMirrors, type MirrorProbeResult } from './mirrors.ts'

export const UV_PYTHON_REQUIREMENT = '>=3.14,<3.15'
export const PROFILE_BLOCK_BEGIN = '# >>> dsh-win-control (machine managed) >>>'
export const PROFILE_BLOCK_END = '# <<< dsh-win-control <<<'
const VERSION_PATTERN = /^[0-9]+(?:\.[0-9]+)+(?:[abrc0-9.+_-]*)?$/u
const PROCESS_SCAN_TIMEOUT_MS = 5000
const SCAN_SCRIPT =
  "$ErrorActionPreference='SilentlyContinue'; Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath } | ForEach-Object { \"$($_.ProcessId)|$($_.ExecutablePath)\" }"

export interface ProcessEntry {
  readonly pid: number
  readonly path: string
}

export interface ManagedVersionInfo {
  readonly version: string
  readonly toolDirectory: string
  readonly executable: string
  readonly installedAt: string | null
  readonly mirror: string | null
}

export interface InstallerSnapshot {
  readonly state: 'idle' | 'probing' | 'installing' | 'succeeded' | 'failed' | 'cancelled'
  readonly version: string
  readonly currentMirror?: string
  readonly message?: string
  readonly error?: string
  readonly executable?: string
  readonly logs: readonly string[]
  readonly mirrors: readonly MirrorProbeResult[]
}

export function managedToolchainRoot(home: string = resolveDshHome()): string {
  return join(home, 'win-control', 'toolchain')
}

export function versionToolRoot(root: string, version: string): string {
  if (!VERSION_PATTERN.test(version)) throw new TypeError(`invalid Windows-MCP version: ${version}`)
  return join(root, version)
}

export function toolDirectoryFor(root: string, version: string): string {
  return join(versionToolRoot(root, version), 'windows-mcp')
}

export function executableIn(toolDir: string): string | null {
  if (!toolDir) return null
  for (const candidate of [
    join(toolDir, 'Scripts', 'windows-mcp.exe'),
    join(toolDir, 'bin', 'windows-mcp.exe'),
    join(toolDir, 'bin', 'windows-mcp'),
  ]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

export function managedExecutable(root: string, version: string = PINNED_WINDOWS_MCP_VERSION): string | null {
  return executableIn(toolDirectoryFor(root, version))
}

export function readManifest(root: string, version: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(join(versionToolRoot(root, version), 'manifest.json'), 'utf8'))
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function writeManifest(root: string, version: string, payload: Record<string, unknown> = {}): Record<string, unknown> {
  const dir = versionToolRoot(root, version)
  mkdirSync(dir, { recursive: true })
  const manifest = {
    version,
    installedAt: new Date().toISOString(),
    executable: managedExecutable(root, version),
    ...payload,
  }
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return manifest
}

function compareVersionDesc(left: string, right: string): number {
  const parts = (v: string) => v.split(/[.+-]/u).map(p => (/^\d+$/u.test(p) ? Number(p) : p))
  const a = parts(left)
  const b = parts(right)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x === y) continue
    if (typeof x === 'number' && typeof y === 'number') return y - x
    return String(y).localeCompare(String(x))
  }
  return 0
}

export function listManagedVersions(root: string = managedToolchainRoot()): ManagedVersionInfo[] {
  let dirs: string[] = []
  try {
    dirs = readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && VERSION_PATTERN.test(entry.name))
      .map(entry => entry.name)
  } catch {
    return []
  }
  return dirs
    .map((version) => {
      const toolDirectory = toolDirectoryFor(root, version)
      const executable = executableIn(toolDirectory)
      if (!executable) return null
      const manifest = readManifest(root, version)
      return {
        version,
        toolDirectory,
        executable,
        installedAt: typeof manifest?.installedAt === 'string' ? manifest.installedAt : null,
        mirror: typeof manifest?.mirror === 'string' ? manifest.mirror : null,
      }
    })
    .filter((entry): entry is ManagedVersionInfo => entry !== null)
    .sort((a, b) => compareVersionDesc(a.version, b.version))
}

export function parseProcessLines(text: string): ProcessEntry[] {
  if (!text) return []
  const out: ProcessEntry[] = []
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim()
    const sep = trimmed.indexOf('|')
    if (sep <= 0) continue
    const pid = Number(trimmed.slice(0, sep))
    const path = trimmed.slice(sep + 1).trim()
    if (!Number.isInteger(pid) || pid <= 0 || !path) continue
    out.push({ pid, path })
  }
  return out
}

function comparableWinPath(value: string, platform: NodeJS.Platform = process.platform): string {
  const normalized = value.replace(/\//gu, '\\').replace(/\\+$/u, '')
  return platform === 'win32' ? normalized.toLowerCase() : normalized
}

export function processesUnder(root: string, entries: readonly ProcessEntry[], platform: NodeJS.Platform = process.platform): ProcessEntry[] {
  if (!root) return []
  const wanted = comparableWinPath(root, platform)
  if (!wanted) return []
  const prefix = wanted.endsWith('\\') ? wanted : `${wanted}\\`
  return entries.filter((entry) => {
    const actual = comparableWinPath(entry.path, platform)
    return actual === wanted || actual.startsWith(prefix)
  })
}

export function listProcesses(options: { timeoutMs?: number; platform?: NodeJS.Platform; spawnImpl?: typeof spawn } = {}): Promise<ProcessEntry[]> {
  const platform = options.platform ?? process.platform
  if (platform !== 'win32') return Promise.resolve([])
  const timeoutMs = options.timeoutMs ?? PROCESS_SCAN_TIMEOUT_MS
  const launcher = options.spawnImpl ?? spawn
  return new Promise((resolve) => {
    let settled = false
    let stdout = ''
    let child: ReturnType<typeof spawn> | null = null
    const finish = (value: ProcessEntry[]) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => {
      try { child?.kill() } catch {}
      finish([])
    }, timeoutMs)
    try {
      child = launcher(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCAN_SCRIPT],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      )
      child.stdout?.setEncoding('utf8')
      child.stdout?.on('data', (chunk: string) => {
        if (stdout.length < 64 * 1024) stdout += chunk
      })
      child.on('error', () => finish([]))
      child.on('close', () => finish(parseProcessLines(stdout)))
    } catch {
      finish([])
    }
  })
}

function yamlScalar(value: unknown): string {
  return JSON.stringify(String(value))
}

export function buildBridgeOverrideBlock(
  executable: string,
  settings: WinControlSettings,
  version: string = PINNED_WINDOWS_MCP_VERSION,
): string {
  const args = ['serve']
  if (settings.bridge.excludeTools.length > 0) {
    args.push('--exclude-tools', settings.bridge.excludeTools.join(','))
  }
  const envEntries: Record<string, string> = {
    ANONYMIZED_TELEMETRY: 'false',
    WINDOWS_MCP_DISABLE_FLASH: settings.bridge.disableFlash ? '1' : '0',
    WINDOWS_MCP_SCREENSHOT_SCALE: String(settings.bridge.screenshotScale),
    WINDOWS_MCP_VERSION: version,
  }
  if (settings.bridge.screenshotBackend !== 'auto') {
    envEntries.WINDOWS_MCP_SCREENSHOT_BACKEND = settings.bridge.screenshotBackend
  }
  const argsYaml = args.map(item => `      - ${yamlScalar(item)}`).join('\n')
  const envYaml = Object.entries(envEntries)
    .map(([key, val]) => `      ${key}: ${yamlScalar(val)}`)
    .join('\n')

  return [
    PROFILE_BLOCK_BEGIN,
    `- id: ${BRIDGE_ROW_ID}`,
    '  disabled: false',
    '  config:',
    `    command: ${yamlScalar(executable)}`,
    '    args:',
    argsYaml,
    `    toolCallTimeoutMs: ${settings.bridge.toolCallTimeoutMs}`,
    '    failOnStartupError: false',
    '    env:',
    envYaml,
    PROFILE_BLOCK_END,
  ].join('\n')
}

/** Idempotently insert or replace the machine-managed bridge override block in a profile patch YAML. */
export function upsertBridgeOverride(existingYaml: string, block: string, eol: string = '\n'): string {
  const normalized = existingYaml.replace(/\r\n/gu, '\n')
  const startIdx = normalized.indexOf(PROFILE_BLOCK_BEGIN)
  const endIdx = normalized.indexOf(PROFILE_BLOCK_END)
  let next: string
  if (startIdx >= 0 && endIdx > startIdx) {
    const afterEnd = endIdx + PROFILE_BLOCK_END.length
    const before = normalized.slice(0, startIdx).replace(/\s+$/u, '')
    const after = normalized.slice(afterEnd).replace(/^\s+/u, '')
    next = [before, block, after].filter(Boolean).join('\n\n') + '\n'
  } else {
    const trimmed = normalized.trim()
    const prefix = trimmed === '' || trimmed === '[]' ? '' : `${trimmed}\n\n`
    next = `${prefix}${block}\n`
  }
  return eol === '\n' ? next : next.replace(/\n/gu, eol)
}

export function writeBridgeOverrideFile(
  profileDir: string,
  executable: string,
  settings: WinControlSettings,
  version: string = PINNED_WINDOWS_MCP_VERSION,
): string {
  const patchPath = join(profileDir, 'cordis.patch.yml')
  const existing = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : '[]\n'
  const block = buildBridgeOverrideBlock(executable, settings, version)
  const updated = upsertBridgeOverride(existing, block)
  mkdirSync(dirname(patchPath), { recursive: true })
  const tmpPath = `${patchPath}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmpPath, updated, 'utf8')
  try {
    renameSync(tmpPath, patchPath)
  } catch (error) {
    if (existsSync(patchPath)) rmSync(patchPath, { force: true })
    renameSync(tmpPath, patchPath)
    if (!existsSync(patchPath)) throw error
  }
  return patchPath
}

export function resolveActiveProfileDirectory(home: string = resolveDshHome()): string | null {
  const desktopProfile = join(home, 'profiles', 'desktop')
  if (existsSync(join(desktopProfile, 'package.json'))) return desktopProfile
  const profilesDir = join(home, 'profiles')
  try {
    const entries = readdirSync(profilesDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && existsSync(join(profilesDir, entry.name, 'package.json'))) {
        return join(profilesDir, entry.name)
      }
    }
  } catch {}
  return existsSync(profilesDir) ? desktopProfile : null
}

function appendLog(logs: string[], line: string): void {
  logs.push(line)
  if (logs.length > 80) logs.splice(0, logs.length - 80)
}

export interface ToolchainInstallerOptions {
  home?: string
  spawnImpl?: typeof spawn
  probeMirrorsImpl?: typeof probeMirrors
  listProcessesImpl?: typeof listProcesses
  writeOverrideImpl?: typeof writeBridgeOverrideFile
}

export function createToolchainInstaller(options: ToolchainInstallerOptions = {}) {
  const home = options.home ?? resolveDshHome()
  const toolchainRoot = managedToolchainRoot(home)
  const spawnImpl = options.spawnImpl ?? spawn
  const probeMirrorsImpl = options.probeMirrorsImpl ?? probeMirrors
  const listProcessesImpl = options.listProcessesImpl ?? listProcesses
  const writeOverrideImpl = options.writeOverrideImpl ?? writeBridgeOverrideFile

  let activeChild: ReturnType<typeof spawn> | null = null
  let cancelRequested = false
  let runningPromise: Promise<InstallerSnapshot> | null = null
  let snapshot: InstallerSnapshot = {
    state: 'idle',
    version: PINNED_WINDOWS_MCP_VERSION,
    logs: [],
    mirrors: [],
  }

  function update(patch: Partial<InstallerSnapshot>) {
    snapshot = { ...snapshot, ...patch, logs: [...snapshot.logs] }
  }

  function runUvInstall(version: string, indexUrl: string, toolDir: string, logs: string[]): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      const env = {
        ...process.env,
        UV_TOOL_DIR: toolDir,
        UV_PYTHON_INSTALL_DIR: join(home, 'win-control', 'python'),
      }
      const args = [
        'tool',
        'install',
        '--force',
        '--python',
        UV_PYTHON_REQUIREMENT,
        '--index-url',
        indexUrl,
        `windows-mcp==${version}`,
      ]
      let child: ReturnType<typeof spawn>
      try {
        child = spawnImpl('uv', args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      } catch (error) {
        resolve({ ok: false, error: error instanceof Error ? error.message : String(error) })
        return
      }
      activeChild = child
      const collect = (chunk: Buffer | string) => {
        for (const line of String(chunk).split(/\r?\n/u)) {
          const trimmed = line.trim()
          if (trimmed) appendLog(logs, trimmed)
        }
        update({ logs: [...logs] })
      }
      child.stdout?.on('data', collect)
      child.stderr?.on('data', collect)
      child.on('error', (error: Error) => {
        activeChild = null
        resolve({ ok: false, error: error.message })
      })
      child.on('close', (code: number | null) => {
        activeChild = null
        resolve(code === 0 ? { ok: true } : { ok: false, error: `uv 退出码 ${String(code ?? 'unknown')}` })
      })
    })
  }

  async function start(params: {
    version?: string
    settings: WinControlSettings
    profileDir?: string | null
  }): Promise<InstallerSnapshot> {
    if (runningPromise) return snapshot
    const version = params.version ?? PINNED_WINDOWS_MCP_VERSION
    cancelRequested = false
    const logs: string[] = []
    snapshot = { state: 'probing', version, message: '检查运行中进程与镜像测速...', logs, mirrors: [] }

    runningPromise = (async () => {
      try {
        const targetToolRoot = versionToolRoot(toolchainRoot, version)
        const running = processesUnder(targetToolRoot, await listProcessesImpl())
        if (running.length > 0) {
          const msg = `检测到 windows-mcp 仍在运行（PID: ${running.map(p => p.pid).join(', ')}），请先停止后再安装或覆盖。`
          appendLog(logs, msg)
          update({ state: 'failed', error: msg, message: msg, logs })
          return snapshot
        }

        const mirrors = await probeMirrorsImpl({ version })
        update({ mirrors })
        if (cancelRequested) {
          update({ state: 'cancelled', message: '已取消安装', logs })
          return snapshot
        }

        const preferredId = params.settings.plugin.preferredMirror
        const orderedCandidates = (() => {
          const usable = mirrors.filter(m => m.ok)
          const list = usable.length > 0 ? usable : MIRROR_CANDIDATES.map(c => ({ ...c, ok: false }))
          if (preferredId !== 'auto') {
            const preferred = list.find(m => m.id === preferredId)
            if (preferred) return [preferred, ...list.filter(m => m.id !== preferredId)]
          }
          return list
        })()

        let installedExe: string | null = null
        let usedMirrorId: string | null = null
        let lastError = '所有 PyPI 镜像均安装失败'

        for (const candidate of orderedCandidates) {
          if (cancelRequested) {
            update({ state: 'cancelled', message: '已取消安装', logs })
            return snapshot
          }
          update({
            state: 'installing',
            currentMirror: candidate.label,
            message: `正在通过 ${candidate.label} 安装 windows-mcp@${version}...`,
          })
          appendLog(logs, `[${candidate.id}] uv tool install windows-mcp==${version} (${candidate.indexUrl})`)
          const res = await runUvInstall(version, candidate.indexUrl, targetToolRoot, logs)
          if (res.ok) {
            installedExe = managedExecutable(toolchainRoot, version)
            if (installedExe) {
              usedMirrorId = candidate.id
              break
            }
            lastError = '安装命令完成，但未找到 windows-mcp 可执行文件'
          } else {
            lastError = res.error ?? lastError
          }
        }

        if (cancelRequested) {
          update({ state: 'cancelled', message: '已取消安装', logs })
          return snapshot
        }

        if (!installedExe) {
          update({ state: 'failed', error: lastError, message: `安装失败：${lastError}`, logs })
          return snapshot
        }

        writeManifest(toolchainRoot, version, { mirror: usedMirrorId })
        const profileDir = params.profileDir === undefined ? resolveActiveProfileDirectory(home) : params.profileDir
        if (profileDir) {
          const patchPath = writeOverrideImpl(profileDir, installedExe, params.settings, version)
          appendLog(logs, `已写入 Profile 配置块：${patchPath}`)
        }
        update({
          state: 'succeeded',
          executable: installedExe,
          message: `已安装 windows-mcp@${version}，重启 DSH 后 MCP 桌面操控桥将自动激活。`,
          error: undefined,
          logs,
        })
        return snapshot
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        update({ state: 'failed', error: msg, message: `安装异常：${msg}`, logs })
        return snapshot
      } finally {
        runningPromise = null
      }
    })()

    return runningPromise
  }

  function cancel(): InstallerSnapshot {
    if (!runningPromise) return snapshot
    cancelRequested = true
    try { activeChild?.kill() } catch {}
    update({ state: 'cancelled', message: '正在取消安装...' })
    return snapshot
  }

  return {
    getSnapshot: (): InstallerSnapshot => ({ ...snapshot, logs: [...snapshot.logs], mirrors: [...snapshot.mirrors] }),
    start,
    cancel,
    toolchainRoot,
  }
}
