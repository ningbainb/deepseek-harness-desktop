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
import * as zlib from 'node:zlib'

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

const CODEX_SESSION_DIRECTORY_NAMES = Object.freeze(['sessions', 'rollouts', 'archived_sessions'])

const INTERNAL_USER_CONTEXT_PREFIXES = [
  '<permissions instructions>',
  '<environment_context>',
  '<managed_developer_instructions>',
  '# AGENTS.md instructions',
  'The following is the Codex agent history whose request action',
  'The following is the Codex agent history added since your last approval assessment',
]

const GENERIC_CODEX_TITLES = new Set([
  'auto',
  'new task',
  'new conversation',
  'untitled',
  'untitled session',
])

function isGenericCodexTitle(value) {
  if (typeof value !== 'string') return true
  const normalized = value.trim().replace(/[\r\n]+/gu, ' ').toLowerCase()
  return !normalized || GENERIC_CODEX_TITLES.has(normalized)
}

function isInternalUserContext(value) {
  const text = typeof value === 'string' ? value.trimStart() : ''
  return INTERNAL_USER_CONTEXT_PREFIXES.some((prefix) => text.startsWith(prefix))
}
function sessionIdFromRef(value) {
  return basename(value).replace(/\.jsonl(?:\.zst)?$|\.json$/iu, '')
}
function createCodexReadStream(filePath, options = {}) {
  if (!/\.jsonl\.zst$/iu.test(filePath)) return createReadStream(filePath, options)
  const { encoding, ...sourceOptions } = options
  const source = createReadStream(filePath, sourceOptions)
  if (typeof zlib.createZstdDecompress !== 'function') {
    source.destroy(new Error('This Node runtime cannot read Codex .jsonl.zst archives'))
    return source
  }
  const decoder = zlib.createZstdDecompress()
  source.once('error', (error) => decoder.destroy(error))
  source.pipe(decoder)
  if (encoding) decoder.setEncoding(encoding)
  return decoder
}

function parseToolArgumentValue(value) {
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    // Newer Codex custom_tool_call records persist the invocation as source
    // code (for example tools.exec_command({"cmd":"..."})). Extract only
    // JSON-quoted command/path fields; never evaluate the source string.
    const fields = {}
    const fieldPattern = /["'](command|cmd|script|path|file|file_path)["']\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gu
    for (const match of value.matchAll(fieldPattern)) {
      const field = match[1]
      try {
        fields[field] = match[2].startsWith('"') ? JSON.parse(match[2]) : match[2].slice(1, -1)
      } catch {
        // Ignore an individual malformed field.
      }
    }
    return fields
  }
}
function normalizeToolArguments(value) {
  if (typeof value !== 'string') return value ?? {}
  try {
    JSON.parse(value)
    return value
  } catch {
    const parsed = parseToolArgumentValue(value)
    return Object.keys(parsed).length > 0 ? JSON.stringify(parsed) : value
  }
}

export class CodexAdapter extends ExternalConversationAdapter {
  constructor(options = {}) {
    super(SOURCE_KINDS.CODEX, 'Codex')
    this.customRootDir = options.rootDir
    this._projectCache = new Map()
    this._sessionCache = new Map()
    this._indexedRoot = ''
    this._indexedIncludeAll = false
    this._sessionIndexCache = undefined
  }

