import assert from 'node:assert/strict'
import test from 'node:test'

import { Context } from '@deepseek-ai/cordis'
import { apply as applyCompactCommand } from '@deepseek-ai/dsh-command-compact'
import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic'
import {
  ManualCompactionError,
  isCompactCheckpointSource,
  toolPairingBalancedAfter,
  toolPairingBalancedBefore,
} from '@deepseek-ai/dsh-compaction'
import {
  ToolCallId,
  createMessage,
  createToolResultMessage,
  createUserMessage,
} from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import TokenMeter from '@deepseek-ai/dsh-token-meter'

const provider = 'compaction-fixture'
const model = 'compaction-fixture-model'

function userMessage(text) {
  return createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  })
}

function assistantMessage(content) {
  return createMessage({
    role: 'assistant',
    content,
    source: { kind: 'model', provider, model },
  })
}

function appendTextTurn(session, turn, userText, assistantText) {
  session.append('turn/start', { turn })
  const user = session.append('user/message', userMessage(userText), { surfaceOp: 'append' })
  session.append('step/start', { turn, step: 1 })
  const assistant = session.append('assistant/message', {
    turn,
    step: 1,
    stream: [],
    message: assistantMessage([{ type: 'text', text: assistantText }]),
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn, step: 1 })
  session.append('turn/end', { turn, reason: { kind: 'completed' } })
  return { user, assistant }
}

