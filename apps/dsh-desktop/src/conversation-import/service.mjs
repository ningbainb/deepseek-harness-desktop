/**
 * Conversation Import Service.
 * Central coordinator managing discovery, preview plans, context reconstruction,
 * project matching, session creation transaction, and ledger commits.
 */

import { randomUUID } from 'node:crypto'

import { ContextReconstructor } from './context-reconstructor.mjs'
import { ExternalSourceDiscoveryService } from './discovery.mjs'
import { ImportLedgerStore } from './ledger.mjs'
import { ProjectMatcher } from './project-matcher.mjs'
import { IMPORT_LIMITS, IMPORT_STATE, LEDGER_STATUS } from './schema.mjs'
import { DSHSessionBridge } from './session-bridge.mjs'

export class ConversationImportService {
  constructor(options = {}) {
    this.discovery = new ExternalSourceDiscoveryService(options)
    this.ledger = new ImportLedgerStore(options)
    this.bridge = new DSHSessionBridge(options)
    this.currentWorkspaceDir = options.currentWorkspaceDir || process.cwd()
    this.activePlans = new Map()
    this.activeBatchPlans = new Map()
    this.batchControllers = new Map()
    this.batchProgressListeners = new Set()
    this.activeSearchController = null
  }

  setCurrentWorkspaceDir(dir) {
    this.currentWorkspaceDir = dir
  }

  setSourceRoot(sourceKind, rootDir) {
    return this.discovery.setSourceRoot(sourceKind, rootDir)
  }

  clearSourceRoot(sourceKind) {
    return this.discovery.clearSourceRoot(sourceKind)
  }

  getSourceRoots() {
    return this.discovery.getSelectedSourceRoots()
  }

  subscribeBatchProgress(listener) {
    if (typeof listener !== 'function') throw new TypeError('batch progress listener must be a function')
    this.batchProgressListeners.add(listener)
    return () => this.batchProgressListeners.delete(listener)
  }

  _emitBatchProgress(payload) {
    for (const listener of [...this.batchProgressListeners]) {
      try { listener(payload) } catch { /* progress observers are best effort */ }
    }
  }

  async probeSources(options = {}) {
    return this.discovery.probeSources(options)
  }

  async discoverAll(options = {}) {
    const discoveryResult = await this.discovery.discoverAll(options)

    // Annotate sessions with ledger status
    for (const proj of discoveryResult.projects) {
      for (const sess of proj.sessions) {
        const sourceSessionId = sess.sessionId || sess.sessionRef.split(/[\\/]/u).pop().replace(/(?:\.jsonl(?:\.zst)?|\.json)$/iu, '')
        const statusInfo = await this.ledger.checkSessionStatus(proj.sourceKind, sourceSessionId, sess.fingerprint)
        sess.importStatus = statusInfo.status
        sess.importedAt = statusInfo.importedAt
        sess.targetSessionId = statusInfo.targetSessionId
      }
    }

    return discoveryResult
  }

  /**
   * Discover the selected Claude/Codex folders without the normal UI caps.
   * This is intentionally separate from discoverAll() so the regular picker
   * remains quick while the explicit "导入全部" action can process history
   * accumulated over many years.
   */
  async discoverSelected(options = {}) {
    const discoveryResult = await this.discovery.discoverSelected(options)
    for (const proj of discoveryResult.projects) {
      for (const sess of proj.sessions) {
        const sourceSessionId = sess.sessionId || sessionIdFromRef(sess.sessionRef)
        const statusInfo = await this.ledger.checkSessionStatus(proj.sourceKind, sourceSessionId, sess.fingerprint)
        sess.importStatus = statusInfo.status
        sess.importedAt = statusInfo.importedAt
        sess.targetSessionId = statusInfo.targetSessionId
      }
    }
    return discoveryResult
  }

