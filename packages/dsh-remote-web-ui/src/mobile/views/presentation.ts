import { RpcCallError, RpcTransportError } from '../rpc.ts'

/** The session-list row model (list + chat share it). */
export interface SessionView {
  sessionId: string
  title: string
  cwd?: string
  updatedAt: number
  running: boolean
  blank: boolean
}

/** Map a list row to the surface model; the title comes from projections when present. */
export function toSessionView(item: {
  sessionId: string
  updatedAt: number
  running: boolean
  blank: boolean
  cwd?: string
  projections?: { values?: Record<string, unknown> }
}): SessionView {
  const titleValue = item.projections?.values?.title
  const title = typeof titleValue === 'string' && titleValue !== ''
    ? titleValue
    : item.cwd !== undefined ? item.cwd.split('/').filter(Boolean).at(-1) ?? item.cwd : '新会话'
  return {
    sessionId: item.sessionId,
    title,
    ...(item.cwd !== undefined ? { cwd: item.cwd } : {}),
    updatedAt: item.updatedAt,
    running: item.running,
    blank: item.blank,
  }
}

/** Human clock, e.g. "14:05" or "昨天 20:31". */
export function formatTime(epochMs: number): string {
  const date = new Date(epochMs)
  const clock = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return clock
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${clock}`
  return `${String(date.getMonth() + 1)}月${String(date.getDate())}日 ${clock}`
}

/** Shared error text for the surface's small failure affordances. */
export function errorText(error: unknown): string {
  if (error instanceof RpcCallError) return error.error.message
  if (error instanceof RpcTransportError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * Actionable hint for transport-level 403s on host-gated channels (model
 * picker, session creation): the phone's UI bundle is served fresh from disk
 * per request, while the host-side allowlist lives in the long-running
 * process — a rebuild without a restart shows the new surface against the
 * old allowlist (HTTP 403 forbidden).
 */
export function staleHostHint(message: string): string | undefined {
  return /^HTTP 403/.test(message)
    ? '宿主端插件可能仍在运行旧版本：请重启 dsh web 后再试。'
    : undefined
}
