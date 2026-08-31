/**
 * Context Reconstructor for Conversation Import.
 * Transforms an ExternalConversationV1 into a structured, bounded Handoff Context.
 */

import { ImportTokenBudgeter, TOKEN_BUDGET_DEFAULTS } from './token-budget.mjs'

export class ContextReconstructor {
  /**
   * Reconstruct working state and generate the standardized Handoff Prompt.
   * @param {import('./schema.mjs').ExternalConversationV1} conversation
   * @param {object} [options]
   * @returns {{ promptText: string, tokenEstimate: number, summary: object }}
   */
  static reconstruct(conversation, options = {}) {
    const maxTokens = options.maxTokens || TOKEN_BUDGET_DEFAULTS.TARGET_BUDGET_TOKENS

    const sourceName = conversation.source?.kind === 'claude-code' ? 'Claude Code' : conversation.source?.kind === 'codex' ? 'Codex' : 'External AI Tool'
    const projectName = conversation.project?.displayName || 'Imported Workspace'
    const sessionTitle = conversation.conversation?.title || 'Untitled Session'
    const messages = conversation.messages || []
    const artifacts = conversation.artifacts || { referencedFiles: [], modifiedFiles: [], commands: [], errors: [] }

    // 1. Identify primary task from the earliest user messages
    const userMessages = messages.filter((m) => m.role === 'user')
    const primaryTask = userMessages[0]?.content || sessionTitle || 'Continuing previous development task'

    // 2. Extract recent requirements and decisions
    const recentUserMessages = userMessages.slice(-3)
    const userRequirements = recentUserMessages.map((m) => `- ${m.content.slice(0, 300).replace(/\n+/gu, ' ')}`).join('\n') || 'None specified'

    // 3. Relevant files and changes
    const referencedFilesList = artifacts.referencedFiles.slice(0, 15).map((f) => `- ${f}`).join('\n') || 'None recorded'
    const modifiedFilesList = artifacts.modifiedFiles.slice(0, 15).map((f) => `- ${f}`).join('\n') || 'None recorded'

    // 4. Commands and verifications
    const commandsList = artifacts.commands.slice(-8).map((c) => `- \`${c.command}\``).join('\n') || 'None recorded'

    // 5. Errors and blockers
    const errorsList = artifacts.errors.slice(-5).map((e) => `- ${e}`).join('\n') || 'None currently'
    const currentBlocker = artifacts.errors.length > 0 ? artifacts.errors[artifacts.errors.length - 1] : 'None'

    // 6. Git state
    const gitBranch = conversation.project?.gitBranch || 'unknown'
    const gitRev = conversation.project?.gitRevision?.slice(0, 8) || 'unknown'
    let gitStateStr = `Branch: ${gitBranch}, Commit: ${gitRev}`
    if (options.revisionChanged) {
      gitStateStr += `\nNote: The current workspace Git commit (${options.currentRevision || 'latest'}) differs from the historical import revision (${gitRev}). Inspect current files first.`
    }

    // 7. Recent conversation tail (last 4 messages)
    const recentTail = messages.slice(-TOKEN_BUDGET_DEFAULTS.RECENT_TURNS_PRESERVED)
    const recentTailStr = recentTail.map((m) => `**${m.role.toUpperCase()}**: ${m.content.slice(0, 600)}`).join('\n\n') || 'None'

    // Build the standardized Handoff Markdown template
    const sections = [
      '<external-agent-handoff>',
      '',
      `Source: ${sourceName}`,
      `Project: ${projectName}`,
      `Original title: ${sessionTitle}`,
      '',
      'Imported working state:',
      '',
      '## Primary task',
      primaryTask.slice(0, 800),
      '',
      '## User requirements',
      userRequirements,
      '',
      '## Relevant files',
      referencedFilesList,
      '',
      '## Changes already made',
      modifiedFilesList,
      '',
      '## Commands and verification',
      commandsList,
      '',
      '## Errors / failed attempts',
      errorsList,
      '',
      '## Current blocker',
      currentBlocker.slice(0, 300),
      '',
      '## Git state at import',
      gitStateStr,
      '',
      '## Recent visible conversation',
      recentTailStr,
      '',
      '## Continuation instruction',
      `You are continuing this task in DeepSeek Harness migrated from ${sourceName}.`,
      `Please start your response by greeting the user in Chinese:`,
      `1. Give a warm greeting with a clear title acknowledging: "**已从 ${sourceName} 成功接力会话「${sessionTitle}」**"`,
      `2. Concisely summarize the primary task and key progress from the history in 2-3 bullet points.`,
      `3. If there are modified files or Git commits, mention them briefly.`,
      `4. Ask the user in a friendly tone what they would like to work on next.`,
      `First inspect the current workspace before making assumptions. The filesystem and Git state are authoritative if they differ from the imported historical context.`,
      '',
      '</external-agent-handoff>',
    ]

    let fullPrompt = sections.join('\n')
    fullPrompt = ImportTokenBudgeter.truncateToTokenBudget(fullPrompt, maxTokens)
    const tokenEstimate = ImportTokenBudgeter.estimateTokens(fullPrompt)

    return {
      promptText: fullPrompt,
      tokenEstimate,
      summary: {
        sourceName,
        projectName,
        sessionTitle,
        primaryTask: primaryTask.slice(0, 150),
        filesCount: artifacts.referencedFiles.length,
        modifiedCount: artifacts.modifiedFiles.length,
        messagesCount: messages.length,
        tokenEstimate,
      },
    }
  }
}
