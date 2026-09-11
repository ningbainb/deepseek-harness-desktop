import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk, ToolSchema } from '@deepseek-ai/dsh-llm'
import type { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'

/**
 * A bounded, argument-free account of a compatibility decision. The raw tool
 * payload can contain source code, paths, or credentials, so it must never be
 * copied into Desktop's diagnostic log.
 */
export interface ToolCallNormalizationDiagnostic {
  readonly outcome: 'normalized' | 'rejected'
  readonly reason: ToolCallNormalizationReason
  readonly provider: string
  readonly model: string
  readonly tool: string
  readonly callId: string
  readonly source: 'block-end' | 'stream-delta'
}

/** Reasons an exact one-key `arguments` envelope was accepted or left intact. */
export type ToolCallNormalizationReason =
  | 'schema-validated-envelope'
  | 'unknown-tool'
  | 'duplicate-tool-schema'
  | 'unsupported-tool-schema'
  | 'nested-arguments-not-object'
  | 'nested-arguments-invalid'
  | 'ambiguous-outer-and-inner-valid'

export interface ToolCallArgumentNormalization {
  readonly arguments: string
  readonly diagnostic?: Omit<ToolCallNormalizationDiagnostic, 'provider' | 'model' | 'tool' | 'callId' | 'source'>
}

type ToolSchemaLookup =
  | { readonly kind: 'found'; readonly schema: ToolSchema }
  | { readonly kind: 'missing' }
  | { readonly kind: 'duplicate' }

interface BufferedToolCall {
  readonly chunks: StreamChunk[]
  id: ToolCallId
  name?: string
  arguments: string
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
}

function parseObject(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(raw)
    return isJsonObject(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function onlyArgumentsEnvelope(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value)
  return keys.length === 1 && keys[0] === 'arguments'
}

function buildToolSchemaLookup(tools: readonly ToolSchema[] | undefined): Map<string, ToolSchemaLookup> {
  const lookup = new Map<string, ToolSchemaLookup>()
  for (const tool of tools ?? []) {
    if (typeof tool.name !== 'string' || tool.name.length === 0) continue
    const previous = lookup.get(tool.name)
    lookup.set(tool.name, previous === undefined ? { kind: 'found', schema: tool } : { kind: 'duplicate' })
  }
  return lookup
}

/**
 * Recover the one transport defect reported by Desktop users without changing
 * the tool contract: `{ "arguments": { ...valid tool arguments... } }`.
 *
 * A field called `arguments` can be legitimate for a third-party tool. We
 * therefore unwrap only when all of these hold:
 *
 * 1. The outer value is a JSON object with exactly one own `arguments` key.
 * 2. Its nested value is an object (one level only; no recursive guessing).
 * 3. The currently advertised schema accepts the nested value.
 * 4. The same schema rejects the original outer value.
 *
 * Conditions 3 and 4 make a valid-but-ambiguous tool contract fail closed.
 * Every other input is handed to the ordinary DSH schema validator unchanged.
 */
export function normalizeWrappedToolCallArguments(
  raw: string,
  tool: ToolSchema | undefined,
): ToolCallArgumentNormalization {
  return normalizeWrappedToolCallArgumentsWithLookup(raw, tool === undefined ? { kind: 'missing' } : { kind: 'found', schema: tool })
}

function normalizeWrappedToolCallArgumentsWithLookup(
  raw: string,
  tool: ToolSchemaLookup,
): ToolCallArgumentNormalization {
  const outer = parseObject(raw)
  if (outer === undefined || !onlyArgumentsEnvelope(outer)) return { arguments: raw }

  if (tool.kind === 'missing') {
    return { arguments: raw, diagnostic: { outcome: 'rejected', reason: 'unknown-tool' } }
  }
  if (tool.kind === 'duplicate') {
    return { arguments: raw, diagnostic: { outcome: 'rejected', reason: 'duplicate-tool-schema' } }
  }

  let outerViolations: readonly string[]
  try {
    outerViolations = validateJsonSchemaValue(tool.schema.parameters as never, outer)
  } catch {
    return { arguments: raw, diagnostic: { outcome: 'rejected', reason: 'unsupported-tool-schema' } }
  }

  const nested = outer.arguments
  if (!isJsonObject(nested)) {
    // This may be a legitimate scalar `arguments` field. Only diagnose it
    // when the advertised schema also rejects the outer object.
    return outerViolations.length === 0
      ? { arguments: raw }
      : { arguments: raw, diagnostic: { outcome: 'rejected', reason: 'nested-arguments-not-object' } }
  }

  let nestedViolations: readonly string[]
  try {
    nestedViolations = validateJsonSchemaValue(tool.schema.parameters as never, nested)
  } catch {
    return { arguments: raw, diagnostic: { outcome: 'rejected', reason: 'unsupported-tool-schema' } }
  }

  if (outerViolations.length === 0) {
    // A schema that allows both shapes gives us no basis for choosing one.
    return nestedViolations.length === 0
      ? { arguments: raw, diagnostic: { outcome: 'rejected', reason: 'ambiguous-outer-and-inner-valid' } }
      : { arguments: raw }
  }

  if (nestedViolations.length > 0) {
    return { arguments: raw, diagnostic: { outcome: 'rejected', reason: 'nested-arguments-invalid' } }
  }

  return {
    arguments: JSON.stringify(nested),
    diagnostic: { outcome: 'normalized', reason: 'schema-validated-envelope' },
  }
}

function addDiagnostic(
  callback: ((diagnostic: ToolCallNormalizationDiagnostic) => void) | undefined,
  options: GenerateOptions,
  name: string,
  id: string,
  source: ToolCallNormalizationDiagnostic['source'],
  normalization: ToolCallArgumentNormalization,
): void {
  if (normalization.diagnostic === undefined || callback === undefined) return
  callback({
    ...normalization.diagnostic,
    provider: options.provider,
    model: options.model,
    tool: name,
    callId: id,
    source,
  })
}

function normalizeToolCall(
  raw: string,
  name: string,
  id: string,
  source: ToolCallNormalizationDiagnostic['source'],
  options: GenerateOptions,
  lookup: ReadonlyMap<string, ToolSchemaLookup>,
  diagnostic: ((diagnostic: ToolCallNormalizationDiagnostic) => void) | undefined,
): string {
  const normalization = normalizeWrappedToolCallArgumentsWithLookup(raw, lookup.get(name) ?? { kind: 'missing' })
  addDiagnostic(diagnostic, options, name, id, source, normalization)
  return normalization.arguments
}

function bufferToolCallChunk(
  buffered: Map<number, BufferedToolCall>,
  chunk: Extract<StreamChunk, { type: 'tool-call-delta' }>,
): void {
  const existing = buffered.get(chunk.index)
  if (existing === undefined) {
    buffered.set(chunk.index, {
      chunks: [chunk],
      id: chunk.id,
      ...(chunk.name === undefined || chunk.name.length === 0 ? {} : { name: chunk.name }),
      arguments: chunk.argumentsDelta,
    })
    return
  }
  existing.chunks.push(chunk)
  existing.id = chunk.id
  if (chunk.name !== undefined && chunk.name.length > 0) existing.name = chunk.name
  existing.arguments += chunk.argumentsDelta
}

function* flushBufferedToolCall(
  index: number,
  buffered: Map<number, BufferedToolCall>,
  options: GenerateOptions,
  lookup: ReadonlyMap<string, ToolSchemaLookup>,
  diagnostic: ((diagnostic: ToolCallNormalizationDiagnostic) => void) | undefined,
): Generator<StreamChunk> {
  const pending = buffered.get(index)
  if (pending === undefined) return
  buffered.delete(index)

  if (pending.name === undefined) {
    yield* pending.chunks
    return
  }

  const normalized = normalizeToolCall(
    pending.arguments,
    pending.name,
    pending.id,
    'stream-delta',
    options,
    lookup,
    diagnostic,
  )
  if (normalized === pending.arguments) {
    yield* pending.chunks
    return
  }

  yield {
    type: 'tool-call-delta',
    index,
    id: pending.id,
    name: pending.name,
    argumentsDelta: normalized,
  }
}

function* flushRawBufferedToolCall(
  index: number,
  buffered: Map<number, BufferedToolCall>,
): Generator<StreamChunk> {
  const pending = buffered.get(index)
  if (pending === undefined) return
  buffered.delete(index)
  yield* pending.chunks
}

/**
 * Normalize model tool-call payloads before dsh-agent-loop parses raw JSON.
 * Complete `block-end` calls are transformed in place. Delta-only calls are
 * held until they close so the raw JSON can be assessed as a complete value;
 * non-recovered deltas are replayed byte-for-byte.
 */
export async function* normalizeToolCallArgumentStream(
  options: GenerateOptions,
  source: AsyncIterable<StreamChunk>,
  diagnostic?: (diagnostic: ToolCallNormalizationDiagnostic) => void,
): AsyncGenerator<StreamChunk> {
  const lookup = buildToolSchemaLookup(options.tools)
  const buffered = new Map<number, BufferedToolCall>()

  try {
    for await (const chunk of source) {
      if (chunk.type === 'tool-call-delta') {
        bufferToolCallChunk(buffered, chunk)
        continue
      }

      if (chunk.type === 'block-end') {
        if (chunk.block.type === 'tool-call') {
          // A terminal block wins in BlockAssembler. Preserve any preceding raw
          // delta chunks for replay before yielding its normalized final block.
          yield* flushRawBufferedToolCall(chunk.index, buffered)
          const arguments_ = normalizeToolCall(
            chunk.block.arguments,
            chunk.block.name,
            String(chunk.block.id),
            'block-end',
            options,
            lookup,
            diagnostic,
          )
          yield {
            ...chunk,
            block: { ...chunk.block, arguments: arguments_ },
          }
          continue
        }

        yield* flushBufferedToolCall(chunk.index, buffered, options, lookup, diagnostic)
        yield chunk
        continue
      }

      if (chunk.type === 'finish') {
        // Map insertion order is model-stream order. Do not sort indexes: a
        // delta-only adapter is allowed to assign sparse indexes, and the
        // assistant message must preserve first-seen tool-call ordering.
        for (const index of [...buffered.keys()]) {
          yield* flushBufferedToolCall(index, buffered, options, lookup, diagnostic)
        }
        yield chunk
        continue
      }

      yield chunk
    }
  } catch (error) {
    // Do not turn an adapter failure into a silent truncation. Consumers still
    // receive every complete pending call before the original failure bubbles.
    for (const index of [...buffered.keys()]) {
      yield* flushBufferedToolCall(index, buffered, options, lookup, diagnostic)
    }
    throw error
  }

  // A broken adapter may end without a finish chunk. Let the official stream
  // invariant report that protocol violation, but do not silently discard a
  // pending argument payload on the way there.
  for (const index of [...buffered.keys()]) {
    yield* flushBufferedToolCall(index, buffered, options, lookup, diagnostic)
  }
}

function diagnosticValue(value: string): string {
  const truncated = value.length <= 160 ? value : `${value.slice(0, 157)}...`
  return JSON.stringify(truncated)
}

/** Install the Desktop-only stream compatibility hook through the public SDK. */
export function installToolCallArgumentNormalization(ctx: Context): void {
  ctx.on('llm/stream', (options, next) => normalizeToolCallArgumentStream(options, next(), (event) => {
    const message = [
      'dsh-desktop-compat: tool-call argument envelope',
      `outcome=${event.outcome}`,
      `reason=${event.reason}`,
      `provider=${diagnosticValue(event.provider)}`,
      `model=${diagnosticValue(event.model)}`,
      `tool=${diagnosticValue(event.tool)}`,
      `callId=${diagnosticValue(event.callId)}`,
      `source=${event.source}`,
    ].join(' ')
    ctx.logger?.warn?.(message)
  }), { global: true })
}
