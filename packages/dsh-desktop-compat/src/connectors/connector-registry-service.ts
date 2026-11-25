import { spawn, type ChildProcess } from 'node:child_process'
import { accessSync, constants, existsSync } from 'node:fs'
import { chmod, copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { loadBuiltinCatalog } from './builtin-catalog.ts'
import { ConnectorSecretVault } from './secret-vault.ts'
import {
  WORK_OFFICE_PRESET_ID,
  type ConnectorCatalogDocument,
  type ConnectorCatalogEntry,
  type ConnectorDiagnosticResult,
  type ConnectorDriverSpec,
  type ConnectorEnvironmentDiagnostic,
  type ConnectorInstallResult,
  type ConnectorLoginSession,
  type ConnectorPersistedConfigFile,
  type ConnectorRiskLevel,
  type ConnectorRiskMatch,
  type ConnectorRuntimeItem,
  type ConnectorStateSnapshot,
  type ConnectorStatus,
  type ConnectorUserConfig,
} from './types.ts'

interface McpManagerLike {
  register?(name: string, entry: {
    transport: 'stdio' | 'streamable-http'
    command?: string
    args?: string[]
    env?: Record<string, string>
    url?: string
    headers?: Record<string, string>
    toolLoading?: 'eager' | 'on-demand'
    startupTimeoutMs?: number
    oauth?: { credentialKey: string; scope?: string }
  }): () => void
  probe?(name: string): Promise<{ ok?: boolean; error?: string }>
}

interface SkillRegistryLike {
  registerProvider?(factory: (control: { invalidate(): void }) => {
    name: string
    discover(): Promise<{ candidates: Array<Record<string, unknown>>; complete: boolean }>
    get(locator: unknown): Promise<Record<string, unknown> | undefined>
  }): () => void
}

interface SystemPromptLike {
  section?(options: {
    name: string
    order?: number
    text: (assembly: unknown) => string
  }): () => void
}

export interface LoginChildProcessLike {
  stdout?: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown } | null
  stderr?: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown } | null
  once(event: 'close', listener: (code: number | null) => void): unknown
  once(event: 'error', listener: (error: Error) => void): unknown
  kill?(signal?: NodeJS.Signals | number): boolean
}

export interface ConnectorInstallRunnerSpec {
  connectorId: string
  kind: 'npm' | 'github-release' | 'skill'
  target: string
  managedDir: string
  binary?: string
  assetTemplates?: Record<string, string>
}

export interface ConnectorRegistryDeps {
  dshHome?: string
  platform?: NodeJS.Platform
  probeCli?: (command: string, args: string[], timeoutMs: number, env?: NodeJS.ProcessEnv) => Promise<{ ok: boolean; stdout: string; stderr: string }>
  installRunner?: (spec: ConnectorInstallRunnerSpec) => Promise<{ ok: boolean; binaryPath?: string; version?: string; sourceUsed?: string; error?: string }>
  loginLauncher?: (command: string, args: string[], env: NodeJS.ProcessEnv) => LoginChildProcessLike
  secretVault?: ConnectorSecretVault
}

export function resolveConnectorsHome(explicitHome?: string): string {
  if (explicitHome && explicitHome.trim().length > 0) return explicitHome
  const envHome = process.env.DSH_HOME
  if (envHome && envHome.trim().length > 0) return envHome.trim()
  return join(homedir(), '.dsh')
}

function defaultUserConfig(entry: ConnectorCatalogEntry): ConnectorUserConfig {
  return {
    enabled: false,
    selectedDriverId: entry.drivers[0]?.id,
    activeProfileId: 'default',
    profiles: { default: { id: 'default' } },
    consentAccepted: false,
  }
}

