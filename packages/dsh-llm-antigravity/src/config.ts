export const namespace = 'llm-antigravity'
export const statusPath = '/api/dsh-antigravity-cli'
export const efforts = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export const authModes = ['oauth-personal', 'oauth-business', 'gemini-api-key', 'agent-platform'] as const
export type AuthMode = typeof authModes[number]

export function isHarnessLlmAllowed(authMode: AuthMode): boolean {
  return authMode === 'gemini-api-key' || authMode === 'agent-platform'
}

export interface Settings {
  enabled: boolean
  cliPath: string
  transport: 'stream-json' | 'acp'
  authMode: AuthMode
  effort: 'auto' | typeof efforts[number]
  timeoutSeconds: number
  extraModels: string
}

export const defaults: Settings = {
  enabled: false, cliPath: '', transport: 'acp', authMode: 'oauth-personal', effort: 'auto', timeoutSeconds: 120, extraModels: '',
}

export interface CliModel { id: string; name: string }
export interface Diagnostic {
  state: 'not-installed' | 'not-authenticated' | 'ready' | 'error' | 'disabled'
  path?: string
  authMode?: AuthMode
  harnessLlmAllowed?: boolean
  models: CliModel[]
}
