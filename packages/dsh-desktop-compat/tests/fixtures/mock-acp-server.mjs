import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const probeFixture = process.argv[2]
const stateFile = join(
  tmpdir(),
  `dsh-mock-acp-${createHash('sha1').update(process.cwd()).digest('hex')}.json`,
)

function loadSessions() {
  if (!existsSync(stateFile)) return new Map()
  try {
    return new Map(Object.entries(JSON.parse(readFileSync(stateFile, 'utf8'))))
  } catch {
    return new Map()
  }
}

function saveSessions(map) {
  writeFileSync(stateFile, JSON.stringify(Object.fromEntries(map)), 'utf8')
}

let nextClientRequestId = 5000
const pendingClientRequests = new Map()
let sessions = loadSessions()
const cancelledSessions = new Set()

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`)
}

function callClient(method, params) {
  const id = ++nextClientRequestId
  return new Promise((resolvePromise, rejectPromise) => {
    pendingClientRequests.set(id, { resolve: resolvePromise, reject: rejectPromise })
    send({ jsonrpc: '2.0', id, method, params })
  })
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', async (line) => {
  if (!line.trim()) return
  const msg = JSON.parse(line)

  if (msg.id !== undefined && msg.method === undefined) {
    const waiter = pendingClientRequests.get(msg.id)
    if (waiter) {
      pendingClientRequests.delete(msg.id)
      if (msg.error) waiter.reject(new Error(msg.error.message || 'client error'))
      else waiter.resolve(msg.result)
    }
    return
  }

  if (msg.method === 'session/cancel') {
    if (msg.params?.sessionId) cancelledSessions.add(msg.params.sessionId)
    return
  }

  if (msg.id === undefined) return

  switch (msg.method) {
    case 'initialize':
      if (probeFixture === '--probe-timeout') break
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: 1,
          agentInfo: { name: 'Mock ACP Agent', version: '1.0.0' },
          agentCapabilities: {
            loadSession: true,
            mcpCapabilities: { http: true, sse: false },
          },
          authMethods: [
            { id: 'oauth-personal', name: 'Google OAuth' },
            { id: 'gemini-api-key', name: 'Gemini API Key' },
          ],
        },
      })
      break
    case 'authenticate':
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
      break
    case 'session/new': {
      if (probeFixture === '--probe-signed-out') {
        send({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: 'Authentication required' } })
        break
      }
      const sid = `acp-sess-${sessions.size + 1}`
      sessions.set(sid, { cwd: msg.params?.cwd, model: 'gemini-pro', effort: 'medium' })
      saveSessions(sessions)
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          sessionId: sid,
          models: {
            currentModelId: 'gemini-pro',
            availableModels: [
              { modelId: 'gemini-pro', name: 'Gemini Pro' },
              { modelId: 'gemini-flash', name: 'Gemini Flash' },
            ],
          },
          configOptions: [
            {
              id: 'thought_level',
              name: 'Thought Level',
              currentValue: 'medium',
              options: [{ value: 'low', name: 'Low' }, { value: 'high', name: 'High' }],
            },
            {
              id: 'mode',
              category: 'mode',
              currentValue: 'ask',
              options: [{ value: 'ask' }, { value: 'plan' }, { value: 'bypassPermissions' }],
            },
          ],
        },
      })
      break
    }
    case 'session/load': {
      sessions = loadSessions()
      const sid = msg.params?.sessionId
      const existing = sessions.get(sid)
      if (!existing) {
        send({ jsonrpc: '2.0', id: msg.id, error: { code: -32004, message: 'session not found' } })
      } else {
        send({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            sessionId: sid,
            models: { currentModelId: existing.model, availableModels: [{ modelId: 'gemini-pro', name: 'Gemini Pro' }] },
            configOptions: [],
          },
        })
      }
      break
    }
    case 'session/set_model': {
      const sess = sessions.get(msg.params?.sessionId)
      if (sess) {
        sess.model = msg.params?.modelId
        saveSessions(sessions)
      }
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
      break
    }
    case 'session/set_config_option': {
      const sess = sessions.get(msg.params?.sessionId)
      if (sess && msg.params?.configId === 'thought_level') {
        sess.effort = msg.params?.value
        saveSessions(sessions)
      }
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
      break
    }
    case 'session/prompt': {
      const sid = msg.params?.sessionId
      const text = msg.params?.prompt?.[0]?.text ?? ''
      cancelledSessions.delete(sid)

      if (text === 'slow') {
        const timer = setInterval(() => {
          if (cancelledSessions.has(sid)) {
            clearInterval(timer)
            send({ jsonrpc: '2.0', id: msg.id, result: { stopReason: 'cancelled' } })
          }
        }, 15)
        break
      }

      if (text === 'escape-read') {
        try {
          await callClient('fs/read_text_file', { sessionId: sid, path: '../outside-secret.txt' })
          send({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: 'escape unexpectedly allowed' } })
        } catch (err) {
          send({
            jsonrpc: '2.0',
            method: 'session/update',
            params: {
              sessionId: sid,
              update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `blocked:${err.message}` } },
            },
          })
          send({ jsonrpc: '2.0', id: msg.id, result: { stopReason: 'end_turn' } })
        }
        break
      }

      send({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: sid,
          update: { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'planning steps' } },
        },
      })
      send({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: sid,
          update: { sessionUpdate: 'plan', entries: [{ content: 'Inspect notes', status: 'in_progress', priority: 'high' }] },
        },
      })
      send({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: sid,
          update: { sessionUpdate: 'tool_call', toolCallId: 'tc-1', title: 'Read workspace note', kind: 'read', status: 'in_progress' },
        },
      })

      const fileRes = await callClient('fs/read_text_file', { sessionId: sid, path: 'note.txt' })
      const permRes = await callClient('session/request_permission', {
        sessionId: sid,
        toolCall: { title: 'Edit note.txt', kind: 'edit', rawInput: { path: 'note.txt' } },
        options: [
          { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
          { optionId: 'allow-always', name: 'Allow always', kind: 'allow_always' },
        ],
      })

      send({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: sid,
          update: {
            sessionUpdate: 'tool_call_update',
            toolCallId: 'tc-1',
            status: 'completed',
            content: [{ type: 'diff', path: 'note.txt', oldText: 'old', newText: 'new' }],
          },
        },
      })
      send({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: sid,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: {
              type: 'text',
              text: `read=${String(fileRes.content).trim()};perm=${permRes.outcome?.outcome}`,
            },
          },
        },
      })
      send({ jsonrpc: '2.0', id: msg.id, result: { stopReason: 'end_turn' } })
      break
    }
    default:
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } })
  }
})
