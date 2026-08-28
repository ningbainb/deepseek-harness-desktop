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
    this.allowedRoots = new Set(
      options.allowedRoots
        ? options.allowedRoots.map((r) => resolve(r))
        : [resolve(homedir())],
    )
  }

  registerAdapter(adapter) {
    this.adapters.set(adapter.id, adapter)
  }

  getAdapter(sourceKind) {
    return this.adapters.get(sourceKind)
  }

  /**
   * Safe path verification against path traversal and symlink escape.
   */
  async assertSafePath(targetPath) {
    if (typeof targetPath !== 'string' || !isAbsolute(targetPath)) {
      throw new Error(`Target path must be an absolute string: ${targetPath}`)
    }
    const real = await realpath(targetPath).catch(() => null)
    if (!real) {
      const normalized = resolve(targetPath)
      const isAllowed = Array.from(this.allowedRoots).some((root) => {
        const rel = relative(root, normalized)
        return rel === '' || (!rel.startsWith('..') && !rel.startsWith(`..${sep}`))
      })
      if (!isAllowed) {
        throw new Error(`Path escape detected: ${targetPath}`)
      }
      return normalized
    }

    const isAllowed = Array.from(this.allowedRoots).some((root) => {
      const rel = relative(root, real)
      return rel === '' || (!rel.startsWith('..') && !rel.startsWith(`..${sep}`))
    })
    if (!isAllowed) {
      throw new Error(`Symlink or path traversal escape detected: ${targetPath}`)
    }
    return real
  }

  async probeSources() {
    const results = []
    for (const [id, adapter] of this.adapters) {
      try {
        const res = await adapter.probe()
        results.push({
          sourceKind: id,
          displayName: adapter.displayName,
          available: res.available,
          status: res.status,
          reason: res.reason,
        })
      } catch (error) {
        results.push({
          sourceKind: id,
          displayName: adapter.displayName,
          available: false,
          status: ADAPTER_STATUS.UNAVAILABLE,
          reason: error.message,
        })
      }
    }
    return results
  }

  async discoverAll() {
    const sourcesSummary = []
    const projectsGrouped = []

    for (const [id, adapter] of this.adapters) {
      const probeRes = await adapter.probe().catch(() => ({ available: false }))
      if (!probeRes.available) {
        sourcesSummary.push({
          sourceKind: id,
          displayName: adapter.displayName,
          available: false,
          projectCount: 0,
          sessionCount: 0,
        })
        continue
      }

      let projects = []
      try {
        projects = await adapter.discoverProjects()
      } catch {
        // ignore
      }

      let totalSessions = 0

      for (const proj of projects) {
        let sessions = []
        try {
          sessions = await adapter.discoverSessions(proj.projectRef)
        } catch {
          // ignore
        }
        totalSessions += sessions.length

        projectsGrouped.push({
          sourceKind: id,
          sourceDisplayName: adapter.displayName,
          projectRef: proj.projectRef,
          displayName: proj.displayName,
          originalCwd: proj.originalCwd,
          sessionCount: sessions.length,
          lastActiveAt: proj.lastActiveAt,
          sessions: sessions.map((s) => ({
            sessionRef: s.sessionRef,
            title: s.title,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            messageCount: s.messageCount,
            status: s.status,
            fingerprint: s.fingerprint,
          })),
        })
      }

      sourcesSummary.push({
        sourceKind: id,
        displayName: adapter.displayName,
        available: true,
        projectCount: projects.length,
        sessionCount: totalSessions,
      })
    }

    return {
      sources: sourcesSummary,
      projects: projectsGrouped.sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0)),
    }
  }
}
