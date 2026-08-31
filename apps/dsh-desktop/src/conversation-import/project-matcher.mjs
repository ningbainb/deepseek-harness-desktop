/**
 * Project Matcher for Conversation Import.
 * Resolves canonical path, Git root, remote identities, and detects revision changes.
 */

import { readFile, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { MATCH_STATUS } from './schema.mjs'

function samePath(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  return resolve(left).toLowerCase() === resolve(right).toLowerCase()
}

function isStrictPathAncestor(parent, child) {
  if (typeof parent !== 'string' || typeof child !== 'string') return false
  const relation = relative(resolve(parent), resolve(child))
  return relation.length > 0 && !relation.startsWith('..') && !isAbsolute(relation)
}

export class ProjectMatcher {
  /**
   * Find Git root directory by walking up parent directories looking for .git.
   */
  static async findGitRoot(dirPath) {
    if (!dirPath || typeof dirPath !== 'string') return undefined
    let current = resolve(dirPath)
    while (current) {
      const gitDir = join(current, '.git')
      const stats = await stat(gitDir).catch(() => null)
      if (stats) return current
      const parent = dirname(current)
      if (parent === current) break
      current = parent
    }
    return undefined
  }

  /**
   * Read Git HEAD commit hash from .git directory without spawning external processes.
   */
  static async readGitHead(gitRootDir) {
    if (!gitRootDir) return undefined
    try {
      const headPath = join(gitRootDir, '.git', 'HEAD')
      const headContent = (await readFile(headPath, 'utf8')).trim()
      if (headContent.startsWith('ref:')) {
        const refPath = join(gitRootDir, '.git', headContent.slice(4).trim())
        const commitHash = (await readFile(refPath, 'utf8')).trim()
        return commitHash.slice(0, 12)
      }
      return headContent.slice(0, 12)
    } catch {
      return undefined
    }
  }

  /**
   * Read Git remote URL from .git/config.
   */
  static async readGitRemote(gitRootDir) {
    if (!gitRootDir) return undefined
    try {
      const configPath = join(gitRootDir, '.git', 'config')
      const configContent = await readFile(configPath, 'utf8')
      const match = configContent.match(/\[remote\s+"origin"\][\s\S]*?url\s*=\s*([^\r\n]+)/u)
      if (match && match[1]) {
        return match[1].trim()
      }
    } catch {
      // ignore
    }
    return undefined
  }

  /**
   * Normalize Git remote URL for comparison (removes protocol, auth, .git suffix).
   */
  static normalizeRemote(url) {
    if (!url || typeof url !== 'string') return ''
    return url
      .toLowerCase()
      .trim()
      .replace(/^git@([^:]+):/u, '$1/')
      .replace(/^(?:https?|ssh|git):\/\/(?:[^@]+@)?/u, '')
      .replace(/\.git$/u, '')
      .replace(/\/+$/u, '')
  }

  /**
   * Match an external project's original CWD against the current workspace directory.
   */
  static async matchProject({ originalCwd, historicalGitRoot, historicalRemote, historicalRevision, manualCwd }, currentWorkspaceDir) {
    const result = {
      status: MATCH_STATUS.UNKNOWN,
      matchedPath: undefined,
      matchReason: '',
      confidence: 'none',
      requiresManualSelection: false,
      canImport: false,
      isExactMatch: false,
      revisionChanged: false,
      historicalRevision: historicalRevision?.slice(0, 12) || undefined,
      currentRevision: undefined,
      message: '',
    }

    // 0. If manual directory is provided, verify it first
    if (manualCwd && typeof manualCwd === 'string') {
      const realManual = await realpath(manualCwd).catch(() => null)
      if (realManual) {
        const s = await stat(realManual).catch(() => null)
        if (s && s.isDirectory()) {
          result.status = MATCH_STATUS.MANUAL_SELECTED
          result.matchedPath = realManual
          result.matchReason = '用户手动指定的有效项目目录'
          result.confidence = 'high'
          result.requiresManualSelection = false
          result.canImport = true
          result.message = '已使用手动指定的项目路径'

          const gitRoot = await ProjectMatcher.findGitRoot(realManual)
          if (gitRoot) {
            const currentHead = await ProjectMatcher.readGitHead(gitRoot)
            result.currentRevision = currentHead
            if (result.historicalRevision && currentHead && result.historicalRevision !== currentHead) {
              result.revisionChanged = true
            }
          }
          return result
        }
      }
    }

    if (!originalCwd) {
      result.status = MATCH_STATUS.PATH_NOT_FOUND
      result.matchReason = '原会话未记录项目绝对路径'
      result.confidence = 'none'
      result.requiresManualSelection = true
      result.canImport = false
      result.message = '原会话未记录项目绝对路径，请手动选择工程目录'
      return result
    }

    // 1. Exact canonical realpath check
    const realOriginal = await realpath(originalCwd).catch(() => null)
    const realCurrent = currentWorkspaceDir ? await realpath(currentWorkspaceDir).catch(() => null) : null
    const currentGitRoot = realCurrent ? await ProjectMatcher.findGitRoot(realCurrent) : undefined
    const originalGitRoot = realOriginal ? await ProjectMatcher.findGitRoot(realOriginal) : undefined

    if (realOriginal && realCurrent && realOriginal.toLowerCase() === realCurrent.toLowerCase()) {
      result.status = MATCH_STATUS.EXACT_PATH
      result.matchedPath = realCurrent
      result.matchReason = '精确匹配当前已打开的 DSH 工作区目录'
      result.confidence = 'high'
      result.requiresManualSelection = false
      result.canImport = true
      result.isExactMatch = true
      result.message = '已精确匹配当前工作区路径'

      const gitRoot = await ProjectMatcher.findGitRoot(realCurrent)
      if (gitRoot) {
        const currentHead = await ProjectMatcher.readGitHead(gitRoot)
        result.currentRevision = currentHead
        if (result.historicalRevision && currentHead && result.historicalRevision !== currentHead) {
          result.revisionChanged = true
          result.message = '已匹配项目，但自原会话后代码版本已更新'
        }
      }
      return result
    }

    // Prefer the current repository root over an umbrella/launch directory.
    // Codex and Claude often record the shell's parent directory (for example
    // a monorepo checkout or the user's code folder) instead of the repository
    // opened in DSH. Only infer this when the current workspace is itself a
    // Git root and the recorded path is a strict ancestor with no Git root of
    // its own. A real historical Git root still takes precedence even when
    // the original CWD exists on disk.
    const historicalRoot = typeof historicalGitRoot === 'string' && isAbsolute(historicalGitRoot)
      ? await realpath(historicalGitRoot).catch(() => resolve(historicalGitRoot))
      : undefined
    const historicalRootMatchesCurrent = Boolean(
      currentGitRoot
      && historicalRoot
      && samePath(currentGitRoot, historicalRoot),
    )
    const inferredCurrentRoot = Boolean(
      currentGitRoot
      && realCurrent
      && samePath(currentGitRoot, realCurrent)
      && realOriginal
      && !originalGitRoot
      && isStrictPathAncestor(realOriginal, realCurrent),
    )

    if (historicalRootMatchesCurrent || inferredCurrentRoot) {
      result.status = MATCH_STATUS.GIT_ROOT
      result.matchedPath = currentGitRoot
      result.matchReason = historicalRootMatchesCurrent
        ? '当前工作区的 Git 根目录与原会话记录一致'
        : '原会话记录的是当前仓库的上级目录，已按当前 Git 根目录匹配'
      result.confidence = historicalRootMatchesCurrent ? 'high' : 'medium'
      result.requiresManualSelection = false
      result.canImport = true
      result.message = inferredCurrentRoot
        ? '原记录路径是当前仓库的上级目录，已选择当前 Git 工作区根目录'
        : '已匹配当前 Git 工作区根目录'

      const currentHead = await ProjectMatcher.readGitHead(currentGitRoot)
      result.currentRevision = currentHead
      if (result.historicalRevision && currentHead && result.historicalRevision !== currentHead) {
        result.revisionChanged = true
        result.message = '已匹配 Git 工作区，但自原会话后代码版本已更新'
      }
      return result
    }

    // 2. If original path exists on disk
    if (realOriginal) {
      const origStat = await stat(realOriginal).catch(() => null)
      if (origStat && origStat.isDirectory()) {
        result.status = MATCH_STATUS.EXACT_PATH
        result.matchedPath = realOriginal
        result.matchReason = '原工程物理文件夹完整存在于本机'
        result.confidence = 'high'
        result.requiresManualSelection = false
        result.canImport = true
        result.isExactMatch = true
        result.message = '原项目路径存在于本机'

        const gitRoot = await ProjectMatcher.findGitRoot(realOriginal)
        if (gitRoot) {
          const currentHead = await ProjectMatcher.readGitHead(gitRoot)
          result.currentRevision = currentHead
          if (result.historicalRevision && currentHead && result.historicalRevision !== currentHead) {
            result.revisionChanged = true
          }
        }
        return result
      }
    }

    // 3. Check if current workspace has matching Git root or remote
    if (realCurrent && currentGitRoot) {
        const currentRemote = await ProjectMatcher.readGitRemote(currentGitRoot)
        if (historicalRemote && currentRemote && ProjectMatcher.normalizeRemote(historicalRemote) === ProjectMatcher.normalizeRemote(currentRemote)) {
          result.status = MATCH_STATUS.GIT_REMOTE
          result.matchedPath = currentGitRoot
          result.matchReason = '原目录已不存在，但 Git 远程仓库与当前工作区一致'
          result.confidence = 'low'
          result.requiresManualSelection = false
          result.canImport = true
          result.message = '原目录已不存在，但 Git 远程仓库与当前工作区一致'
          const currentHead = await ProjectMatcher.readGitHead(currentGitRoot)
          result.currentRevision = currentHead
          if (result.historicalRevision && currentHead && result.historicalRevision !== currentHead) {
            result.revisionChanged = true
          }
          return result
        }
    }

    // 4. Path not found and cannot match automatically
    result.status = MATCH_STATUS.PATH_NOT_FOUND
    result.matchReason = '原项目目录不存在于本机，且无法通过 Git 远程自动对齐'
    result.confidence = 'none'
    result.requiresManualSelection = true
    result.canImport = false
    result.message = '原项目目录已不存在或已移动，必须手动选择有效目录后方可导入'
    return result
  }
}
