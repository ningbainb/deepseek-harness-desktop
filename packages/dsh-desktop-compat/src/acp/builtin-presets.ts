import { createHash } from 'node:crypto'
import { access, readFile, realpath, stat } from 'node:fs/promises'
import { constants, type Stats } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { AcpAgentDefinition, AcpPresetDefinition } from './types.ts'

export const ANTIGRAVITY_ACP_AGENT: AcpPresetDefinition = {
  id: 'antigravity',
  name: 'Google Antigravity',
  command: process.platform === 'win32' ? 'agy.exe' : 'agy',
  args: ['acp'],
  authMode: 'oauth-personal',
  compliancePolicy: 'human-interactive',
  custom: false,
}

export const BUILTIN_ACP_PRESETS: readonly AcpPresetDefinition[] = [
  ANTIGRAVITY_ACP_AGENT,
  {
    id: 'claude-code', name: 'Claude Code', command: 'claude-agent-acp', args: [],
    authMode: 'custom', custom: false, npmPackage: '@agentclientprotocol/claude-agent-acp',
    installCommand: 'npm install -g @agentclientprotocol/claude-agent-acp',
  },
  {
    id: 'codex', name: 'OpenAI Codex', command: 'codex-acp', args: [],
    authMode: 'custom', custom: false, npmPackage: '@agentclientprotocol/codex-acp',
    installCommand: 'npm install -g @agentclientprotocol/codex-acp',
  },
  {
    id: 'opencode', name: 'OpenCode', command: 'opencode', args: ['acp'],
    authMode: 'custom', custom: false, npmPackage: 'opencode-ai',
    installCommand: 'npm install -g opencode-ai',
  },
]

const byId = new Map(BUILTIN_ACP_PRESETS.map(preset => [preset.id, preset]))

export function getAcpPreset(id: string): AcpPresetDefinition | undefined {
  return byId.get(id)
}

interface LaunchResolutionOptions {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  cwd?: string
  managedPrefix?: string
  commandOverride?: string
  signal?: AbortSignal
}

export interface ResolvedAcpLaunch {
  command: string
  args: string[]
  fingerprint: string
}

async function executable(path: string, platform: NodeJS.Platform): Promise<Stats | undefined> {
  try {
    const info = await stat(path)
    if (!info.isFile()) return undefined
    if (platform !== 'win32') await access(path, constants.X_OK)
    return info
  } catch {
    return undefined
  }
}

function fingerprint(file: string, info: Stats): string {
  return createHash('sha256').update([file, info.mtimeMs, info.size].join('\0')).digest('hex')
}

function isChildPath(root: string, destination: string): boolean {
  const child = relative(root, destination)
  return Boolean(child) && child !== '..' && !child.startsWith('..' + sep) && !isAbsolute(child)
}

export function isWindowsNetworkPath(path: string, platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32' && /^[\\/]{2}(?![?][\\/][a-z]:[\\/])/iu.test(path)
}

async function npmEntry(
  prefix: string,
  preset: AcpPresetDefinition,
  args: string[],
  platform: NodeJS.Platform,
  signal?: AbortSignal,
): Promise<ResolvedAcpLaunch | undefined> {
  const packageName = preset.npmPackage
  if (!packageName || isWindowsNetworkPath(prefix, platform)) return undefined
  try {
    signal?.throwIfAborted()
    const root = await realpath(join(prefix, 'node_modules', packageName))
    if (isWindowsNetworkPath(root, platform)) return undefined
    signal?.throwIfAborted()
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
      name?: string
      bin?: string | Record<string, string>
    }
    if (manifest.name !== packageName) return undefined
    const entry = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[preset.command]
    if (typeof entry !== 'string') return undefined
    const file = resolve(root, entry)
    if (!isChildPath(root, file)) return undefined
    const resolved = await realpath(file)
    if (!isChildPath(root, resolved) || isWindowsNetworkPath(resolved, platform)) return undefined
    signal?.throwIfAborted()
    const format = extname(file).toLowerCase()
    const script = ['.js', '.cjs', '.mjs'].includes(format)
    if (!script && format !== '.exe' && format !== '') return undefined
    const info = await executable(file, script ? 'win32' : platform)
    if (!info) return undefined
    return {
      command: script ? process.execPath : file,
      args: script ? [file, ...args] : args,
      fingerprint: fingerprint(file, info),
    }
  } catch {
    signal?.throwIfAborted()
    return undefined
  }
}

