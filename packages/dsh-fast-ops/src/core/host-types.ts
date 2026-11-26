import type { Context } from '@deepseek-ai/cordis'

export interface ToolSchemaLike {
  name?: string
  description?: string
  parameters?: unknown
}

export interface AgentSessionLike {
  id: string
}

export interface AgentLike {
  id?: string
  cwd?: string
  session?: AgentSessionLike | null
  workspace?: { path?: string } | null
  ctx?: {
    get?: (name: string) => unknown
    tools?: ScopedToolsLike
  }
}

export interface ScopedToolsLike {
  restrict?: (rule: { deny?: string[]; allow?: string[] }) => () => void
  schemas?: () => ReadonlyArray<ToolSchemaLike | [string, ToolSchemaLike?]>
  view?: (scope?: unknown) => { restrictableNames?: ReadonlySet<string> }
}

export interface ToolOutputSpec {
  schema: Record<string, unknown>
  render: (args: unknown, value: unknown) => Array<{ type: 'text'; text: string }>
}

export interface ToolRegistrationSpec {
  name: string
  description: string
  parameters: unknown
  output: ToolOutputSpec
  returns?: unknown
  execute: (args: Record<string, unknown> | undefined, exec?: { agent?: AgentLike }) => unknown
}

export interface ToolsServiceLike {
  schemas?: () => ReadonlyArray<ToolSchemaLike | [string, ToolSchemaLike?]>
  view?: (scope?: unknown) => { restrictableNames?: ReadonlySet<string> }
  restrict?: (rule: { deny?: string[]; allow?: string[] }) => () => void
  register?: (
    spec: ToolRegistrationSpec | Omit<ToolRegistrationSpec, 'execute'>,
    execute?: ToolRegistrationSpec['execute'],
  ) => (() => void) | void
}

export interface SystemPromptServiceLike {
  section?: (
    spec: { name: string; order: number; text: (() => string) | string },
  ) => (() => void) | void
}

export interface WorkspaceEntryLike {
  id: string
  path: string
}

export interface WorkspacesServiceLike {
  list?: () => ReadonlyArray<WorkspaceEntryLike>
}

export interface UserScopeServiceLike {
  desktopScope?: () => { principalId: string } | undefined
  currentScope?: () => { source?: string; principalId: string } | undefined
}

export interface WebRouteRequestLike {
  url?: string
  method?: string
  headers: Record<string, string | string[] | undefined>
  socket?: { remoteAddress?: string }
  [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | string>
}

export interface WebRouteResponseLike {
  writeHead: (status: number, headers: Record<string, string>) => void
  end: (body?: string) => void
}

export interface WebRoutePeerLike {
  principal?: { kind?: string }
}

export interface WebRouteSpec {
  path: string
  kind?: 'prefix' | 'exact'
  handler: (
    request: WebRouteRequestLike,
    response: WebRouteResponseLike,
    peer?: WebRoutePeerLike,
  ) => Promise<void> | void
}

export interface WebServerLike {
  register?: (route: WebRouteSpec) => (() => void) | void
  route?: (method: string, path: string, handler: WebRouteSpec['handler']) => (() => void) | void
}

export interface SlotsServiceLike {
  inject: (slot: string, factory: () => () => void) => () => void
  register: (spec: Record<string, unknown>, component: unknown) => () => void
}

export interface LocaleServiceLike {
  register: (namespace: string, dictionaries: Record<string, Record<string, string>>) => () => void
}

export function getHostService<T>(ctx: Context, name: string): T | undefined {
  const candidate = ctx as unknown as { get?: (key: string) => unknown } & Record<string, unknown>
  try {
    return (candidate.get?.(name) ?? candidate[name]) as T | undefined
  } catch {
    return undefined
  }
}
