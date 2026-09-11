import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { BlockAssembler, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk, ToolSchema } from '@deepseek-ai/dsh-llm'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'

import {
  installToolCallArgumentNormalization,
  normalizeToolCallArgumentStream,
  normalizeWrappedToolCallArguments,
} from '../src/tool-call-normalization.ts'
import type { ToolCallNormalizationDiagnostic } from '../src/tool-call-normalization.ts'

const PWSH_SCHEMA = {
  name: 'Pwsh',
  description: 'Run one PowerShell command with an operator-facing description.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      command: { type: 'string' },
      description: { type: 'string' },
    },
    required: ['command', 'description'],
  },
} satisfies ToolSchema

const VALID_PWSH_ARGUMENTS = {
  command: 'Get-ChildItem',
  description: 'List the working directory',
}

function request(tools: readonly ToolSchema[] = [PWSH_SCHEMA]): GenerateOptions {
  return {
    provider: 'fixture-provider',
    model: 'fixture-model',
    messages: [],
    tools: [...tools],
  }
}

async function collect(source: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of source) chunks.push(chunk)
  return chunks
}

async function* stream(chunks: readonly StreamChunk[]): AsyncGenerator<StreamChunk> {
  yield* chunks
}

function wrapped(value: unknown): string {
  return JSON.stringify({ arguments: value })
}

function exactToolCallStream(raw: string): StreamChunk[] {
  const id = ToolCallId('call-pwsh')
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name: 'Pwsh', argumentsDelta: raw.slice(0, 12) },
    { type: 'tool-call-delta', index: 0, id, argumentsDelta: raw.slice(12) },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'Pwsh', arguments: raw } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

