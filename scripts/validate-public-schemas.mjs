import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

export const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, '..')

export const PUBLIC_SCHEMA_FILES = Object.freeze({
  desktopContract: 'docs/schemas/desktop-contract-v1.schema.json',
  runtimeProvider: 'docs/schemas/runtime-provider-v1.schema.json',
  runtimeMatrix: 'docs/schemas/supported-runtime-matrix-v1.schema.json',
  patchRegistry: 'docs/schemas/compat-patch-registry-v1.schema.json',
  deepLink: 'docs/schemas/dsh-deep-link-v1.schema.json',
  preset: 'docs/schemas/dshpreset-v1.schema.json',
  taskLedger: 'docs/schemas/task-ledger-v3.schema.json',
})

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function pathForProperty(path, property) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(property)
    ? `${path}.${property}`
    : `${path}[${JSON.stringify(property)}]`
}

function valueMatchesType(value, expected) {
  if (expected === 'null') return value === null
  if (expected === 'array') return Array.isArray(value)
  if (expected === 'object') return isRecord(value)
  if (expected === 'integer') return typeof value === 'number' && Number.isInteger(value)
  if (expected === 'number') return typeof value === 'number' && Number.isFinite(value)
  return typeof value === expected
}

function schemaAtReference(rootSchema, reference) {
  if (typeof reference !== 'string' || !reference.startsWith('#/')) {
    throw new TypeError(`only local JSON Schema references are supported: ${String(reference)}`)
  }
  let current = rootSchema
  for (const segment of reference.slice(2).split('/')) {
    const property = segment.replaceAll('~1', '/').replaceAll('~0', '~')
    if (!isRecord(current) || !(property in current)) {
      throw new TypeError(`unresolved JSON Schema reference: ${reference}`)
    }
    current = current[property]
  }
  return current
}

function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

function isDateTime(value) {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
  ) {
    return false
  }
  return !Number.isNaN(Date.parse(value))
}

function branchErrors(schema, value, state) {
  const errors = []
  validateSchemaNode(schema, value, { ...state, errors })
  return errors
}