export async function resolveAcpLaunch(
  agent: AcpAgentDefinition,
  options: LaunchResolutionOptions = {},
): Promise<ResolvedAcpLaunch | undefined> {
  const platform = options.platform ?? process.platform
  const { env = process.env, signal } = options
  const preset = !agent.custom ? getAcpPreset(agent.id) : undefined
  const command = options.commandOverride?.trim() || agent.command
  const args = agent.args
  if (!command || command.includes('\0') || isWindowsNetworkPath(command, platform)) return undefined
  const environmentPath = env.PATH ?? env.Path ?? env.path ?? ''
  const pathEntries = environmentPath.split(platform === 'win32' ? ';' : ':')
    .map(entry => entry.trim().replace(/^"(.*)"$/u, '$1'))
    .filter(entry => entry && isAbsolute(entry) && !isWindowsNetworkPath(entry, platform))
  const explicit = /[\\/]/u.test(command) || isAbsolute(command)
  const directories = explicit
    ? [dirname(resolve(options.cwd ?? process.cwd(), command))]
    : [...new Set([
      ...(preset?.id === 'antigravity' && env.LOCALAPPDATA
        ? [join(env.LOCALAPPDATA, 'agy', 'bin')]
        : []),
      ...pathEntries,
      ...(platform === 'win32' && env.APPDATA ? [join(env.APPDATA, 'npm')] : []),
    ])]

  const binary = basename(command)
  const extensions = platform === 'win32' && extname(binary) === '' ? ['.exe', '.com', ''] : ['']
  for (const directory of directories) {
    if (isWindowsNetworkPath(directory, platform)) continue
    for (const extension of extensions) {
      signal?.throwIfAborted()
      const fullPath = join(directory, binary + extension)
      if (platform === 'win32' && /\.(?:cmd|bat|ps1)$/iu.test(fullPath)) continue
      const info = await executable(fullPath, platform)
      if (info) {
        const resolvedPath = await realpath(fullPath).catch(() => undefined)
        if (resolvedPath && !isWindowsNetworkPath(resolvedPath, platform)
          && (platform !== 'win32' || !/\.(?:cmd|bat|ps1)$/iu.test(resolvedPath))) {
          return { command: resolvedPath, args, fingerprint: fingerprint(resolvedPath, info) }
        }
      }
    }
    if (platform === 'win32' && preset?.npmPackage
      && binary.replace(/\.(?:cmd|bat|ps1)$/iu, '').toLowerCase() === preset.command) {
      const installed = await npmEntry(directory, preset, args, platform, signal)
        ?? await npmEntry(dirname(directory), preset, args, platform, signal)
      if (installed) return installed
    }
  }
  if (!explicit && options.managedPrefix && preset?.npmPackage) {
    return npmEntry(options.managedPrefix, preset, args, platform, signal)
  }
  return undefined
}

export async function getAcpAuthHint(agentId: string, env = process.env): Promise<'credentials-present' | undefined> {
  if (agentId !== 'codex') return undefined
  if (env.OPENAI_API_KEY?.trim() || env.CODEX_API_KEY?.trim()) return 'credentials-present'
  const codexHome = env.CODEX_HOME?.trim() || join(homedir(), '.codex')
  if (isWindowsNetworkPath(codexHome, process.platform)) return undefined
  try {
    // The settings importer reads and restores Codex grants. This detector only checks presence.
    return (await stat(join(codexHome, 'auth.json'))).isFile() ? 'credentials-present' : undefined
  } catch {
    return undefined
  }
}
