import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type AgentWslPermission = 'off' | 'ask' | 'allow'

/** Missing settings retain the original per-call approval. Corrupt settings fail closed. */
export function parseAgentWslPermission(raw?: string): AgentWslPermission {
  if (raw === undefined) return 'ask'
  try {
    const value: unknown = JSON.parse(raw)
    if (value && typeof value === 'object' && !Array.isArray(value)
      && 'version' in value && value.version === 1
      && 'mode' in value && ['off', 'ask', 'allow'].includes(String(value.mode))) {
      return value.mode as AgentWslPermission
    }
  } catch {}
  return 'off'
}

export function currentAgentWslPermission(environment: NodeJS.ProcessEnv = process.env): AgentWslPermission {
  if (typeof environment.DSH_HOME !== 'string' || environment.DSH_HOME.length === 0) return 'ask'
  try {
    return parseAgentWslPermission(readFileSync(join(environment.DSH_HOME, 'desktop-agent-shell.json'), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'ask'
    return 'off'
  }
}
