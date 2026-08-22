import { z } from 'zod'
// Type-only: pulls the session-projection map table (merge-extensible) so the
// liveTokenUsage projection key registers against it (augmentation lives in
// @deepseek-ai/dsh-token-meter/projection).
import type {} from '@deepseek-ai/dsh-session-projection/types'
import type { Message, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SurfaceEvent } from '@deepseek-ai/dsh-session'
import { isSurfaceEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { LiveTokenUsageProjection, TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import {
  estimateContentTokens,
  estimateHeaderTokens,
  estimateMessageTokens,
  estimateTextBlockTokens,
  estimateToolCallBlockTokens,
} from './estimator.ts'
import type { EstimatorSpec } from './estimator.ts'

export type { LiveTokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'

const zeroBuckets = (): TokenUsageProjection => ({
  uncachedInputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
})

const bucketsFrom = (usage: TokenUsage): TokenUsageProjection => ({
  uncachedInputTokens: usage.inputTokens,
  outputTokens: usage.outputTokens,
  cacheReadTokens: usage.cacheReadTokens ?? 0,
  cacheWriteTokens: usage.cacheWriteTokens ?? 0,
})

const addReplacing = (
  totals: TokenUsageProjection,
  previous: TokenUsageProjection | undefined,
  next: TokenUsageProjection,
): TokenUsageProjection => ({
  uncachedInputTokens: totals.uncachedInputTokens - (previous?.uncachedInputTokens ?? 0) + next.uncachedInputTokens,
  outputTokens: totals.outputTokens - (previous?.outputTokens ?? 0) + next.outputTokens,
  cacheReadTokens: totals.cacheReadTokens - (previous?.cacheReadTokens ?? 0) + next.cacheReadTokens,
  cacheWriteTokens: totals.cacheWriteTokens - (previous?.cacheWriteTokens ?? 0) + next.cacheWriteTokens,
})

const projectionSchema = z.object({
  uncachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  estimated: z.boolean(),
  tokensPerSecond: z.number().nonnegative().optional(),
}).strict() as unknown as z.ZodType<LiveTokenUsageProjection>

const tokenBucketsSchema = z.object({
  uncachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
}).strict()

type OutputBlock =
  | { kind: 'text'; characters: number }
  | { kind: 'reasoning'; characters: number }
  | { kind: 'tool-call'; nameCharacters: number; argumentCharacters: number }
  | { kind: 'fixed'; tokens: number }

interface ActiveStep {
  turn: number
  step: number
  buckets: TokenUsageProjection
  exact: boolean
  blocks: Record<string, OutputBlock>
  /** Running sum of the per-block estimates of every non-undefined block. */
  pricedTokens: number
  /** Count of non-undefined blocks (guards the role overhead and zero case). */
  pricedBlocks: number
  firstOutputTime?: number
  latestOutputTime?: number
}

interface SettledSample {
  turn: number
  step: number
  buckets: TokenUsageProjection
  estimated: boolean
  /** Last measured throughput; carried across rate-less steps. */
  tokensPerSecond?: number
}

/** Plain-JSON fold state persisted by the RC.1 projection cache. */
export interface LiveTokenUsageState {
  settled: TokenUsageProjection
  settledEstimates: number
  last: SettledSample | null
  /** Surface message seq -> estimated tokens, kept in increasing seq order. */
  surface: Record<string, number>
  surfaceTokens: number
  headerTokens: number
  active: ActiveStep | null
}

type State = LiveTokenUsageState
type LiveTokenUsageProjectionDefinition = ProjectionDefinition<'liveTokenUsage', State> & {
  wire: NonNullable<ProjectionDefinition<'liveTokenUsage', State>['wire']>
}

const outputBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), characters: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal('reasoning'), characters: z.number().int().nonnegative() }).strict(),
  z.object({
    kind: z.literal('tool-call'),
    nameCharacters: z.number().int().nonnegative(),
    argumentCharacters: z.number().int().nonnegative(),
  }).strict(),
  z.object({ kind: z.literal('fixed'), tokens: z.number().int().nonnegative() }).strict(),
])