  /**
   * Build one plan for one or more external projects. The plan contains only
   * bounded session metadata; transcript bodies are read just before each
   * import so a large source folder does not duplicate all history in memory.
   */
  async createBatchPreviewPlan({ sourceKind, projectRefs, sessionRefs, manualMappings = {}, includeAll = true, sourceRoots } = {}) {
    const discoveryResult = await this.discoverSelected({
      includeAll: includeAll !== false,
      sourceRoots,
    })
    const wanted = Array.isArray(projectRefs) && projectRefs.length > 0
      ? new Set(projectRefs.flatMap((entry) => {
        if (entry && typeof entry === 'object') {
          return [makeProjectKey(entry), [entry.sourceKind || '', entry.projectRef || ''].join('\u001f'), entry.projectRef]
        }
        return [String(entry)]
      }))
      : null
    const selectedProjects = discoveryResult.projects.filter((project) => {
      if (sourceKind && project.sourceKind !== sourceKind) return false
      if (!wanted) return true
      return wanted.has(makeProjectKey(project)) || wanted.has(project.projectRef)
    })
    const wantedSessions = Array.isArray(sessionRefs) && sessionRefs.length > 0
      ? new Set(sessionRefs.flatMap((entry) => {
        if (entry && typeof entry === 'object') return [`${entry.sourceKind || ''}\u001f${entry.sessionRef || ''}`, entry.sessionRef]
        return [String(entry)]
      }))
      : null

    const projectPlans = []
    const items = []
    const workspaceGroups = new Map()
    for (const project of selectedProjects) {
      const projectKey = makeProjectKey(project)
      const manualProjectCwd = resolveManualMapping(manualMappings, projectKey, project.projectRef)
      const matchResult = await ProjectMatcher.matchProject(
        {
          originalCwd: project.originalCwd,
          manualCwd: manualProjectCwd,
        },
        this.currentWorkspaceDir,
      )
      const effectiveCwd = matchResult.canImport
        ? matchResult.matchedPath || project.originalCwd
        : undefined
      const sessionItems = []
      for (const session of (project.sessions || []).filter((candidate) => {
        if (!wantedSessions) return true
        return wantedSessions.has(`${project.sourceKind}\u001f${candidate.sessionRef}`) || wantedSessions.has(candidate.sessionRef)
      })) {
        const sourceSessionId = session.sessionId || sessionIdFromRef(session.sessionRef)
        const existingRec = await this.ledger.findReusableImport(
          project.sourceKind,
          sourceSessionId,
          session.fingerprint || '',
        )
        const item = {
          itemId: `item-${randomUUID()}`,
          projectKey,
          sourceKind: project.sourceKind,
          sourceDisplayName: project.sourceDisplayName,
          sourceRootDir: project.rootDir,
          projectRef: project.projectRef,
          projectName: project.displayName,
          originalCwd: project.originalCwd,
          sessionRef: session.sessionRef,
          sourceSessionId,
          fingerprint: session.fingerprint || '',
          title: session.title || 'Untitled Session',
          snippet: session.snippet || '',
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          messageCount: session.messageCount || 0,
          status: session.status,
          importStatus: existingRec ? 'imported' : session.importStatus,
          existingRec,
          effectiveCwd,
          matchResult,
        }
        items.push(item)
        sessionItems.push(item)
      }

      const workspaceKey = effectiveCwd
        ? normalizePathKey(effectiveCwd)
        : `unmapped:${projectKey}`
      const group = workspaceGroups.get(workspaceKey) || {
        workspaceKey,
        targetPath: effectiveCwd,
        projectKeys: [],
        projectNames: [],
        sessionCount: 0,
        alreadyImportedCount: 0,
        requiresManualSelection: false,
      }
      group.projectKeys.push(projectKey)
      group.projectNames.push(project.displayName)
      group.sessionCount += sessionItems.length
      group.alreadyImportedCount += sessionItems.filter((item) => Boolean(item.existingRec)).length
      group.requiresManualSelection ||= matchResult.requiresManualSelection || !matchResult.canImport
      workspaceGroups.set(workspaceKey, group)

      projectPlans.push({
        projectKey,
        sourceKind: project.sourceKind,
        sourceDisplayName: project.sourceDisplayName,
        sourceRootDir: project.rootDir,
        projectRef: project.projectRef,
        displayName: project.displayName,
        originalCwd: project.originalCwd,
        effectiveCwd,
        sessionCount: sessionItems.length,
        alreadyImportedCount: sessionItems.filter((item) => Boolean(item.existingRec)).length,
        requiresManualSelection: matchResult.requiresManualSelection || !matchResult.canImport,
        matchResult: publicMatchResult(matchResult),
      })
    }

    const planId = `batch-plan-${randomUUID()}`
    const plan = {
      planId,
      createdAt: Date.now(),
      expiresAt: Date.now() + IMPORT_LIMITS.PLAN_TTL_MS,
      sourceKind,
      sourceRoots: this.discovery.getSelectedSourceRoots(),
      projectPlans,
      items,
      workspaceGroups: Array.from(workspaceGroups.values()),
    }
    this.activeBatchPlans.set(planId, plan)
    // A missing-path workflow may re-preview once per project. Keep a small
    // bounded set of superseded plans so cancelled previews cannot accumulate
    // transcript metadata for the lifetime of the desktop process.
    if (this.activeBatchPlans.size > 8) {
      const oldest = [...this.activeBatchPlans.values()]
        .sort((left, right) => left.createdAt - right.createdAt)[0]
      if (oldest && oldest.planId !== planId) this.activeBatchPlans.delete(oldest.planId)
    }

    const blockedProjects = projectPlans.filter((project) => project.requiresManualSelection)
    const importableItems = items.filter((item) => item.effectiveCwd && item.matchResult.canImport)
    const alreadyImportedCount = items.filter((item) => Boolean(item.existingRec)).length
    return {
      planId,
      planType: 'batch',
      createdAt: plan.createdAt,
      expiresAt: plan.expiresAt,
      sourceKind,
      sourceRoots: plan.sourceRoots,
      totalProjects: projectPlans.length,
      totalSessions: items.length,
      importableSessionCount: importableItems.length,
      alreadyImportedCount,
      requiresManualSelection: blockedProjects.length > 0,
      canImport: importableItems.length > 0 && blockedProjects.length === 0,
      blockedProjects: blockedProjects.map((project) => ({
        projectKey: project.projectKey,
        displayName: project.displayName,
        originalCwd: project.originalCwd,
        message: project.matchResult.message,
      })),
      projects: projectPlans.map((project) => ({ ...project, matchResult: { ...project.matchResult } })),
      workspaces: plan.workspaceGroups.map((group) => ({ ...group })),
    }
  }