async function atomicWriteUtf8(filePath: string, content: string): Promise<void> {
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

function isExecutableFile(target: string, platform: NodeJS.Platform): boolean {
  if (!isAbsolute(target) || !existsSync(target)) return false
  if (platform === 'win32') return /\.(?:exe|cmd|bat)$/iu.test(target)
  try {
    accessSync(target, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function binaryCandidates(binary: string, platform: NodeJS.Platform): string[] {
  if (platform === 'win32') {
    return binary.endsWith('.exe') ? [binary] : [`${binary}.exe`, `${binary}.cmd`, binary]
  }
  return [binary]
}

const DIRECT_NATIVE_PATHS: Record<string, (pkgRoot: string, arch: string) => string[]> = {
  'lark-cli': (pkgRoot) => [join(pkgRoot, 'node_modules', '@larksuite', 'cli', 'bin', 'lark-cli.exe')],
  tmeet: (pkgRoot, arch) => [
    join(pkgRoot, 'node_modules', '@tencentcloud', 'tmeet', 'dist', arch === 'arm64' ? 'tmeet-Windows-ARM64.exe' : 'tmeet-Windows-x86_64.exe'),
    join(pkgRoot, 'node_modules', '@tencentcloud', 'tmeet', 'dist', 'tmeet-Windows-x86_64.exe'),
  ],
  'wecom-cli': (pkgRoot, arch) => [
    join(pkgRoot, 'node_modules', `@wecom/cli-win32-${arch === 'arm64' ? 'arm64' : 'x64'}`, 'wecom-cli.exe'),
    join(pkgRoot, 'node_modules', `@wecom/cli-win32-${arch === 'arm64' ? 'arm64' : 'x64'}`, 'bin', 'wecom-cli.exe'),
    join(pkgRoot, 'node_modules', '@wecom', 'cli', 'bin', 'wecom-cli.exe'),
  ],
}

function findManagedBinary(
  homeDir: string,
  connectorId: string,
  binary: string,
  platform: NodeJS.Platform,
): string | undefined {
  const pkgRoot = join(homeDir, 'connectors', 'packages', connectorId)
  if (platform === 'win32') {
    const directFn = DIRECT_NATIVE_PATHS[binary]
    if (directFn) {
      for (const candidate of directFn(pkgRoot, process.arch)) {
        if (isExecutableFile(candidate, platform)) return candidate
      }
    }
  }
  const candidates = binaryCandidates(binary, platform)
  const dirs = [
    join(pkgRoot, 'bin'),
    join(pkgRoot, 'node_modules', '.bin'),
  ]
  for (const dir of dirs) {
    for (const file of candidates) {
      const full = join(dir, file)
      if (isExecutableFile(full, platform)) return full
    }
  }
  return undefined
}

export async function unwrapWindowsCmdToNode(cmdPath: string): Promise<string | undefined> {
  if (!/\.(?:cmd|bat)$/iu.test(cmdPath) || !existsSync(cmdPath)) return undefined
  try {
    const content = await readFile(cmdPath, 'utf8')
    const binDir = dirname(cmdPath)
    // Match pnpm/npm generated Windows .cmd shims pointing at node_modules script files via %dp0% or %~dp0
    const match = /"(?:%dp0%|%~dp0)[\\/]([^"]+\.(?:cjs|mjs|js))"/iu.exec(content)
    if (!match) return undefined
    const candidate = join(binDir, match[1].replace(/\\/gu, '/'))
    return existsSync(candidate) ? candidate : undefined
  } catch {
    return undefined
  }
}

export async function resolveDirectCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): Promise<{ command: string; args: string[]; env: NodeJS.ProcessEnv; shell: boolean }> {
  if (platform === 'win32' && /\.(?:cmd|bat)$/iu.test(command)) {
    const unwrapped = await unwrapWindowsCmdToNode(command)
    if (unwrapped) {
      return {
        command: process.execPath,
        args: [unwrapped, ...args],
        env: {
          ...env,
          ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        },
        shell: false,
      }
    }
    return { command, args, env, shell: true }
  }
  return { command, args, env, shell: false }
}

function findBinaryOnPath(binary: string, platform: NodeJS.Platform): string | undefined {
  const candidates = binaryCandidates(binary, platform)
  const dirs = (process.env.PATH ?? '').split(platform === 'win32' ? ';' : ':').filter(Boolean)
  for (const dir of dirs) {
    for (const file of candidates) {
      const full = join(dir, file)
      if (isExecutableFile(full, platform)) return full
    }
  }
  return undefined
}

export async function ensureManagedNodeShim(
  homeDir: string,
  platform: NodeJS.Platform = process.platform,
  execPath: string = process.execPath,
  isElectronRuntime: boolean = Boolean(process.versions.electron),
): Promise<string> {
  const binDir = join(homeDir, 'connectors', 'bin')
  await mkdir(binDir, { recursive: true })
  if (platform === 'win32') {
    const shimPath = join(binDir, 'node.cmd')
    let commandLine = `"${execPath}" %*`
    if (/[\u0080-\uFFFF%]/u.test(execPath)) {
      const psScriptPath = join(binDir, 'dsh-node-unicode.ps1')
      const psLines = [
        isElectronRuntime ? "$env:ELECTRON_RUN_AS_NODE = '1'" : '',
        `& '${execPath.replace(/'/gu, "''")}' @args`,
        'exit $LASTEXITCODE',
      ].filter(Boolean)
      await writeFile(psScriptPath, `\uFEFF${psLines.join('\r\n')}\r\n`, 'utf8')
      commandLine = '"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0dsh-node-unicode.ps1" %*'
    }
    const lines = [
      '@echo off',
      'setlocal',
      isElectronRuntime ? 'set ELECTRON_RUN_AS_NODE=1' : '',
      commandLine,
    ].filter(Boolean)
    await writeFile(shimPath, `${lines.join('\r\n')}\r\n`, 'utf8')
    return binDir
  }

  const shimPath = join(binDir, 'node')
  const quoted = `'${execPath.replace(/'/gu, "'\\''")}'`
  const lines = [
    '#!/bin/sh',
    isElectronRuntime ? 'export ELECTRON_RUN_AS_NODE=1' : '',
    `exec ${quoted} "$@"`,
  ].filter(Boolean)
  await writeFile(shimPath, `${lines.join('\n')}\n`, 'utf8')
  await chmod(shimPath, 0o755)
  return binDir
}

export function withManagedBinPath(
  baseEnv: NodeJS.ProcessEnv,
  binDir: string,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const sep = platform === 'win32' ? ';' : ':'
  const nextEnv: NodeJS.ProcessEnv = { ...baseEnv }
  const pathKey = platform === 'win32'
    ? (Object.keys(nextEnv).find(key => key.toLowerCase() === 'path') ?? 'PATH')
    : 'PATH'
  const existing = nextEnv[pathKey] ?? nextEnv.PATH ?? ''
  const parts = existing.split(sep).filter(Boolean)
  const deduped = [binDir, ...parts.filter(part => part.toLowerCase() !== binDir.toLowerCase())]
  nextEnv[pathKey] = deduped.join(sep)
  if (pathKey !== 'PATH') nextEnv.PATH = nextEnv[pathKey]
  return nextEnv
}

export function resolveBundledPnpmCli(platform: NodeJS.Platform = process.platform): string | undefined {
  const pnpmRelCandidates = [
    'pnpm/bin/pnpm.mjs',
    'pnpm/bin/pnpm.cjs',
    'pnpm/dist/pnpm.mjs',
    'pnpm/dist/pnpm.cjs',
  ]
  const req = createRequire(import.meta.url)
  for (const spec of pnpmRelCandidates) {
    try {
      const resolved = req.resolve(spec)
      if (resolved && existsSync(resolved)) return resolved
    } catch {
      // Try unpacked filesystem candidates below.
    }
  }
  const probeRoots: string[] = []
  const resourcesPath = (process as { resourcesPath?: string }).resourcesPath
  if (typeof resourcesPath === 'string' && resourcesPath.length > 0) {
    probeRoots.push(join(resourcesPath, 'app.asar.unpacked'), resourcesPath)
  }
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 7; i += 1) {
    probeRoots.push(dir, join(dir, 'apps', 'dsh-desktop'))
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  for (const root of probeRoots) {
    for (const rel of pnpmRelCandidates) {
      const candidate = join(root, 'node_modules', rel)
      if (existsSync(candidate)) return candidate
    }
  }
  return findBinaryOnPath('pnpm', platform)
}

export function classifyInstallError(rawError: string): { zh: string; en: string } {
  const text = rawError.trim()
  if (/\b(?:ENOENT|EINVAL|not recognized as an internal or external command)\b|exited with code 1\b|npm\.cmd/iu.test(text) && !/https?:\/\/|\b(?:ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|404|E404)\b/iu.test(text)) {
    return {
      zh: '本机包管理器或 Node 运行时不可用，未能完成自动安装，请查看下方原始日志或前往官网手动安装。',
      en: 'Package manager or Node runtime is unavailable on this machine. Check diagnostic log or install from official docs.',
    }
  }
  if (/\b(?:404|E404|ERR_PNPM_FETCH_404|Not Found)\b|HTTP 404/iu.test(text)) {
    return {
      zh: '包仓库暂未找到该官方组件包，请查看下方原始日志或前往官方页面下载安装包。',
      en: 'Package was not found in registry. Check diagnostic log or open the official download page.',
    }
  }
  if (/\b(?:ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ERR_PNPM_META_FETCH_FAIL)\b|timed\s+out|fetch\s+failed|certificate|ssl/iu.test(text)) {
    return {
      zh: '无法连接包仓库，请检查当前网络或代理设置后重试，也可前往官方页面下载。',
      en: 'Could not reach package registry. Check network/proxy settings and retry, or open the official download page.',
    }
  }
  return {
    zh: '自动安装官方组件未完成，可展开下方「查看原始日志」查看原因，或前往官方页面手动安装。',
    en: 'Automatic installation did not complete. Expand Diagnostic log below or open official install docs.',
  }
}

async function runSimpleProcess(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; shell?: boolean; timeoutMs?: number } = {},
): Promise<{ ok: boolean; error?: string }> {
  return await new Promise((resolvePromise) => {
    let settled = false
    const finish = (result: { ok: boolean; error?: string }): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise(result)
    }
    let child: ChildProcess
    try {
      child = spawn(command, args, {
        ...(options.cwd ? { cwd: options.cwd } : {}),
        ...(options.env ? { env: options.env } : {}),
        shell: options.shell ?? false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      finish({ ok: false, error: error instanceof Error ? error.message : String(error) })
      return
    }
    let output = ''
    const append = (chunk: Buffer): void => {
      if (output.length < 16_384) output += chunk.toString('utf8')
    }
    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      finish({ ok: false, error: `${command} timed out` })
    }, options.timeoutMs ?? 120_000)
    child.once('error', (error: Error) => {
      finish({ ok: false, error: error.message })
    })
    child.once('close', (code: number | null) => {
      finish(code === 0 ? { ok: true } : { ok: false, error: output.trim() || `${command} exited with code ${code}` })
    })
  })
}

async function findExtractedFile(rootDir: string, candidates: string[], depth = 0): Promise<string | undefined> {
  if (depth > 4 || !existsSync(rootDir)) return undefined
  const entries = await readdir(rootDir, { withFileTypes: true })
  const lowerCandidates = new Set(candidates.map(c => c.toLowerCase()))
  for (const entry of entries) {
    if (entry.isFile() && lowerCandidates.has(entry.name.toLowerCase())) {
      return join(rootDir, entry.name)
    }
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nested = await findExtractedFile(join(rootDir, entry.name), candidates, depth + 1)
      if (nested) return nested
    }
  }
  return undefined
}

