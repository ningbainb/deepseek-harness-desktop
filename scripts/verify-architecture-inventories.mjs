import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const TRANSPORT_FIELDS = Object.freeze([
  'pluginId', 'sourcePath', 'endpoint', 'method', 'requestSchema', 'responseSchema',
  'kind', 'authPrincipal', 'workspaceScope', 'callerSurfaces',
  'cancellationAndLimits', 'v4Target', 'migrationTest', 'owner',
])
const DATA_FIELDS = Object.freeze([
  'domain', 'owner', 'sourceLocation', 'schema', 'destination', 'identifierMapping',
  'action', 'consistency', 'validation', 'rollbackBoundary',
])
const NATIVE_FIELDS = Object.freeze(['module', 'capability', 'process', 'version', 'abiPolicy', 'acceptance'])
const ROUTE_PACKAGE_PATHS = Object.freeze([
  'packages/dsh-aionui-panel/',
  'packages/dsh-agent-inbox/',
  'packages/dsh-desktop-compat/',
  'packages/dsh-git-graph/',
  'packages/dsh-live-stats/',
  'packages/dsh-memory/',
  'packages/dsh-pet/',
  'packages/dsh-remote-web-ui/',
  'packages/dsh-ssh/',
  'packages/dsh-task-board/',
  'packages/dsh-tool-describe-image/',
  'packages/dsh-web-ui-settings/',
  'packages/skins/skin-center/',
])
const DATA_DOMAINS = Object.freeze([
  'sessions-and-attachments', 'workspaces', 'model-providers', 'api-and-oauth-credentials',
  'memory-and-personal-prompt', 'user-scope', 'plugin-config-and-source', 'skills-and-presets',
  'tasks-runs-evidence', 'automation', 'ssh-qq-remote', 'window-theme-preferences',
])

function parse(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'))
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function validateRows(rows, fields, identity, label, errors) {
  if (!Array.isArray(rows) || rows.length === 0) {
    errors.push(`${label} must contain records`)
    return
  }
  const seen = new Set()
  for (const [index, row] of rows.entries()) {
    for (const field of fields) {
      if (field === 'callerSurfaces') {
        if (!Array.isArray(row[field]) || row[field].length === 0 || row[field].some(item => !nonEmpty(item))) {
          errors.push(`${label}[${index}].${field} must be a non-empty string array`)
        }
      } else if (!nonEmpty(row[field])) errors.push(`${label}[${index}].${field} is required`)
    }
    if (seen.has(row[identity])) errors.push(`${label} has duplicate ${identity} ${row[identity]}`)
    seen.add(row[identity])
  }
}

export function validateArchitectureInventories() {
  const transport = parse('docs/architecture/transport-inventory.json')
  const data = parse('docs/architecture/data-ownership.json')
  const native = parse('docs/architecture/native-dependency-inventory.json')
  const errors = []
  if (transport.schemaVersion !== 1 || transport.runtimeProviderApiVersion !== 2 || transport.defaultTarget !== 'desktop-private-pipe') {
    errors.push('transport inventory must target RuntimeProvider v2 and desktop-private-pipe')
  }
  validateRows(transport.records, TRANSPORT_FIELDS, 'pluginId', 'transport.records', errors)
  validateRows(data.domains, DATA_FIELDS, 'domain', 'data.domains', errors)
  validateRows(native.records, NATIVE_FIELDS, 'module', 'native.records', errors)

  const transportSources = transport.records.map(record => record.sourcePath.replaceAll('\\', '/')).join('; ')
  for (const path of ROUTE_PACKAGE_PATHS) {
    if (!transportSources.includes(path)) errors.push(`transport inventory does not own ${path}`)
  }
  for (const record of transport.records) {
    if (!existsSync(resolve(ROOT, record.migrationTest))) errors.push(`transport migration test is missing: ${record.migrationTest}`)
    if (record.status?.includes('adapter') || record.status === 'temporary-adapter') {
      if (!nonEmpty(record.adapterScope) || !nonEmpty(record.exitCondition)) {
        errors.push(`adapter record ${record.pluginId} requires scope and exit condition`)
      }
    }
  }
  const actualDomains = new Set(data.domains.map(domain => domain.domain))
  for (const domain of DATA_DOMAINS) if (!actualDomains.has(domain)) errors.push(`data ownership domain is missing: ${domain}`)
  if (data.migrationImplementation !== 'apps/dsh-desktop/src/community-home-migration.mjs') {
    errors.push('data ownership inventory must identify the executable migration')
  }
  if (!native.records.some(record => record.module === 'node-pty') || !native.records.some(record => record.module === 'pnpm')) {
    errors.push('native inventory must include terminal and profile construction dependencies')
  }
  if (errors.length > 0) throw new Error(errors.join('\n'))
  return Object.freeze({ transports: transport.records.length, dataDomains: data.domains.length, nativeDependencies: native.records.length })
}

if (import.meta.main) {
  try {
    const result = validateArchitectureInventories()
    process.stdout.write(`Validated ${result.transports} transports, ${result.dataDomains} data domains, and ${result.nativeDependencies} native dependencies.\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
