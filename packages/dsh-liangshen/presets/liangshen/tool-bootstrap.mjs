/**
 * Keep the first model request on a minimal-shaped input surface, then expose
 * the full preset catalog once the session is safely anchored.
 *
 * Phase 1 (no persisted `tool/call` yet):
 * - tool catalog: one platform shell plus `commonTools`
 * - prompt sections: only the persona section (all other sections,
 *   including plan-mode's `plan:policy`, return after promotion)
 * - runtime contexts: emptied (no sandbox/approval snapshot)
 * - pre-step messages: only explicit user messages pass
 *
 * Promotion opens the full tool catalog and restores runtime contexts and all
 * prompt sections. With `anchorGate` the promotion after the first tool call
 * also requires one minimal-like reasoning block (a first block containing
 * `we` and no `let me`) or the `maxBootstrapSteps` fallback.
 * `promoteAfterFirstResponse` promotes a tool-less first response once it has
 * responded, and also releases an anchor-gated session when its first turn
 * ends (`turn/end`). With `promotedPresentation: code` the promoted catalog
 * is presented as Code Mode (PTC): the wire shows a single `run_code` tool
 * backed by the generated SDK, switched at the step boundary so the current
 * step's native calls are never interrupted. `deferredSources` and
 * `deferredGraceSteps` delay selected injected message kinds (workspace
 * instructions, skill catalog) for a few steps after promotion.
 *
 * Source: https://github.com/xiaobright/dsh-anchored-standard (MIT), extended
 * with the phase-1 quarantine and the stabilization controls above.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'anchored-tool-bootstrap'

/** Prompt assembly and the tool registry must exist before this filter runs. */
export const inject = ['systemPrompt', 'tools']

/**
 * The current SDK splits the scoped persona into prefix and suffix sections.
 * Keep the older single-section names for existing runtimes. These literals
 * also allow the copied preset helper to run without its own node_modules;
 * tests compare against the installed official SDK's exported constants.
 */
const PERSONA_PREFIX_SECTION_NAMES = new Set(['deployment:persona-prefix', 'deployment:persona', 'persona'])
const PERSONA_SECTION_NAMES = new Set([...PERSONA_PREFIX_SECTION_NAMES, 'deployment:persona-suffix'])

/**
 * Workspace line a promoted persona gains. Phase 1 keeps the exact one-line
 * persona (the Minimal anchor); after promotion the model must also know the
 * session's selected workspace, which the Standard persona carries through
 * the `{{cwd}}` prompt variable. The literal cwd is read from the session
 * header at assembly time instead, so the line stays correct after a
 * workspace switch and a session without a selected workspace keeps the bare
 * one-liner rather than failing prompt interpolation.
 */
const WORKSPACE_LINE_PREFIX = '\n\nYour working directory is '

/** Message-source kinds the model may see during phase 1. */
const DEFAULT_MESSAGE_SOURCES = ['user']

/** Message-source kinds delayed after promotion. */
const DEFAULT_DEFERRED_SOURCES = []

function stringList(value, field, fallback) {
  if (value === undefined) return [...fallback]
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || item.length === 0)) {
    throw new TypeError(`${name}: ${field} must be a non-empty array of non-empty strings`)
  }
  return [...new Set(value)]
}

function stringListOrEmpty(value, field) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.length === 0)) {
    throw new TypeError(`${name}: ${field} must be an array of non-empty strings`)
  }
  return [...new Set(value)]
}

function integerAtLeast(value, field, minimum) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new TypeError(`${name}: ${field} must be an integer >= ${minimum}`)
  }
  return value
}

function countWord(text, regex) {
  return [...text.matchAll(regex)].length
}

/**
 * Anchor classifier for promotion gating. A reasoning block counts as
 * minimal-like when it contains `we` and no `let me`; a block with any
 * `let me` is standard-like; everything else is ambiguous. This is a
 * deliberate relaxation of the modeltest identity probe: the gate decides
 * trajectory surface, not model identity, and `we` presence without
 * first-person execution phrases is the stable surface marker.
 */
export function classifyReasoning(text) {
  const trimmed = String(text ?? '').trim()
  const we = countWord(trimmed, /\bwe\b/gi)
  const letMe = countWord(trimmed, /\blet me\b/gi)
  const metrics = { we, letMe }
  if (we > 0 && letMe === 0) return { label: 'minimal-like', score: 4, metrics }
  if (letMe > 0) return { label: 'standard-like', score: -4, metrics }
  return { label: 'ambiguous', score: 0, metrics }
}