describe('schema-aware tool call argument recovery', () => {
  it('unwraps an exact extra arguments envelope only when the nested object validates and the outer one does not', () => {
    const raw = wrapped(VALID_PWSH_ARGUMENTS)
    const result = normalizeWrappedToolCallArguments(raw, PWSH_SCHEMA)

    expect(validateJsonSchemaValue(PWSH_SCHEMA.parameters as never, JSON.parse(raw))).not.toEqual([])
    expect(validateJsonSchemaValue(PWSH_SCHEMA.parameters as never, JSON.parse(result.arguments))).toEqual([])
    expect(JSON.parse(result.arguments)).toEqual(VALID_PWSH_ARGUMENTS)
    expect(result.diagnostic).toEqual({
      outcome: 'normalized',
      reason: 'schema-validated-envelope',
    })
  })

  it('preserves malformed nested arguments so the normal schema error remains authoritative', () => {
    const raw = wrapped({ command: 'Get-ChildItem' })
    const result = normalizeWrappedToolCallArguments(raw, PWSH_SCHEMA)

    expect(result.arguments).toBe(raw)
    expect(result.diagnostic).toEqual({
      outcome: 'rejected',
      reason: 'nested-arguments-invalid',
    })
    expect(validateJsonSchemaValue(PWSH_SCHEMA.parameters as never, JSON.parse(result.arguments))).toContain(
      'missing required property "value.command"',
    )
  })

  it('does not reinterpret a legitimate arguments field or a shape with extra envelope keys', () => {
    const legitimateArgumentsSchema = {
      name: 'literal_arguments',
      description: 'Accept an explicitly named arguments string.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { arguments: { type: 'string' } },
        required: ['arguments'],
      },
    } satisfies ToolSchema
    const legitimate = '{"arguments":"keep-me"}'
    const legitimateResult = normalizeWrappedToolCallArguments(legitimate, legitimateArgumentsSchema)
    const extraKey = JSON.stringify({ arguments: VALID_PWSH_ARGUMENTS, trace: 'do-not-drop' })
    const extraKeyResult = normalizeWrappedToolCallArguments(extraKey, PWSH_SCHEMA)

    expect(legitimateResult).toEqual({ arguments: legitimate })
    expect(extraKeyResult).toEqual({ arguments: extraKey })
    expect(validateJsonSchemaValue(PWSH_SCHEMA.parameters as never, JSON.parse(extraKey))).not.toEqual([])
  })

  it('rejects an ambiguous schema that accepts both the outer envelope and inner payload', () => {
    const permissiveSchema = {
      name: 'permissive',
      description: 'A deliberately open object contract.',
      parameters: { type: 'object', additionalProperties: true },
    } satisfies ToolSchema
    const raw = wrapped(VALID_PWSH_ARGUMENTS)

    expect(normalizeWrappedToolCallArguments(raw, permissiveSchema)).toEqual({
      arguments: raw,
      diagnostic: {
        outcome: 'rejected',
        reason: 'ambiguous-outer-and-inner-valid',
      },
    })
  })

  it('normalizes the actual llm stream before BlockAssembler and preserves an argument-free diagnostic', async () => {
    const raw = wrapped({
      command: 'Get-ChildItem # must-not-appear-in-diagnostic',
      description: 'List the working directory',
    })
    const diagnostics: ToolCallNormalizationDiagnostic[] = []
    const chunks = await collect(normalizeToolCallArgumentStream(
      request(),
      stream(exactToolCallStream(raw)),
      event => diagnostics.push(event),
    ))
    const assembler = new BlockAssembler()
    for (const chunk of chunks) assembler.push(chunk)

    expect(assembler.blocks()).toEqual([{
      type: 'tool-call',
      id: ToolCallId('call-pwsh'),
      name: 'Pwsh',
      arguments: JSON.stringify({
        command: 'Get-ChildItem # must-not-appear-in-diagnostic',
        description: 'List the working directory',
      }),
    }])
    expect(diagnostics).toEqual([{
      outcome: 'normalized',
      reason: 'schema-validated-envelope',
      provider: 'fixture-provider',
      model: 'fixture-model',
      tool: 'Pwsh',
      callId: 'call-pwsh',
      source: 'block-end',
    }])
    expect(JSON.stringify(diagnostics)).not.toContain('must-not-appear-in-diagnostic')
  })

  it('uses the public llm/stream waterfall, not a model-specific prompt workaround', async () => {
    const raw = wrapped(VALID_PWSH_ARGUMENTS)
    const ctx = new Context()
    try {
      await ctx.plugin(LlmRuntime)
      installToolCallArgumentNormalization(ctx)
      ctx.llm.registerAdapter(['fixture-provider'], {
        providerInfo(provider) {
          return { id: provider, name: 'Fixture provider' }
        },
        providerRetryPolicy() { return undefined },
        async listModels() { return [] },
        async prepareCall(provider, model) {
          return {
            model: { provider, id: model, name: model },
            stream: async function* () { yield* exactToolCallStream(raw) },
          }
        },
      } as never)

      const chunks = await collect(ctx.llm.stream(request()))
      const assembler = new BlockAssembler()
      for (const chunk of chunks) assembler.push(chunk)
      const [call] = assembler.blocks()

      expect(call).toMatchObject({
        type: 'tool-call',
        name: 'Pwsh',
        arguments: JSON.stringify(VALID_PWSH_ARGUMENTS),
      })
      expect(validateJsonSchemaValue(PWSH_SCHEMA.parameters as never, JSON.parse((call as { arguments: string }).arguments))).toEqual([])
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('normalizes a complete delta-only payload immediately before finish', async () => {
    const raw = wrapped(VALID_PWSH_ARGUMENTS)
    const id = ToolCallId('call-delta')
    const diagnostics: ToolCallNormalizationDiagnostic[] = []
    const chunks = await collect(normalizeToolCallArgumentStream(
      request(),
      stream([
        { type: 'block-start', index: 0, blockType: 'tool-call' },
        { type: 'tool-call-delta', index: 0, id, name: 'Pwsh', argumentsDelta: raw.slice(0, 8) },
        { type: 'tool-call-delta', index: 0, id, argumentsDelta: raw.slice(8) },
        { type: 'finish', reason: { kind: 'tool-calls' } },
      ]),
      event => diagnostics.push(event),
    ))
    const assembler = new BlockAssembler()
    for (const chunk of chunks) assembler.push(chunk)

    expect(assembler.blocks()).toEqual([{
      type: 'tool-call',
      id,
      name: 'Pwsh',
      arguments: JSON.stringify(VALID_PWSH_ARGUMENTS),
    }])
    expect(diagnostics).toEqual([expect.objectContaining({
      outcome: 'normalized',
      reason: 'schema-validated-envelope',
      source: 'stream-delta',
    })])
  })

  it('waits for a complete delta-only payload and refuses an unknown tool without exposing its arguments', async () => {
    const raw = wrapped({ command: 'secret-value', description: 'Sensitive model payload' })
    const id = ToolCallId('call-unknown')
    const diagnostics: ToolCallNormalizationDiagnostic[] = []
    const chunks = await collect(normalizeToolCallArgumentStream(
      request([]),
      stream([
        { type: 'block-start', index: 0, blockType: 'tool-call' },
        { type: 'tool-call-delta', index: 0, id, name: 'UnknownTool', argumentsDelta: raw.slice(0, 8) },
        { type: 'tool-call-delta', index: 0, id, argumentsDelta: raw.slice(8) },
        { type: 'finish', reason: { kind: 'tool-calls' } },
      ]),
      event => diagnostics.push(event),
    ))
    const assembler = new BlockAssembler()
    for (const chunk of chunks) assembler.push(chunk)

    expect(assembler.blocks()).toEqual([{
      type: 'tool-call',
      id,
      name: 'UnknownTool',
      arguments: raw,
    }])
    expect(diagnostics).toEqual([expect.objectContaining({
      outcome: 'rejected',
      reason: 'unknown-tool',
      tool: 'UnknownTool',
    })])
    expect(JSON.stringify(diagnostics)).not.toContain('secret-value')
  })

  it('flushes a complete pending delta before propagating an upstream stream error', async () => {
    const raw = wrapped(VALID_PWSH_ARGUMENTS)
    const id = ToolCallId('call-interrupted')
    async function* interrupted(): AsyncGenerator<StreamChunk> {
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id, name: 'Pwsh', argumentsDelta: raw }
      throw new Error('fixture adapter disconnected')
    }

    const chunks: StreamChunk[] = []
    let failure: unknown
    try {
      for await (const chunk of normalizeToolCallArgumentStream(request(), interrupted())) chunks.push(chunk)
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe('fixture adapter disconnected')
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      {
        type: 'tool-call-delta',
        index: 0,
        id,
        name: 'Pwsh',
        argumentsDelta: JSON.stringify(VALID_PWSH_ARGUMENTS),
      },
    ])
  })
})
