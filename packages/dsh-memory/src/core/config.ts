export interface MemoryConfig {
  version: 1
  enabled: boolean
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = { version: 1, enabled: false }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function assertMemoryConfig(value: unknown): asserts value is MemoryConfig {
  if (!isRecord(value) || value.version !== 1 || typeof value.enabled !== 'boolean') {
    throw new Error('invalid memory settings')
  }
}

export function normalizeMemoryConfig(value: unknown): MemoryConfig {
  if (value === undefined) return { ...DEFAULT_MEMORY_CONFIG }
  assertMemoryConfig(value)
  return { version: 1, enabled: value.enabled }
}
