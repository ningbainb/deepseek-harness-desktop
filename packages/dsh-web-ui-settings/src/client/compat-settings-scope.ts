/**
 * rc.6-compatible settings scope for the Web UI plugin group.
 *
 * The official settings scope answers "unavailable" for every third-party
 * namespace on rc.6 hosts (the apiproxy allowlist is hard-coded), which turns
 * every family plugin card into a read-only explanation. This binder wraps
 * the official scope: when it reports the namespace ready, the wrapper is a
 * pass-through; when it reports unavailable on a loopback connection, a
 * bridge controller takes over and serves the same SettingsScope contract
 * from this package's host-side bridge routes (/api/dsh-web-ui-settings).
 * Remote browsers (non-loopback) never use the bridge, matching the official
 * process-local policy. Family plugins opt in through ctx.get('webUiSettings')
 * without a hard service dependency, so a deployment without this package
 * keeps the previous behavior.
 */

import { Service, type Context } from '@deepseek-ai/cordis'
// Type-only: pulls the settings-surface Context merge (ctx.settingsScope) and
// the forwarded settings invalidation face (ctx.remote).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsScope, SettingsScopeSnapshot, SettingsScopeSpec } from '@deepseek-ai/dsh-client-ui-settings/client'
import { WEB_UI_SETTINGS_BRIDGE_PREFIX } from '../protocol.ts'
import type { BridgeDescribeResult, BridgeMutateRequest, BridgeMutateResult } from '../protocol.ts'

/** True when the value is a well-formed bridge RPC result (the inner result payload the route answers). */
function isBridgeResult(value: unknown): value is BridgeDescribeResult | BridgeMutateResult {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (typeof record.ok !== 'boolean') return false
  if (record.ok) return typeof record.value === 'object' && record.value !== null
  return typeof record.code === 'string' && typeof record.message === 'string'
}

/** The settings wire face the bridge controller consumes. */
export interface BridgeSettingsFace {
  settings: {
    describe: (payload: Record<string, never>) => Promise<{ result: BridgeDescribeResult }>
    mutate: (payload: BridgeMutateRequest) => Promise<{ result: BridgeMutateResult }>
  }
}

/** True only for browser hostnames that resolve to the local machine. */
export function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname === '::1'
    || hostname === '[::1]'
    || /^127(?:\.\d{1,3}){3}$/u.test(hostname)
}

/** One settled bridge POST, always shaped as an RPC result envelope. */
interface EnvelopedResult {
  result: BridgeDescribeResult | BridgeMutateResult
}

/**
 * Build the fetch-backed settings face for the bridge routes. Network and
 * HTTP failures collapse into an ok:false envelope so the controller keeps
 * its unavailable state instead of throwing into plugin activation.
 * @param fetchFn - the fetch implementation (the global fetch on loopback).
 * @returns the settings face.
 */
export function createBridgeApi(fetchFn: typeof fetch): BridgeSettingsFace {
  const post = async (path: string, body: unknown): Promise<EnvelopedResult> => {
    try {
      const response = await fetchFn(WEB_UI_SETTINGS_BRIDGE_PREFIX + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) return { result: { ok: false, code: 'internal', message: 'bridge HTTP ' + response.status } }
      const parsed: unknown = await response.json()
      if (!isBridgeResult(parsed)) return { result: { ok: false, code: 'internal', message: 'bridge malformed response' } }
      return { result: parsed }
    } catch {
      return { result: { ok: false, code: 'internal', message: 'settings bridge unreachable' } }
    }
  }
  return {
    settings: {
      describe: async payload => post('/describe', payload) as Promise<{ result: BridgeDescribeResult }>,
      mutate: async payload => post('/mutate', payload) as Promise<{ result: BridgeMutateResult }>,
    },
  }
}

/**
 * A minimal SettingsScopeController over the bridge face. Mirrors the
 * official controller's ordering (serialized queue, revision-fenced writes,
 * recovery read after a refusal) but trusts the Host-seam value without
 * re-running the wire-schema validation: the seam already validated it, and
 * the family cards bind without a narrowing decoder.
 */
class BridgeScopeController<T> implements SettingsScope<T> {
  private readonly store: SnapshotStore<SettingsScopeSnapshot<T>>
  private tail: Promise<void> = Promise.resolve()
  private disposed = false
  private writeGeneration = 0
  private pendingRevision: number | undefined

  constructor(
    private readonly api: BridgeSettingsFace,
    private readonly spec: SettingsScopeSpec<T>,
  ) {
    this.store = createSnapshotStore<SettingsScopeSnapshot<T>>({
      status: 'loading',
      value: undefined,
      base: undefined,
      user: undefined,
      revision: undefined,
      writable: false,
      mode: 'host',
    })
  }