function validateSchemaNode(schema, value, state) {
  if (!isRecord(schema)) {
    state.errors.push(`${state.path}: schema must be an object`)
    return
  }
  if (typeof schema.$ref === 'string') {
    validateSchemaNode(schemaAtReference(state.rootSchema, schema.$ref), value, state)
    return
  }
  if (Array.isArray(schema.allOf)) {
    for (const child of schema.allOf) validateSchemaNode(child, value, state)
  }
  if (Array.isArray(schema.anyOf)) {
    const results = schema.anyOf.map((child) => branchErrors(child, value, state))
    if (!results.some((errors) => errors.length === 0)) {
      state.errors.push(`${state.path}: must match at least one allowed schema`)
    }
  }
  if (Array.isArray(schema.oneOf)) {
    const results = schema.oneOf.map((child) => branchErrors(child, value, state))
    if (results.filter((errors) => errors.length === 0).length !== 1) {
      state.errors.push(`${state.path}: must match exactly one allowed schema`)
    }
  }
  if (schema.not !== undefined && branchErrors(schema.not, value, state).length === 0) {
    state.errors.push(`${state.path}: must not match the disallowed schema`)
  }
  if (schema.const !== undefined && !isDeepStrictEqual(value, schema.const)) {
    state.errors.push(`${state.path}: must equal ${JSON.stringify(schema.const)}`)
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => isDeepStrictEqual(value, candidate))) {
    state.errors.push(`${state.path}: must equal one of ${schema.enum.map((item) => JSON.stringify(item)).join(', ')}`)
  }

  const declaredTypes = schema.type === undefined
    ? undefined
    : (Array.isArray(schema.type) ? schema.type : [schema.type])
  if (declaredTypes !== undefined && !declaredTypes.some((type) => valueMatchesType(value, type))) {
    state.errors.push(`${state.path}: must be ${declaredTypes.join(' or ')}`)
    return
  }

  if (typeof value === 'string') {
    if (Number.isInteger(schema.minLength) && [...value].length < schema.minLength) {
      state.errors.push(`${state.path}: must contain at least ${schema.minLength} characters`)
    }
    if (Number.isInteger(schema.maxLength) && [...value].length > schema.maxLength) {
      state.errors.push(`${state.path}: must contain at most ${schema.maxLength} characters`)
    }
    if (typeof schema.pattern === 'string' && !(new RegExp(schema.pattern, 'u')).test(value)) {
      state.errors.push(`${state.path}: must match ${schema.pattern}`)
    }
    if (schema.format === 'date' && !isCalendarDate(value)) {
      state.errors.push(`${state.path}: must be an RFC 3339 calendar date`)
    }
    if (schema.format === 'date-time' && !isDateTime(value)) {
      state.errors.push(`${state.path}: must be an RFC 3339 date-time`)
    }
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      state.errors.push(`${state.path}: must be at least ${schema.minimum}`)
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      state.errors.push(`${state.path}: must be at most ${schema.maximum}`)
    }
  }

  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      state.errors.push(`${state.path}: must contain at least ${schema.minItems} items`)
    }
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) {
      state.errors.push(`${state.path}: must contain at most ${schema.maxItems} items`)
    }
    if (schema.uniqueItems === true) {
      for (let index = 0; index < value.length; index += 1) {
        if (value.slice(0, index).some((candidate) => isDeepStrictEqual(candidate, value[index]))) {
          state.errors.push(`${state.path}[${index}]: duplicates an earlier array item`)
        }
      }
    }
    if (schema.items !== undefined) {
      for (let index = 0; index < value.length; index += 1) {
        validateSchemaNode(schema.items, value[index], {
          ...state,
          path: `${state.path}[${index}]`,
        })
      }
    }
  }

  if (isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {}
    const patternProperties = isRecord(schema.patternProperties) ? schema.patternProperties : {}
    if (Array.isArray(schema.required)) {
      for (const property of schema.required) {
        if (typeof property === 'string' && !(property in value)) {
          state.errors.push(`${state.path}: missing required property ${property}`)
        }
      }
    }
    for (const [property, child] of Object.entries(properties)) {
      if (property in value) {
        validateSchemaNode(child, value[property], {
          ...state,
          path: pathForProperty(state.path, property),
        })
      }
    }
    for (const [pattern, child] of Object.entries(patternProperties)) {
      const matcher = new RegExp(pattern, 'u')
      for (const [property, childValue] of Object.entries(value)) {
        if (matcher.test(property)) {
          validateSchemaNode(child, childValue, {
            ...state,
            path: pathForProperty(state.path, property),
          })
        }
      }
    }
    if (schema.additionalProperties !== undefined) {
      for (const [property, childValue] of Object.entries(value)) {
        const knownProperty = property in properties
        const matchesPattern = Object.keys(patternProperties).some((pattern) => (new RegExp(pattern, 'u')).test(property))
        if (knownProperty || matchesPattern) continue
        if (schema.additionalProperties === false) {
          state.errors.push(`${pathForProperty(state.path, property)}: is not an allowed property`)
        } else if (isRecord(schema.additionalProperties)) {
          validateSchemaNode(schema.additionalProperties, childValue, {
            ...state,
            path: pathForProperty(state.path, property),
          })
        }
      }
    }
  }
}

/** Returns deterministic validation errors for the JSON Schema subset used by public Desktop artifacts. */
export function validateJsonSchema(schema, value) {
  const errors = []
  validateSchemaNode(schema, value, { rootSchema: schema, path: '$', errors })
  return Object.freeze(errors)
}

export function formatSchemaErrors(schemaName, errors) {
  const detail = errors.slice(0, 8).join('; ')
  const upgradeHint = schemaName === 'preset' && errors.some((error) => error.startsWith('$.formatVersion:'))
    ? ' Upgrade DeepSeek Harness Desktop or export the preset as formatVersion 1.'
    : ''
  return `${schemaName} schema validation failed: ${detail}${upgradeHint}`
}

function assertSchemaDocument(name, schema) {
  if (!isRecord(schema)) throw new TypeError(`${name} schema must be a JSON object`)
  if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
    throw new TypeError(`${name} schema must declare JSON Schema draft 2020-12`)
  }
  if (typeof schema.$id !== 'string' || schema.$id.length === 0) {
    throw new TypeError(`${name} schema must declare a non-empty $id`)
  }
  if (schema.type === undefined) throw new TypeError(`${name} schema must declare a root type`)
}

function assertSchemaValue(name, schema, value) {
  const errors = validateJsonSchema(schema, value)
  if (errors.length > 0) throw new TypeError(formatSchemaErrors(name, errors))
}

export function loadPublicSchemas(root = REPOSITORY_ROOT) {
  return Object.freeze(Object.fromEntries(Object.entries(PUBLIC_SCHEMA_FILES).map(([name, file]) => {
    const path = resolve(root, file)
    return [name, JSON.parse(readFileSync(path, 'utf8'))]
  })))
}

export function utcDate(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.valueOf())) throw new TypeError('utcDate requires a valid Date')
  return date.toISOString().slice(0, 10)
}

