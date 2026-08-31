/**
 * Claude Code Conversation Adapter.
 * Reads local Claude Code session transcripts, projects, and working context.
 */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'

import { createBoundedLineStream } from '../bounded-lines.mjs'
import { Redactor } from '../redaction.mjs'
import {
  ADAPTER_STATUS,
  EVENT_ROLES,
  EVENT_TYPES,
  IMPORT_ADAPTER_VERSION,
  IMPORT_LIMITS,
  IMPORT_SCHEMA_VERSION,
  IMPORT_SCHEMA_VERSION_V2,
  SOURCE_KINDS,
  TIMESTAMP_QUALITY,
  TOOL_STATUS,
  createTranscriptEvent,
} from '../schema.mjs'
import { ExternalConversationAdapter } from './external-adapter.mjs'

export class ClaudeCodeAdapter extends ExternalConversationAdapter {
  constructor(options = {}) {
    super(SOURCE_KINDS.CLAUDE_CODE, 'Claude Code')
    this.customRootDir = options.rootDir
  }

  resolveRootDir() {
    const configuredRoot = this.customRootDir
      || (typeof process.env.CLAUDE_CONFIG_DIR === 'string' ? process.env.CLAUDE_CONFIG_DIR.trim() : '')
    return configuredRoot ? resolve(configuredRoot) : join(homedir(), '.claude')
  }

  async probe(options = {}) {
    const root = options.rootDir ? resolve(options.rootDir) : this.resolveRootDir()
    try {
      const stats = await stat(root)
      if (stats.isDirectory()) {
        return { available: true, status: ADAPTER_STATUS.RECOGNIZED, rootDir: root }
      }
      return { available: false, status: ADAPTER_STATUS.UNAVAILABLE, rootDir: root }
    } catch {
      return { available: false, status: ADAPTER_STATUS.UNAVAILABLE, rootDir: root }
    }
  }

  _decodeClaudeProjectPath(dirName) {
    if (!dirName) return dirName
    try {
      if (dirName.includes('%')) {
        const decoded = decodeURIComponent(dirName)
        if (decoded && decoded !== dirName) {
          return decoded.replaceAll('/', '\\')
        }
      }
    } catch {
      // ignore
    }
    // Windows drive letters like c--Users-15210-Desktop-code -> C:\Users\15210\Desktop\code
    if (/^[a-zA-Z]--/u.test(dirName)) {
      const drive = dirName[0].toUpperCase() + ':'
      const rest = dirName.slice(3).replace(/-/gu, '\\')
      return `${drive}\\${rest}`
    }
    // Unix paths like -Users-john-code -> /Users/john/code
    if (dirName.startsWith('-')) {
      return dirName.replace(/-/gu, '/')
    }
    return dirName
  }

  async discoverProjects(options = {}) {
    const root = options.rootDir ? resolve(options.rootDir) : this.resolveRootDir()
    const probeRes = await this.probe({ rootDir: root })
    if (!probeRes.available) return []

    const projectsDir = join(root, 'projects')
    const results = []

    try {
      const entries = await readdir(projectsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const projectPath = join(projectsDir, entry.name)
        const decodedPath = this._decodeClaudeProjectPath(entry.name)
        const projectTitle = basename(decodedPath) || entry.name
        const detectedCwd = isAbsolute(decodedPath) ? decodedPath : projectPath
        
        let sessionCount = 0
        let lastActiveAt = 0

        try {
          const files = await readdir(projectPath, { withFileTypes: true })
          for (const file of files) {
            if (file.isFile() && (file.name.endsWith('.jsonl') || file.name.endsWith('.json'))) {
              sessionCount++
              const sPath = join(projectPath, file.name)
              const sStat = await stat(sPath).catch(() => null)
              if (sStat && sStat.mtimeMs > lastActiveAt) {
                lastActiveAt = Math.round(sStat.mtimeMs)
              }
            }
          }
        } catch {
          // ignore
        }

        if (sessionCount > 0) {
          results.push({
            projectRef: projectPath,
            displayName: projectTitle,
            originalCwd: detectedCwd,
            sessionCount,
            lastActiveAt: lastActiveAt || Date.now(),
          })
        }
      }
    } catch {
      // ignore
    }

    const rootSessionsDir = join(root, 'sessions')
    try {
      const sEntries = await readdir(rootSessionsDir, { withFileTypes: true })
      const rootSessionFiles = sEntries.filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
      if (rootSessionFiles.length > 0) {
        results.push({
          projectRef: rootSessionsDir,
          displayName: 'Default Claude Project',
          originalCwd: homedir(),
          sessionCount: rootSessionFiles.length,
          lastActiveAt: Date.now(),
        })
      }
    } catch {
      // ignore
    }

    return options.includeAll === true ? results : results.slice(0, IMPORT_LIMITS.MAX_PROJECTS)
  }

