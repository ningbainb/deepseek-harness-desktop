/**
 * Codex Conversation Adapter.
 * Reads local Codex sessions, rollouts, session index, and working context.
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

export class CodexAdapter extends ExternalConversationAdapter {
  constructor(options = {}) {
    super(SOURCE_KINDS.CODEX, 'Codex')
    this.customRootDir = options.rootDir
  }

  resolveRootDir() {
    return this.customRootDir ? resolve(this.customRootDir) : join(homedir(), '.codex')
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

    const projectsMap = new Map()

    // 1. Scan sessions directory
    const sessionsDir = join(root, 'sessions')
    try {
      const entries = await readdir(sessionsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile() || (!entry.name.endsWith('.jsonl') && !entry.name.endsWith('.json'))) continue
        const filePath = join(sessionsDir, entry.name)
        const fileStats = await stat(filePath).catch(() => null)
        if (!fileStats) continue

        const peek = await this._peekSession(filePath)
        const projectKey = peek.cwd || 'default-codex-project'
        const existing = projectsMap.get(projectKey) || {
          projectRef: projectKey,
          displayName: basename(projectKey) || 'Codex Workspace',
          originalCwd: isAbsolute(projectKey) ? projectKey : homedir(),
          sessionCount: 0,
          lastActiveAt: 0,
          sessionFiles: [],
        }

        existing.sessionCount++
        existing.sessionFiles.push(filePath)
        if (fileStats.mtimeMs > existing.lastActiveAt) {
          existing.lastActiveAt = Math.round(fileStats.mtimeMs)
        }
        projectsMap.set(projectKey, existing)
      }
    } catch {
      // ignore
    }

    // 2. Scan rollouts or history directory if present
    const rolloutsDir = join(root, 'rollouts')
    try {
      const entries = await readdir(rolloutsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const rPath = join(rolloutsDir, entry.name)
        const rFiles = await readdir(rPath, { withFileTypes: true }).catch(() => [])
        const sessionFiles = rFiles.filter((f) => f.isFile() && f.name.endsWith('.jsonl'))
        if (sessionFiles.length > 0) {
          projectsMap.set(rPath, {
            projectRef: rPath,
            displayName: entry.name,
            originalCwd: homedir(),
            sessionCount: sessionFiles.length,
            lastActiveAt: Date.now(),
          })
        }
      }
    } catch {
      // ignore
    }

    return Array.from(projectsMap.values()).slice(0, IMPORT_LIMITS.MAX_PROJECTS)
  }

  async discoverSessions(projectRef, _options = {}) {
    if (!projectRef || typeof projectRef !== 'string') return []
    const root = this.resolveRootDir()
    const sessionsDir = join(root, 'sessions')
    const results = []

    try {
      // If projectRef is a directory path, scan it
      let targetDir = sessionsDir
      const refStat = await stat(projectRef).catch(() => null)
      if (refStat && refStat.isDirectory()) {
        targetDir = projectRef
      }

      const entries = await readdir(targetDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile() || (!entry.name.endsWith('.jsonl') && !entry.name.endsWith('.json'))) continue
        const filePath = join(targetDir, entry.name)

        const fileStats = await stat(filePath).catch(() => null)
        if (!fileStats) continue

        const peek = await this._peekSession(filePath)
        // If projectRef is a specific cwd, filter by cwd if known
        if (projectRef !== targetDir && isAbsolute(projectRef) && peek.cwd && peek.cwd !== projectRef) {
          continue
        }

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

        // Extract metadata
        if (parsed.cwd && typeof parsed.cwd === 'string' && isAbsolute(parsed.cwd)) {
          detectedCwd = parsed.cwd
        }
        if (parsed.git_root && typeof parsed.git_root === 'string') detectedGitRoot = parsed.git_root
        if (parsed.git_branch && typeof parsed.git_branch === 'string') detectedGitBranch = parsed.git_branch
        if (parsed.git_commit && typeof parsed.git_commit === 'string') detectedGitRevision = parsed.git_commit
        if (parsed.title && typeof parsed.title === 'string' && !sessionTitle) sessionTitle = parsed.title

        // Skip internal reasoning / rollout trace events
        if (parsed.type === 'reasoning' || parsed.type === 'internal' || parsed.type === 'rollout_trace') {
          skippedEvents++
          continue
        }

        // Handle user message event
        if (parsed.role === 'user' || parsed.type === 'user_turn' || parsed.type === 'user') {
          const rawText = this._extractText(parsed.content ?? parsed.message?.content ?? parsed.text)
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

        // Handle assistant message event
        if (parsed.role === 'assistant' || parsed.type === 'assistant_turn' || parsed.type === 'assistant') {
          const rawText = this._extractText(parsed.content ?? parsed.message?.content ?? parsed.text)
          if (rawText) {
            const cleanText = Redactor.redact(rawText)
            messages.push({
              role: 'assistant',
              content: cleanText,
              timestamp: parsed.timestamp ? Math.round(new Date(parsed.timestamp).getTime()) : undefined,
              kind: 'text',
            })
          }

          // Inspect tool calls in assistant turn
          const toolCalls = parsed.tool_calls || parsed.tools || []
          for (const tc of toolCalls) {
            this._inspectToolCall(tc, referencedFiles, modifiedFiles, commands)
          }
          continue
        }

        // Handle tool event
        if (parsed.role === 'tool' || parsed.type === 'tool_call' || parsed.type === 'tool_result') {
          this._inspectToolCall(parsed, referencedFiles, modifiedFiles, commands)
          if (parsed.status === 'failed' || parsed.error || parsed.is_error) {
            const errStr = parsed.error || parsed.content || 'Tool failure'
            errors.push(Redactor.redact(String(errStr).slice(0, 300)))
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
        kind: SOURCE_KINDS.CODEX,
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
        .map((part) => (typeof part === 'string' ? part : part?.text || ''))
        .filter(Boolean)
        .join('\n')
    }
    if (content && typeof content === 'object' && typeof content.text === 'string') {
      return content.text
    }
    return ''
  }

  _inspectToolCall(tc, referencedFiles, modifiedFiles, commands) {
    const name = tc.name || tc.tool || tc.function?.name || ''
    const args = tc.arguments || tc.input || tc.params || {}
    const parsedArgs = typeof args === 'string' ? (() => { try { return JSON.parse(args) } catch { return {} } })() : args

    if (name.includes('read') || name.includes('view') || name.includes('search')) {
      const file = parsedArgs.path || parsedArgs.file || parsedArgs.file_path
      if (typeof file === 'string') referencedFiles.add(file)
    } else if (name.includes('write') || name.includes('edit') || name.includes('create') || name.includes('replace')) {
      const file = parsedArgs.path || parsedArgs.file || parsedArgs.file_path
      if (typeof file === 'string') {
        referencedFiles.add(file)
        modifiedFiles.add(file)
      }
    } else if (name.includes('exec') || name.includes('command') || name.includes('shell') || name.includes('bash')) {
      const cmd = parsedArgs.command || parsedArgs.cmd || parsedArgs.script
      if (typeof cmd === 'string' && cmd.trim()) {
        commands.push({ command: Redactor.redact(cmd.trim().slice(0, 200)) })
      }
    }
  }

  async _peekSession(filePath) {
    let title = ''
    let messageCount = 0
    let cwd = ''
    let isPartial = false

    const stream = createReadStream(filePath, { encoding: 'utf8' })
    const rl = createInterface({ input: stream, crlfDelay: Infinity })

    try {
      for await (const line of rl) {
        if (!line || !line.trim()) continue
        try {
          const parsed = JSON.parse(line)
          if (parsed.cwd && typeof parsed.cwd === 'string' && !cwd) {
            cwd = parsed.cwd
          }
          if (parsed.role === 'user' || parsed.type === 'user_turn' || parsed.type === 'user') {
            messageCount++
            if (!title) {
              const text = this._extractText(parsed.content ?? parsed.message?.content ?? parsed.text)
              if (text) title = text.slice(0, 60).replace(/[\r\n]+/gu, ' ')
            }
          } else if (parsed.role === 'assistant' || parsed.type === 'assistant_turn' || parsed.type === 'assistant') {
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
      cwd,
      messageCount,
      status: isPartial ? ADAPTER_STATUS.PARTIALLY_READABLE : ADAPTER_STATUS.RECOGNIZED,
    }
  }
}