  getSnapshot(): SettingsScopeSnapshot<T> {
    return this.store.getSnapshot()
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener)
  }

  /** Queue a Host refresh through the bridge. */
  load(): Promise<void> {
    const generation = this.writeGeneration
    return this.enqueue(() => this.read(generation))
  }

  set(field: string, value: unknown): Promise<void> {
    const generation = ++this.writeGeneration
    return this.enqueue(() => this.write([{ op: 'set', path: [field], value }], generation))
  }

  unset(field: string): Promise<void> {
    return this.mutate([{ op: 'unset', path: [field] }])
  }

  mutate(ops: readonly SettingsPathOpView[], expectedRevision?: number): Promise<void> {
    const generation = ++this.writeGeneration
    const copied = ops.map(op => op.op === 'set'
      ? { op: 'set' as const, path: [...op.path], value: op.value }
      : { op: 'unset' as const, path: [...op.path] })
    return this.enqueue(() => this.write(copied, generation, expectedRevision))
  }

  /** Stop queued operations and wait for the current bridge call to settle. */
  async dispose(): Promise<void> {
    this.disposed = true
    await this.tail
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    if (this.disposed) return Promise.resolve()
    const task = this.tail.then(async () => {
      if (this.disposed) return
      await operation()
    })
    this.tail = task.catch(() => {})
    return task
  }

  private async read(generation: number): Promise<void> {
    let response: { result: BridgeDescribeResult }
    try {
      response = await this.api.settings.describe({})
    } catch {
      // A dropped bridge call must not strand the card in a permanent
      // loading state: report the namespace unavailable, which the card
      // renders as its explanation instead of a form.
      if (!this.disposed && generation === this.writeGeneration) {
        this.store.update((draft) => { draft.status = 'unavailable' })
      }
      return
    }
    if (!response.result.ok || this.disposed) {
      if (!this.disposed && generation === this.writeGeneration) {
        this.store.update((draft) => { draft.status = 'unavailable' })
      }
      return
    }
    const { namespaces, writable } = response.result.value
    const view = namespaces.find(candidate => candidate.ns === this.spec.namespace)
    if (generation !== this.writeGeneration) {
      if (view !== undefined) this.pendingRevision = view.revision
      return
    }
    if (view === undefined) {
      this.store.update((draft) => {
        draft.status = 'unavailable'
        draft.writable = writable
      })
      return
    }
    this.pendingRevision = undefined
    this.accept(view.value, view, writable)
  }

  private async write(
    ops: Array<{ op: 'set' | 'unset'; path: string[]; value?: unknown }>,
    generation: number,
    expectedRevision = this.pendingRevision ?? this.getSnapshot().revision,
  ): Promise<void> {
    let response: { result: BridgeMutateResult }
    try {
      response = await this.api.settings.mutate({
        ns: this.spec.namespace,
        ops,
        ...expectedRevision === undefined ? {} : { expectedRevision },
      })
    } catch {
      if (!this.disposed && generation === this.writeGeneration) await this.read(generation)
      return
    }
    if (!response.result.ok || this.disposed) {
      if (!this.disposed && generation === this.writeGeneration) await this.read(generation)
      return
    }
    // A newer user edit is already queued. Retain the revision fence without
    // publishing an intermediate value over the controller's latest preview.
    if (generation !== this.writeGeneration) {
      this.pendingRevision = response.result.value.revision
      return
    }
    this.pendingRevision = undefined
    this.accept(response.result.value.value, response.result.value, undefined)
  }

  /** Publish one accepted Host view (value narrowed by the optional decoder). */
  private accept(section: unknown, view: { base?: unknown; user?: unknown; revision: number }, writable: boolean | undefined): void {
    const decoded = this.spec.decode === undefined ? section as T : this.spec.decode(section)
    this.store.update((draft) => {
      draft.revision = view.revision
      draft.base = view.base
      draft.user = view.user
      if (writable !== undefined) draft.writable = writable
      if (decoded === undefined) return
      draft.status = 'ready'
      draft.value = decoded
    })
  }
}

/** Options of the compatibility scope wrapper. */
export interface CompatScopeOptions<T> {
  /** Settings namespace the scope serves. */
  namespace: string
  /** The official settings scope (already bound by the official binder). */
  primary: SettingsScope<T>
  /** The fetch implementation; absent on remote browsers (no bridge). */
  fetchFn?: typeof fetch
}

/**
 * Wrap the official settings scope with the bridge fallback. The official
 * scope stays authoritative whenever it serves the namespace; the bridge
 * controller answers only its unavailable state on a loopback connection.
 * @param options - the official scope, the namespace, and the loopback fetch.
 * @returns the compatibility scope implementing the SettingsScope contract.
 */