  async confirmAndImportBatch(planId) {
    const plan = this.activeBatchPlans.get(planId)
    if (!plan) throw new Error('Batch import plan not found or has expired')
    if (Date.now() > plan.expiresAt) {
      this.activeBatchPlans.delete(planId)
      throw new Error('Batch import plan has expired. Please refresh preview.')
    }

    const controller = new AbortController()
    this.batchControllers.set(planId, controller)
    const total = plan.items.length
    const results = []
    let completed = 0
    let importedCount = 0
    let reusedCount = 0
    let failedCount = 0
    try {
      this._emitBatchProgress({ planId, phase: 'started', total, completed: 0, importedCount: 0, reusedCount: 0, failedCount: 0 })
      for (const item of plan.items) {
        if (controller.signal.aborted) {
          results.push({ ok: false, itemId: item.itemId, projectKey: item.projectKey, sessionRef: item.sessionRef, cancelled: true, error: '批量导入已取消' })
          failedCount++
          completed++
          this._emitBatchProgress({ planId, phase: 'cancelled', total, completed, importedCount, reusedCount, failedCount, itemId: item.itemId })
          break
        }

        let result
        try {
          if (!item.effectiveCwd || !item.matchResult?.canImport) {
            throw new Error(item.matchResult?.message || '必须先为该原项目选择目标工作区目录')
          }
          const adapter = this.discovery.getAdapter(item.sourceKind)
          if (!adapter) throw new Error(`Unsupported source adapter: ${item.sourceKind}`)
          const safeSessionRef = await this.discovery.assertSafePath(item.sessionRef)
          const conversation = await adapter.readConversation(safeSessionRef, {
            rootDir: item.sourceRootDir,
          })
          const temporaryPlanId = `${planId}:${item.itemId}`
          this.activePlans.set(temporaryPlanId, {
            planId: temporaryPlanId,
            createdAt: plan.createdAt,
            expiresAt: plan.expiresAt,
            sourceKind: item.sourceKind,
            sessionRef: safeSessionRef,
            fingerprint: item.fingerprint,
            conversation,
            matchResult: item.matchResult,
            effectiveCwd: item.effectiveCwd,
            existingRec: item.existingRec,
          })
          try {
            result = await this.confirmAndImport(temporaryPlanId)
            result = {
              ...result,
              itemId: item.itemId,
              projectKey: item.projectKey,
              sessionRef: item.sessionRef,
            }
          } finally {
            this.activePlans.delete(temporaryPlanId)
          }
          if (result.reused) reusedCount++
          else importedCount++
        } catch (error) {
          failedCount++
          result = {
            ok: false,
            itemId: item.itemId,
            projectKey: item.projectKey,
            sourceKind: item.sourceKind,
            sourceRootDir: item.sourceRootDir,
            projectRef: item.projectRef,
            sessionRef: item.sessionRef,
            title: item.title,
            projectPath: item.effectiveCwd,
            error: error instanceof Error ? error.message : String(error),
          }
        }
        results.push(result)
        completed++
        this._emitBatchProgress({
          planId,
          phase: 'item-complete',
          total,
          completed,
          importedCount,
          reusedCount,
          failedCount,
          itemId: item.itemId,
          projectKey: item.projectKey,
          sessionRef: item.sessionRef,
          result: sanitizeBatchResult(result),
        })
      }
    } finally {
      this.batchControllers.delete(planId)
      this.activeBatchPlans.delete(planId)
    }

    const firstSuccess = results.find((result) => result?.ok)
    const cancelled = controller.signal.aborted || results.some((result) => result?.cancelled)
    const workspaces = []
    const workspaceSeen = new Set()
    for (const result of results) {
      if (!result?.ok || !result.workspaceId || workspaceSeen.has(result.workspaceId)) continue
      workspaceSeen.add(result.workspaceId)
      workspaces.push({ workspaceId: result.workspaceId, projectPath: result.projectPath })
    }
    return {
      ok: failedCount === 0 && !cancelled,
      planId,
      total,
      completed,
      importedCount,
      reusedCount,
      failedCount,
      cancelled,
      workspaceCount: workspaces.length,
      workspaces,
      firstSessionId: firstSuccess?.sessionId,
      firstWorkspaceId: firstSuccess?.workspaceId,
      results,
      message: cancelled
        ? '批量导入已取消，已保留此前完成的会话'
        : failedCount > 0
        ? `批量导入完成：成功 ${importedCount + reusedCount} 个，失败 ${failedCount} 个`
        : `批量导入完成：已处理 ${completed} 个会话`
    }
  }

