import { execFile } from 'node:child_process'
import { access, realpath, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, extname, isAbsolute, join, normalize, relative, sep } from 'node:path'
import { promisify } from 'node:util'
import { loadSyntaxApi, outlineSource } from './ast-outline.ts'
import { type CodeSelection, readWorkspaceCodeFile, selectCodeFiles } from './code-files.ts'

const execFileAsync = promisify(execFile)

export async function resolveGitExecutable(workspace: string): Promise<string | undefined> {
  const root = await realpath(workspace).catch(() => undefined)
  if (!root) return undefined
  const path = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1]
  const executable = process.platform === 'win32' ? 'git.exe' : 'git'
  for (const entry of (path ?? '').split(delimiter)) {
    const directory = entry.replace(/^"(.*)"$/u, '$1')
    if (!isAbsolute(directory)) continue
    const candidate = await realpath(join(directory, executable)).catch(() => undefined)
    if (!candidate) continue
    const fromWorkspace = relative(root, candidate)
    if (!isAbsolute(fromWorkspace) && fromWorkspace !== '..' && !fromWorkspace.startsWith('..' + sep)) continue
    try {
      if (!(await stat(candidate)).isFile()) continue
      await access(candidate, constants.X_OK)
      return candidate
    } catch {
      // An inaccessible PATH entry cannot serve as the Git executable.
    }
  }
  return undefined
}

async function recentChanges(root: string, signal?: AbortSignal): Promise<Map<string, number>> {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key)))
  env.GIT_CONFIG_NOSYSTEM = '1'
  env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null'
  env.GIT_CEILING_DIRECTORIES = normalize(root)
  env.GIT_TERMINAL_PROMPT = '0'
  env.GIT_NO_LAZY_FETCH = '1'
  env.GIT_OPTIONAL_LOCKS = '0'
  try {
    const git = await resolveGitExecutable(root)
    if (!git) return new Map()
    const { stdout } = await execFileAsync(git, [
      '--no-pager', '-c', 'core.fsmonitor=false', '-c', `core.hooksPath=${env.GIT_CONFIG_GLOBAL}`,
      'log', '-80', '--name-only', '--format=', '-z', '--no-ext-diff', '--no-textconv', '--', '.',
    ], { cwd: root, env, timeout: 800, maxBuffer: 1024 * 1024, windowsHide: true, signal })
    const counts = new Map<string, number>()
    for (const value of stdout.split('\0')) {
      const path = value.replace(/^\n+/u, '')
      if (path) counts.set(path, (counts.get(path) ?? 0) + 1)
    }
    return counts
  } catch {
    return new Map()
  }
}

const KNOWN_CREDENTIAL = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:gh[pousr]_|github_pat_|glpat-|xox[baprs]-|sk-(?:proj-)?|AIza)[0-9A-Za-z_-]{12,}|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\bBearer\s+[A-Za-z0-9._-]{12,})/gu
const QUOTED_VALUE = /(["'\x60])(?:\\.|(?!\1).)*\1/gu

function safeMapText(text: string): string {
  return text
    .replace(KNOWN_CREDENTIAL, '[redacted]')
    .replace(QUOTED_VALUE, '[…]')
    .replace(/[\u0000-\u0020\u007f]+/gu, ' ')
    .trim()
}

function estimateTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, 'utf8') / 2)
}

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs',
  '.java', '.c', '.h', '.cpp', '.cc', '.hpp', '.cs', '.rb', '.php', '.swift', '.kt', '.vue', '.svelte',
])

export async function mapRepository(root: string, params: CodeSelection & { maxTokens?: number }, signal?: AbortSignal) {
  const selected = await selectCodeFiles(root, params, 700, signal)
  if (selected.error) return { ok: false, error: selected.error }
  const maxTokens = Math.max(40, Math.min(12_000, params.maxTokens ?? 4000))
  const [api, churn] = await Promise.all([loadSyntaxApi(), recentChanges(root, signal)])
  const score = (path: string) => 3 * Math.log2(1 + (churn.get(path) ?? 0))
    + (SOURCE_EXTENSIONS.has(extname(path).toLowerCase()) ? 2 : 0) - Math.min(5, path.split('/').length) * 0.5
  const ordered = selected.paths.sort((a, b) => score(b) - score(a) || a.localeCompare(b)).slice(0, 200)
  const names = new Map<string, number>()
  const previews: Array<{ path: string; symbols: ReturnType<typeof outlineSource>['symbols'] }> = []
  for (const path of ordered) {
    signal?.throwIfAborted()
    if (!SOURCE_EXTENSIONS.has(extname(path).toLowerCase())) {
      previews.push({ path, symbols: [] })
      continue
    }
    const file = await readWorkspaceCodeFile(root, path, 256 * 1024)
    if (!file) continue
    const { symbols } = outlineSource(path, file.text, api, 18)
    for (const match of file.text.matchAll(/\b(?:import|from|require)\s*\(?\s*(?:[{*][^'\x22\r\n]{0,256}\bfrom\s*)?['\x22]([^'\x22]{1,168})['\x22]/gu)) {
      const name = match[1].split('/').at(-1)?.replace(/\.(?:[cm]?[jt]sx?)$/u, '')
      if (name) names.set(name, (names.get(name) ?? 0) + 1)
    }
    previews.push({ path, symbols: symbols.filter(symbol => symbol.level === 0).sort((a, b) => Number(b.visibility === 'exported') - Number(a.visibility === 'exported')) })
  }
  const ranked = previews.sort((a, b) => {
    const rank = (path: string) => score(path) + Math.log2(1 + (names.get(path.split('/').at(-1)?.replace(/\.[^.]+$/u, '') ?? '') ?? 0))
    return rank(b.path) - rank(a.path) || a.path.localeCompare(b.path)
  })
  const lines: string[] = []
  let charBudget = maxTokens * 2
  let files = 0
  let bounded = selected.bounded || previews.length < selected.paths.length
  const append = (line: string): boolean => {
    const bytes = Buffer.byteLength(line, 'utf8') + (lines.length ? 1 : 0)
    if (bytes > charBudget) return false
    charBudget -= bytes
    lines.push(line)
    return true
  }
  for (const { path, symbols } of ranked) {
    if (!append(safeMapText(path))) {
      bounded = true
      break
    }
    files++
    for (const symbol of symbols.slice(0, 8)) {
      if (append(`  ${safeMapText(symbol.signature)}`)) continue
      bounded = true
      break
    }
  }
  const map = lines.join('\n')
  return { ok: true, map, files, estimatedTokens: estimateTokens(map), bounded }
}
