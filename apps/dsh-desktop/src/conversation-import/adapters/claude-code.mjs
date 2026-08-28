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

import { Redactor } from '../redaction.mjs'
import {
  ADAPTER_STATUS,
  IMPORT_ADAPTER_VERSION,
  IMPORT_LIMITS,
  IMPORT_SCHEMA_VERSION,
  SOURCE_KINDS,
} from '../schema.mjs'
import { ExternalConversationAdapter } from './external-adapter.mjs'

export class ClaudeCodeAdapter extends ExternalConversationAdapter {
  constructor(options = {}) {
    super(SOURCE_KINDS.CLAUDE_CODE, 'Claude Code')
    this.customRootDir = options.rootDir
  }

  resolveRootDir() {
    return this.customRootDir ? resolve(this.customRootDir) : join(homedir(), '.claude')
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
        
        let sessionCount = 0
        let lastActiveAt = 0
        let detectedCwd = ''
        let projectTitle = entry.name

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
            originalCwd: detectedCwd || projectPath,
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

    return results.slice(0, IMPORT_LIMITS.MAX_PROJECTS)
  }

  async discoverSessions(projectRef, _options = {}) {
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

    return results
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, IMPORT_LIMITS.MAX_SESSIONS_PER_PROJECT)
  }

  async readConversation(sessionRef, _options = {}) {
    if (!sessionRef || typeof sessionRef !== 'string') {
      throw new TypeError('sessionRef is required')
    }

    const fileStats = await stat(sessionRef)
    if (fileStats.size > IMPORT_LIMITS.MAX_FILE_SIZE_BYTES) {
      throw new Error(`Session file exceeds maximum allowed size: ${fileStats.size} bytes`)
    }

    const messages = []
    const referencedFiles = new Set()
    const modifiedFiles = new Set()
    const commands = []
    const errors = []

    let parsedEvents = 0
    let skippedEvents = 0
    let malformedEvents = 0
    let detectedCwd = ''
    let detectedGitRoot = ''
    let detectedGitBranch = ''
    let detectedGitRevision = ''
    let sessionTitle = ''
    let createdAt = Math.round(fileStats.birthtimeMs || fileStats.mtimeMs)
    let updatedAt = Math.round(fileStats.mtimeMs)

    const fileStream = createReadStream(sessionRef, { encoding: 'utf8' })
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    })

    try {
      for await (const line of rl) {
        if (!line || line.trim() === '') continue
        if (line.length > IMPORT_LIMITS.MAX_LINE_LENGTH_BYTES) {
          skippedEvents++
          continue
        }

        let parsed
        try {
          parsed = JSON.parse(line)
        } catch {
          malformedEvents++
          continue
        }

        parsedEvents++

        if (parsed.cwd && typeof parsed.cwd === 'string' && isAbsolute(parsed.cwd)) {
          detectedCwd = parsed.cwd
        }
        if (parsed.git_root && typeof parsed.git_root === 'string') detectedGitRoot = parsed.git_root
        if (parsed.git_branch && typeof parsed.git_branch === 'string') detectedGitBranch = parsed.git_branch
        if (parsed.git_commit && typeof parsed.git_commit === 'string') detectedGitRevision = parsed.git_commit
        if (parsed.title && typeof parsed.title === 'string' && !sessionTitle) sessionTitle = parsed.title

        if (parsed.type === 'reasoning' || parsed.type === 'thinking' || parsed.type === 'internal_trace') {
          skippedEvents++
          continue
        }

        if (parsed.type === 'user' || parsed.role === 'user' || parsed.message?.role === 'user') {
          const rawText = this._extractText(parsed.message?.content ?? parsed.content ?? parsed.text)
          if (rawText) {
            const cleanText = Redactor.redact(rawText)
            messages.push({
              role: 'user',
              content: cleanText,
              timestamp: parsed.timestamp ? Math.round(new Date(parsed.timestamp).getTime()) : undefined,
              kind: 'text',
            })
            if (!sessionTitle) {
              sessionTitle = cleanText.slice(0, 50).replace(/[\r\n]+/gu, ' ')
            }
          }
          continue
        }

        if (parsed.type === 'assistant' || parsed.role === 'assistant' || parsed.message?.role === 'assistant') {
          const rawText = this._extractText(parsed.message?.content ?? parsed.content ?? parsed.text)
          if (rawText) {
            const cleanText = Redactor.redact(rawText)
            messages.push({
              role: 'assistant',
              content: cleanText,
              timestamp: parsed.timestamp ? Math.round(new Date(parsed.timestamp).getTime()) : undefined,
              kind: 'text',
            })
          }

          const contentBlocks = Array.isArray(parsed.message?.content) ? parsed.message.content : Array.isArray(parsed.content) ? parsed.content : []
          for (const block of contentBlocks) {
            if (block && typeof block === 'object') {
              if (block.type === 'tool_use' || block.name) {
                this._inspectToolUse(block, referencedFiles, modifiedFiles, commands)
              }
            }
          }
          continue
        }

        if (parsed.type === 'tool_use' || parsed.tool_use) {
          this._inspectToolUse(parsed.tool_use || parsed, referencedFiles, modifiedFiles, commands)
          continue
        }

        if (parsed.type === 'tool_result' || parsed.tool_result) {
          const tr = parsed.tool_result || parsed
          const contentStr = this._extractText(tr.content ?? tr.output ?? tr.result)
          if (tr.is_error || tr.status === 'failed' || tr.error || (contentStr && /error|failed|exception/iu.test(contentStr))) {
            const errSummary = (tr.error || contentStr || 'Tool execution failed').slice(0, 300)
            errors.push(Redactor.redact(errSummary))
          }
          continue
        }
      }
    } finally {
      rl.close()
    }

    return {
      schemaVersion: IMPORT_SCHEMA_VERSION,
      source: {
        kind: SOURCE_KINDS.CLAUDE_CODE,
        adapterVersion: IMPORT_ADAPTER_VERSION,
        sourceSessionId: basename(sessionRef).replace(/\.jsonl?$/iu, ''),
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
        createdAt,
        updatedAt,
      },
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
    let messageCount = 0
    let isPartial = false

    const stream = createReadStream(filePath, { encoding: 'utf8' })
    const rl = createInterface({ input: stream, crlfDelay: Infinity })

    try {
      for await (const line of rl) {
        if (!line || !line.trim()) continue
        try {
          const parsed = JSON.parse(line)
          if (parsed.type === 'user' || parsed.role === 'user' || parsed.message?.role === 'user') {
            messageCount++
            if (!title) {
              const text = this._extractText(parsed.message?.content ?? parsed.content ?? parsed.text)
              if (text) title = text.slice(0, 60).replace(/[\r\n]+/gu, ' ')
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

    return {
      title,
      messageCount,
      status: isPartial ? ADAPTER_STATUS.PARTIALLY_READABLE : ADAPTER_STATUS.RECOGNIZED,
    }
  }
}