  cancelBatchImport(planId) {
    const controller = this.batchControllers.get(planId)
    if (!controller) return false
    controller.abort()
    return true
  }

  /**
   * Search session content across all adapters.
   */
  async searchContent(query) {
    if (!query || typeof query !== 'string') return []
    this.activeSearchController?.abort()
    const controller = new AbortController()
    this.activeSearchController = controller
    const results = new Set()
    try {
      for (const [, adapter] of this.discovery.adapters.entries()) {
        if (controller.signal.aborted) break
        if (typeof adapter.searchContent === 'function') {
          const matches = await adapter.searchContent(query, {
            signal: controller.signal,
            rootDir: this.discovery.getSourceRoot(adapter.id),
          }).catch(() => [])
          for (const m of matches) results.add(m)
        }
      }
      return Array.from(results)
    } finally {
      if (this.activeSearchController === controller) this.activeSearchController = null
    }
  }

  /**
   * Create an opaque preview plan for user review.
   */
  async createPreviewPlan({ sourceKind, sessionRef, manualProjectCwd }) {
    const adapter = this.discovery.getAdapter(sourceKind)
    if (!adapter) {
      throw new Error(`Unsupported source adapter: ${sourceKind}`)
    }

    const safeSessionRef = await this.discovery.assertSafePath(sessionRef)

    // 1. Read conversation
    const conversation = await adapter.readConversation(safeSessionRef, {
      rootDir: this.discovery.getSourceRoot(sourceKind),
    })

    // 2. Match project
    const originalCwd = manualProjectCwd || conversation.project?.originalCwd
    const matchResult = await ProjectMatcher.matchProject(
      {
        originalCwd,
        historicalGitRoot: conversation.project?.gitRoot,
        historicalRemote: conversation.project?.gitRemote,
        historicalRevision: conversation.project?.gitRevision,
        manualCwd: manualProjectCwd,
      },
      this.currentWorkspaceDir,
    )

    // 3. Reconstruct context
    const reconstruction = ContextReconstructor.reconstruct(conversation, {
      revisionChanged: matchResult.revisionChanged,
      currentRevision: matchResult.currentRevision,
    })

    // 4. Compute fingerprint & check ledger for existing import
    const fp = await adapter.fingerprint(safeSessionRef).catch(() => '')
    const existingRec = await this.ledger.findReusableImport(sourceKind, conversation.source.sessionId, fp)

    // 5. Store plan
    const planId = `plan-${randomUUID()}`
    const plan = {
      planId,
      createdAt: Date.now(),
      expiresAt: Date.now() + IMPORT_LIMITS.PLAN_TTL_MS,
      sourceKind,
      sessionRef: safeSessionRef,
      fingerprint: fp,
      conversation,
      matchResult,
      reconstruction,
      existingRec,
      effectiveCwd: matchResult.matchedPath || (matchResult.canImport ? originalCwd : undefined),
    }
    this.activePlans.set(planId, plan)

    const events = Array.isArray(conversation.events) ? conversation.events : []
    const toolCallCount = events.filter((e) => e.type === 'tool_call').length
    const sourceStats = conversation.stats || {}
    const sourcePartial = sourceStats.partial === true
    const sourceSkippedEventCount = (Number.isSafeInteger(sourceStats.malformedEvents) ? sourceStats.malformedEvents : 0)
      + (Number.isSafeInteger(sourceStats.oversizedLineCount) ? sourceStats.oversizedLineCount : 0)
      + (sourceStats.maxEventsReached === true ? 1 : 0)

    // Return sanitized preview model to renderer
    return {
      planId,
      sourceKind,
      sourceDisplayName: adapter.displayName,
      sessionTitle: conversation.conversation?.title || 'Untitled Session',
      messageCount: conversation.messages?.length || events.filter((e) => e.type === 'message').length,
      eventCount: events.length,
      toolCallCount,
      createdAt: conversation.conversation?.startedAt || conversation.conversation?.createdAt,
      updatedAt: conversation.conversation?.endedAt || conversation.conversation?.updatedAt,
      originalCwd: conversation.project?.originalCwd,
      canImport: matchResult.canImport,
      requiresManualSelection: matchResult.requiresManualSelection,
      alreadyImported: Boolean(existingRec),
      reusableSessionId: existingRec?.sessionId,
      sourcePartial,
      sourceSkippedEventCount,
      sourceWarning: sourcePartial
        ? '源日志中有 ' + sourceSkippedEventCount + ' 条超长、损坏或超出导入上限的记录未复制；可读取的历史仍会导入。'
        : undefined,
      matchResult: {
        status: matchResult.status,
        matchedPath: matchResult.matchedPath,
        matchReason: matchResult.matchReason,
        confidence: matchResult.confidence,
        requiresManualSelection: matchResult.requiresManualSelection,
        canImport: matchResult.canImport,
        isExactMatch: matchResult.isExactMatch,
        revisionChanged: matchResult.revisionChanged,
        historicalRevision: matchResult.historicalRevision,
        currentRevision: matchResult.currentRevision,
        message: matchResult.message,
      },
      reconstructionSummary: reconstruction.summary,
      previewPromptSnippet: reconstruction.promptText ? reconstruction.promptText.slice(0, 1500) : '',
      eventsPreview: events.slice(0, 20).map((e) => ({
        sequence: e.sequence,
        type: e.type,
        role: e.role,
        contentPreview: (e.content || (e.toolName ? `${e.toolName}(${JSON.stringify(e.toolArgs || {})})` : '')).slice(0, 120),
        toolName: e.toolName,
        sourceTimestamp: e.sourceTimestamp,
      })),
    }
  }

