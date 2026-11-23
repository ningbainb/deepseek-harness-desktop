import { AsyncLocalStorage } from 'node:async_hooks'
import { registerHooks } from 'node:module'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import { PERSONA_PREFIX_SECTION } from '@deepseek-ai/dsh-system-prompt'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const ROLE_TOOL = 'spawn_teammate_role'
const MARKET_ENTRY = /\/node_modules\/dsh-agent-plugins-market\/lib\/index\.js$/u
const SIDEBAR_ENTRY = /\/node_modules\/dsh-better-sidebar\/lib\/index\.js$/u
const SIDEBAR_ORIGINAL_QUERY = '__desktop_sidebar_team_original'
const retainedRoles = new Map()
export const MARKET_TEAM_REVIEWED_ENTRY = Object.freeze({
  package: 'dsh-agent-plugins-market', version: '0.11.1', entry: 'lib/index.js', byteLength: 143,
  sha256: 'e6039f4cee7d4cf377db3721b4fe841f46c9c70e8ea029f5d41f2dbc3f3b9218',
})
export const SIDEBAR_TEAM_REVIEWED_ENTRY = Object.freeze({
  package: 'dsh-better-sidebar', version: '0.24.1', entry: 'lib/index.js', byteLength: 174661,
  sha256: '59633da266535fca2fef926d44285b45981cf3423d4b8c158043924c90b3db6e',
  // The tracked pnpm patch contributes four CRLF lines on Windows and LF
  // lines on native Unix checkouts. Accept only these two reviewed byte sets.
  sourceVariants: Object.freeze([Object.freeze({ byteLength: 174657,
    sha256: '584c469b7f82ed4577843e27c424ee016a4f460e6dd3ec8ce90670572366b099',
  })]),
})

/** Sidebar task writes retain the vendor route and official Team mutation API.
 * Unlike market's structural identity seam, its no-Team test includes mode.
 */
export function wrapSidebarTeamContext(ctx) {
  const teams = () => {
    const original = ctx.get('agentTeams')
    if (!original || typeof original.tryMembership === 'function') return original
    return new Proxy(original, { get(target, key) {
      if (key === 'tryMembership') return agent => {
        if (!agent || ctx.get('agents')?.get(agent.id) !== agent) return undefined
        try {
          if (!original.isEnabled(agent)) return undefined
          const subagents = ctx.get('subagents')
          const root = subagents.rootOf(agent)
          return { root, role: root === agent ? 'lead' : 'member', name: subagents.namesOf(agent).self }
        } catch (error) {
          if (error.code === 'UNAUTHORIZED') return undefined
          throw error
        }
      }
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    } })
  }
  return new Proxy(ctx, { get(target, key) {
    if (key === 'agentTeams') return teams()
    if (key === 'get') return (name, ...args) => name === 'agentTeams' ? teams() : target.get(name, ...args)
    const value = Reflect.get(target, key, target)
    return typeof value === 'function' ? value.bind(target) : value
  } })
}

/** Project the retired Team identity/creation seam onto the official rc3 tree.
 * Identity is independent of the root's Team-mode selection, just as in rc3.
 * Only the market subtree sees this facade; the official services stay intact.
 */