/**
 * Whether the FIRST reasoning block of an assistant message classifies as
 * minimal-like. Later blocks do not override an earlier standard-like first
 * block.
 */
export function hasAnchoredReasoning(content) {
  if (!Array.isArray(content)) return false
  const first = content.find(block => block?.type === 'reasoning')
  return first !== undefined && classifyReasoning(first.text).label === 'minimal-like'
}

/**
 * Whether one pre-step message is an explicit user message. Only `kind:
 * 'user'` passes; injected kinds and source-less seed messages never pass.
 */
function isAllowedMessage(message, allowedSources) {
  const kind = message.source?.kind
  return kind === 'user' && allowedSources.has(kind)
}

/** Whether one pre-step message belongs to a deferred injection kind. */
function isDeferredMessage(message, deferredSources) {
  const kind = message.source?.kind
  return kind !== undefined && deferredSources.has(kind)
}

/**
 * Phase-2 promotion state per session. Sessions append events only, so the
 * scan resumes from the first event it has not inspected yet.
 */
const promotionBySession = new WeakMap()

/** Live agents observed by the assemble/pre-step listeners, keyed by session. */
const agentBySession = new WeakMap()

function stateFor(session) {
  let state = promotionBySession.get(session)
  if (state === undefined) {
    state = {
      next: 0,
      promoted: false,
      toolCalled: false,
      responded: false,
      anchored: false,
      turnEnded: false,
      steps: 0,
      deferredSteps: 0,
      presentationApplied: false,
    }
    promotionBySession.set(session, state)
  }
  return state
}

/**
 * Switch one agent's wire presentation to Code Mode (PTC: a single `run_code`
 * tool backed by the generated SDK) after promotion. `agent.ctx.tools` is the
 * per-agent view of the host registry, so the switch affects this session only.
 */
function applyPresentation(agent, state, policy) {
  if (state.presentationApplied || policy.promotedPresentation !== 'code') return
  state.presentationApplied = true
  const tools = agent.ctx.tools
  if (tools === undefined) return
  tools.presentAs('code')
}

/**
 * a) first tool call, no anchor gate — promote immediately;
 * b) first tool call, anchored or `maxBootstrapSteps` fallback — promote;
 * c) first tool call, still gated, but the first turn ended and
 *    `promoteAfterFirstResponse` is set — release on the new user turn (the
 *    release happens during prompt assembly, so that turn already gets the
 *    full catalog);
 * d) tool-less first response with `promoteAfterFirstResponse` — promote.
 */
function decidePromotion(state, config) {
  if (state.toolCalled && config.anchorGate !== true) return true
  if (state.toolCalled && config.anchorGate === true && (state.anchored || state.steps >= config.maxBootstrapSteps)) return true
  if (state.toolCalled && config.anchorGate === true && config.promoteAfterFirstResponse === true && state.turnEnded) return true
  if (!state.toolCalled && state.responded && config.promoteAfterFirstResponse === true) return true
  return false
}

/** Scan newly appended session events and update promotion state. */
function scanEvents(state, session) {
  const events = session.events
  for (; state.next < events.length; state.next += 1) {
    const event = events[state.next]
    if (event === undefined) continue
    if (event.type === 'tool/call') {
      state.toolCalled = true
    } else if (event.type === 'step/start') {
      state.steps += 1
    } else if (event.type === 'turn/end') {
      state.turnEnded = true
    } else if (event.type === 'assistant/message') {
      state.responded = true
      if (!state.anchored) state.anchored = hasAnchoredReasoning(event.data?.message?.content)
    }
  }
}

/** Update one agent's promotion state and apply its post-promotion presentation. */
function refresh(agent, policy) {
  const session = agent?.session
  if (session === undefined) return undefined
  const state = stateFor(session)
  agentBySession.set(session, agent)
  if (!state.promoted) {
    scanEvents(state, session)
    if (decidePromotion(state, policy)) state.promoted = true
  }
  if (state.promoted) applyPresentation(agent, state, policy)
  return state
}

/**
 * Append the session's working directory to the persona section of a promoted
 * assembly. Returns the assembly unchanged when there is no persona section,
 * no selected workspace, or the exact line is already present.
 */
