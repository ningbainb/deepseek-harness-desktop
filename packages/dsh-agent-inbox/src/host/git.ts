import { execFile } from 'node:child_process'
import { lstat, open, realpath } from 'node:fs/promises'
import { relative, resolve, isAbsolute, sep } from 'node:path'
import type { Change, DiffPreview } from '../core/types.ts'

const limit = 256 * 1024

async function git(cwd: string, args: string[], allowDifferent = false, config: string[] = []): Promise<string> {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')))
  return new Promise((resolve, reject) => {
    execFile('git', ['--no-pager', '--literal-pathspecs', '-c', 'core.fsmonitor=false', ...config, ...args], {
      cwd, env: { ...env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
      windowsHide: true, shell: false, maxBuffer: limit, timeout: 8000,
    }, (error, stdout) => {
      if (!error || (allowDifferent && error.code === 1)) resolve(stdout)
      else reject(error)
    })
  })
}

async function filterOverrides(cwd: string): Promise<string[]> {
  const names = await git(cwd, ['config', '--includes', '--null', '--name-only', '--get-regexp', '^filter\\..*\\.(clean|smudge|process|required)$'], true)
  // A worktree's configured filters may invoke external programs. Neutralize
  // them before commands that compare the index with the working directory.
  return names.split('\0').filter(Boolean).flatMap(name => ['-c', name + (name.endsWith('.required') ? '=false' : '=')])
}

const diffOptions = ['--no-ext-diff', '--no-textconv', '--no-renames', '--no-color']

export function parseStatus(output: string): Change[] {
  return output.split('\0').filter(line => line.length > 3).map(line => ({
    path: line.slice(3),
    status: line.slice(0, 2),
  }))
}

async function untrackedLineCount(cwd: string, path: string): Promise<number | undefined> {
  const absolute = resolve(cwd, path)
  const rel = relative(cwd, absolute)
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) return
  const info = await lstat(absolute)
  if (!info.isFile() || info.size > 64 * 1024 || relative(await realpath(absolute), absolute) !== '') return
  const handle = await open(absolute, 'r')
  try {
    const bytes = Buffer.alloc(64 * 1024 + 1)
    const { bytesRead } = await handle.read(bytes)
    if (bytesRead !== info.size || bytes.subarray(0, bytesRead).includes(0)) return
    let lines = 0
    for (let offset = 0; offset < bytesRead; offset++) {
      if (bytes[offset] === 10) lines++
    }
    return lines + Number(bytesRead > 0 && bytes[bytesRead - 1] !== 10)
  } finally { await handle.close() }
}

export async function changes(cwd: string): Promise<{ files: Change[]; truncated: boolean }> {
  if (relative(cwd, await realpath(cwd)) !== '') throw Error('Workspace directory changed')
  const config = await filterOverrides(cwd)
  const prefix = (await git(cwd, ['rev-parse', '--show-prefix'])).replace(/\r?\n$/, '')
  const status = await git(cwd, ['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all', '--ignore-submodules=all', '--', '.'], false, config)
  const files = parseStatus(status).filter(file => file.path.startsWith(prefix))
    .map(file => ({ ...file, path: file.path.slice(prefix.length) }))
  const counts = new Map<string, { added?: number; removed?: number }>()
  let truncated = files.length > 500
  try {
    const head = await git(cwd, ['rev-parse', '--verify', 'HEAD']).then(() => ['HEAD'], () => [])
    const views = head.length ? [head] : [[], ['--cached']]
    for (const view of views) {
      const stats = await git(cwd, ['diff', ...diffOptions, '--relative', '--numstat', '-z', ...view, '--', '.'], false, config)
      for (const entry of stats.split('\0')) {
        const match = /^(\d+)\t(\d+)\t([\s\S]+)$/.exec(entry)
        if (!match) continue
        const prior = counts.get(match[3])
        counts.set(match[3], { added: Number(match[1]) + (prior?.added ?? 0), removed: Number(match[2]) + (prior?.removed ?? 0) })
      }
    }
  } catch { truncated = true }
  const visible = files.slice(0, 500)
  const untracked = visible.filter(file => file.status === '??')
  for (const file of untracked.slice(0, 100)) {
    const added = await untrackedLineCount(cwd, file.path).catch(() => undefined)
    if (added !== undefined) counts.set(file.path, { added, removed: 0 })
  }
  return { files: visible.map(file => ({ ...file, ...counts.get(file.path) })), truncated }
}

export async function preview(cwd: string, path: string): Promise<DiffPreview | undefined> {
  if (!path || path.length > 4096 || isAbsolute(path) || path.includes('\0')) return
  const file = (await changes(cwd)).files.find(item => item.path === path)
  if (!file) return
  const absolute = resolve(cwd, path)
  const rel = relative(cwd, absolute)
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) return
  try {
    const stat = await lstat(absolute).catch(error => { if (error.code === 'ENOENT') return undefined; throw error })
    if (stat && (stat.isSymbolicLink() || !stat.isFile() || stat.size > limit || await realpath(absolute) !== absolute)) {
      return { text: '', truncated: true }
    }
    if (file.status === '??') {
      const empty = process.platform === 'win32' ? 'NUL' : '/dev/null'
      return { text: await git(cwd, ['diff', ...diffOptions, '--no-index', '--', empty, absolute], true), truncated: false }
    }
    const config = await filterOverrides(cwd)
    const head = await git(cwd, ['rev-parse', '--verify', 'HEAD']).then(() => ['HEAD'], () => [])
    const text = await git(cwd, ['diff', ...diffOptions, '--relative', ...head, '--', path], false, config)
    const staged = head.length ? '' : await git(cwd, ['diff', ...diffOptions, '--relative', '--cached', '--', path], false, config)
    return { text: (staged + text).slice(0, limit), truncated: (staged + text).length > limit }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return { text: '', truncated: true }
    throw error
  }
}