const sequenceKey = z.string().regex(/^(?:0|[1-9]\d*)$/u)
const sequenceTableSchema = z.record(sequenceKey, z.number().int().nonnegative())
const blockTableSchema = z.record(sequenceKey, outputBlockSchema)
const activeStepSchema = z.object({
  turn: z.number().int().nonnegative(),
  step: z.number().int().nonnegative(),
  buckets: tokenBucketsSchema,
  exact: z.boolean(),
  blocks: blockTableSchema,
  pricedTokens: z.number().int().nonnegative(),
  pricedBlocks: z.number().int().nonnegative(),
  firstOutputTime: z.number().optional(),
  latestOutputTime: z.number().optional(),
}).strict()
const settledSampleSchema = z.object({
  turn: z.number().int().nonnegative(),
  step: z.number().int().nonnegative(),
  buckets: tokenBucketsSchema,
  estimated: z.boolean(),
  tokensPerSecond: z.number().nonnegative().optional(),
}).strict()
const stateSchema = z.object({
  settled: tokenBucketsSchema,
  settledEstimates: z.number().int().nonnegative(),
  last: settledSampleSchema.nullable(),
  surface: sequenceTableSchema,
  surfaceTokens: z.number().int().nonnegative(),
  headerTokens: z.number().int().nonnegative(),
  active: activeStepSchema.nullable(),
}).strict() as unknown as z.ZodType<LiveTokenUsageState>

function surfaceMessage(event: SurfaceEvent): Message {
  switch (event.type) {
    case 'user/message':
      return event.data
    case 'assistant/message':
    case 'tool/result':
      return event.data.message
  }
}

function applySurface(
  state: State,
  event: SurfaceEvent,
  spec: EstimatorSpec,
): Pick<State, 'surface' | 'surfaceTokens'> {
  const tokens = estimateMessageTokens(surfaceMessage(event), spec)
  if (event.surfaceOp === 'append') {
    state.surface[event.seq] = tokens
    return {
      surface: state.surface,
      surfaceTokens: state.surfaceTokens + tokens,
    }
  }
  const operation = event.surfaceOp
  if (!Object.hasOwn(state.surface, operation.start)
    || !Object.hasOwn(state.surface, operation.end)
    || operation.start > operation.end) {
    throw new Error(
      'live-stats: replace at seq ' + event.seq + ' has invalid current range ' + operation.start + '-' + operation.end,
    )
  }
  // Integer object keys enumerate in increasing order. This keeps the state
  // plain JSON for RC.1 checkpoint persistence without losing the early exit.
  let removed = 0
  for (const sequence of Object.keys(state.surface)) {
    const seq = Number(sequence)
    if (seq < operation.start) continue
    if (seq > operation.end) break
    removed += state.surface[sequence] ?? 0
    delete state.surface[sequence]
  }
  state.surface[event.seq] = tokens
  return {
    surface: state.surface,
    surfaceTokens: state.surfaceTokens - removed + tokens,
  }
}

/** Per-block token contribution used by the incremental output pricing. */
function blockEstimate(block: OutputBlock, spec: EstimatorSpec): number {
  switch (block.kind) {
    case 'text':
    case 'reasoning':
      return estimateTextBlockTokens(block.characters, spec)
    case 'tool-call':
      return estimateToolCallBlockTokens(block.nameCharacters, block.argumentCharacters, spec)
    case 'fixed':
      return block.tokens
  }
}

/** Rewrite one block slot and fold the estimate delta into the active sums. */
function writeBlock(
  active: ActiveStep,
  index: number,
  previous: OutputBlock | undefined,
  next: OutputBlock,
  spec: EstimatorSpec,
): void {
  active.pricedTokens += blockEstimate(next, spec) - (previous === undefined ? 0 : blockEstimate(previous, spec))
  if (previous === undefined) active.pricedBlocks += 1
  active.blocks[index] = next
}

