import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { isAbsolute, win32 } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { currentAgentWslPermission } from './agent-wsl-permission.ts'

const OUTPUT_LIMIT = 64 * 1024
const COMMAND_TIMEOUT_MS = 60_000
const LIST_TIMEOUT_MS = 10_000
const RESERVED_DISTRIBUTIONS = /^(?:docker-desktop(?:-data)?|rancher-desktop(?:-data)?|podman-machine(?:-default)?)$/iu

type ProcessResult = {
  code: number | null
  stdout: Buffer
  stderr: Buffer
  timedOut: boolean
  aborted: boolean
  truncated: boolean
}

function wslExecutable(environment: NodeJS.ProcessEnv = process.env): string {
  const root = environment.SystemRoot ?? environment.WINDIR ?? 'C:\\Windows'
  if (!win32.isAbsolute(root)) throw new Error('Windows 系统目录无效，无法定位 WSL。')
  const executable = win32.join(root, 'System32', 'wsl.exe')
  if (!existsSync(executable)) throw new Error('未找到 wsl.exe，请先安装 Windows Subsystem for Linux。')
  return executable
}

function decodeWslList(output: Buffer): string {
  const zeroBytes = output.subarray(1).filter(byte => byte === 0).length
  const utf16Newline = output.includes(Buffer.from([13, 0, 10, 0]))
  return utf16Newline || zeroBytes > output.length / 8 ? output.toString('utf16le') : output.toString('utf8')
}

export function parseWslDistributions(output: string): string[] {
  return [...new Set(output.replace(/\u0000/gu, '').split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line !== '' && !RESERVED_DISTRIBUTIONS.test(line)))]
}

export function selectWslDistribution(installed: readonly string[], requested?: string): string {
  if (installed.length === 0) throw new Error('没有可供 Agent 使用的 WSL Linux 发行版。Docker Desktop 内部发行版不会被当作工作终端。')
  if (requested !== undefined) {
    const match = installed.find(name => name.toLowerCase() === requested.trim().toLowerCase())
    if (match === undefined) throw new Error('指定的 WSL 发行版未安装或不可用。请先检查 wsl.exe --list --quiet。')
    return match
  }
  if (installed.length !== 1) throw new Error('安装了多个 WSL 发行版，请在本次调用中明确指定 distribution。')
  return installed[0]!
}

export function createWslCommandArgs(distribution: string, command: string, workdir?: string): string[] {
  return ['--distribution', distribution, ...(workdir ? ['--cd', workdir] : []),
    '--exec', '/bin/sh', '-lc', command]
}

function runProcess(executable: string, args: readonly string[], options: {
  cwd?: string
  signal: AbortSignal
  timeoutMs: number
}): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    if (options.signal.aborted) {
      reject(new Error('WSL 命令已取消。'))
      return
    }
    const child = spawn(executable, [...args], {
      cwd: options.cwd,
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let stdoutBytes = 0
    let stderrBytes = 0
    let timedOut = false
    let aborted = false
    let truncated = false
    let settled = false
    const stop = () => child.kill()
    const onAbort = () => {
      if (aborted) return
      aborted = true
      stop()
    }
    const timer = setTimeout(() => {
      timedOut = true
      stop()
    }, options.timeoutMs)
    const cleanup = () => {
      clearTimeout(timer)
      options.signal.removeEventListener('abort', onAbort)
    }
    options.signal.addEventListener('abort', onAbort, { once: true })
    if (options.signal.aborted) onAbort()
    child.stdout?.on('data', (chunk: Buffer) => {
      const remaining = OUTPUT_LIMIT - stdoutBytes
      if (chunk.length > remaining) truncated = true
      if (remaining > 0) {
        const part = chunk.subarray(0, remaining)
        stdout.push(part)
        stdoutBytes += part.length
      }
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      const remaining = OUTPUT_LIMIT - stderrBytes
      if (chunk.length > remaining) truncated = true
      if (remaining > 0) {
        const part = chunk.subarray(0, remaining)
        stderr.push(part)
        stderrBytes += part.length
      }
    })
    child.once('error', error => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    })
    child.once('close', code => {
      if (settled) return
      settled = true
      cleanup()
      resolve({ code, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), timedOut, aborted, truncated })
    })
  })
}

