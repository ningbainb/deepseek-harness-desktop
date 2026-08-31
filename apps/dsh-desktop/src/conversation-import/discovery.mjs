/**
 * External Source Discovery Service.
 * Safely discovers and aggregates projects and sessions from all registered adapters.
 */

import { realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, relative, resolve, sep } from 'node:path'

import { ClaudeCodeAdapter } from './adapters/claude-code.mjs'
import { CodexAdapter } from './adapters/codex.mjs'
import { ADAPTER_STATUS, IMPORT_LIMITS, SOURCE_KINDS } from './schema.mjs'

export class ExternalSourceDiscoveryService {
  constructor(options = {}) {
    this.adapters = new Map([
      [SOURCE_KINDS.CLAUDE_CODE, new ClaudeCodeAdapter({ rootDir: options.claudeRootDir })],
      [SOURCE_KINDS.CODEX, new CodexAdapter({ rootDir: options.codexRootDir })],
    ])
    const hasExplicitAllowedRoots = Array.isArray(options.allowedRoots)
    const configuredRoots = hasExplicitAllowedRoots
      ? []
      : [
          options.claudeRootDir,
          options.codexRootDir,
          typeof process.env.CLAUDE_CONFIG_DIR === 'string' ? process.env.CLAUDE_CONFIG_DIR : undefined,
          typeof process.env.CODEX_HOME === 'string' ? process.env.CODEX_HOME : undefined,
        ]
    const baseRoots = hasExplicitAllowedRoots ? options.allowedRoots : [homedir()]
    const sourceRoots = []
    if (!hasExplicitAllowedRoots) {
      for (const adapter of this.adapters.values()) {
        try {
          if (typeof adapter.resolveRootDir === 'function') sourceRoots.push(adapter.resolveRootDir())
        } catch {
          // An invalid optional source configuration is reported by probe().
        }
      }
    }
    this.allowedRoots = new Set(
      [...baseRoots, ...configuredRoots, ...sourceRoots]
        .filter((root) => typeof root === 'string' && root.trim())
        .map((root) => resolve(root)),
    )
    // Source roots selected in the native directory picker are kept in the
    // main process.  Renderer code never needs to pass the roots back for
    // every scan/import request, and an explicitly selected root becomes an
    // allowed boundary for the subsequent safe-path checks.
    this.selectedRoots = new Map()
    for (const [sourceKind, rootDir] of Object.entries(options.sourceRoots || {})) {
      if (typeof rootDir === 'string' && rootDir.trim()) {
        this.setSourceRoot(sourceKind, rootDir)
      }
    }
  }

  registerAdapter(adapter) {
    this.adapters.set(adapter.id, adapter)
  }

  getAdapter(sourceKind) {
    return this.adapters.get(sourceKind)
  }

  /**
   * Remember a user-selected source folder and add it to the path allowlist.
   * The caller is still expected to probe the folder before scanning it; this
   * method deliberately does not read from disk so it remains synchronous.
   */
  setSourceRoot(sourceKind, rootDir) {
    const adapter = this.getAdapter(sourceKind)
    if (!adapter) throw new Error(`Unsupported source adapter: ${sourceKind}`)
    if (typeof rootDir !== 'string' || !isAbsolute(rootDir)) {
      throw new TypeError('source root must be an absolute path')
    }
    const resolvedRoot = resolve(rootDir)
    this.selectedRoots.set(sourceKind, resolvedRoot)
    this.allowedRoots.add(resolvedRoot)
    return resolvedRoot
  }

  clearSourceRoot(sourceKind) {
    this.selectedRoots.delete(sourceKind)
  }

  getSourceRoot(sourceKind) {
    return this.selectedRoots.get(sourceKind) || this.getAdapter(sourceKind)?.resolveRootDir?.()
  }

  getSelectedSourceRoots() {
    return Object.fromEntries(this.selectedRoots.entries())
  }

