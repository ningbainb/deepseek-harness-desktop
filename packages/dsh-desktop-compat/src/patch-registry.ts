/**
 * Compatibility metadata remains source-compatible with the 2.x registry while
 * exposing the 3.0 public fields. Consumers should prefer `appliesTo` and
 * `tests`; the legacy aliases are retained on normalized entries.
 */
export interface DesktopCompatPatch {
  id: string
  appliesTo?: readonly string[]
  upstreamReference: string
  owner?: string
  tests?: readonly string[]
  removeWhen: string
  lastVerified: string
  reason?: string
  /** @deprecated Use `appliesTo`. */
  applicableVersions?: readonly string[]
  /** @deprecated Use `tests`. */
  test?: string
}

export interface NormalizedDesktopCompatPatch extends DesktopCompatPatch {
  appliesTo: readonly string[]
  owner: string
  tests: readonly string[]
  applicableVersions: readonly string[]
  test: string
}

export interface CompatPatchRegistryValidationOptions {
  /**
   * An ISO calendar date used to enforce verification freshness. Omit it to
   * use the current UTC date; tests can supply a fixed date.
   */
  today?: string
  maxAgeDays?: number
  /** Only the static package export disables this policy during module load. */
  enforceFreshness?: boolean
  /** A repository-aware predicate supplied by CI or the schema validator. */
  testExists?: (testPath: string) => boolean
}

export const COMPAT_PATCH_MAX_AGE_DAYS = 90

const PATCH_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u
const OWNER = /^[a-z0-9][a-z0-9._/@-]{1,127}$/u
const TEST_PATH = /^(?:(?:apps|packages)\/[a-z0-9][a-z0-9._-]*\/(?:test|tests)\/|scripts\/)[a-z0-9][a-z0-9._/-]*\.(?:spec|test)\.(?:[cm]?[jt]s|tsx)$/iu

function nonEmptyString(
  value: unknown,
  entryId: string,
  field: string,
  minimumLength = 8,
): string {
  if (typeof value !== 'string' || value.trim().length < minimumLength) {
    throw new TypeError(`compat patch ${entryId} has an invalid ${field}`)
  }
  return value
}

function calendarDate(value: unknown, entryId: string, field: string): Date {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    throw new TypeError(`compat patch ${entryId} has an invalid ${field} date`)
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new TypeError(`compat patch ${entryId} has an invalid ${field} date`)
  }
  return parsed
}

function normalizedVersions(entry: DesktopCompatPatch): readonly string[] {
  const appliesTo = entry.appliesTo
  const legacy = entry.applicableVersions
  const valid = (versions: unknown): versions is readonly string[] => (
    Array.isArray(versions)
    && versions.length > 0
    && versions.every((version) => typeof version === 'string' && EXACT_VERSION.test(version))
  )

  if (appliesTo !== undefined && !valid(appliesTo)) {
    throw new TypeError(`compat patch ${entry.id} must use exact appliesTo versions`)
  }
  if (legacy !== undefined && !valid(legacy)) {
    throw new TypeError(`compat patch ${entry.id} must use exact applicable versions`)
  }
  if (appliesTo === undefined && legacy === undefined) {
    throw new TypeError(`compat patch ${entry.id} must declare appliesTo versions`)
  }
  if (appliesTo !== undefined && legacy !== undefined) {
    const canonical = [...appliesTo].sort()
    const legacyNormalized = [...legacy].sort()
    if (canonical.length !== legacyNormalized.length || canonical.some((version, index) => version !== legacyNormalized[index])) {
      throw new TypeError(`compat patch ${entry.id} has conflicting appliesTo and applicableVersions`)
    }
  }
  return Object.freeze([...(appliesTo ?? (legacy as readonly string[]))])
}

function normalizedTests(entry: DesktopCompatPatch): readonly string[] {
  const tests = entry.tests
  const legacy = entry.test
  const valid = (value: unknown): value is readonly string[] => (
    Array.isArray(value)
    && value.length > 0
    && value.every((testPath) => typeof testPath === 'string' && TEST_PATH.test(testPath))
  )

  if (tests !== undefined && !valid(tests)) {
    throw new TypeError(`compat patch ${entry.id} has invalid tests`)
  }
  if (legacy !== undefined && (typeof legacy !== 'string' || !TEST_PATH.test(legacy))) {
    throw new TypeError(`compat patch ${entry.id} has an invalid test`)
  }
  if (tests === undefined && legacy === undefined) {
    throw new TypeError(`compat patch ${entry.id} must declare tests`)
  }
  if (tests !== undefined && legacy !== undefined && !tests.includes(legacy)) {
    throw new TypeError(`compat patch ${entry.id} must include legacy test in tests`)
  }
  return Object.freeze([...(tests ?? [legacy as string])])
}