async function runGithubReleaseInstallAttempt(
  spec: ConnectorInstallRunnerSpec,
  platform: NodeJS.Platform,
  childEnv: NodeJS.ProcessEnv,
): Promise<{ ok: boolean; binaryPath?: string; sourceUsed?: string; error?: string }> {
  const platformKey = `${platform}-${process.arch}`
  const assetName = spec.assetTemplates?.[platformKey]
  if (!assetName) {
    return { ok: false, error: `no release asset template for ${platformKey}` }
  }
  const downloadUrl = `https://github.com/${spec.target}/releases/latest/download/${assetName}`
  const archivePath = join(spec.managedDir, assetName)
  const binDir = join(spec.managedDir, 'bin')
  await mkdir(binDir, { recursive: true })

  try {
    const response = await fetch(downloadUrl, {
      headers: { 'user-agent': 'deepseek-harness-desktop' },
      redirect: 'follow',
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status} downloading ${downloadUrl}` }
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    await writeFile(archivePath, buffer)
  } catch (error) {
    return { ok: false, error: `fetch failed for ${downloadUrl}: ${error instanceof Error ? error.message : String(error)}` }
  }

  let extracted: { ok: boolean; error?: string }
  if (/\.zip$/iu.test(assetName)) {
    if (platform === 'win32') {
      extracted = await runSimpleProcess('tar.exe', ['-xf', archivePath, '-C', binDir], { env: childEnv })
      if (!extracted.ok) {
        const escSrc = archivePath.replace(/'/gu, "''")
        const escDst = binDir.replace(/'/gu, "''")
        extracted = await runSimpleProcess(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${escSrc}' -DestinationPath '${escDst}' -Force`],
          { env: childEnv },
        )
      }
    } else {
      extracted = await runSimpleProcess('unzip', ['-o', archivePath, '-d', binDir], { env: childEnv })
    }
  } else {
    extracted = await runSimpleProcess(platform === 'win32' ? 'tar.exe' : 'tar', ['-xzf', archivePath, '-C', binDir], { env: childEnv })
  }
  await rm(archivePath, { force: true }).catch(() => {})
  if (!extracted.ok) {
    return { ok: false, error: `extract failed for ${assetName}: ${extracted.error}` }
  }

  const binary = spec.binary ?? spec.connectorId
  const candidates = binaryCandidates(binary, platform)
  const direct = candidates.map(name => join(binDir, name)).find(path => existsSync(path))
  let resolvedPath = direct
  if (!resolvedPath) {
    const nested = await findExtractedFile(binDir, candidates)
    if (nested) {
      const targetName = platform === 'win32' ? (binary.endsWith('.exe') ? binary : `${binary}.exe`) : binary
      const promoted = join(binDir, targetName)
      await copyFile(nested, promoted)
      resolvedPath = promoted
    }
  }
  if (!resolvedPath) {
    return { ok: false, error: `extracted ${assetName} but executable ${binary} was not found` }
  }
  if (platform !== 'win32') {
    await chmod(resolvedPath, 0o755).catch(() => {})
  }
  return { ok: true, binaryPath: resolvedPath, sourceUsed: 'github-release' }
}