  /**
   * Safe path verification against path traversal and symlink escape.
   */
  async assertSafePath(targetPath) {
    if (typeof targetPath !== 'string' || !isAbsolute(targetPath)) {
      throw new Error(`Target path must be an absolute string: ${targetPath}`)
    }
    const real = await realpath(targetPath).catch(() => null)
    const canonicalRoots = await Promise.all(
      Array.from(this.allowedRoots, async (root) => realpath(root).catch(() => resolve(root))),
    )
    const isAllowedPath = (candidate) => canonicalRoots.some((root) => {
      const rel = relative(root, candidate)
      return rel === '' || (!rel.startsWith('..') && !rel.startsWith(`..${sep}`))
    })
    if (!real) {
      const normalized = resolve(targetPath)
      if (!isAllowedPath(normalized)) {
        throw new Error(`Path escape detected: ${targetPath}`)
      }
      return normalized
    }

    if (!isAllowedPath(real)) {
      throw new Error(`Symlink or path traversal escape detected: ${targetPath}`)
    }
    return real
  }

  async probeSources(options = {}) {
    const requestedRoots = options?.sourceRoots && typeof options.sourceRoots === 'object'
      ? options.sourceRoots
      : undefined
    const results = []
    for (const [id, adapter] of this.adapters) {
      try {
        const requestedRoot = requestedRoots?.[id]
        const rootDir = requestedRoot
          ? this.setSourceRoot(id, requestedRoot)
          : this.getSourceRoot(id)
        const res = await adapter.probe({ rootDir })
        results.push({
          sourceKind: id,
          displayName: adapter.displayName,
          available: res.available,
          status: res.status,
          reason: res.reason,
          rootDir: res.rootDir || rootDir,
        })
      } catch (error) {
        results.push({
          sourceKind: id,
          displayName: adapter.displayName,
          available: false,
          status: ADAPTER_STATUS.UNAVAILABLE,
          reason: error.message,
          rootDir: this.getSourceRoot(id),
        })
      }
    }
    return results
  }

  async discoverAll(options = {}) {
    const requestedRoots = options?.sourceRoots && typeof options.sourceRoots === 'object'
      ? options.sourceRoots
      : undefined
    const includeAll = options?.includeAll === true
    const sourcesSummary = []
    const projectsGrouped = []

    for (const [id, adapter] of this.adapters) {
      let rootDir
      try {
        rootDir = requestedRoots?.[id]
          ? this.setSourceRoot(id, requestedRoots[id])
          : this.getSourceRoot(id)
      } catch {
        rootDir = undefined
      }
      const probeRes = await adapter.probe({ rootDir }).catch(() => ({ available: false, rootDir }))
      if (!probeRes.available) {
        sourcesSummary.push({
          sourceKind: id,
          displayName: adapter.displayName,
          available: false,
          projectCount: 0,
          sessionCount: 0,
          rootDir: probeRes.rootDir || rootDir,
        })
        continue
      }

      let projects = []
      try {
        projects = await adapter.discoverProjects({ rootDir: probeRes.rootDir || rootDir, includeAll })
      } catch {
        // ignore
      }

      let totalSessions = 0

      for (const proj of projects) {
        let sessions = []
        try {
          sessions = await adapter.discoverSessions(proj.projectRef, {
            rootDir: probeRes.rootDir || rootDir,
            includeAll,
          })
        } catch {
          // ignore
        }
        totalSessions += sessions.length

        projectsGrouped.push({
          sourceKind: id,
          sourceDisplayName: adapter.displayName,
          rootDir: probeRes.rootDir || rootDir,
          projectRef: proj.projectRef,
          displayName: proj.displayName,
          originalCwd: proj.originalCwd,
          sessionCount: sessions.length,
          lastActiveAt: proj.lastActiveAt,
          sessions: sessions.map((s) => ({
            sessionId: s.sessionId,
            sessionRef: s.sessionRef,
            title: s.title,
            // Keep the adapter-provided first-message preview so the list is
            // useful before the user opens the full preview pane.
            snippet: s.snippet,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            messageCount: s.messageCount,
            status: s.status,
            fingerprint: s.fingerprint,
            importStatus: s.importStatus,
            importedAt: s.importedAt,
            targetSessionId: s.targetSessionId,
          })),
        })
      }

      sourcesSummary.push({
        sourceKind: id,
        displayName: adapter.displayName,
        available: true,
        projectCount: projects.length,
        sessionCount: totalSessions,
        rootDir: probeRes.rootDir || rootDir,
      })
    }

    return {
      sources: sourcesSummary,
      projects: projectsGrouped.sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0)),
    }
  }

  async discoverSelected(options = {}) {
    return this.discoverAll({ ...options, includeAll: options.includeAll !== false })
  }
}