function normalizedOwner(entry: DesktopCompatPatch): string {
  if (typeof entry.owner !== 'string' || !OWNER.test(entry.owner)) {
    throw new TypeError(`compat patch ${entry.id} has an invalid owner`)
  }
  return entry.owner
}

function validationPolicy(options: CompatPatchRegistryValidationOptions): {
  today?: Date
  maxAgeDays: number
} {
  const maxAgeDays = options.maxAgeDays ?? COMPAT_PATCH_MAX_AGE_DAYS
  if (!Number.isInteger(maxAgeDays) || maxAgeDays < 0 || maxAgeDays > 366) {
    throw new TypeError('compat patch registry maxAgeDays must be an integer from 0 through 366')
  }
  if (options.enforceFreshness === false) return { maxAgeDays }
  return {
    maxAgeDays,
    today: calendarDate(options.today ?? new Date().toISOString().slice(0, 10), 'registry', 'today'),
  }
}

/**
 * Validates and normalizes canonical 3.0 fields plus legacy 2.x aliases.
 * Freshness is enforced against the current UTC date unless a caller supplies
 * a fixed date or explicitly bypasses it for static package initialization.
 * CI supplies a repository-aware test-file predicate through the public schema
 * validator.
 */
export function validateCompatPatchRegistry(
  entries: readonly DesktopCompatPatch[],
  options: CompatPatchRegistryValidationOptions = {},
): readonly NormalizedDesktopCompatPatch[] {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new TypeError('compat patch registry must contain at least one entry')
  }
  const policy = validationPolicy(options)
  const ids = new Set<string>()
  const normalizedEntries: NormalizedDesktopCompatPatch[] = []

  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object' || !PATCH_ID.test(entry.id)) {
      throw new TypeError('compat patch registry id is invalid')
    }
    if (ids.has(entry.id)) throw new TypeError(`duplicate compat patch id: ${entry.id}`)
    ids.add(entry.id)

    const appliesTo = normalizedVersions(entry)
    const tests = normalizedTests(entry)
    const owner = normalizedOwner(entry)
    const upstreamReference = nonEmptyString(entry.upstreamReference, entry.id, 'upstreamReference')
    const removeWhen = nonEmptyString(entry.removeWhen, entry.id, 'removeWhen')
    const reason = entry.reason === undefined
      ? undefined
      : nonEmptyString(entry.reason, entry.id, 'reason')
    const lastVerified = calendarDate(entry.lastVerified, entry.id, 'lastVerified')

    if (policy.today !== undefined) {
      const ageDays = Math.floor((policy.today.valueOf() - lastVerified.valueOf()) / 86_400_000)
      if (ageDays < 0 || ageDays > policy.maxAgeDays) {
        throw new TypeError(
          `compat patch ${entry.id} is stale: lastVerified ${entry.lastVerified} exceeds ${policy.maxAgeDays} days`,
        )
      }
    }
    if (options.testExists !== undefined) {
      for (const testPath of tests) {
        if (!options.testExists(testPath)) {
          throw new TypeError(`compat patch ${entry.id} references missing test: ${testPath}`)
        }
      }
    }

    const normalized: NormalizedDesktopCompatPatch = {
      id: entry.id,
      appliesTo,
      applicableVersions: appliesTo,
      upstreamReference,
      owner,
      tests,
      test: tests[0],
      removeWhen,
      lastVerified: entry.lastVerified,
      ...(reason === undefined ? {} : { reason }),
    }
    normalizedEntries.push(Object.freeze(normalized))
  }

  return Object.freeze(normalizedEntries)
}

