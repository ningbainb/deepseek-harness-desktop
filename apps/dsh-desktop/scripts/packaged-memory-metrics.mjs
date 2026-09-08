function numericField(value, name) {
  const numeric = Number(value)
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`)
  }
  return numeric
}

export function normalizeProcessSnapshot(value) {
  const rows = Array.isArray(value) ? value : [value]
  return rows.map((row) => {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new TypeError('process snapshot rows must be objects')
    }
    return Object.freeze({
      processId: numericField(row.ProcessId, 'ProcessId'),
      parentProcessId: numericField(row.ParentProcessId, 'ParentProcessId'),
      workingSetBytes: numericField(row.WorkingSetSize, 'WorkingSetSize'),
      privateBytes: numericField(row.PrivatePageCount, 'PrivatePageCount'),
      name: typeof row.Name === 'string' ? row.Name : '',
      commandLine: typeof row.CommandLine === 'string' ? row.CommandLine : '',
    })
  })
}

export function selectProcessTree(rows, rootProcessId) {
  const root = numericField(rootProcessId, 'rootProcessId')
  if (root === 0) throw new TypeError('rootProcessId must be positive')
  const children = new Map()
  for (const row of rows) {
    const siblings = children.get(row.parentProcessId) ?? []
    siblings.push(row)
    children.set(row.parentProcessId, siblings)
  }
  const selected = []
  const pending = [root]
  const seen = new Set()
  while (pending.length > 0) {
    const processId = pending.pop()
    if (seen.has(processId)) continue
    seen.add(processId)
    const row = rows.find(candidate => candidate.processId === processId)
    if (row !== undefined) selected.push(row)
    for (const child of children.get(processId) ?? []) pending.push(child.processId)
  }
  if (selected.every(row => row.processId !== root)) {
    throw new Error(`root process ${root} is absent from the process snapshot`)
  }
  return selected
}

function median(values) {
  if (values.length === 0) throw new TypeError('cannot summarize an empty sample set')
  const sorted = [...values].toSorted((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

export function summarizeMemorySamples(samples, { idleMs, windowMs }) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new TypeError('memory samples must be a non-empty array')
  }
  const normalizedIdleMs = numericField(idleMs, 'idleMs')
  const normalizedWindowMs = numericField(windowMs, 'windowMs')
  if (normalizedWindowMs === 0 || normalizedWindowMs > normalizedIdleMs) {
    throw new TypeError('windowMs must be positive and no greater than idleMs')
  }
  const windowStartMs = normalizedIdleMs - normalizedWindowMs
  const finalWindow = samples.filter(sample => sample.elapsedMs >= windowStartMs)
  if (finalWindow.length === 0) throw new Error('no memory samples fall inside the final window')
  const summarizeField = field => Object.freeze({
    minimum: Math.min(...finalWindow.map(sample => sample[field])),
    median: median(finalWindow.map(sample => sample[field])),
    maximum: Math.max(...finalWindow.map(sample => sample[field])),
  })
  return Object.freeze({
    sampleCount: samples.length,
    finalWindowSampleCount: finalWindow.length,
    totalWorkingSetBytes: summarizeField('totalWorkingSetBytes'),
    totalPrivateBytes: summarizeField('totalPrivateBytes'),
    runtimeWorkingSetBytes: summarizeField('runtimeWorkingSetBytes'),
    processCount: summarizeField('processCount'),
  })
}

export function createMemorySample(rows, rootProcessId, elapsedMs) {
  const tree = selectProcessTree(rows, rootProcessId)
  const runtimeRows = tree.filter(row => /@deepseek-ai[\\/]dsh[\\/]lib[\\/]bin\.js/iu.test(row.commandLine))
  return Object.freeze({
    elapsedMs: numericField(elapsedMs, 'elapsedMs'),
    totalWorkingSetBytes: tree.reduce((total, row) => total + row.workingSetBytes, 0),
    totalPrivateBytes: tree.reduce((total, row) => total + row.privateBytes, 0),
    runtimeWorkingSetBytes: runtimeRows.reduce((total, row) => total + row.workingSetBytes, 0),
    processCount: tree.length,
  })
}