  resolveRootDir() {
    const configuredRoot = this.customRootDir || (typeof process.env.CODEX_HOME === 'string' ? process.env.CODEX_HOME.trim() : '')
    return configuredRoot ? resolve(configuredRoot) : join(homedir(), '.codex')
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

  async _loadGlobalState(root) {
    const threadRoots = new Map()
    const savedRoots = []
    const statePath = join(root, '.codex-global-state.json')
    try {
      const stream = createReadStream(statePath, { encoding: 'utf8' })
      const rl = createInterface({ input: stream, crlfDelay: Infinity })
      let jsonText = ''
      for await (const line of rl) {
        jsonText += line
      }
      const parsed = JSON.parse(jsonText)
      if (parsed['thread-workspace-root-hints'] && typeof parsed['thread-workspace-root-hints'] === 'object') {
        for (const [threadId, rootPath] of Object.entries(parsed['thread-workspace-root-hints'])) {
          if (typeof rootPath === 'string' && rootPath.trim()) {
            threadRoots.set(threadId.toLowerCase(), rootPath.trim())
          }
        }
      }
      if (parsed['thread-writable-roots'] && typeof parsed['thread-writable-roots'] === 'object') {
        for (const [threadId, rootPath] of Object.entries(parsed['thread-writable-roots'])) {
          if (typeof rootPath === 'string' && rootPath.trim() && !threadRoots.has(threadId.toLowerCase())) {
            threadRoots.set(threadId.toLowerCase(), rootPath.trim())
          }
        }
      }
      if (Array.isArray(parsed['electron-saved-workspace-roots'])) {
        for (const r of parsed['electron-saved-workspace-roots']) {
          if (typeof r === 'string' && r.trim()) savedRoots.push(r.trim())
        }
      }
    } catch {}
    return { threadRoots, savedRoots }
  }

  async _loadSessionIndex(root) {
    const indexMap = new Map()
    const indexPath = join(root, 'session_index.jsonl')
    try {
      const stream = createReadStream(indexPath, { encoding: 'utf8', highWaterMark: 128 * 1024 })
      const rl = createInterface({ input: stream, crlfDelay: Infinity })
      for await (const line of rl) {
        if (!line || !line.trim()) continue
        try {
          const item = JSON.parse(line)
          if (item.id) {
            indexMap.set(item.id, {
              title: item.thread_name || item.title || '',
              updatedAt: item.updated_at ? Math.round(new Date(item.updated_at).getTime()) : undefined,
            })
          }
        } catch {}
      }
    } catch {}
    return indexMap
  }

  async _getSessionIndex(root) {
    const indexPath = join(root, 'session_index.jsonl')
    const fileStats = await stat(indexPath).catch(() => undefined)
    const cached = this._sessionIndexCache
    if (
      cached?.root === root
      && cached.size === fileStats?.size
      && cached.mtimeMs === fileStats?.mtimeMs
    ) {
      return cached.map
    }
    const map = await this._loadSessionIndex(root)
    this._sessionIndexCache = {
      root,
      size: fileStats?.size,
      mtimeMs: fileStats?.mtimeMs,
      map,
    }
    return map
  }
  async _collectSessionFiles(dir, maxDepth = 5, currentDepth = 0) {
    if (currentDepth > maxDepth) return []
    const results = []
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          const nested = await this._collectSessionFiles(fullPath, maxDepth, currentDepth + 1)
          results.push(...nested)
        } else if (entry.isFile() && (entry.name.endsWith('.jsonl') || entry.name.endsWith('.json') || entry.name.endsWith('.jsonl.zst'))) {
          results.push(fullPath)
        }
      }
    } catch {}
    return results
  }

  async _peekSessionFast(filePath, indexMap, globalState) {
    let title = ''
    let titleIsGeneric = false
    let snippet = ''
    let firstUserTitle = ''
    let messageCount = 0
    let sawUserRecord = false
    let hasVisibleUser = false
    let internalSession = false
    let cwd = ''
    let isPartial = false
    let createdAt = 0

    const idMatch = basename(filePath).match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/iu)
    if (idMatch) {
      const threadId = idMatch[1].toLowerCase()
      if (globalState?.threadRoots?.has(threadId)) {
        cwd = globalState.threadRoots.get(threadId)
      }
      if (indexMap?.has(idMatch[1])) {
        const entry = indexMap.get(idMatch[1])
        if (entry.title) {
          title = entry.title
          titleIsGeneric = isGenericCodexTitle(title)
        }
        if (entry.updatedAt && !createdAt) createdAt = entry.updatedAt
      }
    }

    try {
      const stream = createCodexReadStream(filePath, { highWaterMark: 64 * 1024 })
      const boundedStream = createBoundedLineStream(stream, {
        maxLineBytes: IMPORT_LIMITS.MAX_LINE_LENGTH_BYTES,
      })
      const rl = createInterface({ input: boundedStream, crlfDelay: Infinity })
      let linesCount = 0

      for await (const line of rl) {
        linesCount++
        if (linesCount > 25) {
          rl.close()
          break
        }
        if (!line || !line.trim()) continue
        try {
          const parsed = JSON.parse(line)
          const payload = parsed.payload || {}

          if (parsed.type === 'session_meta') {
            internalSession = payload.thread_source === 'guardian_review'
              || payload.model_provider === 'codex-auto-review'
          }

          if (!createdAt && (payload.timestamp || parsed.timestamp)) {
            createdAt = Math.round(new Date(payload.timestamp || parsed.timestamp).getTime())
          }

          if (!cwd) {
            if (payload.cwd && typeof payload.cwd === 'string' && isAbsolute(payload.cwd)) {
              cwd = payload.cwd
            } else if (parsed.cwd && typeof parsed.cwd === 'string' && isAbsolute(parsed.cwd)) {
              cwd = parsed.cwd
            } else if (Array.isArray(payload.workspace_roots) && payload.workspace_roots.length > 0 && isAbsolute(payload.workspace_roots[0])) {
              cwd = payload.workspace_roots[0]
            }
          }

          const candidateTitle = typeof payload.summary === 'string'
            ? payload.summary
            : typeof parsed.title === 'string'
            ? parsed.title
            : ''
          if (candidateTitle && (!title || (titleIsGeneric && !isGenericCodexTitle(candidateTitle)))) {
            title = candidateTitle
            titleIsGeneric = isGenericCodexTitle(title)
          }

          if (parsed.type === 'event_msg') {
            const eventType = payload.type
            if (eventType === 'user_message' || eventType === 'agent_message') {
              if (eventType === 'user_message') sawUserRecord = true
              const text = this._extractText(payload.message ?? payload.content ?? payload.text)
              if (text && !(eventType === 'user_message' && isInternalUserContext(text))) {
                if (eventType === 'user_message') hasVisibleUser = true
                messageCount++
                if (eventType === 'user_message') {
                  if (!firstUserTitle) firstUserTitle = text.slice(0, 60).replace(/[\r\n]+/gu, ' ')
                  if (!title || titleIsGeneric) {
                    title = firstUserTitle
                    titleIsGeneric = false
                  }
                }
                if (!snippet && eventType === 'user_message') snippet = text.slice(0, 150).replace(/[\r\n]+/gu, ' ')
              }
            }
          } else if (parsed.type === 'response_item') {
            if (payload.type === 'message' || payload.role) {
              if (payload.role === 'user' || payload.role === 'assistant') messageCount++
              if (payload.role === 'user') {
                sawUserRecord = true
                const text = this._extractText(payload.content)
                if (text && !isInternalUserContext(text)) {
                  hasVisibleUser = true
                  if (!firstUserTitle) firstUserTitle = text.slice(0, 60).replace(/[\r\n]+/gu, ' ')
                  if (!title || titleIsGeneric) {
                    title = firstUserTitle
                    titleIsGeneric = false
                  }
                  if (!snippet) snippet = text.slice(0, 150).replace(/[\r\n]+/gu, ' ')
                }
              }
            }
          } else if (parsed.role === 'user' || parsed.type === 'user_turn' || parsed.type === 'user' || parsed.type === 'user_message') {
            sawUserRecord = true
            messageCount++
            const text = this._extractText(parsed.content ?? parsed.message?.content ?? parsed.message ?? parsed.text)
            if (text && !isInternalUserContext(text)) {
              hasVisibleUser = true
              if (!firstUserTitle) firstUserTitle = text.slice(0, 60).replace(/[\r\n]+/gu, ' ')
              if (!title || titleIsGeneric) {
                title = firstUserTitle
                titleIsGeneric = false
              }
              if (!snippet) snippet = text.slice(0, 150).replace(/[\r\n]+/gu, ' ')
            }
          } else if (parsed.role === 'assistant' || parsed.type === 'assistant_turn' || parsed.type === 'assistant') {
            messageCount++
          }
        } catch {
          // ignore single malformed line
        }
      }
      if (boundedStream.oversizedLineCount > 0) isPartial = true
    } catch {
      isPartial = true
    }

    const effectiveTitle = !isGenericCodexTitle(title) ? title : firstUserTitle
    return {
      title: effectiveTitle,
      snippet: snippet || effectiveTitle,
      cwd,
      messageCount,
      hasVisibleUser,
      internalOnly: internalSession || (sawUserRecord && !hasVisibleUser),
      createdAt,
      status: isPartial ? ADAPTER_STATUS.PARTIALLY_READABLE : ADAPTER_STATUS.RECOGNIZED,
    }
  }

  async searchContent(query, { signal, rootDir } = {}) {
    if (!query || typeof query !== 'string') return []
    const q = query.toLowerCase().trim()
    if (!q) return []
    const root = rootDir ? resolve(rootDir) : this.resolveRootDir()
    const files = await collectCodexSessionFiles(this, root)
    const candidates = []
    let remainingBytes = IMPORT_LIMITS.MAX_SEARCH_TOTAL_BYTES
    const entries = await Promise.all(files.map(async (filePath) => ({
      filePath,
      stats: await stat(filePath).catch(() => null),
    })))
    for (const entry of entries
      .filter((item) => item.stats)
      .sort((a, b) => (b.stats.mtimeMs || 0) - (a.stats.mtimeMs || 0))) {
      if (signal?.aborted || remainingBytes <= 0) break
      const compressed = /\.jsonl\.zst$/iu.test(entry.filePath)
      if (compressed && entry.stats.size > IMPORT_LIMITS.MAX_SEARCH_FILE_BYTES) continue
      const budget = Math.min(entry.stats.size, IMPORT_LIMITS.MAX_SEARCH_FILE_BYTES)
      if (budget <= 0) continue
      candidates.push({ ...entry, compressed, budget })
      remainingBytes -= budget
    }
    const matched = []

    const batchSize = 32
    for (let i = 0; i < candidates.length; i += batchSize) {
      if (signal?.aborted) break
      const batch = candidates.slice(i, i + batchSize)
      await Promise.all(
        batch.map(async ({ filePath, stats, compressed }) => {
          try {
            if (signal?.aborted) return
            // A range read is safe for plain JSONL. A zstd stream cannot be
            // sliced after compression, so an archive larger than the search
            // budget is skipped rather than attempting a multi-gigabyte
            // decompression for every keystroke.
            const ranges = compressed || stats.size <= IMPORT_LIMITS.MAX_SEARCH_FILE_BYTES
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
              const stream = createCodexReadStream(filePath, {
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

  async _scanAndIndex(root, options = {}) {
    const indexMap = await this._getSessionIndex(root)
    const globalState = await this._loadGlobalState(root)
    const projectsMap = new Map()
    const sessionMap = new Map()

    // Include archived sessions as well as the live and legacy rollout trees.
    // Codex moves older conversations to archived_sessions without changing
    // their transcript format, so excluding that directory would violate the
    // folder-level "import all" contract.
    const allFiles = await collectCodexSessionFiles(this, root)

    // Process files in batches with bounded concurrency to prevent EMFILE
    const batchSize = 32
    for (let i = 0; i < allFiles.length; i += batchSize) {
      const batch = allFiles.slice(i, i + batchSize)
      const batchPeeks = await Promise.all(
        batch.map(async (filePath) => {
          const fileStats = await stat(filePath).catch(() => null)
          if (!fileStats) return null
          const peek = await this._peekSessionFast(filePath, indexMap, globalState)
          // Keep the discovery fingerprint identical to fingerprint(), which
          // is used again during confirmation to reject a stale preview.
          // Using the raw stat tuple here made every Codex batch item look
          // changed because confirm compares against the SHA-256 digest.
          const fp = await this.fingerprint(filePath).catch(() => `${fileStats.size}:${Math.round(fileStats.mtimeMs)}`)
          return {
            filePath,
            fileStats,
            peek,
            fingerprint: fp,
          }
        }),
      )

      for (const item of batchPeeks) {
        if (!item) continue
        const { filePath, fileStats, peek, fingerprint } = item
        if (peek.internalOnly || !peek.hasVisibleUser) continue
        const projectKey = peek.cwd || join(homedir(), 'Desktop', 'Codex Projects')
        const originalCwd = isAbsolute(projectKey) ? projectKey : resolve(projectKey)
        const displayName = basename(originalCwd) || 'Codex Workspace'

        const existing = projectsMap.get(originalCwd) || {
          projectRef: originalCwd,
          displayName,
          originalCwd,
          sessionCount: 0,
          lastActiveAt: 0,
          sessionFiles: [],
        }

        existing.sessionCount++
        existing.sessionFiles.push(filePath)
        if (fileStats.mtimeMs > existing.lastActiveAt) {
          existing.lastActiveAt = Math.round(fileStats.mtimeMs)
        }
        projectsMap.set(originalCwd, existing)

        const sessItem = {
          sessionRef: filePath,
          title: peek.title || sessionIdFromRef(filePath),
          snippet: peek.snippet || peek.title || '',
          createdAt: peek.createdAt || Math.round(fileStats.birthtimeMs || fileStats.mtimeMs),
          updatedAt: Math.round(fileStats.mtimeMs),
          messageCount: peek.messageCount || 0,
          status: peek.status || ADAPTER_STATUS.RECOGNIZED,
          fingerprint,
        }

        const sessList = sessionMap.get(originalCwd) || []
        sessList.push(sessItem)
        sessionMap.set(originalCwd, sessList)
      }
    }

    // Sort sessions in each project
    for (const [pRef, list] of sessionMap.entries()) {
      sessionMap.set(
        pRef,
        options.includeAll === true
          ? list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
          : list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, IMPORT_LIMITS.MAX_SESSIONS_PER_PROJECT),
      )
    }

    this._projectCache = projectsMap
    this._sessionCache = sessionMap
    this._indexedRoot = root
    this._indexedIncludeAll = options.includeAll === true

    const sortedProjects = Array.from(projectsMap.values())
      .sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0))
    return options.includeAll === true ? sortedProjects : sortedProjects.slice(0, IMPORT_LIMITS.MAX_PROJECTS)
  }

  async discoverProjects(options = {}) {
    const root = options.rootDir ? resolve(options.rootDir) : this.resolveRootDir()
    const probeRes = await this.probe({ rootDir: root })
    if (!probeRes.available) return []

    return this._scanAndIndex(root, options)
  }

  async discoverSessions(projectRef, options = {}) {
    if (!projectRef || typeof projectRef !== 'string') return []
    const requestedRoot = options.rootDir ? resolve(options.rootDir) : this.resolveRootDir()
    if (
      this._sessionCache.has(projectRef)
      && this._indexedRoot === requestedRoot
      && (options.includeAll !== true || this._indexedIncludeAll === true)
    ) {
      return this._sessionCache.get(projectRef)
    }
    const root = requestedRoot
    await this._scanAndIndex(root, options)
    const sessions = this._sessionCache.get(projectRef) || []
    return options.includeAll === true ? sessions : sessions.slice(0, IMPORT_LIMITS.MAX_SESSIONS_PER_PROJECT)
  }

  async readConversation(sessionRef, options = {}) {
    if (!sessionRef || typeof sessionRef !== 'string') {
      throw new TypeError('sessionRef is required')
    }

    const fileStats = await stat(sessionRef)
    if (fileStats.size > IMPORT_LIMITS.MAX_CODEX_FILE_SIZE_BYTES) {
      throw new Error(`Session file exceeds maximum allowed size: ${fileStats.size} bytes`)
    }

    const sourceSessionId = sessionIdFromRef(sessionRef)
    const sourceRoot = options.rootDir ? resolve(options.rootDir) : this.resolveRootDir()
    const sessionIndex = await this._getSessionIndex(sourceRoot)
    const sessionIndexId = basename(sessionRef).match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/iu)?.[1]
    const indexedTitle = sessionIndexId
      ? (sessionIndex.get(sessionIndexId)?.title || sessionIndex.get(sessionIndexId.toLowerCase())?.title || '')
      : ''
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
    let sessionTitle = indexedTitle
    let sessionTitleIsGeneric = isGenericCodexTitle(indexedTitle)
    let firstUserTitle = ''
    let maxEventsReached = false
    let startedAt = Math.round(fileStats.birthtimeMs || fileStats.mtimeMs)
    let endedAt = Math.round(fileStats.mtimeMs)

    // A Codex rollout may persist the same visible message twice: once as a
    // response_item and once as an event_msg. Keep both representations when
    // they carry different text, but collapse an adjacent exact duplicate.
    const emittedMessageSources = new Map()
    const emittedToolResultIds = new Set()
    const appendVisibleMessage = ({ role, rawText, sourceEventId, sourceTimestamp, timestampQuality, sourceTag }) => {
      const cleanText = Redactor.redact(this._extractText(rawText))
      if (!cleanText.trim() || (role === EVENT_ROLES.USER && isInternalUserContext(cleanText))) return false
      const key = `${role}\u001f${cleanText}\u001f${Number.isSafeInteger(sourceTimestamp) ? sourceTimestamp : ''}`
      const previousSource = emittedMessageSources.get(key)
      if (previousSource && previousSource !== sourceTag) return false
      emittedMessageSources.set(key, sourceTag)

      currentSequence++
      events.push(
        createTranscriptEvent({
          sequence: currentSequence,
          type: role === EVENT_ROLES.SYSTEM ? EVENT_TYPES.SYSTEM : EVENT_TYPES.MESSAGE,
          role,
          content: cleanText,
          sourceEventId,
          sourceTimestamp,
          timestampQuality,
          sourceSessionId,
        }),
      )
      visibleMessageCount++
      messages.push({
        role,
        content: cleanText,
        timestamp: sourceTimestamp,
        kind: 'text',
      })
      if (role === EVENT_ROLES.USER) {
        if (!firstUserTitle) firstUserTitle = cleanText.slice(0, 50).replace(/[\r\n]+/gu, ' ')
        if (!sessionTitle || sessionTitleIsGeneric) {
          sessionTitle = firstUserTitle
          sessionTitleIsGeneric = false
        }
      }
      return true
    }

    const appendToolResult = ({ toolCallId, toolResult, isError, sourceEventId, sourceTimestamp, timestampQuality }) => {
      const normalizedCallId = typeof toolCallId === 'string' && toolCallId.length > 0
        ? toolCallId
        : `call-${currentSequence}`
      if (emittedToolResultIds.has(normalizedCallId)) return false
      emittedToolResultIds.add(normalizedCallId)
      const safeResult = typeof toolResult === 'string'
        ? Redactor.redact(toolResult)
        : Redactor.redactObject(toolResult)
      if (isError) {
        const errStr = typeof safeResult === 'string' ? safeResult : JSON.stringify(safeResult)
        errors.push(Redactor.redact(String(errStr || 'Tool execution error').slice(0, 300)))
      }
      currentSequence++
      events.push(
        createTranscriptEvent({
          sequence: currentSequence,
          type: EVENT_TYPES.TOOL_RESULT,
          role: EVENT_ROLES.TOOL,
          toolCallId: normalizedCallId,
          toolResult: safeResult,
          toolStatus: isError ? TOOL_STATUS.ERROR : TOOL_STATUS.SUCCESS,
          sourceEventId: sourceEventId || `res-${currentSequence}`,
          sourceTimestamp,
          timestampQuality,
          sourceSessionId,
        }),
      )
      return true
    }

    const fileStream = createCodexReadStream(sessionRef, { highWaterMark: 256 * 1024 })
    const boundedStream = createBoundedLineStream(fileStream, {
      maxLineBytes: IMPORT_LIMITS.MAX_LINE_LENGTH_BYTES,
    })
    const rl = createInterface({
      input: boundedStream,
      crlfDelay: Infinity,
    })

    let lineBuffer = ''

    const processJsonRecord = (parsed) => {
      parsedEvents++
      const payload = parsed.payload || {}

      // 1. Extract metadata from payload or top level
      const cwdVal = payload.cwd || parsed.cwd
      if (cwdVal && typeof cwdVal === 'string' && isAbsolute(cwdVal) && !detectedCwd) {
        detectedCwd = cwdVal
      } else if (Array.isArray(payload.workspace_roots) && payload.workspace_roots.length > 0 && isAbsolute(payload.workspace_roots[0]) && !detectedCwd) {
        detectedCwd = payload.workspace_roots[0]
      }

      if ((payload.git_root || parsed.git_root) && !detectedGitRoot) detectedGitRoot = payload.git_root || parsed.git_root
      if ((payload.git_branch || parsed.git_branch) && !detectedGitBranch) detectedGitBranch = payload.git_branch || parsed.git_branch
      if ((payload.git_commit || parsed.git_commit) && !detectedGitRevision) detectedGitRevision = payload.git_commit || parsed.git_commit
      const candidateTitle = typeof payload.summary === 'string'
        ? payload.summary
        : typeof parsed.title === 'string'
        ? parsed.title
        : ''
      if (candidateTitle && (!sessionTitle || (sessionTitleIsGeneric && !isGenericCodexTitle(candidateTitle)))) {
        sessionTitle = candidateTitle
        sessionTitleIsGeneric = isGenericCodexTitle(sessionTitle)
      }

      const rawTs = payload.timestamp || parsed.timestamp || parsed.time
      const hasExactTs = Boolean(rawTs)
      const sourceTimestamp = hasExactTs ? Math.round(new Date(rawTs).getTime()) : (endedAt || startedAt)
      const timestampQuality = hasExactTs ? TIMESTAMP_QUALITY.EXACT : TIMESTAMP_QUALITY.INFERRED

      if (sourceTimestamp) {
        if (!startedAt || sourceTimestamp < startedAt) startedAt = sourceTimestamp
        if (!endedAt || sourceTimestamp > endedAt) endedAt = sourceTimestamp
      }

      if (['reasoning', 'agent_reasoning', 'rollout_trace', 'world_state', 'internal_trace'].includes(parsed.type)) {
        skippedEvents++
        return
      }

      // Codex records user/assistant display events separately from the raw
      // response_item stream. Prefer these canonical event_msg records when
      // available, while appendVisibleMessage collapses an exact duplicate
      // emitted by the other representation.
      if (parsed.type === 'event_msg') {
        const eventType = payload.type
        if (eventType === 'user_message' || eventType === 'agent_message') {
          const role = eventType === 'user_message' ? EVENT_ROLES.USER : EVENT_ROLES.ASSISTANT
          const rawText = payload.message ?? payload.content ?? payload.text
          if (!appendVisibleMessage({
            role,
            rawText,
            sourceEventId: payload.id || parsed.id || `${eventType}-${currentSequence + 1}`,
            sourceTimestamp,
            timestampQuality,
            sourceTag: 'event-msg',
          })) {
            skippedEvents++
          }
          return
        }

        if (eventType === 'exec_command_end' || eventType === 'function_call_output' || eventType === 'custom_tool_call_output' || eventType === 'tool_result') {
          const toolCallId = payload.call_id || payload.tool_call_id || payload.id || `event-call-${currentSequence + 1}`
          const toolResult = payload.aggregated_output || payload.formatted_output || payload.output || payload.result || payload.stdout || payload.stderr || payload.content || ''
          const exitCode = Number.isSafeInteger(payload.exit_code) ? payload.exit_code : undefined
          const isError = Boolean(
            payload.is_error
            || payload.isError
            || payload.error
            || payload.status === 'failed'
            || payload.status === 'error'
            || (exitCode !== undefined && exitCode !== 0),
          )
          appendToolResult({
            toolCallId,
            toolResult,
            isError,
            sourceEventId: payload.id || parsed.id,
            sourceTimestamp,
            timestampQuality,
          })
          return
        }

        skippedEvents++
        return
      }

      // 2. Handle nested response_item (Codex rollout format)
      if (parsed.type === 'response_item' || parsed.type === 'event') {
        const itemType = payload.type || ''

        if (itemType === 'reasoning' || itemType === 'agent_reasoning' || itemType === 'event_msg' || itemType === 'world_state' || itemType === 'rollout_trace') {
          skippedEvents++
          return
        }

        // 2a. Message item
        if (itemType === 'message' || itemType === 'user_message' || itemType === 'agent_message' || payload.role) {
          const role = payload.role === 'assistant' || itemType === 'agent_message'
            ? EVENT_ROLES.ASSISTANT
            : payload.role === 'user' || itemType === 'user_message'
            ? EVENT_ROLES.USER
            : payload.role === 'system'
            ? EVENT_ROLES.SYSTEM
            : null
          if (role) {
            const rawText = this._extractText(payload.content ?? payload.message ?? payload.text)
            if (rawText) {
              if (!appendVisibleMessage({
                role,
                rawText,
                sourceEventId: payload.id || parsed.id || `msg-${currentSequence + 1}`,
                sourceTimestamp,
                timestampQuality,
                sourceTag: 'response-item',
              })) {
                skippedEvents++
              }
            }
          }
          return
        }

        // 2b. Tool / Function call item
        if (itemType === 'function_call' || itemType === 'tool_call' || itemType === 'custom_tool_call') {
          toolCallCount++
          const toolName = payload.name || payload.call?.name || payload.tool || 'tool'
          const toolCallId = payload.call_id || payload.id || `call-${currentSequence + 1}`
          const toolArgs = normalizeToolArguments(payload.arguments || payload.call?.arguments || payload.input || {})
          this._inspectToolCall({ name: toolName, arguments: toolArgs }, referencedFiles, modifiedFiles, commands)

          currentSequence++
          const ev = createTranscriptEvent({
            sequence: currentSequence,
            type: EVENT_TYPES.TOOL_CALL,
            role: EVENT_ROLES.ASSISTANT,
            toolName,
            toolCallId,
            toolArgs,
            sourceEventId: payload.id || parsed.id || toolCallId,
            sourceTimestamp,
            timestampQuality,
            sourceSessionId,
          })
          events.push(ev)
          return
        }

        // 2c. Tool / Function call output item
        if (itemType === 'function_call_output' || itemType === 'tool_result' || itemType === 'custom_tool_call_output') {
          const toolCallId = payload.call_id || payload.tool_call_id || payload.id || `call-${currentSequence}`
          const toolResult = payload.output !== undefined ? payload.output : payload.result !== undefined ? payload.result : payload.content
          const isError = Boolean(payload.is_error || payload.error || payload.status === 'failed')
          appendToolResult({
            toolCallId,
            toolResult,
            isError,
            sourceEventId: payload.id || parsed.id,
            sourceTimestamp,
            timestampQuality,
          })
          return
        }
      }

      // 3. Handle flat user message event
      if (
        parsed.role === 'user'
        || parsed.type === 'user_turn'
        || parsed.type === 'user'
        || parsed.type === 'user_message'
      ) {
        const rawText = this._extractText(parsed.content ?? parsed.message?.content ?? parsed.message ?? parsed.text)
        if (!appendVisibleMessage({
          role: EVENT_ROLES.USER,
          rawText,
          sourceEventId: parsed.id || `msg-${currentSequence + 1}`,
          sourceTimestamp,
          timestampQuality,
          sourceTag: 'flat',
        })) {
          if (rawText) skippedEvents++
        }
        return
      }

      // 4. Handle flat assistant message event
      if (
        parsed.role === 'assistant'
        || parsed.type === 'assistant_turn'
        || parsed.type === 'assistant'
        || parsed.type === 'agent_message'
      ) {
        const rawText = this._extractText(parsed.content ?? parsed.message?.content ?? parsed.message ?? parsed.text)
        if (!appendVisibleMessage({
          role: EVENT_ROLES.ASSISTANT,
          rawText,
          sourceEventId: parsed.id || `msg-${currentSequence + 1}`,
          sourceTimestamp,
          timestampQuality,
          sourceTag: 'flat',
        })) {
          if (rawText) skippedEvents++
        }

        const toolCalls = parsed.tool_calls || parsed.tools || []
        for (const tc of toolCalls) {
          toolCallCount++
          const name = tc.function?.name || tc.name || tc.tool || 'tool'
          const callId = tc.id || `call-${currentSequence + 1}`
          const args = normalizeToolArguments(tc.function?.arguments || tc.arguments || tc.input || {})
          this._inspectToolCall(tc, referencedFiles, modifiedFiles, commands)
          currentSequence++
          events.push(
            createTranscriptEvent({
              sequence: currentSequence,
              type: EVENT_TYPES.TOOL_CALL,
              role: EVENT_ROLES.ASSISTANT,
              toolName: name,
              toolCallId: callId,
              toolArgs: args,
              sourceEventId: tc.id || callId,
              sourceTimestamp,
              timestampQuality,
              sourceSessionId,
            }),
          )
        }
        return
      }

      // 4b. Handle flat tool_call / function_call event
      if (parsed.type === 'tool_call' || parsed.type === 'function_call' || (parsed.role === 'tool' && !parsed.status && !parsed.error && parsed.arguments)) {
        toolCallCount++
        const name = parsed.name || parsed.function?.name || parsed.tool || 'tool'
        const callId = parsed.call_id || parsed.id || `call-${currentSequence + 1}`
        const args = normalizeToolArguments(parsed.arguments || parsed.function?.arguments || parsed.input || {})
        this._inspectToolCall({ name, arguments: args }, referencedFiles, modifiedFiles, commands)
        currentSequence++
        events.push(
          createTranscriptEvent({
            sequence: currentSequence,
            type: EVENT_TYPES.TOOL_CALL,
            role: EVENT_ROLES.ASSISTANT,
            toolName: name,
            toolCallId: callId,
            toolArgs: args,
            sourceEventId: parsed.id || callId,
            sourceTimestamp,
            timestampQuality,
            sourceSessionId,
          }),
        )
        return
      }

      // 5. Handle flat tool result event
      if (parsed.role === 'tool' || parsed.type === 'tool_result') {
        const toolCallId = parsed.tool_call_id || parsed.call_id || parsed.id || `call-${currentSequence}`
        const isError = Boolean(parsed.error || parsed.is_error || parsed.status === 'failed')
          const toolResult = parsed.content !== undefined
            ? parsed.content
            : parsed.output !== undefined
            ? parsed.output
            : parsed.result !== undefined
            ? parsed.result
            : parsed.error
        appendToolResult({
          toolCallId,
          toolResult,
          isError,
          sourceEventId: parsed.id,
          sourceTimestamp,
          timestampQuality,
        })
        return
      }

      // 6. System events
      if (parsed.role === 'system' || parsed.type === 'system') {
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
          // Check if this line is part of a multiline JSON block
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
          processJsonRecord(parsed)
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
      const idMatch = basename(sessionRef).match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/iu)
      if (idMatch) {
        const root = options.rootDir ? resolve(options.rootDir) : this.resolveRootDir()
        const globalState = await this._loadGlobalState(root)
        if (globalState.threadRoots?.has(idMatch[1].toLowerCase())) {
          detectedCwd = globalState.threadRoots.get(idMatch[1].toLowerCase())
        }
      }
    }

    const fp = await this.fingerprint(sessionRef).catch(() => '')

    return {
      schemaVersion: IMPORT_SCHEMA_VERSION_V2,
      source: {
        kind: SOURCE_KINDS.CODEX,
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
        title: !isGenericCodexTitle(sessionTitle) ? sessionTitle : firstUserTitle || sessionIdFromRef(sessionRef),
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
        .map((part) => this._extractText(part))
        .filter(Boolean)
        .join('\n')
    }
    if (content && typeof content === 'object') {
      if (typeof content.text === 'string') return content.text
      if (typeof content.message === 'string') return content.message
      if (content.content !== undefined) return this._extractText(content.content)
    }
    return ''
  }

  _inspectToolCall(tc, referencedFiles, modifiedFiles, commands) {
    const name = tc.name || tc.tool || tc.function?.name || ''
    const args = tc.arguments || tc.input || tc.params || {}
    const parsedArgs = parseToolArgumentValue(args)

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
}

async function collectCodexSessionFiles(adapter, root) {
  const rootName = basename(root).toLowerCase()
  const directories = CODEX_SESSION_DIRECTORY_NAMES.includes(rootName)
    ? [root]
    : CODEX_SESSION_DIRECTORY_NAMES.map((name) => join(root, name))
  const nestedFiles = await Promise.all(directories.map((directory) => adapter._collectSessionFiles(directory)))
  return [...new Set(nestedFiles.flat())]
}