export const DESKTOP_COMPAT_PATCHES = validateCompatPatchRegistry([
  {
    id: 'queued-turn-continuation',
    appliesTo: ['0.1.1-rc.1'],
    upstreamReference: '@deepseek-ai/dsh-agent 0.1.1-rc.1 agent/status public hook behavior',
    owner: 'desktop-platform',
    tests: ['packages/dsh-desktop-compat/tests/recovery.spec.ts'],
    reason: 'Resume a queued user turn after the active turn reaches a terminal status.',
    removeWhen: 'The upstream agent loop natively and deterministically resumes queued turns.',
    lastVerified: '2026-08-21',
  },
  {
    id: 'cancellation-presentation',
    appliesTo: ['0.1.1-rc.1'],
    upstreamReference: '@deepseek-ai/dsh-tools 0.1.1-rc.1 tools/post-execute public hook behavior',
    owner: 'desktop-platform',
    tests: ['packages/dsh-desktop-compat/tests/recovery.spec.ts'],
    reason: 'Translate the known object-shaped cancellation result into a stable user-facing message.',
    removeWhen: 'The upstream tool runtime returns a stable cancellation presentation contract.',
    lastVerified: '2026-08-21',
  },
  {
    id: 'tool-call-arguments-envelope',
    appliesTo: ['0.1.1-rc.1'],
    upstreamReference: '@deepseek-ai/dsh-llm 0.1.1-rc.1 llm/stream waterfall plus dsh-tools schema validation',
    owner: 'desktop-platform',
    tests: ['packages/dsh-desktop-compat/tests/tool-call-normalization.spec.ts'],
    reason: 'Recover only a schema-proven single-key arguments envelope before the agent loop parses tool JSON.',
    removeWhen: 'The upstream adapter or agent loop normalizes this malformed transport envelope with the same ambiguity guard.',
    lastVerified: '2026-08-21',
  },
  {
    id: 'desktop-skin-profile-isolation',
    appliesTo: ['0.1.1-rc.1'],
    upstreamReference: '@deepseek-ai/dsh 0.1.1-rc.1 profile-scoped runtime behavior and Skin Center v2 state isolation',
    owner: 'desktop-platform',
    tests: ['packages/dsh-desktop-compat/tests/skin-state.spec.ts'],
    reason: 'Keep Desktop skin selection inside the isolated desktop profile patch.',
    removeWhen: 'The upstream skin service exposes a profile-scoped public persistence contract.',
    lastVerified: '2026-08-21',
  },
  {
    id: 'tools-capability-request-side',
    appliesTo: ['0.1.1-rc.1'],
    upstreamReference: '@deepseek-ai/dsh-llm-pi-ai 0.1.1-rc.1 GenerateOptions tools request path',
    owner: 'desktop-platform',
    tests: ['apps/dsh-desktop/test/tools-capability.test.mjs'],
    reason: 'Add a route-level auto/native/none request-side tools capability while preserving ordinary chat and stable tool-history failure semantics.',
    removeWhen: 'The upstream adapter exposes a request-side tools capability contract with the same route-level behavior.',
    lastVerified: '2026-08-24',
  },
  {
    id: 'session-startup-corruption',
    appliesTo: ['0.1.1-rc.1'],
    upstreamReference: '@deepseek-ai/dsh-session-persistence-jsonl 0.1.1-rc.1 listArtifacts/readFirstZstdLine invalid frame magic at byte 0',
    owner: 'desktop-platform',
    tests: ['packages/dsh-desktop-compat/tests/session-recovery.spec.ts'],
    reason: 'Skip only a confirmed invalid zstd frame header while preserving every original session artifact.',
    removeWhen: 'The upstream JSONL persistence backend isolates an invalid session artifact during metadata enumeration.',
    lastVerified: '2026-08-25',
  },
  {
    id: 'transcript-tool-call-balance',
    appliesTo: ['0.1.1-rc.1'],
    upstreamReference: '@deepseek-ai/dsh-agent-loop 0.1.1-rc.1 buildRequest interrupted assistant tool_calls transcript projection',
    owner: 'desktop-platform',
    tests: ['packages/dsh-desktop-compat/tests/transcript-balance.spec.ts'],
    reason: 'Strip trailing incomplete assistant messages with unresponded tool calls from outbound stream requests without mutating disk session logs.',
    removeWhen: 'The upstream agent loop strips or repairs interrupted assistant tool calls before assembling outbound LLM messages.',
    lastVerified: '2026-08-26',
  },
] satisfies readonly DesktopCompatPatch[], { enforceFreshness: false })
