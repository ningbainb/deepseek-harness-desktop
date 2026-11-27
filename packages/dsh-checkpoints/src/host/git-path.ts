import { lstatSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join, parse, relative } from 'node:path'

function realGit(candidate: string): string | undefined {
  if (!isAbsolute(candidate)) return
  try {
    const path = realpathSync(candidate)
    if (statSync(path).isFile() && /(?:^|[\\/])git(?:\.exe)?$/iu.test(path)) return path
  } catch { /* Missing Git remains a normal degraded state. */ }
}

export function resolveCheckpointGit(env = process.env): string | undefined {
  const supplied = env.DSH_DESKTOP_CHECKPOINT_GIT
  if (supplied) {
    const trusted = realGit(supplied)
    if (trusted) return trusted
  }
  const executable = process.platform === 'win32' ? 'git.exe' : 'git'
  for (const entry of (env.PATH ?? env.Path ?? '').split(delimiter)) {
    if (!isAbsolute(entry)) continue
    const git = realGit(join(entry, executable))
    if (git) return git
  }
}

export function validCheckpointWorkspace(path: string): boolean {
  if (!isAbsolute(path) || path === parse(path).root) return false
  try {
    const fromWorkspaceToHome = relative(path, realpathSync(homedir()))
    if (!isAbsolute(fromWorkspaceToHome) && !/^\.\.(?:[\\/]|$)/u.test(fromWorkspaceToHome)) return false
    return lstatSync(path).isDirectory() && relative(path, realpathSync(path)) === ''
  } catch { return false }
}
