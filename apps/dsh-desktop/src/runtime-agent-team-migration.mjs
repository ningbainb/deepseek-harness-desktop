const LEGACY_TEAM_ROWS = new Map([
  ['@deepseek-ai/dsh-experimental-agent-team', 'agent-team'],
  ['@deepseek-ai/dsh-experimental-tool-agent-team', 'tool-agent-team'],
  ['@deepseek-ai/dsh-experimental-client-ui-agent-team', 'ui-agent-team'],
])

/** Original profile/home patch bytes belong to the versioned migration backup.
 * The adapter only projects retired rows onto the official rc.3 roster.
 * Unknown old config fields stay in that original; they are never guessed.
 */
export function adaptRuntimeAgentTeamPatches(patches) {
  const project = row => {
    const id = LEGACY_TEAM_ROWS.get(row?.name)
    if (!id) return undefined
    const next = { id }
    if (typeof row.disabled === 'boolean') next.disabled = row.disabled
    if (id === 'agent-team' && Number.isSafeInteger(row.config?.maxTasks) && row.config.maxTasks > 0) {
      next.config = { maxTasks: row.config.maxTasks }
    }
    return next
  }
  return patches.flatMap(operation => {
    if (!Array.isArray(operation?.insert)) return [project(operation) ?? operation]
    const retained = []
    const migrated = []
    for (const row of operation.insert) {
      const next = project(row)
      if (next) migrated.push(next)
      else retained.push(row)
    }
    if (!migrated.length) return [operation]
    return [...(retained.length ? [{ ...operation, insert: retained }] : []), ...migrated]
  })
}
