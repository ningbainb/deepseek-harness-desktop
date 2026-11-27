import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { LocalCodexAuthView } from './chatgpt-auth-protocol.ts'

/** Official pi-ai OAuth credential payload stored under `llm-pi-ai/openai-codex`. */
export interface LocalCodexGrant {
  type: 'oauth'
  access: string
  refresh: string
  expires: number
  accountId: string
}

/** Local Codex CLI auth projection plus optional grant payload for one-click sync. */
export interface LocalCodexSnapshot {
  view: LocalCodexAuthView
  grant?: LocalCodexGrant
}

const JWT_CLAIM_PATH = 'https://api.openai.com/auth'
const PLAN_PATTERN = /^[a-z0-9_-]{1,32}$/i
const ISO_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T[0-9:.+-]{5,40}Z?$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  const parts = token.split('.')
  if (parts.length !== 3) return undefined
  const segment = parts[1]
  if (!segment) return undefined
  try {
    const decoded = Buffer.from(segment, 'base64url').toString('utf8')
    const parsed = JSON.parse(decoded) as unknown
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function defaultCodexAuthPath(env: NodeJS.ProcessEnv = process.env): string {
  const codexHome = env.CODEX_HOME?.trim()
  const baseDir = codexHome && codexHome.length > 0 ? codexHome : join(homedir(), '.codex')
  return join(baseDir, 'auth.json')
}

/**
 * Inspect local Codex CLI `~/.codex/auth.json` without exposing raw secret fields in `view`.
 */
export function readLocalCodexAuth(authFilePath = defaultCodexAuthPath()): LocalCodexSnapshot | undefined {
  let rawText: string
  try {
    rawText = readFileSync(authFilePath, 'utf8')
  } catch {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText) as unknown
  } catch {
    return undefined
  }
  if (!isRecord(parsed)) return undefined

  const authMode = nonEmptyString(parsed.auth_mode)
  const tokens = isRecord(parsed.tokens) ? parsed.tokens : undefined
  const access = nonEmptyString(tokens?.access_token)
  const refresh = nonEmptyString(tokens?.refresh_token)
  const rawAccountId = nonEmptyString(tokens?.account_id)

  const detected = Boolean(access || refresh || authMode === 'chatgpt')
  if (!detected) return undefined

  const jwt = access ? decodeJwtPayload(access) : undefined
  const authClaim = jwt && isRecord(jwt[JWT_CLAIM_PATH]) ? jwt[JWT_CLAIM_PATH] : undefined
  const jwtPlan = nonEmptyString(authClaim?.chatgpt_plan_type)
  const planType = jwtPlan && PLAN_PATTERN.test(jwtPlan) ? jwtPlan.toLowerCase() : undefined
  const jwtAccountId = nonEmptyString(authClaim?.chatgpt_account_id)
  const accountId = jwtAccountId ?? rawAccountId
  const rawExp = jwt?.exp
  const expires = typeof rawExp === 'number' && Number.isFinite(rawExp) && rawExp > 0
    ? Math.trunc(rawExp * 1000)
    : Date.now() + 3_600_000

  const rawUpdated = nonEmptyString(parsed.last_refresh)
  const updatedAt = rawUpdated && ISO_TIME_PATTERN.test(rawUpdated)
    ? rawUpdated.slice(0, 64)
    : undefined

  const syncable = Boolean(access && refresh && accountId)
  const view: LocalCodexAuthView = {
    detected: true,
    syncable,
    ...planType === undefined ? {} : { planType },
    ...updatedAt === undefined ? {} : { updatedAt },
  }

  return {
    view,
    ...syncable && access && refresh && accountId
      ? {
          grant: {
            type: 'oauth',
            access,
            refresh,
            expires,
            accountId,
          },
        }
      : {},
  }
}