function withWorkspaceLine(assembly, agent) {
  const cwd = agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || cwd.length === 0) return assembly
  if (!Array.isArray(assembly.sections)) return assembly
  const line = `${WORKSPACE_LINE_PREFIX}${cwd}.`
  const persona = assembly.sections.find(section =>
    PERSONA_PREFIX_SECTION_NAMES.has(section?.name)
    && typeof section?.text === 'string'
    && !section.text.includes(line))
  if (persona === undefined) return assembly
  return {
    ...assembly,
    sections: assembly.sections.map(section => section === persona
      ? { ...section, text: `${persona.text}${line}` }
      : section),
  }
}

/** Register the per-session bootstrap quarantine and promotion policy. */
export function apply(ctx, config) {
  const commonTools = stringList(config.commonTools, 'commonTools')
  const shellTools = stringList(config.shellTools, 'shellTools')
  const messageSources = new Set(stringList(config.messageSources, 'messageSources', DEFAULT_MESSAGE_SOURCES))
  const deferredSources = new Set(stringListOrEmpty(config.deferredSources, 'deferredSources'))
  const presentation = config.promotedPresentation ?? 'native'
  if (presentation !== 'native' && presentation !== 'code') {
    throw new TypeError(`${name}: promotedPresentation must be "native" or "code"`)
  }
  const policy = {
    anchorGate: config.anchorGate === true,
    promoteAfterFirstResponse: config.promoteAfterFirstResponse === true,
    maxBootstrapSteps: integerAtLeast(config.maxBootstrapSteps ?? 4, 'maxBootstrapSteps', 1),
    deferredGraceSteps: integerAtLeast(config.deferredGraceSteps ?? 0, 'deferredGraceSteps', 0),
    promotedPresentation: presentation,
  }

  // Promotion is applied at step/turn boundaries, never while a step is still
  // executing tools: switching the presentation mid-step would collapse the
  // native calls that step already planned. By `step/end` the tool-call and
  // reasoning events are durable, so the NEXT prompt assembly already sees
  // Code Mode with its generated SDK section.
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'step/end' && event.type !== 'turn/end') return
    const state = stateFor(session)
    if (!state.promoted) {
      scanEvents(state, session)
      if (decidePromotion(state, policy)) state.promoted = true
    }
    if (state.promoted) {
      const agent = agentBySession.get(session)
      if (agent !== undefined) applyPresentation(agent, state, policy)
    }
  })

  // `prepend: true` puts both filters at the outermost position of their
  // waterfall, so `await next()` always observes the complete downstream
  // result (including messages appended by listener order, not row order)
  // before the quarantine strips it.
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next()
    const agent = context.agent
    if (agent === undefined) return assembled
    const state = refresh(agent, policy)
    if (state.promoted) return withWorkspaceLine(assembled, agent)

    const available = new Set(assembled.tools.map(tool => tool.name))
    const selectedShells = shellTools.filter(toolName => available.has(toolName))
    const missingCommon = commonTools.filter(toolName => !available.has(toolName))
    if (selectedShells.length !== 1 || missingCommon.length > 0) {
      throw new Error(
        `${name}: expected exactly one bootstrap shell and every common tool; `
        + `shells=${JSON.stringify(selectedShells)}, missing=${JSON.stringify(missingCommon)}`,
      )
    }

    const bootstrap = new Set([...selectedShells, ...commonTools])
    return {
      ...assembled,
      tools: assembled.tools.filter(tool => bootstrap.has(tool.name)),
      contexts: [],
      ...(Array.isArray(assembled.sections)
        ? { sections: assembled.sections.filter(section => PERSONA_SECTION_NAMES.has(section?.name)) }
        : {}),
    }
  }, { prepend: true })

  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    const agent = payload.agent
    if (agent === undefined || decision.kind !== 'enter') return decision
    const state = refresh(agent, policy)
    if (state === undefined) return decision

    if (!state.promoted) {
      return {
        ...decision,
        messages: decision.messages.filter(message => isAllowedMessage(message, messageSources)),
      }
    }
    if (state.deferredSteps < policy.deferredGraceSteps) {
      state.deferredSteps += 1
      return {
        ...decision,
        messages: decision.messages.filter(message => !isDeferredMessage(message, deferredSources)),
      }
    }
    return decision
  }, { prepend: true })
}
