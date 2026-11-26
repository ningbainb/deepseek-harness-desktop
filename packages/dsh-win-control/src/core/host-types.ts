import type { Context } from '@deepseek-ai/cordis'

export interface ToolSchemaLike {
  name?: string
  description?: string
  parameters?: unknown
}

export interface AgentSessionLike {
  id: string
  header?: {
    origin?: string
    parentSession?: string
  }
}

export interface AgentLike {
  id?: string
  session?: AgentSessionLike | null
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

export interface ToolExecutionLike {
  name?: string
  agent?: AgentLike
}

export interface ToolOutputSpec {
  schema: Record<string, unknown>
  render: (args: unknown, value: unknown) => ReadonlyArray<{ type: 'text'; text: string }>
}

export interface ToolRegistrationSpec {
  name: string
  description: string
  parameters: unknown
  output: ToolOutputSpec
  returns?: unknown
  render?: (args: unknown, value: unknown) => ReadonlyArray<{ type: 'text'; text: string }>
  execute: (args: Record<string, unknown> | undefined, exec?: { agent?: AgentLike }) => unknown
}

export interface ToolsServiceLike {
  schemas?: () => ReadonlyArray<ToolSchemaLike | [string, ToolSchemaLike?]>
  view?: (scope?: unknown) => { restrictableNames?: ReadonlySet<string> }
  restrict?: (rule: { deny?: string[]; allow?: string[] }) => () => void
  guard?: (fn: (exec: ToolExecutionLike) => string | undefined) => (() => void) | void
  register?: (
    spec: ToolRegistrationSpec | Omit<ToolRegistrationSpec, 'execute'>,
    execute?: ToolRegistrationSpec['execute'],
  ) => (() => void) | void
}

export interface SessionsServiceLike {
  get?: (id: string) => AgentSessionLike | undefined | null
  list?: () => ReadonlyArray<AgentSessionLike>
}

export interface AgentsServiceLike {
  list?: () => ReadonlyArray<AgentLike>
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
  on?: (event: string, listener: (chunk?: unknown) => void) => void
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
  route?: (
    method: string,
    path: string,
    handler: WebRouteSpec['handler'],
  ) => (() => void) | void
}

export interface SlotsServiceLike {
  inject: (slot: string, factory: () => () => void) => () => void
  register: (spec: Record<string, unknown>, component: unknown) => () => void
}

export interface LocaleServiceLike {
  register: (namespace: string, dictionaries: Record<string, Record<string, string>>) => () => void
  bind?: (namespace: string) => (key: string) => string
}

export type HostServiceAccessor = (ctx: Context, name: string) => unknown
