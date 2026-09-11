/** Native client projections are authoritative; the top-level field is legacy. */
export function sessionPreset(summary: {
  agentPreset?: string
  projectionValues?: Readonly<{ agentPreset?: unknown }>
} | undefined): string | undefined {
  if (summary?.projectionValues !== undefined) {
    const projected = summary.projectionValues.agentPreset
    return typeof projected === 'string' && projected !== '' ? projected : undefined
  }
  return summary?.agentPreset
}
