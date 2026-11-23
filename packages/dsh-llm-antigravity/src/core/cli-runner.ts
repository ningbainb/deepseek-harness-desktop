import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'
import { createInterface } from 'node:readline'
import type { CliModel, Diagnostic } from '../config.ts'

export const loginHint = 'Sign in to Antigravity with agy or agy acp --login, then refresh models.'
export const installHint = 'Install Antigravity CLI or choose an absolute path to the agy executable.'
export const authRequired = (text: string) => /please sign in|authentication required|not (?:logged|signed) in|login required/i.test(text)
export const modelSlug = /^[a-z0-9][a-z0-9._-]{0,127}$/i

const isExecutable = async (path: string) => {
  try {
    if (process.platform === 'win32' && !path.toLowerCase().endsWith('.exe')) return false
    await access(path, constants.X_OK)
    return (await stat(path)).isFile()
  } catch { return false }
}

export async function findCli(custom: string, env = process.env, executable = isExecutable) {
  if (custom.trim()) {
    const path = custom.trim()
    return isAbsolute(path) && await executable(path) ? path : undefined
  }
  const win = process.platform === 'win32'
  const binary = win ? 'agy.exe' : 'agy'
  const pathValue = Object.entries(env).find(([key]) => win ? key.toLowerCase() === 'path' : key === 'PATH')?.[1]
  const folders = pathValue?.split(delimiter).map(path => path.replace(/^"(.*)"$/, '$1')) ?? []
  if (win && env.LOCALAPPDATA) folders.push(join(env.LOCALAPPDATA, 'agy', 'bin'))
  for (const folder of folders.filter(isAbsolute)) {
    const path = join(folder, binary)
    if (await executable(path)) return path
  }
}

export function parseModels(output: string): CliModel[] {
  const models = new Map<string, CliModel>()
  for (const line of output.split(/\r?\n/)) {
    const row = /^(\S+)(?:\t+| {2,})(\S.*)$/.exec(line.trim())
    if (row && modelSlug.test(row[1]) && !models.has(row[1])) {
      models.set(row[1], { id: row[1], name: row[2] })
    }
  }
  return [...models.values()]
}

export class CliRunner {
  constructor(private readonly launch = spawn) {}

  async *run(
    path: string,
    args: string[],
    timeoutMs: number,
    signal?: AbortSignal,
    start?: (write: (line: string) => void, close: () => void, cwd: string) => void,
  ): AsyncGenerator<string> {
    signal?.throwIfAborted()
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-agy-'))
    try {
      signal?.throwIfAborted()
      yield* this.runInDirectory(path, args, cwd, timeoutMs, signal, start)
    } finally {
      await rm(cwd, { recursive: true, force: true, maxRetries: 2 }).catch(() => {})
    }
  }

  private async *runInDirectory(
    path: string, args: string[], cwd: string, timeoutMs: number, signal?: AbortSignal,
    start?: (write: (line: string) => void, close: () => void, cwd: string) => void,
  ): AsyncGenerator<string> {
    const child = this.launch(path, args, { cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    let spawnError: unknown
    let timedOut = false
    let force: ReturnType<typeof setTimeout> | undefined
    const closed = new Promise<number | null>(resolve => {
      child.once('error', error => { spawnError = error })
      child.once('close', resolve)
    })
    child.stderr.setEncoding('utf8').on('data', (data: string) => { stderr = (stderr + data).slice(-16_384) })
    child.stdin.on('error', () => {})
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
    const terminate = () => {
      lines.close()
      child.stdin.destroy()
      if (child.exitCode !== null || child.signalCode !== null || force) return
      child.kill('SIGTERM')
      force = setTimeout(() => child.kill('SIGKILL'), 500)
      force.unref()
    }
    const timer = setTimeout(() => { timedOut = true; terminate() }, timeoutMs)
    signal?.addEventListener('abort', terminate, { once: true })
    if (signal?.aborted) terminate()
    try {
      if (!signal?.aborted) {
        if (start) start(line => child.stdin.write(line + '\n'), () => child.stdin.end(), cwd)
        else child.stdin.end()
        for await (const line of lines) {
          if (signal?.aborted || timedOut) break
          yield line
        }
      }
      const code = await closed
      signal?.throwIfAborted()
      if (timedOut) throw new Error('Antigravity CLI request timed out.')
      if (spawnError) throw spawnError
      if (authRequired(stderr)) throw new Error(loginHint)
      if (code !== 0) throw new Error(`Antigravity CLI exited with code ${code}.`)
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', terminate)
      terminate()
      await closed
      clearTimeout(force)
    }
  }

  async probe(custom: string, signal?: AbortSignal): Promise<Diagnostic> {
    const path = await findCli(custom)
    if (!path) return { state: 'not-installed', models: [] }
    try {
      const lines: string[] = []
      for await (const line of this.run(path, ['models'], 30_000, signal)) lines.push(line)
      if (lines.some(authRequired)) return { state: 'not-authenticated', path, models: [] }
      const models = parseModels(lines.join('\n'))
      return { state: models.length ? 'ready' : 'error', path, models }
    } catch (error) {
      if (signal?.aborted) throw error
      const state = error instanceof Error && error.message === loginHint ? 'not-authenticated'
        : (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'not-installed' : 'error'
      return { state, path, models: [] }
    }
  }
}
