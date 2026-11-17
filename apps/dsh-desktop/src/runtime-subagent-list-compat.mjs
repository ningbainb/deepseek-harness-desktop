import { registerHooks } from 'node:module'
import { scopeOf } from '@deepseek-ai/dsh-scope'

export const RETIRED_SUBAGENT_LIST_SPECIFIER = '@deepseek-ai/dsh-tool-subagent-control/list-agents'

export const name = 'desktop-subagent-list-compat'
export const inject = ['tools', 'subagents', 'agents', 'loader']

// Current control plugins own discovery together with messaging and interruption.
// Keep legacy composition rows active while requiring that capability to exist.
export async function apply(ctx) {
  const parent = ctx.fiber.entry?.parent
  const controlRow = parent?.data.find(row => row.name === '@deepseek-ai/dsh-tool-subagent-control')
  const control = controlRow && parent.tree.store[controlRow.id]
  // Sibling imports may settle in either order. Await this provider alone;
  // awaiting the entire Loader here would also wait on this compatibility row.
  if (!control || control.disabled) {
    throw new Error('Legacy subagent discovery requires a sibling subagent-control provider')
  }
  await control.refresh()
  await control.fiber?.await()
  if (!ctx.tools.get('list_agents', scopeOf(ctx))) {
    throw new Error('Legacy subagent discovery requires the subagent-control list_agents tool')
  }
}

export function resolveDesktopSubagentListCompatibility(specifier, context, nextResolve) {
  if (specifier !== RETIRED_SUBAGENT_LIST_SPECIFIER) return nextResolve(specifier, context)
  try {
    return nextResolve(specifier, context)
  } catch (error) {
    if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error
    return { url: import.meta.url, shortCircuit: true }
  }
}

export function installDesktopSubagentListCompatibility(ctx) {
  const hooks = registerHooks({ resolve: resolveDesktopSubagentListCompatibility })
  ctx.effect(() => () => hooks.deregister(), 'legacy subagent discovery resolution')
}