/** Mutate the active step in place for one stream chunk.
 * @param active - the active step whose blocks slot and priced sums are updated.
 * @param chunk - the stream delta to apply.
 * @param spec - resolved estimator settings.
 * @returns true when the chunk changed a block (no-ops return false untouched).
 */
function applyOutputChunk(active: ActiveStep, chunk: StreamChunk, spec: EstimatorSpec): boolean {
  switch (chunk.type) {
    case 'text-delta': {
      if (chunk.text === '') return false
      const previous = active.blocks[chunk.index]
      writeBlock(active, chunk.index, previous, {
        kind: 'text',
        characters: (previous?.kind === 'text' ? previous.characters : 0) + chunk.text.length,
      }, spec)
      return true
    }
    case 'reasoning-delta': {
      if (chunk.text === '') return false
      const previous = active.blocks[chunk.index]
      writeBlock(active, chunk.index, previous, {
        kind: 'reasoning',
        characters: (previous?.kind === 'reasoning' ? previous.characters : 0) + chunk.text.length,
      }, spec)
      return true
    }
    case 'tool-call-delta': {
      if (chunk.name === undefined && chunk.argumentsDelta === '') return false
      const previous = active.blocks[chunk.index]
      writeBlock(active, chunk.index, previous, {
        kind: 'tool-call',
        nameCharacters: chunk.name?.length ?? (previous?.kind === 'tool-call' ? previous.nameCharacters : 0),
        argumentCharacters: (previous?.kind === 'tool-call' ? previous.argumentCharacters : 0)
          + chunk.argumentsDelta.length,
      }, spec)
      return true
    }
    case 'block-end': {
      const previous = active.blocks[chunk.index]
      writeBlock(active, chunk.index, previous, { kind: 'fixed', tokens: estimateContentTokens([chunk.block], spec) }, spec)
      return true
    }
    default:
      return false
  }
}

function rateOf(step: ActiveStep): number | undefined {
  if (step.firstOutputTime === undefined || step.latestOutputTime === undefined) return
  const elapsedMs = step.latestOutputTime - step.firstOutputTime
  if (elapsedMs <= 0 || step.buckets.outputTokens <= 0) return
  return step.buckets.outputTokens * 1_000 / elapsedMs
}

function exactStep(step: ActiveStep, usage: TokenUsage, time: number): ActiveStep {
  return {
    ...step,
    buckets: bucketsFrom(usage),
    exact: true,
    // The exact usage supersedes every block priced from streamed deltas;
    // retain only the exact buckets so later deltas cannot re-estimate.
    blocks: {},
    pricedTokens: 0,
    pricedBlocks: 0,
    ...(usage.outputTokens > 0
      ? { firstOutputTime: step.firstOutputTime ?? time, latestOutputTime: time }
      : {}),
  }
}

function view(state: State): LiveTokenUsageProjection {
  const active = state.active
  const previous = active !== null
    && state.last?.turn === active.turn
    && state.last.step === active.step
    ? state.last
    : undefined
  const buckets = active === null
    ? state.settled
    : addReplacing(state.settled, previous?.buckets, active.buckets)
  const estimates = state.settledEstimates
    - (previous?.estimated === true ? 1 : 0)
    + (active !== null && !active.exact ? 1 : 0)
  // Resident throughput: once any step measured a rate, keep reporting it.
  // Without the fallback the row drops out between output bursts (an active
  // step before its first chunk) and after a rate-less step settles — the
  // stats band must not flicker while the other groups stay put.
  const rate = active === null
    ? state.last?.tokensPerSecond
    : rateOf(active) ?? state.last?.tokensPerSecond
  return {
    ...buckets,
    estimated: estimates > 0,
    ...(rate === undefined ? {} : { tokensPerSecond: rate }),
  }
}

/** Create the replayable live usage projection consumed by DSH Web and the TPS row.
 * @param spec - resolved estimator settings for the fold.
 * @returns the replayable `liveTokenUsage` projection definition.
 */
