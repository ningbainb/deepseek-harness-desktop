import type { Context } from '@deepseek-ai/cordis'

/** Read the current scoped service or its directly exposed context property. */
export function getHostService<T>(ctx: Context, name: string): T | undefined {
  const candidate = ctx as unknown as { get?: (key: string) => unknown } & Record<string, unknown>
  try {
    return (candidate.get?.(name) ?? candidate[name]) as T | undefined
  } catch {
    return undefined
  }
}