async function listWslDistributions(signal: AbortSignal): Promise<string[]> {
  const listed = await runProcess(wslExecutable(), ['--list', '--quiet'], {
    signal,
    timeoutMs: LIST_TIMEOUT_MS,
  })
  if (listed.aborted) throw new Error('WSL 检查已取消。')
  if (listed.timedOut || listed.truncated || listed.code !== 0) throw new Error('无法完整读取 WSL 发行版列表，请检查 WSL 是否可用。')
  return parseWslDistributions(decodeWslList(listed.stdout))
}

/** Register a separate, explicitly approved WSL tool; never replace the official sandboxed pwsh executor. */
export function installAgentWslTool(ctx: Context): void {
  if (process.platform !== 'win32') return
  ctx.tools.register(defineTool({
    name: 'desktop_wsl_list',
    description: 'List installed user WSL Linux distributions before choosing desktop_wsl. This read-only check excludes Docker Desktop and other application-owned distributions.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          distributions: { type: 'array', items: { type: 'string' }, required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.distributions.length
        ? value.distributions.join('\n')
        : 'No user WSL Linux distribution is installed.' }],
    },
    timeoutMs: LIST_TIMEOUT_MS + 5_000,
    async execute(_args, exec) {
      return { distributions: await listWslDistributions(exec.signal) }
    },
  }))
  ctx.tools.register(defineTool({
    name: 'desktop_wsl',
    description: 'Run one Linux shell command in an installed WSL distribution. First call desktop_wsl_list to check available distributions. Use this only when Linux tools are needed; use the normal pwsh tool for Windows commands. WSL runs outside the Windows DSH sandbox; the user controls approval in Smart Control settings (off, ask every time, or always allow). Commands are foreground-only, have a 60-second limit, and cannot request sandbox escalation. The session workspace is used as the starting directory when available.',
    parameters: {
      command: { type: 'string', required: true, description: 'Linux /bin/sh command to run. Never pass PowerShell syntax here.' },
      distribution: { type: 'string', description: 'Exact installed WSL distribution name. Required when more than one user distribution is installed.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          distribution: { type: 'string', required: true },
          stdout: { type: 'string', required: true },
          stderr: { type: 'string', required: true },
          exitCode: { oneOf: [{ type: 'integer' }, { type: 'null' }], required: true },
          timedOut: { type: 'boolean', required: true },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: [value.stdout || '(no output)', value.stderr ? `[stderr]\n${value.stderr}` : '',
          value.timedOut ? '[timed out after 60000 ms]' : '',
          value.truncated ? '[output truncated at 65536 bytes per stream]' : '',
          value.exitCode !== 0 ? `[exit code: ${value.exitCode}]` : ''].filter(Boolean).join('\n'),
      }],
    },
    timeoutMs: COMMAND_TIMEOUT_MS + LIST_TIMEOUT_MS + 5_000,
    async execute(args, exec) {
      if (currentAgentWslPermission() === 'off') throw new Error('Agent WSL 命令已由用户关闭。')
      const executable = wslExecutable()
      const distribution = selectWslDistribution(await listWslDistributions(exec.signal), args.distribution)
      const cwd = exec.agent?.session.header.cwd
      const workdir = cwd && isAbsolute(cwd) ? cwd : undefined
      const commandArgs = createWslCommandArgs(distribution, args.command, workdir)
      const result = await runProcess(executable, commandArgs, {
        cwd: workdir,
        signal: exec.signal,
        timeoutMs: COMMAND_TIMEOUT_MS,
      })
      if (result.aborted) throw new Error('WSL 命令已取消。')
      return {
        distribution,
        stdout: result.stdout.toString('utf8'),
        stderr: result.stderr.toString('utf8'),
        exitCode: result.code,
        timedOut: result.timedOut,
        truncated: result.truncated,
      }
    },
  }))
}