  async discoverSessions(projectRef, options = {}) {
    if (!projectRef || typeof projectRef !== 'string') return []
    const results = []

    try {
      const entries = await readdir(projectRef, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile() || (!entry.name.endsWith('.jsonl') && !entry.name.endsWith('.json'))) continue
        const filePath = join(projectRef, entry.name)

        const fileStats = await stat(filePath).catch(() => null)
        if (!fileStats) continue

        const peek = await this._peekSession(filePath)
        const fp = await this.fingerprint(filePath).catch(() => '')

        results.push({
          sessionRef: filePath,
          title: peek.title || entry.name.replace(/\.jsonl?$/iu, ''),
          snippet: peek.snippet || peek.title || '',
          createdAt: peek.createdAt || Math.round(fileStats.birthtimeMs || fileStats.mtimeMs),
          updatedAt: Math.round(fileStats.mtimeMs),
          messageCount: peek.messageCount || 0,
          status: peek.status || ADAPTER_STATUS.RECOGNIZED,
          fingerprint: fp,
        })
      }
    } catch {
      // ignore
    }

    const sorted = results.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    return options.includeAll === true ? sorted : sorted.slice(0, IMPORT_LIMITS.MAX_SESSIONS_PER_PROJECT)
  }

  async readConversation(sessionRef, _options = {}) {
    if (!sessionRef || typeof sessionRef !== 'string') {
      throw new TypeError('sessionRef is required')
    }

    const fileStats = await stat(sessionRef)
    if (fileStats.size > IMPORT_LIMITS.MAX_FILE_SIZE_BYTES) {
      throw new Error(`Session file exceeds maximum allowed size: ${fileStats.size} bytes`)
    }

    const sourceSessionId = basename(sessionRef).replace(/\.jsonl?$/iu, '')
    const events = []
    const messages = []
    const referencedFiles = new Set()
    const modifiedFiles = new Set()
    const commands = []
    const errors = []

    let currentSequence = 0
    let parsedEvents = 0
    let skippedEvents = 0
    let malformedEvents = 0
    let visibleMessageCount = 0
    let toolCallCount = 0
    let detectedCwd = ''
    let detectedGitRoot = ''
    let detectedGitBranch = ''
    let detectedGitRevision = ''
    let sessionTitle = ''
    let startedAt = Math.round(fileStats.birthtimeMs || fileStats.mtimeMs)
    let endedAt = Math.round(fileStats.mtimeMs)
    let maxEventsReached = false

    const fileStream = createReadStream(sessionRef)
    const boundedStream = createBoundedLineStream(fileStream, {
      maxLineBytes: IMPORT_LIMITS.MAX_LINE_LENGTH_BYTES,
    })
    const rl = createInterface({
      input: boundedStream,
      crlfDelay: Infinity,
    })

    let lineBuffer = ''

    const processRecord = (parsed) => {
      parsedEvents++

      if (parsed.cwd && typeof parsed.cwd === 'string' && isAbsolute(parsed.cwd)) {
        detectedCwd = parsed.cwd
      }
      if (parsed.git_root && typeof parsed.git_root === 'string') detectedGitRoot = parsed.git_root
      if (parsed.git_branch && typeof parsed.git_branch === 'string') detectedGitBranch = parsed.git_branch
      if (parsed.git_commit && typeof parsed.git_commit === 'string') detectedGitRevision = parsed.git_commit
      if (parsed.title && typeof parsed.title === 'string' && !sessionTitle) sessionTitle = parsed.title

      const rawTs = parsed.timestamp || parsed.time || parsed.created_at
      const hasExactTs = Boolean(rawTs)
      const sourceTimestamp = hasExactTs ? Math.round(new Date(rawTs).getTime()) : (endedAt || startedAt)
      const timestampQuality = hasExactTs ? TIMESTAMP_QUALITY.EXACT : TIMESTAMP_QUALITY.INFERRED

      if (sourceTimestamp) {
        if (!startedAt || sourceTimestamp < startedAt) startedAt = sourceTimestamp
        if (!endedAt || sourceTimestamp > endedAt) endedAt = sourceTimestamp
      }

      if (parsed.type === 'reasoning' || parsed.type === 'thinking' || parsed.type === 'internal_trace') {
        skippedEvents++
        return
      }

      const emitToolResult = (toolResultRecord) => {
        const tr = toolResultRecord && typeof toolResultRecord === 'object' ? toolResultRecord : {}
        const contentValue = tr.content ?? tr.output ?? tr.result ?? ''
        const contentStr = this._extractText(contentValue)
        const isError = Boolean(
          tr.is_error
          || tr.isError
          || tr.status === 'failed'
          || tr.error
          || (contentStr && /error|failed|exception/iu.test(contentStr)),
        )
        const toolStatus = isError ? TOOL_STATUS.ERROR : TOOL_STATUS.SUCCESS
        if (isError) {
          const errSummary = String(tr.error || contentStr || 'Tool execution failed').slice(0, 300)
          errors.push(Redactor.redact(errSummary))
        }
        currentSequence++
        events.push(
          createTranscriptEvent({
            sequence: currentSequence,
            type: EVENT_TYPES.TOOL_RESULT,
            role: EVENT_ROLES.TOOL,
            toolCallId: tr.tool_use_id || tr.toolCallId || tr.call_id || tr.id || `call-${currentSequence - 1}`,
            toolResult: contentValue,
            toolStatus,
            sourceEventId: tr.id || tr.tool_use_id || `res-${currentSequence}`,
            sourceTimestamp,
            timestampQuality,
            sourceSessionId,
          }),
        )
      }

      // 1. User message
      if (parsed.type === 'user' || parsed.role === 'user' || parsed.message?.role === 'user') {
        const userContent = parsed.message?.content ?? parsed.content ?? parsed.text
        if (Array.isArray(userContent)) {
          for (const block of userContent) {
            if (block && typeof block === 'object' && block.type === 'tool_result') emitToolResult(block)
          }
        }
        const rawText = this._extractText(userContent)
        if (rawText) {
          const cleanText = Redactor.redact(rawText)
          currentSequence++
          visibleMessageCount++
          events.push(
            createTranscriptEvent({
              sequence: currentSequence,
              type: EVENT_TYPES.MESSAGE,
              role: EVENT_ROLES.USER,
              content: cleanText,
              sourceEventId: parsed.id || parsed.uuid || `msg-${currentSequence}`,
              sourceTimestamp,
              timestampQuality,
              sourceSessionId,
            }),
          )
          messages.push({
            role: 'user',
            content: cleanText,
            timestamp: sourceTimestamp,
            kind: 'text',
          })
          if (!sessionTitle) {
            sessionTitle = cleanText.slice(0, 50).replace(/[\r\n]+/gu, ' ')
          }
        }
        return
      }

      // 2. Assistant message
      if (parsed.type === 'assistant' || parsed.role === 'assistant' || parsed.message?.role === 'assistant') {
        const contentBlocks = Array.isArray(parsed.message?.content) ? parsed.message.content : Array.isArray(parsed.content) ? parsed.content : []

        let textPart = ''
        if (contentBlocks.length > 0) {
          for (const block of contentBlocks) {
            if (typeof block === 'string') {
              textPart += (textPart ? '\n' : '') + block
            } else if (block && typeof block === 'object') {
              if (block.type === 'text' && block.text) {
                textPart += (textPart ? '\n' : '') + block.text
              } else if (block.type === 'tool_use' || block.name) {
                // If there was accumulated text before tool use, emit message event first
                if (textPart.trim()) {
                  const cleanText = Redactor.redact(textPart)
                  currentSequence++
                  visibleMessageCount++
                  events.push(
                    createTranscriptEvent({
                      sequence: currentSequence,
                      type: EVENT_TYPES.MESSAGE,
                      role: EVENT_ROLES.ASSISTANT,
                      content: cleanText,
                      sourceEventId: parsed.id || `msg-${currentSequence}`,
                      sourceTimestamp,
                      timestampQuality,
                      sourceSessionId,
                    }),
                  )
                  messages.push({ role: 'assistant', content: cleanText, timestamp: sourceTimestamp, kind: 'text' })
                  textPart = ''
                }

                toolCallCount++
                this._inspectToolUse(block, referencedFiles, modifiedFiles, commands)
                currentSequence++
                events.push(
                  createTranscriptEvent({
                    sequence: currentSequence,
                    type: EVENT_TYPES.TOOL_CALL,
                    role: EVENT_ROLES.ASSISTANT,
                    toolName: block.name || block.tool || 'tool',
                    toolCallId: block.id || `call-${currentSequence}`,
                    toolArgs: block.input || block.arguments || {},
                    sourceEventId: block.id || `call-${currentSequence}`,
                    sourceTimestamp,
                    timestampQuality,
                    sourceSessionId,
                  }),
                )
              }
            }
          }
        } else {
          const rawText = this._extractText(parsed.message?.content ?? parsed.content ?? parsed.text)
          if (rawText) textPart = rawText
        }

        if (textPart.trim()) {
          const cleanText = Redactor.redact(textPart)
          currentSequence++
          visibleMessageCount++
          events.push(
            createTranscriptEvent({
              sequence: currentSequence,
              type: EVENT_TYPES.MESSAGE,
              role: EVENT_ROLES.ASSISTANT,
              content: cleanText,
              sourceEventId: parsed.id || `msg-${currentSequence}`,
              sourceTimestamp,
              timestampQuality,
              sourceSessionId,
            }),
          )
          messages.push({
            role: 'assistant',
            content: cleanText,
            timestamp: sourceTimestamp,
            kind: 'text',
          })
        }
        return
      }

      // 3. Standalone tool use
      if (parsed.type === 'tool_use' || parsed.tool_use) {
        const tb = parsed.tool_use || parsed
        toolCallCount++
        this._inspectToolUse(tb, referencedFiles, modifiedFiles, commands)
        currentSequence++
        events.push(
          createTranscriptEvent({
            sequence: currentSequence,
            type: EVENT_TYPES.TOOL_CALL,
            role: EVENT_ROLES.ASSISTANT,
            toolName: tb.name || tb.tool || 'tool',
            toolCallId: tb.id || `call-${currentSequence}`,
            toolArgs: tb.input || tb.arguments || {},
            sourceEventId: tb.id || `call-${currentSequence}`,
            sourceTimestamp,
            timestampQuality,
            sourceSessionId,
          }),
        )
        return
      }

      // 4. Standalone tool result
      if (parsed.type === 'tool_result' || parsed.tool_result) {
        emitToolResult(parsed.tool_result || parsed)
        return
      }

      // 5. System event
      if (parsed.type === 'system' || parsed.role === 'system') {
        const rawText = this._extractText(parsed.content ?? parsed.text)
        if (rawText) {
          currentSequence++
          events.push(
            createTranscriptEvent({
              sequence: currentSequence,
              type: EVENT_TYPES.SYSTEM,
              role: EVENT_ROLES.SYSTEM,
              content: Redactor.redact(rawText),
              sourceEventId: parsed.id || `sys-${currentSequence}`,
              sourceTimestamp,
              timestampQuality,
              sourceSessionId,
            }),
          )
        }
      }
    }

    try {
      for await (const line of rl) {
        if (!line || line.trim() === '') continue
        let parsed
        try {
          parsed = JSON.parse(lineBuffer ? lineBuffer + line : line)
          lineBuffer = ''
        } catch {
          if (!lineBuffer && (line.trim().startsWith('{') || line.trim().startsWith('['))) {
            lineBuffer = line + '\n'
            continue
          } else if (lineBuffer) {
            lineBuffer += line + '\n'
            if (lineBuffer.length < 512 * 1024) {
              try {
                parsed = JSON.parse(lineBuffer)
                lineBuffer = ''
              } catch {
                continue
              }
            } else {
              lineBuffer = ''
              malformedEvents++
              continue
            }
          } else {
            malformedEvents++
            continue
          }
        }

        if (parsed && typeof parsed === 'object') {
          if (currentSequence >= IMPORT_LIMITS.MAX_EVENTS_PER_SESSION) {
            maxEventsReached = true
            skippedEvents++
            continue
          }
          processRecord(parsed)
        }
      }
      if (lineBuffer) {
        malformedEvents++
        lineBuffer = ''
      }
      skippedEvents += boundedStream.oversizedLineCount
    } finally {
      rl.close()
    }

    if (!detectedCwd) {
      const parentDirName = basename(resolve(sessionRef, '..'))
      const decoded = this._decodeClaudeProjectPath(parentDirName)
      if (isAbsolute(decoded)) {
        detectedCwd = decoded
      }
    }

    const fp = await this.fingerprint(sessionRef).catch(() => '')

    return {
      schemaVersion: IMPORT_SCHEMA_VERSION_V2,
      source: {
        kind: SOURCE_KINDS.CLAUDE_CODE,
        sessionId: sourceSessionId,
        sourceFile: sessionRef,
        sourceFingerprint: fp,
        importedAt: Date.now(),
      },
      project: {
        displayName: basename(detectedCwd || sessionRef),
        originalCwd: detectedCwd || undefined,
        gitRoot: detectedGitRoot || undefined,
        gitBranch: detectedGitBranch || undefined,
        gitRevision: detectedGitRevision || undefined,
      },
      conversation: {
        title: sessionTitle || basename(sessionRef).replace(/\.jsonl?$/iu, ''),
        startedAt,
        endedAt,
        eventCount: events.length,
        visibleMessageCount,
        toolCallCount,
      },
      events,
      messages: messages.slice(-IMPORT_LIMITS.MAX_MESSAGES_SAVED),
      artifacts: {
        referencedFiles: Array.from(referencedFiles).slice(0, 100),
        modifiedFiles: Array.from(modifiedFiles).slice(0, 100),
        commands: commands.slice(0, 50),
        errors: errors.slice(0, 20),
      },
      stats: {
        parsedEvents,
        skippedEvents,
        malformedEvents,
        oversizedLineCount: boundedStream.oversizedLineCount,
        maxEventsReached,
        partial: malformedEvents > 0 || boundedStream.oversizedLineCount > 0 || maxEventsReached,
      },
    }
  }

  async fingerprint(sessionRef) {
    const fileStats = await stat(sessionRef)
    const hash = createHash('sha256')
    hash.update(`${fileStats.size}:${Math.round(fileStats.mtimeMs)}`)
    return hash.digest('hex')
  }

  _extractText(content) {
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') return part
          if (part && typeof part === 'object') {
            if (part.type === 'text' && typeof part.text === 'string') return part.text
            if (part.text) return String(part.text)
          }
          return ''
        })
        .filter(Boolean)
        .join('\n')
    }
    if (content && typeof content === 'object' && typeof content.text === 'string') {
      return content.text
    }
    return ''
  }

  _inspectToolUse(toolBlock, referencedFiles, modifiedFiles, commands) {
    const name = toolBlock.name || toolBlock.tool || ''
    const input = toolBlock.input || toolBlock.arguments || {}

    if (name.includes('Read') || name.includes('View') || name === 'file_view') {
      const path = input.file_path || input.path || input.file
      if (typeof path === 'string') referencedFiles.add(path)
    } else if (name.includes('Write') || name.includes('Edit') || name.includes('Replace') || name === 'file_edit') {
      const path = input.file_path || input.path || input.file
      if (typeof path === 'string') {
        referencedFiles.add(path)
        modifiedFiles.add(path)
      }
    } else if (name.includes('Bash') || name.includes('exec') || name.includes('command') || name === 'terminal') {
      const cmd = input.command || input.cmd || input.script
      if (typeof cmd === 'string' && cmd.trim()) {
        commands.push({ command: Redactor.redact(cmd.trim().slice(0, 200)) })
      }
    }
  }

  async _peekSession(filePath) {
    let title = ''
    let snippet = ''
    let messageCount = 0
    let isPartial = false

    const stream = createReadStream(filePath)
    const boundedStream = createBoundedLineStream(stream, {
      maxLineBytes: IMPORT_LIMITS.MAX_LINE_LENGTH_BYTES,
    })
    const rl = createInterface({ input: boundedStream, crlfDelay: Infinity })

    try {
      for await (const line of rl) {
        if (!line || !line.trim()) continue
        try {
          const parsed = JSON.parse(line)
          if (parsed.type === 'user' || parsed.role === 'user' || parsed.message?.role === 'user') {
            messageCount++
            const text = this._extractText(parsed.message?.content ?? parsed.content ?? parsed.text)
            if (text) {
              if (!title) title = text.slice(0, 60).replace(/[\r\n]+/gu, ' ')
              if (!snippet) snippet = text.slice(0, 150).replace(/[\r\n]+/gu, ' ')
            }
          } else if (parsed.type === 'assistant' || parsed.role === 'assistant' || parsed.message?.role === 'assistant') {
            messageCount++
          }
        } catch {
          isPartial = true
        }
      }
    } catch {
      isPartial = true
    } finally {
      rl.close()
    }
    if (boundedStream.oversizedLineCount > 0) isPartial = true

    return {
      title,
      snippet: snippet || title,
      messageCount,
      status: isPartial ? ADAPTER_STATUS.PARTIALLY_READABLE : ADAPTER_STATUS.RECOGNIZED,
    }
  }

  async searchContent(query, { signal, rootDir } = {}) {
    if (!query || typeof query !== 'string') return []
    const q = query.toLowerCase().trim()
    if (!q) return []

    const root = rootDir ? resolve(rootDir) : this.resolveRootDir()
    const projectsDir = join(root, 'projects')
    const results = []

    const searchDir = async (dir) => {
      try {
        const entries = await readdir(dir, { withFileTypes: true })
        for (const e of entries) {
          const p = join(dir, e.name)
          if (e.isDirectory()) await searchDir(p)
          else if (e.isFile() && (e.name.endsWith('.jsonl') || e.name.endsWith('.json'))) {
            results.push(p)
          }
        }
      } catch {}
    }

    await searchDir(projectsDir)
    await searchDir(join(root, 'sessions'))

    const candidates = []
    let remainingBytes = IMPORT_LIMITS.MAX_SEARCH_TOTAL_BYTES
    const entries = await Promise.all(results.map(async (filePath) => ({
      filePath,
      stats: await stat(filePath).catch(() => null),
    })))
    for (const entry of entries
      .filter((item) => item.stats)
      .sort((a, b) => (b.stats.mtimeMs || 0) - (a.stats.mtimeMs || 0))) {
      if (signal?.aborted || remainingBytes <= 0) break
      const budget = Math.min(entry.stats.size, IMPORT_LIMITS.MAX_SEARCH_FILE_BYTES)
      if (budget <= 0) continue
      candidates.push({ ...entry, budget })
      remainingBytes -= budget
    }

    const matched = []
    const batchSize = 32
    for (let i = 0; i < candidates.length; i += batchSize) {
      if (signal?.aborted) break
      const batch = candidates.slice(i, i + batchSize)
      await Promise.all(
        batch.map(async ({ filePath, stats }) => {
          try {
            if (signal?.aborted) return
            const ranges = stats.size <= IMPORT_LIMITS.MAX_SEARCH_FILE_BYTES
              ? [{ start: undefined, end: undefined }]
              : [
                  { start: 0, end: Math.floor(IMPORT_LIMITS.MAX_SEARCH_FILE_BYTES / 2) - 1 },
                  {
                    start: Math.max(0, stats.size - Math.floor(IMPORT_LIMITS.MAX_SEARCH_FILE_BYTES / 2)),
                    end: stats.size - 1,
                  },
                ]
            for (const range of ranges) {
              if (signal?.aborted) return
              const stream = createReadStream(filePath, {
                highWaterMark: 64 * 1024,
                ...(signal ? { signal } : {}),
                ...(range.start === undefined ? {} : { start: range.start, end: range.end }),
              })
              const boundedStream = createBoundedLineStream(stream, {
                maxLineBytes: IMPORT_LIMITS.MAX_LINE_LENGTH_BYTES,
              })
              const rl = createInterface({ input: boundedStream, crlfDelay: Infinity })
              let found = false
              for await (const line of rl) {
                if (signal?.aborted) return
                if (line.toLowerCase().includes(q)) {
                  found = true
                  break
                }
              }
              rl.close()
              if (found) {
                matched.push(filePath)
                break
              }
            }
          } catch {}
        }),
      )
      if (matched.length >= 100) break
    }
    return matched
  }
}
