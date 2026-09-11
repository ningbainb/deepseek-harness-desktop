export function summarizeCostMode(rows) {
  let observedSuccess = 0, observedFailure = 0
  const output = { main: { started: 0, success: 0, failure: 0, cancelled: 0 }, subagent: { started: 0, success: 0, failure: 0, cancelled: 0 }, strategies: { saving: 0, balanced: 0, stronger: 0, unknown: 0 }, guide: { shown: 0, completed: 0, dismissed: 0, failed: 0 }, legacyStarted: 0 }
  for (const row of rows) {
    const count = Number(row.count) || 0
    if (row.event === 'value_mode_call' && row.outcome === 'started') output.legacyStarted += count
    if (row.event === 'cost_mode_route' && Object.hasOwn(output, row.detail) && ['main', 'subagent'].includes(row.detail)) {
      if (Object.hasOwn(output[row.detail], row.outcome)) output[row.detail][row.outcome] += count
      if (row.outcome === 'started' && Object.hasOwn(output.strategies, row.bucket)) output.strategies[row.bucket] += count
      if (row.bucket === 'unknown' && row.outcome === 'started') output.legacyStarted += count
      // Legacy clients cannot provide a strategy or successful settlement. Do
      // not turn their failure-only observations into an apparent 100% rate.
      if (row.bucket !== 'unknown' && row.outcome === 'success') observedSuccess += count
      if (row.bucket !== 'unknown' && row.outcome === 'failure') observedFailure += count
    }
    if (['cost_mode_guide', 'value_mode_onboarding'].includes(row.event) && Object.hasOwn(output.guide, row.outcome)) output.guide[row.outcome] += count
  }
  const completed = observedSuccess + observedFailure
  output.failureRate = completed ? observedFailure / completed : null
  output.guideCompletionRate = output.guide.shown ? output.guide.completed / output.guide.shown : null
  output.definition = 'Failure / (success + failure); cancellations and unfinished or legacy starts excluded. Guide completion is completed/shown event counts, not a user cohort.'
  return output
}
