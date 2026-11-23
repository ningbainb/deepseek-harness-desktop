import type { FinishReason, TokenUsage } from '@deepseek-ai/dsh-llm/types'
import { authRequired, CliRunner, loginHint } from './cli-runner.ts'

export const restrictedSettings = '--settings=' + JSON.stringify({
  toolPermission: 'strict',
  agentMode: '',
  permissions: {
    deny: ['command', 'read_file', 'write_file', 'read_url', 'execute_url', 'mcp'].map(action => action + '(*)'),
  },
})

export type Output =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'finish'; kind: 'stop' | 'max-tokens' }

function wireError(message: unknown): never {
  throw new Error(typeof message === 'string' && authRequired(message) ? loginHint : 'Antigravity CLI rejected the request.')
}

interface Request {
  path: string
  prompt: string
  model: string
  effort?: string
  timeout: number
  signal?: AbortSignal
}

export async function* headless(runner: CliRunner, { path, prompt, model, effort, timeout, signal }: Request): AsyncGenerator<Output> {
  const args = ['-p=', '--output-format', 'stream-json', '--disable-slash-commands',
    '--input-format', 'stream-json', restrictedSettings, '--model', model]
  if (effort) args.push('--effort', effort)
  let streamed = false
  const nativeTools = new Set<string>()
  let result: Extract<Output, { type: 'finish' }> | undefined
  for await (const line of runner.run(path, args, timeout, signal, (write, close) => {
    write(JSON.stringify({ event: 'user', message: { content: prompt } }))
    close()
  })) {
    if (!line.trim()) continue
    const event = JSON.parse(line)
    if (event.event === 'init' && Array.isArray(event.init?.tools)) {
      for (const name of event.init.tools) if (typeof name === 'string') nativeTools.add(name)
    } else if (event.event === 'step_update') {
      const step = event.step_update
      if (step?.step_type === 'tool_call' || nativeTools.has(step?.step_type)) {
        throw new Error('Antigravity attempted a native tool call.')
      }
      if (typeof step?.text_delta !== 'string' || !step.text_delta) continue
      if (step.step_type === 'agent_response') {
        streamed = true
        yield { type: 'text', text: step.text_delta }
      } else if (/^(?:thinking|thought|reasoning|agent_thought|agent_thinking)$/.test(step.step_type)) {
        yield { type: 'reasoning', text: step.text_delta }
      }
    } else if (event.event === 'result') {
      const payload = event.result
      if (payload?.status !== 'SUCCESS') wireError(payload?.error)
      if (!streamed && typeof payload.response === 'string') yield { type: 'text', text: payload.response }
      const usage = payload.usage
      if (typeof usage?.input_tokens === 'number' && typeof usage.output_tokens === 'number') {
        const cached = usage.cache_read_tokens ?? 0
        yield { type: 'usage', usage: {
          inputTokens: Math.max(0, usage.input_tokens - cached), outputTokens: usage.output_tokens,
          cacheReadTokens: cached, reasoningTokens: usage.thinking_tokens, totalTokens: usage.total_tokens,
        } }
      }
      result = { type: 'finish', kind: payload.finished_reason === 'max_tokens' ? 'max-tokens' : 'stop' }
    }
  }
  if (!result) throw new Error('Antigravity CLI stopped before returning a result.')
  yield result
}

export async function* acp(runner: CliRunner, { path, prompt, model, effort, timeout, signal }: Request): AsyncGenerator<Output> {
  let write!: (line: string) => void
  let cwd!: string
  let sessionId: string | undefined
  let currentRequest = 0
  let phase: 'initialize' | 'session/new' | 'session/set_model' | 'session/set_config_option' | 'session/prompt'
  let supportsEffort = false
  const request = (method: typeof phase, params: object) => {
    phase = method
    write(JSON.stringify({ jsonrpc: '2.0', id: ++currentRequest, method, params }))
  }
  const sendPrompt = () => request('session/prompt', { sessionId, prompt: [{ type: 'text', text: prompt }] })
  const configureEffort = () => {
    if (effort && supportsEffort) request('session/set_config_option', { sessionId, configId: 'thought_level', value: effort })
    else sendPrompt()
  }
  for await (const line of runner.run(path, [restrictedSettings, 'acp', '--stdio', '--include-default-customizations=false'],
    timeout, signal, (send, _, directory) => {
      write = send
      cwd = directory
      request('initialize', { protocolVersion: 1, clientCapabilities: {} })
    })) {
    if (!line.trim()) continue
    const msg = JSON.parse(line)
    if (typeof msg.method === 'string' && msg.id !== undefined) {
      const reply = msg.method === 'session/request_permission'
        ? { result: { outcome: { outcome: 'cancelled' } } }
        : { error: { code: -32601, message: 'Unsupported client method' } }
      write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, ...reply }))
      continue
    }
    if (msg.method === 'session/update' && sessionId && msg.params?.sessionId === sessionId) {
      const { sessionUpdate, content } = msg.params.update ?? {}
      if (sessionUpdate === 'tool_call') throw new Error('Antigravity ACP attempted a native tool call.')
      if (content?.type === 'text' && typeof content.text === 'string') {
        if (sessionUpdate === 'agent_message_chunk') yield { type: 'text', text: content.text }
        if (sessionUpdate === 'agent_thought_chunk') yield { type: 'reasoning', text: content.text }
      }
      continue
    }
    if (msg.id !== currentRequest) continue
    if (msg.error?.code === -32000 && /auth/i.test(msg.error.message ?? '')) throw new Error(loginHint)
    if (msg.error) wireError(msg.error.message)
    const result = msg.result
    switch (phase!) {
      case 'initialize':
        if (result?.protocolVersion !== 1) throw new Error('Unsupported Antigravity ACP protocol version.')
        request('session/new', { cwd, mcpServers: [] })
        break
      case 'session/new':
        if (typeof result?.sessionId !== 'string') throw new Error('Antigravity ACP returned no session.')
        sessionId = result.sessionId
        supportsEffort = Array.isArray(result.configOptions) && result.configOptions.some((option: { id: string }) => option.id === 'thought_level')
        if (result.models?.currentModelId !== model) request('session/set_model', { sessionId, modelId: model })
        else configureEffort()
        break
      case 'session/set_model':
        configureEffort()
        break
      case 'session/set_config_option':
        sendPrompt()
        break
      case 'session/prompt': {
        const reason = result?.stopReason
        if (reason !== 'end_turn' && reason !== 'stop_sequence' && reason !== 'max_tokens') {
          throw new Error('Antigravity ACP ended the session without a usable response.')
        }
        yield { type: 'finish', kind: reason === 'max_tokens' ? 'max-tokens' : 'stop' }
        return
      }
    }
  }
  throw new Error('Antigravity ACP stopped before returning a result.')
}

export const errorFinish = (error: unknown, signal?: AbortSignal): FinishReason => {
  if (signal?.aborted) return { kind: 'aborted', failure: { code: 'ABORTED', message: 'Antigravity CLI request cancelled.' } }
  const message = error instanceof SyntaxError ? 'Antigravity CLI returned invalid JSON.'
    : error instanceof Error ? error.message : 'Antigravity CLI request failed.'
  return { kind: 'error', failure: { code: 'ANTIGRAVITY_CLI_ERROR', message } }
}
