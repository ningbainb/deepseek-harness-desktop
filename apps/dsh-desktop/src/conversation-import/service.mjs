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
import { IMPORT_LIMITS, IMPORT_STATE } from './schema.mjs'
import { DSHSessionBridge } from './session-bridge.mjs'

export class ConversationImportService {
  constructor(options = {}) {
    this.discovery = new ExternalSourceDiscoveryService(options)
    this.ledger = new ImportLedgerStore(options)
    this.bridge = new DSHSessionBridge(options)
    this.currentWorkspaceDir = options.currentWorkspaceDir || process.cwd()
    this.activePlans = new Map()
  }

  setCurrentWorkspaceDir(dir) {
    this.currentWorkspaceDir = dir
  }

  async probeSources() {
    return this.discovery.probeSources()
  }

  async discoverAll() {
    const discoveryResult = await this.discovery.discoverAll()
    const ledgerData = await this.ledger.load()

    // Annotate sessions with ledger status
    for (const proj of discoveryResult.projects) {
      for (const sess of proj.sessions) {
        const key = `${proj.sourceKind}:${sess.sessionRef}`
        const rec = ledgerData.records[key]
        if (!rec) {
          sess.importStatus = 'not-imported'
        } else if (rec.sourceFingerprint && sess.fingerprint && rec.sourceFingerprint !== sess.fingerprint) {
          sess.importStatus = 'source-updated'
          sess.importedAt = rec.importedAt
        } else {
          sess.importStatus = 'imported'
          sess.importedAt = rec.importedAt
        }
      }
    }

    return discoveryResult
  }

  /**
   * Create an opaque preview plan for user review.
   */
  async createPreviewPlan({ sourceKind, sessionRef, manualProjectCwd }) {
    const adapter = this.discovery.getAdapter(sourceKind)
    if (!adapter) {
      throw new Error(`Unsupported source adapter: ${sourceKind}`)
    }

    // 1. Read conversation
    const conversation = await adapter.readConversation(sessionRef)

    // 2. Match project
    const originalCwd = manualProjectCwd || conversation.project?.originalCwd
    const matchResult = await ProjectMatcher.matchProject(
      {
        originalCwd,
        historicalGitRoot: conversation.project?.gitRoot,
        historicalRemote: conversation.project?.gitRemote,
        historicalRevision: conversation.project?.gitRevision,
      },
      this.currentWorkspaceDir,
    )

    // 3. Reconstruct context
    const reconstruction = ContextReconstructor.reconstruct(conversation, {
      revisionChanged: matchResult.revisionChanged,
      currentRevision: matchResult.currentRevision,
    })

    // 4. Compute fingerprint
    const fp = await adapter.fingerprint(sessionRef).catch(() => '')

    // 5. Store plan
    const planId = `plan-${randomUUID()}`
    const plan = {
      planId,
      createdAt: Date.now(),
      expiresAt: Date.now() + IMPORT_LIMITS.PLAN_TTL_MS,
      sourceKind,
      sessionRef,
      fingerprint: fp,
      conversation,
      matchResult,
      reconstruction,
      effectiveCwd: matchResult.matchedPath || originalCwd || this.currentWorkspaceDir,
    }
    this.activePlans.set(planId, plan)

    // Return sanitized preview model to renderer
    return {
      planId,
      sourceKind,
      sourceDisplayName: adapter.displayName,
      sessionTitle: conversation.conversation?.title || 'Untitled Session',
      messageCount: conversation.messages.length,
      createdAt: conversation.conversation?.createdAt,
      updatedAt: conversation.conversation?.updatedAt,
      originalCwd: conversation.project?.originalCwd,
      matchResult: {
        status: matchResult.status,
        matchedPath: matchResult.matchedPath,
        isExactMatch: matchResult.isExactMatch,
        revisionChanged: matchResult.revisionChanged,
        historicalRevision: matchResult.historicalRevision,
        currentRevision: matchResult.currentRevision,
        message: matchResult.message,
      },
      reconstructionSummary: reconstruction.summary,
      previewPromptSnippet: reconstruction.promptText.slice(0, 1500),
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

    const { sourceKind, sessionRef, fingerprint, effectiveCwd, reconstruction, conversation } = plan

    // 1. Create and seed DSH session
    const bridgeResult = await this.bridge.createAndSeedSession({
      projectCwd: effectiveCwd,
      handoffPrompt: reconstruction.promptText,
      title: `[Handoff] ${conversation.conversation?.title || 'Imported Session'}`,
    })

    if (!bridgeResult.ok) {
      throw new Error(`Failed to create DSH session: ${bridgeResult.error || 'Unknown bridge error'}`)
    }

    // 2. Commit to Ledger
    await this.ledger.recordImport({
      sourceKind,
      sourceSessionId: sessionRef,
      sourceFingerprint: fingerprint,
      targetSessionId: bridgeResult.sessionId,
      projectPath: effectiveCwd,
    })

    // Clean up plan
    this.activePlans.delete(planId)

    return {
      ok: true,
      targetSessionId: bridgeResult.sessionId,
      projectPath: effectiveCwd,
      message: '已成功创建新会话并带入工作上下文',
    }
  }
}