  /**
   * Confirm and execute the import plan.
   */
  async confirmAndImport(planId) {
    const plan = this.activePlans.get(planId)
    if (!plan) {
      throw new Error('Import plan not found or has expired')
    }
    if (Date.now() > plan.expiresAt) {
      this.activePlans.delete(planId)
      throw new Error('Import plan has expired. Please refresh preview.')
    }

    const { sourceKind, sessionRef, fingerprint, effectiveCwd, conversation, matchResult, existingRec } = plan
    const adapter = this.discovery.getAdapter(sourceKind)

    if (!effectiveCwd || !matchResult.canImport) {
      throw new Error('Cannot import session: ' + (matchResult.message || 'Target project path is invalid or missing'))
    }

    // The preview holds an in-memory snapshot. External agents may still be
    // writing the source log while the user reviews it, so reject a stale
    // snapshot instead of silently importing history that no longer matches
    // the selected row. Fingerprints are stat/mtime based and do not reread
    // the transcript body.
    if (fingerprint && typeof adapter?.fingerprint === 'function') {
      const latestFingerprint = await adapter.fingerprint(sessionRef).catch(() => '')
      if (latestFingerprint && latestFingerprint !== fingerprint) {
        this.activePlans.delete(planId)
        throw new Error('源会话在预览后发生变化，请重新扫描并预览后再导入')
      }
    }

    // Reuse existing session if file hasn't changed
    if (existingRec && existingRec.sessionId) {
      this.activePlans.delete(planId)
      return {
        ok: true,
        importId: existingRec.importId,
        workspaceId: existingRec.workspaceId,
        sessionId: existingRec.sessionId,
        targetSessionId: existingRec.sessionId,
        projectPath: effectiveCwd,
        projectName: conversation.project?.displayName || effectiveCwd.split(/[\\/]/).pop() || 'Workspace',
        sessionTitle: conversation.conversation?.title || 'Imported Session',
        importedEventCount: existingRec.eventCount || conversation.events?.length || 0,
        sourcePartial: Boolean(conversation.stats?.partial),
        importTruncated: false,
        reused: true,
        message: '已复用之前导入的会话',
      }
    }

    const importId = `imp-${Date.now()}-${randomUUID().slice(0, 8)}`
    const sourceSessionId = conversation.source?.sessionId || sessionRef
    const requestedSessionId = makeImportSessionId(importId)

    // 1. Begin ledger record
    const beginRecord = await this.ledger.beginImport({
      importId,
      sourceKind,
      sourceSessionId,
      sourceFingerprint: fingerprint,
      workspaceId: '',
      sessionId: requestedSessionId,
      eventCount: conversation.events?.length || 0,
    })
    const effectiveImportId = beginRecord.importId || importId
    const effectiveSessionId = beginRecord.sessionId || makeImportSessionId(effectiveImportId)

    // A second confirmation can race the first one. Reuse a committed record
    // immediately; an in-flight record keeps its stable target ID so the Host
    // route can safely return the already-created session on retry.
    if (beginRecord.status === LEDGER_STATUS.SUCCEEDED && beginRecord.sessionId) {
      this.activePlans.delete(planId)
      return {
        ok: true,
        importId: beginRecord.importId,
        workspaceId: beginRecord.workspaceId,
        sessionId: beginRecord.sessionId,
        targetSessionId: beginRecord.sessionId,
        projectPath: effectiveCwd,
        projectName: conversation.project?.displayName || effectiveCwd.split(/[\\/]/).pop() || 'Workspace',
        sessionTitle: conversation.conversation?.title || 'Imported Session',
        importedEventCount: beginRecord.eventCount || conversation.events?.length || 0,
        sourcePartial: Boolean(conversation.stats?.partial),
        importTruncated: false,
        reused: true,
        message: '已复用之前导入的会话',
      }
    }

    // 2. Execute session bridge import
    const bridgeResult = await this.bridge.importConversationSession({
      projectCwd: effectiveCwd,
      conversation,
      importId: effectiveImportId,
      sessionId: effectiveSessionId,
      title: conversation.conversation?.title || 'Imported Session',
    })

    if (!bridgeResult.ok) {
      await this.ledger.failImport({
        sourceKind,
        sourceSessionId,
        sourceFingerprint: fingerprint,
        error: bridgeResult.error || 'Unknown bridge error',
      })
      throw new Error(`Failed to import conversation: ${bridgeResult.error || 'Unknown bridge error'}`)
    }

    // 3. Commit to Ledger upon verification
    await this.ledger.commitImport({
      importId: effectiveImportId,
      sourceKind,
      sourceSessionId,
      sourceFingerprint: fingerprint,
      workspaceId: bridgeResult.workspaceId || '',
      sessionId: bridgeResult.sessionId,
      eventCount: bridgeResult.importedEventCount || conversation.events?.length || 0,
      transcriptHash: bridgeResult.transcriptHash,
    })

    // Clean up plan
    this.activePlans.delete(planId)

    return {
      ok: true,
      importId: effectiveImportId,
      workspaceId: bridgeResult.workspaceId,
      sessionId: bridgeResult.sessionId,
      targetSessionId: bridgeResult.sessionId,
      projectPath: effectiveCwd,
      projectName: conversation.project?.displayName || (effectiveCwd ? effectiveCwd.split(/[\\/]/).pop() : 'Workspace'),
      sessionTitle: bridgeResult.title || conversation.conversation?.title || 'Imported Session',
      importedEventCount: bridgeResult.importedEventCount,
      sourcePartial: Boolean(conversation.stats?.partial),
      importTruncated: Boolean(bridgeResult.importTruncated),
      transcriptHash: bridgeResult.transcriptHash,
      message: '已成功创建工作区及会话并完成历史记录导入',
    }
  }
}