export function publicSchemaFixtures() {
  return Object.freeze({
    desktopContract: {
      apiVersion: '1.2.0',
      surface: 'main',
      capabilities: ['runtime.read', 'deep-links.subscribe'],
      runtime: {
        providerId: 'dsh-cli-provider-v1',
        upstreamVersion: '0.1.0-rc.7',
        supportStatus: 'known-good',
        capabilities: [{ id: 'runtime.lifecycle', status: 'available' }],
      },
      futureOptionalField: true,
    },
    runtimeProvider: {
      providerId: 'dsh-cli-provider-v1',
      upstreamVersion: '0.1.0-rc.7',
      supportStatus: 'supported',
      capabilities: [{ id: 'profile.paths', status: 'available' }],
      futureOptionalField: true,
    },
    runtimeMatrix: {
      schemaVersion: 1,
      derived: true,
      authority: {
        stableEvidence: 'apps/dsh-desktop/runtime-support/known-good.json',
        source: 'apps/dsh-desktop/runtime-support/supported-runtimes.source.json',
        packageManifest: 'apps/dsh-desktop/package.json',
        lockfile: 'pnpm-lock.yaml',
      },
      entries: [{
        status: 'candidate',
        upstreamVersion: '0.1.0-rc.8',
        providerId: 'dsh-cli-provider-v1',
        desktopRange: '=3.0.0',
        capabilities: [{ id: 'runtime.lifecycle', status: 'available' }],
        verifiedAt: '2026-08-20',
        matrixArtifact: 'apps/dsh-desktop/runtime-support/candidate.json',
        knownIssues: [],
        evidence: {
          package: {
            name: '@deepseek-ai/dsh',
            version: '0.1.0-rc.8',
            integrity: 'sha512-YWJjZA==',
            files: {
              'package.json': 'c'.repeat(64),
              'lib/bin.js': 'd'.repeat(64),
            },
          },
          peers: {},
          slots: ['conversation.input.dock'],
          patches: {
            registry: 'packages/dsh-desktop-compat/src/patch-registry.ts',
            sha256: 'a'.repeat(64),
            ids: ['queued-turn-continuation'],
          },
          packagedRuntime: {
            packageRoot: 'resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh',
            cli: 'resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh/lib/bin.js',
            profileName: 'desktop',
            executionMode: 'electron-run-as-node',
            requiredFiles: ['lib/bin.js', 'package.json'],
          },
          lockfile: {
            path: 'pnpm-lock.yaml',
            sha256: 'b'.repeat(64),
          },
        },
      }],
    },
    deepLinks: [
      'dsh://extensions',
      'dsh://updates',
      'dsh://preset/preview',
      'dsh://task/task-1',
      'dsh://session/session_1',
      'dsh://run/run.1',
    ],
    preset: {
      formatVersion: 1,
      name: 'Public schema fixture',
      createdAt: '2026-08-20T00:00:00.000Z',
      source: {
        desktopVersion: '3.0.0',
        runtimeVersion: '0.1.0-rc.7',
        futureSourceOptionalField: true,
      },
      requiredCapabilities: ['runtime.read'],
      requiredSecrets: ['DSH_TOKEN'],
      futureOptionalField: true,
    },
    taskLedger: {
      schemaVersion: 3,
      revision: 7,
      updatedAt: 1_771_000_000_000,
      projects: [{
        id: 'project-1',
        name: 'Desktop stability',
        workspaceId: 'workspace-1',
        defaultIsolation: 'shared-workspace',
        futureProjectOptionalField: true,
      }],
      tasks: [{
        id: 'task-1',
        title: 'Verify the release',
        description: 'Run the public schema check.',
        prompt: 'Validate the release artifacts.',
        status: 'done',
        createdAt: 1_771_000_000_000,
        updatedAt: 1_771_000_000_100,
        executions: [{
          id: 'execution-1',
          runId: 'run-1',
          workspaceId: 'workspace-1',
          sessionId: 'session-1',
          startedAt: 1_771_000_000_000,
          finishedAt: 1_771_000_000_100,
          result: 'succeeded',
        }],
        projectId: 'project-1',
        isolationMode: 'git-worktree',
        runs: [{
          runId: 'run-1',
          workspaceId: 'workspace-1',
          startedAt: 1_771_000_000_000,
          finishedAt: 1_771_000_000_100,
          resultStatus: 'accepted',
          evidenceId: 'evidence-1',
          runtimeProviderEvidence: {
            providerId: 'dsh-cli-provider-v1',
            upstreamVersion: '0.1.0-rc.7',
            supportStatus: 'known-good',
            capabilities: [{ id: 'runtime.lifecycle', status: 'available' }],
          },
        }],
        schedule: {
          enabled: true,
          cron: '0 9 * * 1-5',
          nextRunAt: 1_771_100_000_000,
          timezone: 'Asia/Shanghai',
          misfirePolicy: 'skip',
          runningPolicy: 'queue-next',
          futureScheduleOptionalField: true,
        },
      }],
      evidences: [{
        evidenceId: 'evidence-1',
        runId: 'run-1',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        changedFiles: [{ path: 'docs/schema-versioning.md', status: 'modified', additions: 1, deletions: 0 }],
        additions: 1,
        deletions: 0,
        clean: false,
        dirty: true,
        resultStatus: 'accepted',
        startedAt: 1_771_000_000_000,
        finishedAt: 1_771_000_000_100,
        diffSource: 'git-graph',
        diffCache: {
          source: 'git-graph',
          generatedAt: 1_771_000_000_100,
          bytes: 128,
          truncated: false,
        },
        runtimeProviderEvidence: {
          providerId: 'dsh-cli-provider-v1',
          supportStatus: 'known-good',
        },
        audit: [{ action: 'evidence', at: 1_771_000_000_100, status: 'ok', summary: 'Derived evidence persisted.' }],
        futureEvidenceOptionalField: true,
      }],
      migration: {
        from: 2,
        status: 'complete',
        at: 1_771_000_000_000,
        marker: 'dsh.taskBoard.v3.migrated',
      },
      futureLedgerOptionalField: true,
    },
  })
}