test('manual compaction preserves history and tool pairing across failure, retry, and continuation', async () => {
  const ctx = new Context()
  let summarizeAttempts = 0
  let failNextSummary = true
  let maintenanceActive = false

  class FixtureCompactionEngine extends BasicCompactionEngine {
    async summarize(input, _agent, signal) {
      signal?.throwIfAborted()
      summarizeAttempts += 1
      assert.ok(input.messages.length >= 4, 'compaction did not receive the expected history prefix')
      if (failNextSummary) {
        failNextSummary = false
        throw new Error('injected compaction summary failure')
      }
      return {
        summary: [{ type: 'text', text: 'Retained project state and completed tool result.' }],
        provider,
        model,
      }
    }
  }

  try {
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(TokenMeter)
    const engine = new FixtureCompactionEngine(ctx, { auto: false })
    const session = ctx.sessions.create()
    const callId = ToolCallId('compaction-fixture-call')

    session.append('turn/start', { turn: 1 })
    const firstUser = session.append('user/message', userMessage(`Inspect the fixture. ${'a'.repeat(1_200)}`), {
      surfaceOp: 'append',
    })
    session.append('step/start', { turn: 1, step: 1 })
    const toolRequest = session.append('assistant/message', {
      turn: 1,
      step: 1,
      stream: [],
      message: assistantMessage([{
        type: 'tool-call',
        id: callId,
        name: 'read_fixture',
        arguments: '{"path":"fixture.txt"}',
      }]),
    }, { surfaceOp: 'append' })
    session.append('tool/call', {
      turn: 1,
      step: 1,
      callId,
      name: 'read_fixture',
      arguments: '{"path":"fixture.txt"}',
    })
    const toolResult = session.append('tool/result', {
      turn: 1,
      step: 1,
      message: createToolResultMessage({
        callId,
        content: [{ type: 'text', text: `fixture contents ${'b'.repeat(1_200)}` }],
        isError: false,
      }),
    }, { surfaceOp: 'append' })
    session.append('step/end', { turn: 1, step: 1 })
    session.append('step/start', { turn: 1, step: 2 })
    session.append('assistant/message', {
      turn: 1,
      step: 2,
      stream: [],
      message: assistantMessage([{ type: 'text', text: `Tool processing complete. ${'c'.repeat(1_200)}` }]),
    }, { surfaceOp: 'append' })
    session.append('step/end', { turn: 1, step: 2 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    const secondTurn = appendTextTurn(
      session,
      2,
      `Continue from the tool output. ${'d'.repeat(1_200)}`,
      'The uncompressed tail remains available.',
    )

    assert.equal(toolPairingBalancedBefore(session, toolRequest.seq), true)
    assert.equal(toolPairingBalancedAfter(session, toolRequest.seq), false)
    assert.equal(toolPairingBalancedAfter(session, toolResult.seq), true)

    const originalSurface = [...session.surface.nodes]
    const originalLog = session.snapshotEvents().map(event => JSON.stringify(event))
    const agent = {
      session,
      options: { provider, model },
      async runMaintenance(task) {
        assert.equal(maintenanceActive, false, 'manual compaction maintenance overlapped')
        maintenanceActive = true
        const controller = new AbortController()
        try {
          return await task(controller.signal)
        } finally {
          maintenanceActive = false
        }
      },
    }

    await assert.rejects(
      engine.compactNow(agent, new AbortController().signal, 'command-fixture'),
      error => {
        assert.ok(error instanceof ManualCompactionError, error?.stack ?? String(error))
        assert.equal(error.code, 'summary')
        assert.match(error.cause?.message ?? '', /injected compaction summary failure/u)
        return true
      },
    )
    assert.deepEqual(session.surface.nodes, originalSurface, 'failed compaction changed the visible surface')
    assert.deepEqual(
      session.snapshotEvents(0, originalLog.length).map(event => JSON.stringify(event)),
      originalLog,
      'failed compaction rewrote original history',
    )
    const failedEnd = session.snapshotEvents().at(-1)
    assert.equal(failedEnd.type, 'compaction/end')
    assert.match(failedEnd.data.error ?? '', /injected compaction summary failure/u)

    const result = await engine.compactNow(agent, new AbortController().signal, 'command-fixture-retry')
    assert.ok(result, 'retry did not produce a compaction result')
    assert.equal(summarizeAttempts, 2)
    assert.equal(result.shadowedSeqs.includes(toolRequest.seq), true)
    assert.equal(result.shadowedSeqs.includes(toolResult.seq), true)
    assert.equal(result.shadowedSeqs.includes(secondTurn.assistant.seq), false)
    assert.deepEqual(
      session.snapshotEvents(0, originalLog.length).map(event => JSON.stringify(event)),
      originalLog,
      'successful compaction rewrote the append-only source history',
    )

    const compactedMessages = session.deriveMessages()
    assert.equal(compactedMessages.length, 2)
    assert.equal(isCompactCheckpointSource(compactedMessages[0].source), true)
    assert.equal(compactedMessages[1].id, secondTurn.assistant.data.message.id)
    for (const seq of session.surface.nodes) {
      assert.equal(toolPairingBalancedBefore(session, seq), true)
      assert.equal(toolPairingBalancedAfter(session, seq), true)
    }

    const continuation = appendTextTurn(
      session,
      3,
      'Continue after the compact checkpoint.',
      'Continuation completed after compaction.',
    )
    const continuedMessages = session.deriveMessages()
    assert.equal(continuedMessages.at(-1)?.id, continuation.assistant.data.message.id)
    assert.equal(session.eventAt(firstUser.seq)?.data.id, firstUser.data.id)
    assert.equal(session.eventAt(toolRequest.seq)?.data.message.id, toolRequest.data.message.id)
    assert.equal(session.eventAt(toolResult.seq)?.data.message.id, toolResult.data.message.id)
  } finally {
    await ctx.fiber.dispose()
  }
})

test('/compact maps no-op, success, retryable failure, cancellation, and usage errors for users', async () => {
  const ctx = new Context()
  let registered
  let nextResult = null
  let compactError
  let compactCalls = 0

  try {
    ctx.commands = {
      register(command) {
        registered = command
        return () => {}
      },
    }
    ctx.compaction = {
      async compactNow() {
        compactCalls += 1
        if (compactError !== undefined) throw compactError
        return nextResult
      },
    }
    applyCompactCommand(ctx)
    assert.equal(registered?.name, 'compact')
    const invoke = (rawInput = '', signal = new AbortController().signal) => registered.handler({
      rawInput,
      signal,
      commandId: 'command-fixture',
      agent: {},
    })

    assert.deepEqual(await invoke('unexpected'), {
      kind: 'error',
      text: 'Usage: /compact (no arguments)',
    })
    assert.equal(compactCalls, 0)

    assert.deepEqual(await invoke(), {
      kind: 'success',
      text: 'No compactable history yet.',
    })

    compactError = new ManualCompactionError('summary', 'injected summary failure')
    assert.deepEqual(await invoke(), {
      kind: 'error',
      text: 'Compaction could not produce a useful summary. The conversation is unchanged; the attempt is recorded in the session log.',
    })

    compactError = undefined
    nextResult = {
      shadowedSeqs: [2, 4, 7],
      shadowedTokenCount: 321,
      summarySeq: 12,
    }
    assert.deepEqual(await invoke(), {
      kind: 'success',
      text: 'Compacted 3 history items (~321 tokens).',
      sourceEventSeq: 12,
    })

    compactError = new ManualCompactionError('busy', 'injected busy state')
    assert.match((await invoke()).text, /agent is not idle/u)

    const controller = new AbortController()
    controller.abort(new Error('caller cancelled'))
    compactError = controller.signal.reason
    assert.deepEqual(await invoke('', controller.signal), {
      kind: 'error',
      text: 'Compaction cancelled.',
    })
  } finally {
    await ctx.fiber.dispose()
  }
})