export function createLiveTokenUsageProjectionDefinition(
  spec: EstimatorSpec,
): LiveTokenUsageProjectionDefinition {
  return {
    key: 'liveTokenUsage',
    stateSchema,
    init: () => ({
      settled: zeroBuckets(),
      settledEstimates: 0,
      last: null,
      surface: {},
      surfaceTokens: 0,
      headerTokens: 0,
      active: null,
    }),
    apply: (state, event: SessionEvent) => {
      let next = state
      if (event.type === 'step/start') {
        next = {
          ...next,
          active: {
            ...event.data,
            buckets: {
              ...zeroBuckets(),
              uncachedInputTokens: state.headerTokens + state.surfaceTokens,
            },
            exact: false,
            blocks: {},
            pricedTokens: 0,
            pricedBlocks: 0,
          },
        }
      } else if (event.type === 'request/header') {
        next = {
          ...next,
          headerTokens: estimateHeaderTokens(event.data.header, spec),
          ...(next.active === null ? {} : {
            active: {
              ...next.active,
              buckets: {
                ...next.active.buckets,
                uncachedInputTokens: estimateHeaderTokens(event.data.header, spec) + state.surfaceTokens,
              },
            },
          }),
        }
      } else if (event.type === 'assistant/chunk' && next.active !== null) {
        const { chunk } = event.data
        if (chunk.type === 'usage') {
          next = { ...next, active: exactStep(next.active, chunk.usage, event.time) }
        } else if (!next.active.exact) {
          // Reuse the active step in place instead of rebuilding a fresh
          // object (and copying buckets) on every streamed delta: only the
          // mutated fields change, and the blocks buffer is untouched between
          // steps. The settle/usage paths still build a fresh active step.
          const active = next.active
          if (applyOutputChunk(active, chunk, spec)) {
            const tokens = active.pricedBlocks === 0 ? 0 : active.pricedTokens + spec.roleOverhead
            active.buckets = { ...active.buckets, outputTokens: tokens }
            if (tokens > 0) {
              if (active.firstOutputTime === undefined) active.firstOutputTime = event.time
              active.latestOutputTime = event.time
            }
          }
        }
      } else if (event.type === 'assistant/message' && next.active !== null) {
        next = {
          ...next,
          active: event.data.usage === undefined
            ? {
              ...next.active,
              ...(next.active.buckets.outputTokens > 0 ? { latestOutputTime: event.time } : {}),
            }
            : exactStep(next.active, event.data.usage, event.time),
        }
      } else if (event.type === 'step/end' && next.active !== null) {
        const active = next.active
        const rate = rateOf(active)
        const residentRate = rate ?? state.last?.tokensPerSecond
        const previous = next.last?.turn === active.turn && next.last.step === active.step
          ? next.last
          : undefined
        next = {
          ...next,
          settled: addReplacing(next.settled, previous?.buckets, active.buckets),
          settledEstimates: next.settledEstimates
          - (previous?.estimated === true ? 1 : 0)
          + (!active.exact ? 1 : 0),
          last: {
            turn: active.turn,
            step: active.step,
            buckets: active.buckets,
            estimated: !active.exact,
            // Carry the last measured rate across a rate-less step instead of
            // clobbering it: the row stays resident (see view()).
          ...(residentRate === undefined ? {} : { tokensPerSecond: residentRate }),
          },
          active: null,
        }
      } else if (event.type === 'turn/end'
      && event.data.reason.kind !== 'completed'
      && next.last?.turn === event.data.turn
      && next.last.estimated) {
        next = {
          ...next,
          settled: addReplacing(next.settled, next.last.buckets, zeroBuckets()),
          settledEstimates: next.settledEstimates - 1,
          last: null,
        }
      }

      if (isSurfaceEvent(event)) next = { ...next, ...applySurface(next, event, spec) }
      return next
    },
    wire: {
      viewSchema: projectionSchema,
      view,
    },
    stateVersion: 3,
  }
}