function sessionIdFromRef(value) {
  return String(value || '')
    .split(/[\\/]/u)
    .pop()
    .replace(/(?:\.jsonl(?:\.zst)?|\.json)$/iu, '')
}

function normalizePathKey(value) {
  return String(value || '').replace(/[\\/]+/gu, '/').replace(/\/$/u, '').toLowerCase()
}

function makeProjectKey(project) {
  if (typeof project === 'string') return project
  return [project?.sourceKind || '', project?.rootDir || '', project?.projectRef || ''].join('\u001f')
}

function resolveManualMapping(mappings, projectKey, projectRef) {
  if (!mappings || typeof mappings !== 'object') return undefined
  const candidate = mappings[projectKey] ?? mappings[projectRef]
  return typeof candidate === 'string' && candidate.trim() ? candidate : undefined
}

function publicMatchResult(matchResult = {}) {
  return {
    status: matchResult.status,
    matchedPath: matchResult.matchedPath,
    matchReason: matchResult.matchReason,
    confidence: matchResult.confidence,
    requiresManualSelection: matchResult.requiresManualSelection,
    canImport: matchResult.canImport,
    isExactMatch: matchResult.isExactMatch,
    revisionChanged: matchResult.revisionChanged,
    historicalRevision: matchResult.historicalRevision,
    currentRevision: matchResult.currentRevision,
    message: matchResult.message,
  }
}

function sanitizeBatchResult(result) {
  if (!result || typeof result !== 'object') return undefined
  return {
    ok: result.ok === true,
    reused: result.reused === true,
    cancelled: result.cancelled === true,
    sessionId: result.sessionId,
    workspaceId: result.workspaceId,
    projectPath: result.projectPath,
    sessionTitle: result.sessionTitle || result.title,
    importedEventCount: result.importedEventCount,
    error: result.error,
  }
}

function makeImportSessionId(importId) {
  const normalized = String(importId || '').replace(/[^a-zA-Z0-9._:-]/gu, '-').slice(0, 112)
  return `import-${normalized || randomUUID().slice(0, 24)}`
}
