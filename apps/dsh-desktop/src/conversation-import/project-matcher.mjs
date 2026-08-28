/**
 * Project Matcher for Conversation Import.
 * Resolves canonical path, Git root, remote identities, and detects revision changes.
 */

import { readFile, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

import { MATCH_STATUS } from './schema.mjs'

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
  static async matchProject({ originalCwd, historicalGitRoot, historicalRemote, historicalRevision }, currentWorkspaceDir) {
    const result = {
      status: MATCH_STATUS.UNKNOWN,
      matchedPath: undefined,
      isExactMatch: false,
      revisionChanged: false,
      historicalRevision: historicalRevision?.slice(0, 12) || undefined,
      currentRevision: undefined,
      message: '',
    }

    if (!originalCwd) {
      result.status = MATCH_STATUS.PATH_NOT_FOUND
      result.message = '原会话未记录项目绝对路径'
      return result
    }

    // 1. Exact canonical realpath check
    const realOriginal = await realpath(originalCwd).catch(() => null)
    const realCurrent = currentWorkspaceDir ? await realpath(currentWorkspaceDir).catch(() => null) : null

    if (realOriginal && realCurrent && realOriginal.toLowerCase() === realCurrent.toLowerCase()) {
      result.status = MATCH_STATUS.EXACT_PATH
      result.matchedPath = realCurrent
      result.isExactMatch = true
      result.message = '已精确匹配当前工作区路径'

      // Check Git revision
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

    // If original path exists on disk (even if not currently opened as currentWorkspaceDir)
    if (realOriginal) {
      result.status = MATCH_STATUS.EXACT_PATH
      result.matchedPath = realOriginal
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

    // 2. Original path does not exist on disk -> Check if current workspace has matching Git root or remote
    if (realCurrent) {
      const currentGitRoot = await ProjectMatcher.findGitRoot(realCurrent)
      if (currentGitRoot) {
        const currentRemote = await ProjectMatcher.readGitRemote(currentGitRoot)
        if (historicalRemote && currentRemote && ProjectMatcher.normalizeRemote(historicalRemote) === ProjectMatcher.normalizeRemote(currentRemote)) {
          result.status = MATCH_STATUS.GIT_REMOTE
          result.matchedPath = currentGitRoot
          result.message = '原目录已不存在，但 Git 远程仓库与当前工作区一致'
          const currentHead = await ProjectMatcher.readGitHead(currentGitRoot)
          result.currentRevision = currentHead
          if (result.historicalRevision && currentHead && result.historicalRevision !== currentHead) {
            result.revisionChanged = true
          }
          return result
        }
      }
    }

    result.status = MATCH_STATUS.PATH_NOT_FOUND
    result.message = '原项目目录已不存在或已移动，请手动选择当前项目目录'
    return result
  }
}