export function createCompatScope<T>(options: CompatScopeOptions<T>): SettingsScope<T> & { load(): Promise<void> } {
  const { namespace, primary } = options
  const fallback = options.fetchFn === undefined
    ? undefined
    : new BridgeScopeController<T>(createBridgeApi(options.fetchFn), { namespace })
  const store = createSnapshotStore<SettingsScopeSnapshot<T>>(project())
  let fallbackStarted = false
  const publish = (): void => { store.set(project()) }
  const startFallback = (): void => {
    if (fallback === undefined || fallbackStarted) return
    fallbackStarted = true
    void fallback.load()
  }
  function project(): SettingsScopeSnapshot<T> {
    const primarySnapshot = primary.getSnapshot()
    if (primarySnapshot.status === 'ready' || fallback === undefined) return primarySnapshot
    if (primarySnapshot.status === 'loading') return primarySnapshot
    const bridgeSnapshot = fallback.getSnapshot()
    if (bridgeSnapshot.status === 'ready') return bridgeSnapshot
    if (bridgeSnapshot.status === 'loading') return { ...primarySnapshot, status: 'loading' }
    return primarySnapshot
  }
  primary.subscribe(() => {
    publish()
    if (primary.getSnapshot().status === 'unavailable') startFallback()
  })
  fallback?.subscribe(publish)
  if (primary.getSnapshot().status === 'unavailable') startFallback()
  return {
    getSnapshot: () => store.getSnapshot(),
    subscribe: listener => store.subscribe(listener),
    mutate: (ops, expectedRevision) => active().mutate(ops, expectedRevision),
    set: (field, value) => active().set(field, value),
    unset: field => active().unset(field),
    load: async () => {
      fallbackStarted = true
      await fallback?.load()
    },
  }
  function active(): SettingsScope<T> {
    return primary.getSnapshot().status === 'ready' ? primary : fallback ?? primary
  }
}

/** The optional compat binder surface family plugins read from ctx. */
export interface WebUiSettingsBinderFace {
  bind<T>(spec: SettingsScopeSpec<T>): SettingsScope<T>
}

/**
 * The rc.6 compatibility binder, provided as the webUiSettings service. Its
 * bind() rides the official binder first and hands the bridge controller in
 * only when the official scope settles as unavailable on a loopback
 * connection, so official behavior stays untouched wherever it works.
 */
export class WebUiSettingsBinder extends Service {
  constructor(ctx: Context) {
    super(ctx, 'webUiSettings')
  }

  bind<T>(spec: SettingsScopeSpec<T>): SettingsScope<T> {
    const ctx = this.ctx
    const official = ctx.get('settingsScope')
    if (!isBinderFace(official)) {
      // The official binder is a product seam every dsh web host carries;
      // when it is absent the bind must not crash the card's activation.
      throw new Error('webUiSettings: the official settingsScope binder is unavailable')
    }
    const primary = official.bind(spec)
    const connectionValue = ctx.get('connection')
    const connection = isConnectionHandle(connectionValue) ? connectionValue : undefined
    // rc.6 Electron connections can omit or misreport isLoopback. The browser
    // URL is still an independent process-local boundary: a remote deployment
    // cannot reach these bridge routes from a non-loopback origin.
    const loopback = connection?.isLoopback === true
      || isLoopbackHostname(globalThis.location?.hostname ?? '')
    const scope = createCompatScope<T>({
      namespace: spec.namespace,
      primary,
      fetchFn: loopback ? ((input, init) => fetch(input, init)) : undefined,
    })
    // Bridge refreshes ride the same invalidation edges as the official
    // scope: forwarded settings-document updates and connection resets.
    ctx.effect(() => {
      const remoteValue = ctx.get('remote')
      const remote = isRemoteFace(remoteValue) ? remoteValue : undefined
      const disposers: Array<() => void> = []
      if (remote !== undefined) {
        disposers.push(remote.$on('settings/document-updated', (namespace) => {
          if (namespace !== undefined && namespace !== spec.namespace) return
          void scope.load()
        }))
      }
      disposers.push(ctx.on('connection/reset', () => { void scope.load() }))
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'web-ui-settings: compat scope invalidation')
    return scope
  }
}

/** True when the value exposes the official settings binder's bind() seam. */
function isBinderFace(value: unknown): value is WebUiSettingsBinderFace {
  return typeof value === 'object' && value !== null && typeof (value as { bind?: unknown }).bind === 'function'
}

/** True when the value looks like the client connection handle this wrapper reads. */
function isConnectionHandle(value: unknown): value is ConnectionHandle {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.isLoopback === undefined || typeof record.isLoopback === 'boolean'
}

/** True when the value exposes the settings invalidation face the wrapper listens to. */
function isRemoteFace(value: unknown): value is { $on: (event: string, callback: (namespace?: unknown) => void) => () => void } {
  return typeof value === 'object' && value !== null && typeof (value as { $on?: unknown }).$on === 'function'
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** rc.6-compatible settings binder (bridge fallback over the official scope). */
    webUiSettings?: WebUiSettingsBinder
  }
}
