import { randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/u
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/u
const NAME_PATTERN = /^[a-zA-Z0-9@._/+:-]{1,128}$/u
const RESULT_STATUSES = new Set(['candidate-ready', 'model-unavailable', 'failed', 'timed-out'])
const JOB_FIELDS = new Set([
  'schemaVersion',
  'jobId',
  'fingerprint',
  'sessionId',
  'workspace',
  'resultPath',
  'roots',
  'commands',
  'settings',
  'timeoutMs',
])

export interface RepairJobRoot {
  id: string
  kind: 'profile' | 'plugin'
  relativePath: string
}

export interface RepairJobCommand {
  name: string
  executable: string
  args: string[]
  cwd: string
}

export interface RepairModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

export interface RepairJobSettings {
  fallbackModels?: RepairModelSelection[]
}

export interface RepairJob {
  schemaVersion: 1
  jobId: string
  fingerprint: string
  sessionId: string
  workspace: string
  resultPath: string
  roots: RepairJobRoot[]
  commands: RepairJobCommand[]
  settings: RepairJobSettings
  timeoutMs: number
  /** Internal host boundary; never sent to the model. */
  incidentDir: string
  /** Internal host boundary; never sent to the model. */
  jobPath: string
}

export interface RepairAttemptSummary {
  provider: string
  model: string
  outcome: string
}

export interface RepairActionSummary {
  tool: string
  outcome: string
  path?: string
}

export interface RepairResult {
  status: 'candidate-ready' | 'model-unavailable' | 'failed' | 'timed-out'
  diagnosis: string
  summary: string
  changedFiles: string[]
  checksRequested: string[]
  attempts: RepairAttemptSummary[]
  actions: RepairActionSummary[]
}

function immutable<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable)) as T
  if (value !== null && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, immutable(item)]),
    )) as T
  }
  return value
}

function isWithin(candidate: string, parent: string): boolean {
  const result = relative(parent, candidate)
  return result === '' || (!result.startsWith(`..${sep}`) && result !== '..' && !isAbsolute(result))
}

function safeId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new TypeError(`${label} is invalid`)
  return value
}

function safeName(value: unknown, label: string): string {
  if (typeof value !== 'string' || !NAME_PATTERN.test(value) || value.includes('..')) {
    throw new TypeError(`${label} is invalid`)
  }
  return value
}

export function safeRepairRelativePath(value: unknown, label = 'repair path'): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 320
    || value.includes('\\')
    || value.includes('\0')
    || isAbsolute(value)
    || value.split('/').some(part => part === '' || part === '.' || part === '..')
  ) {
    throw new TypeError(`${label} is outside repair workspace`)
  }
  return value
}

function safeText(value: unknown, label: string, max = 500): string {
  if (typeof value !== 'string') throw new TypeError(`${label} is invalid`)
  const normalized = value.replace(/[\r\n\t]+/gu, ' ').trim()
  if (normalized.length === 0 || normalized.length > max) throw new TypeError(`${label} is invalid`)
  return normalized
}

function modelSelection(value: unknown): RepairModelSelection {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('repair model selection is invalid')
  }
  const input = value as Record<string, unknown>
  return {
    provider: safeName(input.provider, 'repair provider'),
    model: safeName(input.model, 'repair model'),
    ...(input.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: safeName(input.reasoningEffort, 'repair reasoning effort') }),
  }
}

function rootEntry(value: unknown): RepairJobRoot {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('repair job root is invalid')
  }
  const input = value as Record<string, unknown>
  if (!['profile', 'plugin'].includes(String(input.kind))) throw new TypeError('repair job root kind is invalid')
  return {
    id: safeId(input.id, 'repair root id'),
    kind: input.kind as RepairJobRoot['kind'],
    relativePath: safeRepairRelativePath(input.relativePath, 'repair root path'),
  }
}

function commandEntry(value: unknown, workspace: string): RepairJobCommand {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('repair job command is invalid')
  }
  const input = value as Record<string, unknown>
  if (typeof input.executable !== 'string' || !isAbsolute(input.executable)) {
    throw new TypeError('repair job command executable is invalid')
  }
  if (!Array.isArray(input.args) || input.args.length > 64 || input.args.some(arg => typeof arg !== 'string' || arg.length > 1_000)) {
    throw new TypeError('repair job command arguments are invalid')
  }
  const cwd = safeRepairRelativePath(input.cwd, 'repair command cwd')
  if (!isWithin(resolve(workspace, cwd), workspace)) throw new TypeError('repair command cwd is outside repair workspace')
  return {
    name: safeId(input.name, 'repair command name'),
    executable: resolve(input.executable),
    args: [...input.args] as string[],
    cwd,
  }
}

function assertResult(value: RepairResult): RepairResult {
  if (!RESULT_STATUSES.has(value.status)) throw new TypeError('repair result status is invalid')
  const result: RepairResult = {
    status: value.status,
    diagnosis: safeText(value.diagnosis, 'repair diagnosis'),
    summary: safeText(value.summary, 'repair summary', 1_000),
    changedFiles: value.changedFiles.map(path => safeRepairRelativePath(path, 'repair changed file')),
    checksRequested: value.checksRequested.map(name => safeId(name, 'repair check name')),
    attempts: value.attempts.slice(0, 2).map(attempt => ({
      provider: safeName(attempt.provider, 'repair provider'),
      model: safeName(attempt.model, 'repair model'),
      outcome: safeId(attempt.outcome, 'repair attempt outcome'),
    })),
    actions: value.actions.slice(0, 12).map(action => ({
      tool: safeId(action.tool, 'repair tool name'),
      outcome: safeId(action.outcome, 'repair tool outcome'),
      ...(action.path === undefined ? {} : { path: safeRepairRelativePath(action.path, 'repair action path') }),
    })),
  }
  if (result.changedFiles.length > 4_096 || result.checksRequested.length > 64) {
    throw new TypeError('repair result exceeds its summary budget')
  }
  return immutable(result)
}