export async function loadCompatPatchRegistry(root = REPOSITORY_ROOT) {
  const typescriptPath = resolve(root, 'packages/dsh-desktop-compat/node_modules/typescript')
  const typescript = require(typescriptPath)
  const sourcePath = resolve(root, 'packages/dsh-desktop-compat/src/patch-registry.ts')
  const source = readFileSync(sourcePath, 'utf8')
  const output = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.ESNext,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
    reportDiagnostics: true,
  })
  const diagnostics = output.diagnostics ?? []
  if (diagnostics.some((diagnostic) => diagnostic.category === typescript.DiagnosticCategory.Error)) {
    throw new TypeError(`could not transpile compat patch registry: ${typescript.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n')}`)
  }
  const encoded = Buffer.from(output.outputText, 'utf8').toString('base64')
  return import(`data:text/javascript;base64,${encoded}`)
}

function repositoryTestExists(root, testPath) {
  const candidate = resolve(root, testPath)
  const relativePath = relative(root, candidate)
  if (relativePath === '' || relativePath === '..' || relativePath.startsWith(`..${sep}`)) return false
  return existsSync(candidate)
}

/**
 * Validates public schema documents, current compatibility metadata, and
 * representative v1 fixtures. Calling this script in CI also enforces patch
 * freshness and that every registered test path exists.
 */
export async function validatePublicSchemas({
  root = REPOSITORY_ROOT,
  today = utcDate(),
  testExists = (testPath) => repositoryTestExists(root, testPath),
} = {}) {
  const schemas = loadPublicSchemas(root)
  for (const [name, schema] of Object.entries(schemas)) assertSchemaDocument(name, schema)

  const fixtures = publicSchemaFixtures()
  assertSchemaValue('desktopContract', schemas.desktopContract, fixtures.desktopContract)
  assertSchemaValue('runtimeProvider', schemas.runtimeProvider, fixtures.runtimeProvider)
  assertSchemaValue('runtimeMatrix', schemas.runtimeMatrix, fixtures.runtimeMatrix)
  for (const link of fixtures.deepLinks) assertSchemaValue('deepLink', schemas.deepLink, link)
  assertSchemaValue('preset', schemas.preset, fixtures.preset)
  assertSchemaValue('taskLedger', schemas.taskLedger, fixtures.taskLedger)

  const currentMatrix = JSON.parse(readFileSync(
    resolve(root, 'apps/dsh-desktop/runtime-support/supported-runtimes.json'),
    'utf8',
  ))
  assertSchemaValue('runtimeMatrix', schemas.runtimeMatrix, currentMatrix)

  const registry = await loadCompatPatchRegistry(root)
  const patches = registry.validateCompatPatchRegistry(registry.DESKTOP_COMPAT_PATCHES, {
    today,
    testExists,
  })
  assertSchemaValue('patchRegistry', schemas.patchRegistry, patches)

  return Object.freeze({
    schemaIds: Object.freeze(Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, schema.$id]))),
    patchIds: Object.freeze(patches.map((patch) => patch.id)),
    matrixEntries: currentMatrix.entries.length,
  })
}

const invokedAsScript = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedAsScript) {
  void validatePublicSchemas().then((report) => {
    process.stdout.write(
      `Validated ${Object.keys(report.schemaIds).length} public schemas, ${report.patchIds.length} compatibility patches, and ${report.matrixEntries} runtime matrix entries.\n`,
    )
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
