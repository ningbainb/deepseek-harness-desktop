export const namespace = 'llm-antigravity'
export const statusPath = '/api/dsh-antigravity-cli'
export const efforts = ['low', 'medium', 'high', 'xhigh', 'max'] as const

export interface Settings {
  enabled: boolean
  cliPath: string
  transport: 'stream-json' | 'acp'
  effort: 'auto' | typeof efforts[number]
  timeoutSeconds: number
  extraModels: string
}

export const defaults: Settings = {
  enabled: true, cliPath: '', transport: 'stream-json', effort: 'auto', timeoutSeconds: 120, extraModels: '',
}

export interface CliModel { id: string; name: string }
export interface Diagnostic {
  state: 'not-installed' | 'not-authenticated' | 'ready' | 'error' | 'disabled'
  path?: string
  models: CliModel[]
}