async function atomicWrite(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = join(dirname(path), `.repair-result-${process.pid}-${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true }).catch(() => {})
  }
}

export async function loadRepairJob(jobPath: string): Promise<RepairJob> {
  if (typeof jobPath !== 'string' || !isAbsolute(jobPath)) throw new TypeError('repair job path must be absolute')
  const resolvedJobPath = resolve(jobPath)
  const stat = await lstat(resolvedJobPath)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024) {
    throw new Error('repair job file is not a bounded regular file')
  }
  let input: Record<string, unknown>
  try {
    input = JSON.parse(await readFile(resolvedJobPath, 'utf8')) as Record<string, unknown>
  } catch (error) {
    throw new Error('repair job is unreadable', { cause: error })
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('repair job is invalid')
  if (Object.keys(input).some(key => !JOB_FIELDS.has(key))) throw new TypeError('repair job fields are invalid')
  if (input.schemaVersion !== 1) throw new TypeError('repair job schema is invalid')
  const incidentDir = dirname(resolvedJobPath)
  if (typeof input.workspace !== 'string' || !isAbsolute(input.workspace)) throw new TypeError('repair workspace is invalid')
  if (typeof input.resultPath !== 'string' || !isAbsolute(input.resultPath)) throw new TypeError('repair result path is invalid')
  const workspace = resolve(input.workspace)
  const resultPath = resolve(input.resultPath)
  if (!isWithin(workspace, incidentDir) || workspace === incidentDir || !isWithin(resultPath, incidentDir) || resultPath === incidentDir) {
    throw new TypeError('repair job paths must stay inside the incident directory')
  }
  if (!Array.isArray(input.roots) || input.roots.length === 0 || input.roots.length > 256) {
    throw new TypeError('repair job roots are invalid')
  }
  const roots = input.roots.map(rootEntry)
  if (new Set(roots.map(root => root.id)).size !== roots.length || roots.filter(root => root.kind === 'profile').length !== 1) {
    throw new TypeError('repair job roots are duplicated or incomplete')
  }
  for (const root of roots) {
    if (!isWithin(resolve(workspace, root.relativePath), workspace)) throw new TypeError('repair root is outside repair workspace')
  }
  if (!Array.isArray(input.commands) || input.commands.length > 64) throw new TypeError('repair job commands are invalid')
  const commands = input.commands.map(command => commandEntry(command, workspace))
  if (new Set(commands.map(command => command.name)).size !== commands.length) {
    throw new TypeError('repair job commands are duplicated')
  }
  const settingsInput = input.settings ?? {}
  if (settingsInput === null || typeof settingsInput !== 'object' || Array.isArray(settingsInput)) {
    throw new TypeError('repair job settings are invalid')
  }
  const fallbackInput = (settingsInput as Record<string, unknown>).fallbackModels ?? []
  if (!Array.isArray(fallbackInput) || fallbackInput.length > 8) throw new TypeError('repair fallback models are invalid')
  if (!Number.isInteger(input.timeoutMs) || Number(input.timeoutMs) < 1_000 || Number(input.timeoutMs) > 90_000) {
    throw new TypeError('repair job timeout is invalid')
  }
  const fingerprint = input.fingerprint
  if (typeof fingerprint !== 'string' || !FINGERPRINT_PATTERN.test(fingerprint)) {
    throw new TypeError('repair fingerprint is invalid')
  }
  return immutable({
    schemaVersion: 1,
    jobId: safeId(input.jobId, 'repair job id'),
    fingerprint,
    sessionId: safeId(input.sessionId, 'repair session id'),
    workspace,
    resultPath,
    roots,
    commands,
    settings: { fallbackModels: fallbackInput.map(modelSelection) },
    timeoutMs: Number(input.timeoutMs),
    incidentDir,
    jobPath: resolvedJobPath,
  })
}

export async function claimRepairJob(job: RepairJob): Promise<{ claimed?: true, duplicate?: true, result?: RepairResult }> {
  const lockPath = join(job.incidentDir, 'job.lock')
  try {
    const handle = await open(lockPath, 'wx', 0o600)
    await handle.writeFile(`${job.jobId}\n`, 'utf8')
    await handle.close()
    return immutable({ claimed: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    try {
      const result = await readRepairResult(job)
      return immutable({ duplicate: true, result })
    } catch (resultError) {
      if ((resultError as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('repair job is already running')
      }
      throw resultError
    }
  }
}

export async function readRepairResult(job: Pick<RepairJob, 'resultPath'>): Promise<RepairResult> {
  return assertResult(JSON.parse(await readFile(job.resultPath, 'utf8')) as RepairResult)
}

export async function writeRepairResult(job: Pick<RepairJob, 'resultPath'>, result: RepairResult): Promise<RepairResult> {
  const validated = assertResult(result)
  await atomicWrite(job.resultPath, validated)
  return validated
}