async function runPackageNodePostinstall(
  managedDir: string,
  pkg: string,
  childEnv: NodeJS.ProcessEnv,
): Promise<{ ok: boolean; error?: string }> {
  const pkgName = pkg.startsWith('@')
    ? pkg.replace(/^(?:@[^/]+\/[^@]+)(?:@.*)?$/u, m => m.split(/(?<=[^/])@/u)[0])
    : pkg.split('@')[0]
  const pkgDir = join(managedDir, 'node_modules', pkgName)
  const manifestPath = join(pkgDir, 'package.json')
  if (!existsSync(manifestPath)) return { ok: true }
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      scripts?: Record<string, string>
    }
    const postinstall = manifest.scripts?.postinstall?.trim()
    if (!postinstall) return { ok: true }
    const match = /^node\s+([^\s;|&<>]+)(?:\s+(.*))?$/u.exec(postinstall)
    if (!match) return { ok: true }
    const scriptPath = join(pkgDir, match[1])
    if (!existsSync(scriptPath)) return { ok: true }
    const extraArgs = match[2] ? match[2].trim().split(/\s+/u).filter(Boolean) : []
    return await runSimpleProcess(process.execPath, [scriptPath, ...extraArgs], {
      cwd: pkgDir,
      env: childEnv,
      shell: false,
      timeoutMs: 120_000,
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function runPnpmInstallAttempt(
  pnpmCli: string,
  pkg: string,
  managedDir: string,
  platform: NodeJS.Platform,
  childEnv: NodeJS.ProcessEnv,
  registryUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  const isScript = /\.(?:mjs|cjs|js)$/iu.test(pnpmCli)
  const pnpmArgs = [
    'add',
    '--dir',
    managedDir,
    '--ignore-workspace',
    `--allow-build=${pkg}`,
    '--config.strict-dep-builds=false',
    '--config.node-linker=hoisted',
    '--config.ignore-scripts=true',
    '--config.package-import-method=copy',
    `--registry=${registryUrl}`,
    pkg,
  ]
  const command = isScript ? process.execPath : pnpmCli
  const args = isScript ? [pnpmCli, ...pnpmArgs] : pnpmArgs
  const installRes = await runSimpleProcess(command, args, {
    cwd: managedDir,
    env: childEnv,
    shell: !isScript && platform === 'win32' && /\.(?:cmd|bat)$/iu.test(pnpmCli),
    timeoutMs: 120_000,
  })
  if (!installRes.ok) return installRes
  return await runPackageNodePostinstall(managedDir, pkg, childEnv)
}

async function runNpmInstallAttempt(
  pkg: string,
  managedDir: string,
  platform: NodeJS.Platform,
  childEnv: NodeJS.ProcessEnv,
  registryUrl?: string,
): Promise<{ ok: boolean; error?: string }> {
  const npmCmd = platform === 'win32' ? 'npm.cmd' : 'npm'
  const args = ['install', '--prefix', managedDir, '--no-audit', '--no-fund', '--silent', pkg]
  if (registryUrl) args.push(`--registry=${registryUrl}`)
  return await runSimpleProcess(npmCmd, args, {
    cwd: managedDir,
    env: childEnv,
    shell: platform === 'win32',
    timeoutMs: 120_000,
  })
}

async function defaultInstallRunner(
  spec: ConnectorInstallRunnerSpec,
  platform: NodeJS.Platform,
  homeDir: string,
): Promise<{ ok: boolean; binaryPath?: string; version?: string; sourceUsed?: string; error?: string }> {
  await mkdir(spec.managedDir, { recursive: true })
  const binDir = await ensureManagedNodeShim(homeDir, platform)
  const childEnv: NodeJS.ProcessEnv = {
    ...withManagedBinPath(process.env, binDir, platform),
    ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
  }
  if (spec.kind === 'github-release') {
    return await runGithubReleaseInstallAttempt(spec, platform, childEnv)
  }
  if (spec.kind !== 'npm') {
    return { ok: false, error: `unsupported automatic installer kind: ${spec.kind}` }
  }
  const manifestPath = join(spec.managedDir, 'package.json')
  if (!existsSync(manifestPath)) {
    await writeFile(manifestPath, `${JSON.stringify({ name: `dsh-connector-${spec.connectorId}`, private: true }, null, 2)}\n`, 'utf8')
  }
  const pnpmCli = resolveBundledPnpmCli(platform)
  const registries: Array<{ url: string; label: string }> = [
    { url: 'https://registry.npmmirror.com', label: 'npmmirror' },
    { url: 'https://registry.npmjs.org', label: 'npmjs' },
  ]
  const errors: string[] = []
  for (const reg of registries) {
    const attempt = pnpmCli
      ? await runPnpmInstallAttempt(pnpmCli, spec.target, spec.managedDir, platform, childEnv, reg.url)
      : await runNpmInstallAttempt(spec.target, spec.managedDir, platform, childEnv, reg.url)
    if (attempt.ok) return { ok: true, sourceUsed: `${pnpmCli ? 'pnpm' : 'npm'}:${reg.label}` }
    if (attempt.error) errors.push(`[${reg.label}] ${attempt.error}`)
  }
  return { ok: false, error: errors.join('\n\n') }
}

function defaultLoginLauncher(command: string, args: string[], env: NodeJS.ProcessEnv): LoginChildProcessLike {
  if (process.platform === 'win32' && /\.(?:cmd|bat)$/iu.test(command)) {
    // Synchronously try node unwrap or run with windowsHide so cmd.exe never flashes a window.
    return spawn(command, args, {
      env,
      shell: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  }
  return spawn(command, args, {
    env,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function defaultProbeCli(
  command: string,
  args: string[],
  timeoutMs: number,
  env?: NodeJS.ProcessEnv,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const resolved = await resolveDirectCommand(command, args, env ?? process.env)
  return await new Promise((resolvePromise) => {
    let settled = false
    const finish = (result: { ok: boolean; stdout: string; stderr: string }): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise(result)
    }
    let child
    try {
      child = spawn(resolved.command, resolved.args, {
        env: resolved.env,
        shell: resolved.shell,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      finish({ ok: false, stdout: '', stderr: error instanceof Error ? error.message : String(error) })
      return
    }
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < 8192) stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < 8192) stderr += chunk.toString('utf8')
    })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      finish({ ok: false, stdout, stderr: `${stderr}\ncommand timed out`.trim() })
    }, timeoutMs)
    child.once('error', (error: Error) => {
      finish({ ok: false, stdout, stderr: error.message })
    })
    child.once('close', (code: number | null) => {
      finish({ ok: code === 0, stdout, stderr })
    })
  })
}

function safePatternMatch(pattern: string, input: string): boolean {
  try {
    return new RegExp(pattern, 'iu').test(input)
  } catch {
    return input.toLowerCase().includes(pattern.toLowerCase())
  }
}

export function classifyConnectorFailure(
  entry: ConnectorCatalogEntry,
  rawError: string,
): { status: ConnectorStatus; friendlyCause: ConnectorDiagnosticResult['friendlyCause']; friendlyFix: ConnectorDiagnosticResult['friendlyFix'] } {
  for (const rule of entry.troubleshooting) {
    if (safePatternMatch(rule.matchPattern, rawError)) {
      const lowerCode = rule.code.toLowerCase()
      const status: ConnectorStatus = lowerCode.includes('admin')
        ? 'awaiting_admin_approval'
        : lowerCode.includes('auth') || lowerCode.includes('token')
          ? 'auth_expired'
          : 'error'
      return { status, friendlyCause: rule.cause, friendlyFix: rule.fix }
    }
  }
  if (/admin|approval|corp\s*deny/iu.test(rawError)) {
    return {
      status: 'awaiting_admin_approval',
      friendlyCause: { zh: '需要企业管理员审批开通该应用权限。', en: 'Organization administrator approval is required.' },
      friendlyFix: { zh: '请联系管理员在开放平台工作台批准授权后再次验证。', en: 'Ask your organization admin to approve the app and verify again.' },
    }
  }
  if (/401|unauthorized|expired|not\s+logged\s+in|login\s+required/iu.test(rawError)) {
    return {
      status: 'auth_expired',
      friendlyCause: { zh: '尚未登录或授权令牌已失效。', en: 'Not signed in or authorization token expired.' },
      friendlyFix: { zh: '按向导重新完成登录授权后再次点击验证连接。', en: 'Complete sign-in in the guide and click Verify connection again.' },
    }
  }
  return {
    status: 'error',
    friendlyCause: { zh: '连接验证未通过，可能是网络不可达或参数有误。', en: 'Connection check failed due to unreachable endpoint or invalid parameters.' },
    friendlyFix: { zh: '请核对网络环境、配置参数，或展开「高级设置与调试」查看原始日志。', en: 'Check network connectivity and parameters, or expand Advanced settings to inspect raw logs.' },
  }
}

export class ConnectorRegistryService {
  private readonly homeDir: string
  private readonly configPath: string
  private readonly platform: NodeJS.Platform
  private readonly probeCli: NonNullable<ConnectorRegistryDeps['probeCli']>
  private readonly installRunner?: ConnectorRegistryDeps['installRunner']
  private readonly loginLauncher: NonNullable<ConnectorRegistryDeps['loginLauncher']>
  private readonly secretVault: ConnectorSecretVault
  private readonly catalog: ConnectorCatalogDocument
  private persisted: ConnectorPersistedConfigFile = { version: 1, connectors: {} }
  private statuses = new Map<string, ConnectorStatus>()
  private diagnostics = new Map<string, ConnectorDiagnosticResult>()
  private mcpDisposers = new Map<string, () => void>()
  private loginSessions = new Map<string, ConnectorLoginSession>()
  private loginChildren = new Map<string, LoginChildProcessLike>()
  private skillControl?: { invalidate(): void }
  private loaded = false

  constructor(private readonly ctx: Context, deps: ConnectorRegistryDeps = {}) {
    this.homeDir = resolveConnectorsHome(deps.dshHome)
    this.configPath = join(this.homeDir, 'connectors', 'config.json')
    this.platform = deps.platform ?? process.platform
    this.probeCli = deps.probeCli ?? defaultProbeCli
    this.installRunner = deps.installRunner
    this.loginLauncher = deps.loginLauncher ?? defaultLoginLauncher
    this.secretVault = deps.secretVault ?? new ConnectorSecretVault(this.homeDir)
    this.catalog = loadBuiltinCatalog()
  }

  async init(): Promise<void> {
    await this.ensureLoaded()
    this.installSkillProvider()
    this.installPromptSection()
    await this.reconcileActiveConnectors()
  }

  dispose(): void {
    for (const child of this.loginChildren.values()) {
      try { child.kill?.('SIGTERM') } catch {}
    }
    this.loginChildren.clear()
    for (const dispose of this.mcpDisposers.values()) {
      try { dispose() } catch {}
    }
    this.mcpDisposers.clear()
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    const raw = await readFile(this.configPath, 'utf8').catch((error) => {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return undefined
      return undefined
    })
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<ConnectorPersistedConfigFile>
        if (parsed.version === 1 && parsed.connectors && typeof parsed.connectors === 'object') {
          this.persisted = { version: 1, connectors: parsed.connectors }
        }
      } catch {
        this.persisted = { version: 1, connectors: {} }
      }
    }
    for (const entry of this.catalog.connectors) {
      const cfg = this.persisted.connectors[entry.id] ?? defaultUserConfig(entry)
      this.persisted.connectors[entry.id] = cfg
      this.statuses.set(entry.id, cfg.enabled ? 'installed_unauthenticated' : 'not_installed')
    }
    this.loaded = true
  }

  private async saveConfig(): Promise<void> {
    const sanitized: ConnectorPersistedConfigFile = { version: 1, connectors: {} }
    for (const [id, cfg] of Object.entries(this.persisted.connectors)) {
      const profiles: ConnectorUserConfig['profiles'] = {}
      for (const [pid, profile] of Object.entries(cfg.profiles ?? {})) {
        profiles[pid] = {
          id: pid,
          ...(profile.label ? { label: profile.label } : {}),
          ...(profile.accountLabel ? { accountLabel: profile.accountLabel } : {}),
          ...(profile.nonSecretFields ? { nonSecretFields: { ...profile.nonSecretFields } } : {}),
        }
      }
      sanitized.connectors[id] = {
        enabled: Boolean(cfg.enabled),
        selectedDriverId: cfg.selectedDriverId,
        customBinaryPath: cfg.customBinaryPath,
        activeProfileId: cfg.activeProfileId || 'default',
        profiles,
        consentAccepted: Boolean(cfg.consentAccepted),
        ...(cfg.pinnedVersion ? { pinnedVersion: cfg.pinnedVersion } : {}),
      }
    }
    await atomicWriteUtf8(this.configPath, `${JSON.stringify(sanitized, null, 2)}\n`)
  }

  private activeDriverFor(entry: ConnectorCatalogEntry, config: ConnectorUserConfig): ConnectorDriverSpec {
    return entry.drivers.find(driver => driver.id === config.selectedDriverId) ?? entry.drivers[0]
  }

  private getEntryOrThrow(connectorId: string): ConnectorCatalogEntry {
    const entry = this.catalog.connectors.find(item => item.id === connectorId)
    if (!entry) throw new Error(`unknown connector: ${connectorId}`)
    return entry
  }

  private installSkillProvider(): void {
    const skills = (this.ctx as { get?: (key: string) => unknown }).get?.('skills') as SkillRegistryLike | undefined
    if (!skills?.registerProvider) return
    const unregister = skills.registerProvider((control) => {
      this.skillControl = control
      return {
        name: 'desktop-connectors',
        discover: async () => ({
          complete: true,
          candidates: this.connectedEntries().map((item) => ({
            name: `connector-${item.entry.id}`,
            description: `${item.entry.name.zh} (${item.entry.name.en}): ${item.entry.summary.zh}`,
            whenToUse: item.entry.examples.map(ex => ex.prompt.zh).join(' / '),
            invocation: { modelInvocable: true, userInvocable: true },
            source: 'bundled',
            provider: 'desktop-connectors',
            rank: 550,
            locator: item.entry.id,
          })),
        }),
        get: async (locator) => {
          const item = this.connectedEntries().find(candidate => candidate.entry.id === locator)
          if (!item) return undefined
          const guide = item.entry.auth.guideSteps.zh.join('\n')
          const examples = item.entry.examples.map(ex => `- ${ex.title.zh}: ${ex.prompt.zh}`).join('\n')
          return {
            name: `connector-${item.entry.id}`,
            description: item.entry.summary.zh,
            invocation: { modelInvocable: true, userInvocable: true },
            source: 'bundled',
            provider: 'desktop-connectors',
            content: `# ${item.entry.name.zh} (${item.entry.name.en})\n\nDriver: ${item.activeDriver.kind} (${item.activeDriver.id})\n\n## Usage\n${guide}\n\n## Examples\n${examples}`,
          }
        },
      }
    })
    this.ctx.effect(() => unregister, 'dsh-connectors: skill provider')
  }

  private installPromptSection(): void {
    const systemPrompt = (this.ctx as { get?: (key: string) => unknown }).get?.('systemPrompt') as SystemPromptLike | undefined
    if (!systemPrompt?.section) return
    const unregister = systemPrompt.section({
      name: 'desktop:connectors-index',
      order: 65,
      text: () => {
        const connected = this.connectedEntries()
        if (connected.length === 0) return ''
        const lines = connected.map((item) =>
          `- ${item.entry.id} (${item.entry.name.zh} / ${item.entry.name.en}, mode=${item.activeDriver.kind}): load skill "connector-${item.entry.id}" or discover its on-demand MCP tools only when the user asks about this service.`)
        return `Connected work-mode services (on-demand only; confirm before mutating/external actions):\n${lines.join('\n')}`
      },
    })
    this.ctx.effect(() => unregister, 'dsh-connectors: compact capability index')
  }

  private async reconcileActiveConnectors(): Promise<void> {
    for (const entry of this.catalog.connectors) {
      const cfg = this.persisted.connectors[entry.id]
      if (!cfg?.enabled) {
        this.unmountMcp(entry.id)
        continue
      }
      if (this.statuses.get(entry.id) === 'connected') {
        await this.mountMcpIfApplicable(entry, cfg)
      }
    }
    this.skillControl?.invalidate()
  }

  private async mountMcpIfApplicable(entry: ConnectorCatalogEntry, cfg: ConnectorUserConfig): Promise<void> {
    const driver = this.activeDriverFor(entry, cfg)
    const mcpManager = (this.ctx as { get?: (key: string) => unknown }).get?.('mcpManager') as McpManagerLike | undefined
    if (!mcpManager?.register) return
    this.unmountMcp(entry.id)
    const serverName = `connector_${entry.id}`
    const profileId = cfg.activeProfileId || 'default'
    const nonSecretFields = cfg.profiles?.[profileId]?.nonSecretFields
    if (driver.kind === 'mcp-remote') {
      const headers = await this.secretVault.resolveTemplates(driver.headersTemplate ?? {}, entry.id, profileId, nonSecretFields)
      const dispose = mcpManager.register(serverName, {
        transport: 'streamable-http',
        url: driver.url,
        headers,
        toolLoading: driver.toolLoading ?? 'on-demand',
        startupTimeoutMs: entry.healthCheck.timeoutMs ?? 15000,
      })
      this.mcpDisposers.set(entry.id, dispose)
    } else if (driver.kind === 'mcp-stdio') {
      const resolvedEnv = await this.secretVault.resolveTemplates(driver.envTemplate ?? {}, entry.id, profileId, nonSecretFields)
      const binDir = await ensureManagedNodeShim(this.homeDir, this.platform).catch(() => join(this.homeDir, 'connectors', 'bin'))
      const env = { ...withManagedBinPath(process.env, binDir, this.platform), ...resolvedEnv } as Record<string, string>
      const managedCommand = findManagedBinary(this.homeDir, entry.id, driver.command, this.platform)
      const dispose = mcpManager.register(serverName, {
        transport: 'stdio',
        command: managedCommand ?? driver.command,
        args: driver.args,
        env,
        toolLoading: driver.toolLoading ?? 'on-demand',
        startupTimeoutMs: entry.healthCheck.timeoutMs ?? 15000,
      })
      this.mcpDisposers.set(entry.id, dispose)
    }
  }

  private unmountMcp(connectorId: string): void {
    const existing = this.mcpDisposers.get(connectorId)
    if (!existing) return
    this.mcpDisposers.delete(connectorId)
    try { existing() } catch {}
  }

  private connectedEntries(): ConnectorRuntimeItem[] {
    return this.catalog.connectors
      .map((entry) => {
        const config = this.persisted.connectors[entry.id] ?? defaultUserConfig(entry)
        const status = this.statuses.get(entry.id) ?? (config.enabled ? 'installed_unauthenticated' : 'not_installed')
        return {
          entry,
          config,
          status,
          activeDriver: this.activeDriverFor(entry, config),
          diagnostic: this.diagnostics.get(entry.id),
        }
      })
      .filter(item => item.config.enabled && item.status === 'connected')
  }

  async snapshot(): Promise<ConnectorStateSnapshot> {
    await this.ensureLoaded()
    const items: ConnectorRuntimeItem[] = await Promise.all(this.catalog.connectors.map(async (entry) => {
      const config = this.persisted.connectors[entry.id] ?? defaultUserConfig(entry)
      const status = this.statuses.get(entry.id) ?? 'not_installed'
      const hasSecrets = await this.secretVault.listPresentKeys(entry.id, config.activeProfileId || 'default')
      return {
        entry,
        config: structuredClone(config),
        status,
        activeDriver: this.activeDriverFor(entry, config),
        diagnostic: this.diagnostics.get(entry.id),
        hasSecrets,
      }
    }))
    return {
      catalogVersion: this.catalog.catalogVersion,
      workOfficePresetId: WORK_OFFICE_PRESET_ID,
      connectedCount: items.filter(item => item.config.enabled && item.status === 'connected').length,
      items,
    }
  }

  async detectEnvironment(connectorId: string): Promise<ConnectorEnvironmentDiagnostic> {
    await this.ensureLoaded()
    const entry = this.getEntryOrThrow(connectorId)
    const cfg = this.persisted.connectors[entry.id] ?? defaultUserConfig(entry)
    const driver = this.activeDriverFor(entry, cfg)

    if (driver.kind === 'mcp-remote') {
      return { installed: true, driverId: driver.id, driverKind: driver.kind, note: 'remote-zero-install' }
    }
    if (driver.kind === 'skill') {
      const skillPath = join(this.homeDir, 'skills', driver.skillName, 'SKILL.md')
      return {
        installed: existsSync(skillPath) || cfg.enabled,
        driverId: driver.id,
        driverKind: driver.kind,
        note: existsSync(skillPath) ? skillPath : 'catalog-managed-skill',
      }
    }
    if (driver.kind === 'cli') {
      const custom = cfg.customBinaryPath?.trim()
      const candidate = custom && isExecutableFile(custom, this.platform)
        ? custom
        : findManagedBinary(this.homeDir, entry.id, driver.binary, this.platform)
          ?? findBinaryOnPath(driver.binary, this.platform)
      if (!candidate) {
        if (!cfg.enabled) this.statuses.set(entry.id, 'not_installed')
        return { installed: false, driverId: driver.id, driverKind: driver.kind }
      }
      const binDir = await ensureManagedNodeShim(this.homeDir, this.platform).catch(() => join(this.homeDir, 'connectors', 'bin'))
      const probeEnv = withManagedBinPath(process.env, binDir, this.platform)
      const probe = await this.probeCli(candidate, driver.versionArgs ?? ['--version'], entry.healthCheck.timeoutMs ?? 8000, probeEnv)
      return {
        installed: probe.ok,
        driverId: driver.id,
        driverKind: driver.kind,
        binaryPath: candidate,
        version: probe.ok ? probe.stdout.trim().split(/\r?\n/u)[0] : undefined,
      }
    }
    const candidate = findManagedBinary(this.homeDir, entry.id, driver.command, this.platform)
      ?? findBinaryOnPath(driver.command, this.platform)
    return {
      installed: Boolean(candidate),
      driverId: driver.id,
      driverKind: driver.kind,
      binaryPath: candidate,
    }
  }

  async installConnector(connectorId: string): Promise<ConnectorInstallResult> {
    await this.ensureLoaded()
    const entry = this.getEntryOrThrow(connectorId)
    const cfg = this.persisted.connectors[entry.id] ?? defaultUserConfig(entry)
    const driver = this.activeDriverFor(entry, cfg)

    if (driver.kind === 'mcp-remote') {
      return { ok: true, skipped: true, installed: true, sourceUsed: 'remote-zero-install' }
    }

    if (driver.kind === 'skill') {
      const skillDir = join(this.homeDir, 'skills', driver.skillName)
      const skillMdPath = join(skillDir, 'SKILL.md')
      if (!existsSync(skillMdPath)) {
        const examples = entry.examples.map(ex => `- ${ex.title.zh}: ${ex.prompt.zh}`).join('\n')
        const skillDoc = [
          `# ${entry.name.zh} (${entry.name.en})`,
          '',
          entry.summary.zh,
          '',
          `Official docs: ${entry.officialUrls.docs}`,
          '',
          '## Examples',
          examples,
          '',
        ].join('\n')
        await atomicWriteUtf8(skillMdPath, skillDoc)
      }
      cfg.enabled = true
      this.persisted.connectors[entry.id] = cfg
      if (this.statuses.get(entry.id) === 'not_installed' || this.statuses.get(entry.id) === 'disabled') {
        this.statuses.set(entry.id, 'installed_unauthenticated')
      }
      await this.saveConfig()
      return { ok: true, installed: true, sourceUsed: 'managed-skill' }
    }

    const existingEnv = await this.detectEnvironment(entry.id)
    if (existingEnv.installed) {
      cfg.enabled = true
      this.persisted.connectors[entry.id] = cfg
      if (this.statuses.get(entry.id) === 'not_installed' || this.statuses.get(entry.id) === 'disabled') {
        this.statuses.set(entry.id, 'installed_unauthenticated')
      }
      await this.saveConfig()
      return {
        ok: true,
        installed: true,
        binaryPath: existingEnv.binaryPath,
        version: existingEnv.version,
        sourceUsed: 'existing',
      }
    }

    const installSource = driver.installSource
    const managedDir = join(this.homeDir, 'connectors', 'packages', entry.id)
    const target = installSource?.package ?? installSource?.repo ?? driver.id

    if (!installSource || (installSource.kind !== 'npm' && installSource.kind !== 'github-release' && !this.installRunner)) {
      return {
        ok: false,
        installed: false,
        fallbackUrl: entry.officialUrls.docs,
        friendlyError: {
          zh: '暂不支持自动安装此驱动，请查看官方安装说明。',
          en: 'Automatic installation is not available for this driver; open official docs.',
        },
      }
    }

    const runnerSpec: ConnectorInstallRunnerSpec = {
      connectorId: entry.id,
      kind: installSource.kind === 'github-release' ? 'github-release' : 'npm',
      target,
      managedDir,
      binary: driver.kind === 'cli' ? driver.binary : driver.command,
      ...(installSource.assetTemplates ? { assetTemplates: installSource.assetTemplates } : {}),
    }

    const runResult = this.installRunner
      ? await this.installRunner(runnerSpec)
      : await defaultInstallRunner(runnerSpec, this.platform, this.homeDir)

    if (!runResult.ok) {
      const rawError = runResult.error?.slice(0, 1200)
      return {
        ok: false,
        installed: false,
        fallbackUrl: entry.officialUrls.docs,
        friendlyError: classifyInstallError(rawError ?? ''),
        rawError,
      }
    }

    const afterEnv = await this.detectEnvironment(entry.id)
    const binaryPath = afterEnv.binaryPath ?? runResult.binaryPath
    const installed = afterEnv.installed || Boolean(binaryPath)
    if (installed) {
      cfg.enabled = true
      this.persisted.connectors[entry.id] = cfg
      if (this.statuses.get(entry.id) !== 'connected') {
        this.statuses.set(entry.id, 'installed_unauthenticated')
      }
      this.diagnostics.delete(entry.id)
      await this.saveConfig()
    }
    return {
      ok: installed,
      installed,
      binaryPath,
      version: afterEnv.version ?? runResult.version,
      sourceUsed: runResult.sourceUsed ?? 'npm',
      ...(!installed ? {
        fallbackUrl: entry.officialUrls.docs,
        friendlyError: {
          zh: '组件安装已完成，但未检测到可执行入口，请检查系统环境或查看文档。',
          en: 'Package installed, but executable entrypoint was not detected.',
        },
      } : {}),
    }
  }

  async configure(
    connectorId: string,
    patch: {
      enabled?: boolean
      selectedDriverId?: string
      customBinaryPath?: string
      activeProfileId?: string
      nonSecretFields?: Record<string, string>
      secretFields?: Record<string, string>
      accountLabel?: string
      consentAccepted?: boolean
    },
  ): Promise<ConnectorStateSnapshot> {
    await this.ensureLoaded()
    const entry = this.getEntryOrThrow(connectorId)
    const current = this.persisted.connectors[entry.id] ?? defaultUserConfig(entry)
    const nextDriver = patch.selectedDriverId && entry.drivers.some(d => d.id === patch.selectedDriverId)
      ? patch.selectedDriverId
      : current.selectedDriverId ?? entry.drivers[0].id
    const profileId = patch.activeProfileId?.trim() || current.activeProfileId || 'default'
    const existingProfile = current.profiles[profileId] ?? { id: profileId }
    const mergedFields = { ...existingProfile.nonSecretFields }
    if (patch.nonSecretFields) {
      const allowedNonSecret = new Set((entry.auth.fields ?? []).filter(f => !f.secret).map(f => f.key))
      for (const [key, val] of Object.entries(patch.nonSecretFields)) {
        if (allowedNonSecret.has(key) && typeof val === 'string') {
          mergedFields[key] = val
        }
      }
    }
    if (patch.secretFields) {
      const allowedSecrets = new Set((entry.auth.fields ?? []).filter(f => f.secret).map(f => f.key))
      for (const [key, val] of Object.entries(patch.secretFields)) {
        if (allowedSecrets.has(key) && typeof val === 'string' && val.trim().length > 0) {
          await this.secretVault.setSecret(entry.id, profileId, key, val)
        }
      }
    }
    const nextConfig: ConnectorUserConfig = {
      ...current,
      ...(patch.enabled !== undefined ? { enabled: Boolean(patch.enabled) } : {}),
      selectedDriverId: nextDriver,
      ...(patch.customBinaryPath !== undefined ? { customBinaryPath: patch.customBinaryPath.trim() } : {}),
      activeProfileId: profileId,
      ...(patch.consentAccepted !== undefined ? { consentAccepted: Boolean(patch.consentAccepted) } : {}),
      profiles: {
        ...current.profiles,
        [profileId]: {
          ...existingProfile,
          ...(patch.accountLabel !== undefined ? { accountLabel: patch.accountLabel } : {}),
          nonSecretFields: mergedFields,
        },
      },
    }
    this.persisted.connectors[entry.id] = nextConfig
    if (!nextConfig.enabled) {
      this.statuses.set(entry.id, 'disabled')
      this.unmountMcp(entry.id)
    } else if (this.statuses.get(entry.id) === 'disabled' || this.statuses.get(entry.id) === 'not_installed') {
      this.statuses.set(entry.id, 'installed_unauthenticated')
    }
    await this.saveConfig()
    if (nextConfig.enabled && this.statuses.get(entry.id) === 'connected') {
      await this.mountMcpIfApplicable(entry, nextConfig)
    }
    this.skillControl?.invalidate()
    return this.snapshot()
  }

  async startLogin(connectorId: string): Promise<ConnectorLoginSession> {
    await this.ensureLoaded()
    const entry = this.getEntryOrThrow(connectorId)
    const cfg = this.persisted.connectors[entry.id] ?? defaultUserConfig(entry)
    const driver = this.activeDriverFor(entry, cfg)

    if (driver.kind === 'mcp-remote' || entry.auth.mode !== 'cli-native' || !entry.auth.cliLoginCommand?.length) {
      const session: ConnectorLoginSession = {
        connectorId: entry.id,
        kind: 'web-token',
        state: 'awaiting_user',
        authUrl: entry.auth.quickAuthUrl ?? entry.officialUrls.openPlatform ?? entry.officialUrls.docs,
        needsTokenInput: Boolean(entry.auth.fields?.length),
        message: {
          zh: '已为你打开官方授权网页，完成登录后请按提示确认或填入凭证。',
          en: 'Official authorization page opened. Complete sign-in and confirm or paste your credential.',
        },
      }
      this.loginSessions.set(entry.id, session)
      return { ...session }
    }

    const env = await this.detectEnvironment(entry.id)
    if (!env.installed || !env.binaryPath) {
      const failed: ConnectorLoginSession = {
        connectorId: entry.id,
        kind: 'cli-browser',
        state: 'failed',
        fallbackUrl: entry.officialUrls.docs,
        message: {
          zh: '尚未检测到官方组件，请先点击「一键安装官方组件」。',
          en: 'Official component is not installed yet. Click One-click install first.',
        },
      }
      this.loginSessions.set(entry.id, failed)
      return { ...failed }
    }

    const previousChild = this.loginChildren.get(entry.id)
    if (previousChild) {
      this.loginChildren.delete(entry.id)
      try { previousChild.kill?.('SIGTERM') } catch {}
    }

    const session: ConnectorLoginSession = {
      connectorId: entry.id,
      kind: 'cli-browser',
      state: 'pending',
      message: {
        zh: '正在启动官方网页登录授权，请在浏览器中确认登录。',
        en: 'Launching official browser sign-in. Confirm authorization in your browser.',
      },
      rawOutput: '',
    }
    this.loginSessions.set(entry.id, session)

    const baseArgs = entry.auth.cliLoginCommand.slice(1)
    const binDir = await ensureManagedNodeShim(this.homeDir, this.platform).catch(() => join(this.homeDir, 'connectors', 'bin'))
    const loginEnv = withManagedBinPath(process.env, binDir, this.platform)

    const launchResolved = async (cmdArgs: string[]): Promise<LoginChildProcessLike> => {
      const resolved = this.platform === 'win32' && /\.(?:cmd|bat)$/iu.test(env.binaryPath!)
        ? await resolveDirectCommand(env.binaryPath!, cmdArgs, loginEnv, this.platform)
        : { command: env.binaryPath!, args: cmdArgs, env: loginEnv, shell: false }
      return this.loginLauncher(resolved.command, resolved.args, resolved.env)
    }

    const runLoginAttempt = async (cmdArgs: string[], allowFeishuInitFallback: boolean): Promise<ConnectorLoginSession> => {
      let child: LoginChildProcessLike
      try {
        child = await launchResolved(cmdArgs)
      } catch (error) {
        session.state = 'failed'
        session.rawOutput = error instanceof Error ? error.message : String(error)
        return { ...session }
      }
      this.loginChildren.set(entry.id, child)

      const attemptOutcome = await new Promise<{ retryInit: boolean; result: ConnectorLoginSession }>((resolvePromise) => {
        let settled = false
        const settleNow = (retryInit = false): void => {
          if (settled) return
          settled = true
          clearTimeout(initialTimer)
          resolvePromise({ retryInit, result: { ...session } })
        }
        const onChunk = (chunk: Buffer | string): void => {
          const text = (Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk))
            .replace(/\u001b\[[0-9;]*[a-zA-Z]/gu, '')
          session.rawOutput = `${session.rawOutput ?? ''}${text}`.slice(-4096)
          if (!session.deviceCode) {
            const userCodeMatch = /[?&]user_code=([A-Z0-9]{4}-[A-Z0-9]{4,6})\b/iu.exec(session.rawOutput)
            const codeMatch = userCodeMatch ?? /\b([A-Z0-9]{4}-[A-Z0-9]{4,6})\b/u.exec(session.rawOutput)
            if (codeMatch) session.deviceCode = codeMatch[1].toUpperCase()
          }
          if (!session.authUrl) {
            const urlMatch = /https:\/\/[^\s"'<>]+/u.exec(session.rawOutput)
            if (urlMatch) {
              session.authUrl = urlMatch[0]
              settleNow(false)
            }
          }
        }
        child.stdout?.on('data', onChunk)
        child.stderr?.on('data', onChunk)
        child.once('error', (error: Error) => {
          if (this.loginChildren.get(entry.id) === child) this.loginChildren.delete(entry.id)
          session.state = 'failed'
          session.rawOutput = `${session.rawOutput ?? ''}\n${error.message}`.trim().slice(-4096)
          settleNow(false)
        })
        child.once('close', (code: number | null) => {
          if (this.loginChildren.get(entry.id) === child) this.loginChildren.delete(entry.id)
          if (code === 0) {
            void this.verifyConnection(entry.id, { simulateOutcome: 'ok' })
              .then(() => {
                session.state = 'succeeded'
                session.message = { zh: '网页授权已完成，连接已就绪。', en: 'Browser authorization succeeded.' }
                settleNow(false)
              })
              .catch(() => {
                session.state = 'succeeded'
                settleNow(false)
              })
          } else {
            if (allowFeishuInitFallback && entry.id === 'feishu' && /not_configured|not configured/iu.test(session.rawOutput ?? '')) {
              settleNow(true)
              return
            }
            session.state = 'failed'
            session.message = {
              zh: '登录授权未完成或已取消，可重新发起网页授权。',
              en: 'Authorization was cancelled or failed. You can retry.',
            }
            settleNow(false)
          }
        })
        const initialTimer = setTimeout(() => settleNow(false), 8000)
      })
      if (attemptOutcome.retryInit) {
        session.rawOutput = ''
        session.state = 'pending'
        return await runLoginAttempt(['config', 'init', '--new'], false)
      }
      return attemptOutcome.result
    }

    let initialArgs = baseArgs
    if (entry.id === 'feishu') {
      const cfgProbe = await this.probeCli(env.binaryPath, ['config', 'show'], 4000, loginEnv)
      const cfgText = `${cfgProbe.stdout}\n${cfgProbe.stderr}`
      if (!cfgProbe.ok || /not_configured|not configured|no config/iu.test(cfgText)) {
        initialArgs = ['config', 'init', '--new']
      }
    }
    return await runLoginAttempt(initialArgs, entry.id === 'feishu')
  }

  async getLoginStatus(connectorId: string): Promise<ConnectorLoginSession> {
    await this.ensureLoaded()
    const entry = this.getEntryOrThrow(connectorId)
    const existing = this.loginSessions.get(entry.id)
    if (existing) return { ...existing }
    const currentStatus = this.statuses.get(entry.id) ?? 'not_installed'
    return {
      connectorId: entry.id,
      kind: entry.auth.mode === 'cli-native' ? 'cli-browser' : 'web-token',
      state: currentStatus === 'connected' ? 'succeeded' : 'awaiting_user',
    }
  }

  async verifyConnection(
    connectorId: string,
    opts: { simulateOutcome?: 'ok' | string } = {},
  ): Promise<ConnectorDiagnosticResult> {
    await this.ensureLoaded()
    const entry = this.getEntryOrThrow(connectorId)
    const cfg = this.persisted.connectors[entry.id] ?? defaultUserConfig(entry)
    cfg.enabled = true
    this.persisted.connectors[entry.id] = cfg
    const checkedAt = new Date().toISOString()
    const env = await this.detectEnvironment(connectorId)
    const profileId = cfg.activeProfileId || 'default'

    let ok = true
    let rawError = ''
    if (opts.simulateOutcome && opts.simulateOutcome !== 'ok') {
      ok = false
      rawError = opts.simulateOutcome
    } else if (opts.simulateOutcome === 'ok') {
      ok = true
    } else {
      const missingSecret = []
      for (const field of entry.auth.fields ?? []) {
        if (field.required && field.secret) {
          if (!(await this.secretVault.hasSecret(entry.id, profileId, field.key))) {
            missingSecret.push(field.label.zh)
          }
        }
      }
      if (missingSecret.length > 0) {
        const result: ConnectorDiagnosticResult = {
          status: 'installed_unauthenticated',
          checkedAt,
          friendlyCause: {
            zh: `尚未填写必需凭证：${missingSecret.join('、')}。`,
            en: `Missing required credential field(s).`,
          },
          friendlyFix: {
            zh: '请先点击上方按钮前往官方网页完成登录并粘贴访问凭证。',
            en: 'Open the official auth page and paste your credential above.',
          },
          environment: env,
        }
        this.statuses.set(entry.id, 'installed_unauthenticated')
        this.diagnostics.set(entry.id, result)
        await this.saveConfig()
        return result
      }

      if (entry.healthCheck.kind === 'cli-command') {
        if (!env.installed || !env.binaryPath) {
          ok = false
          rawError = `CLI binary not installed (${env.driverId})`
        } else {
          const binDir = await ensureManagedNodeShim(this.homeDir, this.platform).catch(() => join(this.homeDir, 'connectors', 'bin'))
          const probeEnv = withManagedBinPath(process.env, binDir, this.platform)
          const probe = await this.probeCli(
            env.binaryPath,
            entry.healthCheck.args ?? ['--version'],
            entry.healthCheck.timeoutMs ?? 10_000,
            probeEnv,
          )
          ok = probe.ok
          if (!probe.ok) rawError = probe.stderr || probe.stdout || 'CLI health check failed'
        }
      } else if (entry.healthCheck.kind === 'mcp-probe') {
        await this.mountMcpIfApplicable(entry, cfg)
        const mcpManager = (this.ctx as { get?: (key: string) => unknown }).get?.('mcpManager') as McpManagerLike | undefined
        if (mcpManager?.probe) {
          const res = await mcpManager.probe(`connector_${entry.id}`)
          if (res && res.ok === false) {
            ok = false
            rawError = res.error ?? 'MCP probe failed'
          }
        }
      }
    }

    if (ok) {
      await this.mountMcpIfApplicable(entry, cfg)
      this.statuses.set(entry.id, 'connected')
      const result: ConnectorDiagnosticResult = { status: 'connected', checkedAt, environment: env }
      this.diagnostics.set(entry.id, result)
      await this.saveConfig()
      this.skillControl?.invalidate()
      return result
    }

    this.unmountMcp(entry.id)
    const classified = env.installed === false && !opts.simulateOutcome
      ? {
          status: 'not_installed' as const,
          friendlyCause: { zh: '本机尚未检测到官方 CLI 程序。', en: 'Official CLI executable was not found on this machine.' },
          friendlyFix: { zh: '请在向导中安装官方 CLI，或在高级配置中填写绝对路径。', en: 'Install the official CLI or set its absolute executable path in Advanced settings.' },
        }
      : classifyConnectorFailure(entry, rawError)
    this.statuses.set(entry.id, classified.status)
    const result: ConnectorDiagnosticResult = {
      status: classified.status,
      checkedAt,
      friendlyCause: classified.friendlyCause,
      friendlyFix: classified.friendlyFix,
      rawError: rawError.slice(0, 1000),
      environment: env,
    }
    this.diagnostics.set(entry.id, result)
    await this.saveConfig()
    this.skillControl?.invalidate()
    return result
  }

  async disconnect(connectorId: string): Promise<ConnectorStateSnapshot> {
    await this.ensureLoaded()
    const entry = this.getEntryOrThrow(connectorId)
    const current = this.persisted.connectors[entry.id] ?? defaultUserConfig(entry)
    this.persisted.connectors[entry.id] = { ...current, enabled: false }
    this.statuses.set(entry.id, 'disabled')
    this.unmountMcp(entry.id)
    this.diagnostics.delete(entry.id)
    await this.saveConfig()
    this.skillControl?.invalidate()
    return this.snapshot()
  }

  matchToolRisk(toolName: string): ConnectorRiskMatch | undefined {
    const match = /^mcp__connector_([a-z0-9-]+)__(.+)$/u.exec(toolName)
    if (!match) return undefined
    const [, connectorId, actionName] = match
    const entry = this.catalog.connectors.find(item => item.id === connectorId)
    if (!entry) return undefined
    for (const rule of entry.riskRules) {
      if (safePatternMatch(rule.actionPattern, actionName)) {
        return { connectorId, level: rule.level, label: rule.label }
      }
    }
    const defaultLevel: ConnectorRiskLevel = 'L1'
    return { connectorId, level: defaultLevel }
  }
}