export function wrapMarketTeamContext(context) {
  const contexts = new WeakMap()
  const pending = new AsyncLocalStorage()
  const activations = new Map()
  context.on('agent/disposed', ({ agent }) => {
    if (activations.get(agent.id)?.agent === agent) activations.delete(agent.id)
  })
  const restoreRetained = () => {
    for (const [agent, record] of retainedRoles) {
      if (record.restored || context.get('agents')?.get(agent.id) !== agent) continue
      const prompt = agent.ctx.get('systemPrompt')
      const offPersona = prompt.section({ name: PERSONA_PREFIX_SECTION, order: prompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'), text: record.binding.persona, interpolate: false })
      Object.assign(agent.options, record.binding.route)
      if (record.binding.route.reasoningEffort === undefined) delete agent.options.reasoningEffort
      const offModel = installModelSelection(agent.ctx, { current: record.binding.route, assembled: undefined })
      record.release = () => {
        offModel()
        offPersona()
        if (retainedRoles.get(agent) === record) retainedRoles.delete(agent)
      }
      record.restored = true
      agent.ctx.on('agent/disposed', ({ agent: disposed }) => { if (disposed === agent) record.release() })
      process.stderr.write(`[desktop] retained resumed market role ${agent.id}; root=${record.parent.id}; binding=teammate-role-binding in the persisted session journal; execution interrupted, resident and queued input preserved until agent disposal\n`)
    }
  }
  const wrap = ctx => {
    if (contexts.has(ctx)) return contexts.get(ctx)
    const service = name => ctx.get(name)
    const membership = agent => {
      if (!agent || service('agents').get(agent.id) !== agent) throw new Error('Team membership requires the exact live agent')
      const creation = pending.getStore()
      // rc3 announces the new Agent before publishing its activation. The
      // provider's public prepareContinuable request binds this one startup.
      if (creation?.childId === agent.id && service('agents').get(creation.parent.id) === creation.parent
        && agent.session.header.parentSession === creation.parent.id) {
        return { root: creation.parent, role: 'member', name: creation.name }
      }
      const root = service('subagents').rootOf(agent)
      return { root, role: root === agent ? 'lead' : 'member', name: service('subagents').namesOf(agent).self }
    }
    const tryMembership = agent => {
      if (!agent || service('agents').get(agent.id) !== agent) return undefined
      try { return membership(agent) } catch (error) {
        if (error.code === 'UNAUTHORIZED') return undefined
        throw error
      }
    }
    const enabled = agent => tryMembership(agent) !== undefined && service('agentTeams').isEnabled(agent)
    const facade = (target, overrides) => new Proxy(target, { get(object, key) {
      if (Object.hasOwn(overrides, key)) return overrides[key]
      const value = Reflect.get(object, key, object)
      return typeof value === 'function' ? value.bind(object) : value
    } })
    const teams = () => facade(service('agentTeams'), {
      membership, tryMembership,
      async spawnTeammate(parent, request) {
        if (membership(parent).role !== 'lead') throw new Error('only the Team Lead can create role teammates')
        if (!enabled(parent)) throw new Error('Agent Teams must be enabled to create role teammates')
        if (request.context !== 'fresh') throw new Error('market role teammates require fresh context')
        request.signal.throwIfAborted()
        const creation = { parent, name: request.name }
        const activation = await pending.run(creation, () => service('subagents').startActivation({
          parent, provider: request.provider, name: request.name, label: request.description,
          prompt: request.prompt, signal: request.signal, delivery: 'parent',
        }))
        activations.set(activation.childId, { parent, activation, agent: service('agents').get(activation.childId) })
        return { member: { id: activation.childId, name: activation.name } }
      },
    })
    const subagents = () => facade(service('subagents'), {
      async drainChildren(parent, childIds) {
        if (service('agents').get(parent.id) !== parent) throw new Error('role cleanup requires the exact live parent')
        for (const id of childIds) {
          const owned = activations.get(id)
          const agent = service('agents').get(id)
          if (!agent) continue
          if (owned?.parent !== parent || owned.agent !== agent) {
            if (membership(agent).root !== parent || agent.session.header.parentSession !== parent.id) throw new Error('role cleanup cannot cross the live parent tree')
            const messages = agent.session.snapshotEvents().flatMap(event => event.type === 'user/message' ? [event.data] : event.type === 'agent/inbox/spliced' ? event.data.inserted : [])
            const bindings = new Map(messages.filter(message => message.source?.kind === 'teammate-role-binding').map(message => [message.id, message.source.binding]))
            if (bindings.size !== 1) throw new Error('resumed role cleanup requires one durable role binding')
            const binding = [...bindings.values()][0]
            if (binding.version !== 1 || binding.childId !== agent.id || typeof binding.persona !== 'string' || !binding.route?.provider || !binding.route?.model) throw new Error('resumed role cleanup has an invalid durable binding')
            retainedRoles.set(agent, { parent, binding, restored: false })
            service('subagents').interrupt(id, { kind: 'ancestor', agent: parent })
            await agent.whenIdle()
            continue
          }
          await owned.activation.dispose()
          activations.delete(id)
        }
      },
      registerProvider(provider) {
        if (provider.name !== 'market-role-team' || !provider.prepareContinuable) return service('subagents').registerProvider(provider)
        return service('subagents').registerProvider({ ...provider, prepareContinuable(request) {
          const creation = pending.getStore()
          if (creation?.parent === request.parent) creation.childId = request.sessionId
          return provider.prepareContinuable(request)
        } })
      },
    })
    const tools = () => facade(service('tools'), {
      register(definition, options = {}) {
        if (definition.name !== ROLE_TOOL) return service('tools').register(definition, options)
        return service('tools').register(definition, { ...options, when: async input =>
          enabled(input.agent) && membership(input.agent).role === 'lead' && (!options.when || await options.when(input)) })
      },
      get(name, agent) {
        if (name === ROLE_TOOL && agent && (!enabled(agent) || membership(agent).role !== 'lead')) return undefined
        return service('tools').get(name, agent)
      },
    })
    const prompt = () => facade(service('systemPrompt'), {
      section(section) {
        if (section.name !== 'market:team-coordination') return service('systemPrompt').section(section)
        return service('systemPrompt').section({ ...section, text: input => enabled(input.scope ?? input.agent) ? section.text(input) : '' })
      },
    })
    const projected = { agentTeams: teams, subagents, tools, systemPrompt: prompt }
    const proxy = facade(ctx, {
      get(name, ...args) { return projected[name] ? projected[name]() : ctx.get(name, ...args) },
      inject(dependencies, callback) { return ctx.inject(dependencies, (child, ...args) => callback(wrap(child), ...args)) },
      effect(factory, label) {
        if (label !== 'dsh-agent-plugins-market: role teammates') return ctx.effect(factory, label)
        return ctx.effect(async () => {
          const previous = [...retainedRoles].filter(([agent]) => service('agents').get(agent.id) === agent)
          const ready = Promise.withResolvers()
          const gates = previous.map(([agent]) => agent.ctx.on('agent/pre-step', async (_input, next) => { await ready.promise; return next() }))
          try {
            const off = await factory()
            for (const [, record] of previous) record.release?.()
            return async () => { try { await off() } finally { restoreRetained() } }
          } finally {
            ready.resolve()
            for (const off of gates) off()
          }
        }, label)
      },
      ...Object.fromEntries(Object.keys(projected).map(name => [name, undefined])),
    })
    // Service getters must remain lazy: market declares optional injections.
    const result = new Proxy(proxy, { get(target, key) { return projected[key] ? projected[key]() : Reflect.get(target, key) } })
    contexts.set(ctx, result)
    return result
  }
  return wrap(context)
}

/** Preserve the package URL and client discovery; adapt only its server apply.
 * The original implementation is imported unchanged from its public entry's
 * re-export target. No vendor files or persisted profile rows are rewritten.
 */
function isReviewedEntry(url, original, pin) {
  let manifest
  try { manifest = JSON.parse(readFileSync(new URL('../package.json', url), 'utf8')) }
  catch { return false }
  if (manifest.name !== pin.package || manifest.version !== pin.version) return false
  const source = original.source
  if (typeof source !== 'string' && !ArrayBuffer.isView(source) && !(source instanceof ArrayBuffer)) return false
  const bytes = typeof source === 'string' ? Buffer.from(source) : ArrayBuffer.isView(source)
    ? Buffer.from(source.buffer, source.byteOffset, source.byteLength) : Buffer.from(source)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return [pin, ...(pin.sourceVariants ?? [])].some(reviewed => bytes.byteLength === reviewed.byteLength && sha256 === reviewed.sha256)
}

export function marketTeamCompatibilityLoad(url, context, nextLoad) {
  const original = nextLoad(url, context)
  const location = new URL(url)
  if (SIDEBAR_ENTRY.test(location.pathname)) {
    if (location.searchParams.has(SIDEBAR_ORIGINAL_QUERY) || !isReviewedEntry(url, original, SIDEBAR_TEAM_REVIEWED_ENTRY)) return original
    location.searchParams.set(SIDEBAR_ORIGINAL_QUERY, '1')
    const bypass = location.href
    return { format: 'module', shortCircuit: true, source:
      `export * from ${JSON.stringify(bypass)};\nimport { apply as originalApply } from ${JSON.stringify(bypass)};\nimport { wrapSidebarTeamContext } from ${JSON.stringify(import.meta.url)};\nexport function apply(ctx, config) { return originalApply(wrapSidebarTeamContext(ctx), config); }\n` }
  }
  if (!MARKET_ENTRY.test(location.pathname) || !isReviewedEntry(url, original, MARKET_TEAM_REVIEWED_ENTRY)) return original
  const bundle = new URL('./packages/market-bundle/src/index.js', url).href
  return { format: 'module', shortCircuit: true, source:
    `export * from ${JSON.stringify(bundle)};\nimport { apply as originalApply } from ${JSON.stringify(bundle)};\nimport { wrapMarketTeamContext } from ${JSON.stringify(import.meta.url)};\nexport function apply(ctx, config) { return originalApply(wrapMarketTeamContext(ctx), config); }\n` }
}

export function installDesktopMarketTeamCompatibility(ctx) {
  const hooks = registerHooks({ load: marketTeamCompatibilityLoad })
  ctx.effect(() => () => hooks.deregister(), 'market public Team API compatibility')
}
