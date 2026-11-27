import { createPublicKey, randomUUID, verify, type KeyObject } from 'node:crypto'
import { isAbsolute, relative } from 'node:path'
import type { AccessScope, SessionId, UserScopeService, WorkspaceId } from '@ningbainb/dsh-user-scope'
import type { Checkpoint, CheckpointDiff, CheckpointRestorePreview, CheckpointRestoreResult } from '../core/protocol.ts'
import type { ShadowGit } from '../core/shadow-git.ts'

const APPROVAL_KEY = 'DSH_DESKTOP_ACP_GESTURE_PUBLIC_KEY'
const NONCE_TTL = 60_000
const PROOF_TTL = 10_000
const MAX_PENDING = 32

type ScopeService = Pick<UserScopeService, 'canAccess' | 'currentScope' | 'desktopScope'>
type CheckpointStore = Pick<ShadowGit, 'list' | 'capture' | 'diff' | 'previewRestore' | 'restore'>
type DiffRequest = { path?: string; against?: 'parent' | 'working' }
type WorkspaceReference = { id: string; path: string; sessionIds: readonly string[] }
type ErrorCode = 'approval-required' | 'approval-unavailable' | 'busy' | 'forbidden' | 'not-found' | 'stale-preview' | 'unavailable'

interface HostOptions {
  store: CheckpointStore
  userScope: ScopeService
  workspaces: { list(): readonly WorkspaceReference[] }
  approvalKey?: KeyObject
  now?: () => number
  vaultHome?: string
  executable?: string
  validWorkspace?(path: string): boolean
}

interface WorkspaceAccess {
  sessionId: string
  workspaceId: string
  root: string
  principalId: string
}

interface ActiveTurn extends WorkspaceAccess {
  turnId: string
  baseCheckpointId?: string
  captures?: Promise<void>
}

interface Challenge extends WorkspaceAccess {
  checkpoint: Checkpoint
  token: string
  paths?: string[]
  files: number
  deleteCount: number
  expiration: number
}

export class CheckpointAccessError extends Error {
  constructor(readonly code: ErrorCode) { super(code) }
}

export function desktopApprovalKey(encoded = process.env[APPROVAL_KEY]): KeyObject | undefined {
  if (!encoded || encoded.length > 256) return
  try {
    const key = createPublicKey({ key: Buffer.from(encoded, 'base64'), format: 'der', type: 'spki' })
    return key.asymmetricKeyType === 'ed25519' ? key : undefined
  } catch { return undefined }
}

function validProof(value: unknown, challengeId: string, key: KeyObject, now: number): boolean {
  if (typeof value !== 'string' || value.length > 512 || !/^[\w-]+\.[\w-]+$/u.test(value)) return false
  try {
    const [body, signature] = value.split('.') as [string, string]
    const payload = Buffer.from(body, 'base64url')
    if (!verify(null, payload, key, Buffer.from(signature, 'base64url'))) return false
    const signed = JSON.parse(payload.toString('utf8')) as { kind?: unknown; challengeId?: unknown; issuedAt?: unknown } | null
    return signed?.kind === 'checkpoint-restore-approval' && signed.challengeId === challengeId
      && typeof signed.issuedAt === 'number' && Number.isSafeInteger(signed.issuedAt)
      && signed.issuedAt <= now + 1000 && now - signed.issuedAt <= PROOF_TTL
  } catch { return false }
}

function contains(directory: string, path: string): boolean {
  const difference = relative(directory, path)
  return !isAbsolute(difference) && !/^\.\.(?:[\\/]|$)/u.test(difference)
}

function rootKey(root: string): string { return process.platform === 'win32' ? root.toLowerCase() : root }

export class CheckpointHost {
  private readonly turns = new Map<string, ActiveTurn>()
  private readonly changes = new Map<string, number>()
  private readonly restoring = new Set<string>()
  private readonly challenges = new Map<string, Challenge>()
  private readonly now: () => number

  constructor(private readonly options: HostOptions) { this.now = options.now ?? Date.now }

  private access(sessionId: string): WorkspaceAccess {
    const { userScope, workspaces, vaultHome, executable } = this.options
    const desktop = userScope.desktopScope()
    const scope: AccessScope | undefined = userScope.currentScope() ?? desktop
    if (scope?.source !== 'desktop' || scope.principalId !== desktop?.principalId
      || !userScope.canAccess(scope, { kind: 'session', sessionId: sessionId as SessionId }).allowed) {
      throw new CheckpointAccessError('forbidden')
    }
    const registered = workspaces.list().filter(workspace => workspace.sessionIds.includes(sessionId))
    const workspace = registered.length === 1 ? registered[0] : undefined
    if (!workspace || !isAbsolute(workspace.path)
      || !userScope.canAccess(scope, { kind: 'workspace', workspaceId: workspace.id as WorkspaceId }).allowed) {
      throw new CheckpointAccessError('forbidden')
    }
    if (this.options.validWorkspace && !this.options.validWorkspace(workspace.path)) throw new CheckpointAccessError('forbidden')
    if (vaultHome && (contains(workspace.path, vaultHome) || contains(vaultHome, workspace.path))) {
      throw new CheckpointAccessError('forbidden')
    }
    if (executable && contains(workspace.path, executable)) throw new CheckpointAccessError('forbidden')
    return { sessionId, workspaceId: workspace.id, root: workspace.path, principalId: scope.principalId }
  }

  private assertAccess(previous: WorkspaceAccess): void {
    const next = this.access(previous.sessionId)
    if (previous.principalId !== next.principalId || previous.workspaceId !== next.workspaceId || previous.root !== next.root) {
      throw new CheckpointAccessError('forbidden')
    }
  }

  private async checkpoint(target: WorkspaceAccess, checkpointId: string, signal?: AbortSignal): Promise<Checkpoint> {
    const checkpoints = await this.options.store.list(target.root, target.sessionId, signal)
    const checkpoint = checkpoints.find(item => item.checkpointId === checkpointId && item.sessionId === target.sessionId)
    if (!checkpoint) throw new CheckpointAccessError('not-found')
    this.assertAccess(target)
    return checkpoint
  }

  async list(sessionId: string, signal?: AbortSignal): Promise<Checkpoint[]> {
    const target = this.access(sessionId)
    const checkpoints = await this.options.store.list(target.root, sessionId, signal)
    this.assertAccess(target)
    return checkpoints.filter(item => item.sessionId === sessionId)
  }

  async diff(sessionId: string, checkpointId: string, options: DiffRequest, signal?: AbortSignal): Promise<CheckpointDiff> {
    const target = this.access(sessionId)
    const checkpoint = await this.checkpoint(target, checkpointId, signal)
    const result = await this.options.store.diff(target.root, checkpoint.checkpointId, {
      ...options, baseCheckpointId: options.against === 'working' ? undefined : checkpoint.baseCheckpointId,
      summariesOnly: !options.path,
    }, signal)
    this.assertAccess(target)
    return result
  }

  async captureBeforeWrite(sessionId: string, workspacePath: string, signal?: AbortSignal): Promise<void> {
    const target = this.access(sessionId)
    if (this.restoring.has(rootKey(target.root))) throw new CheckpointAccessError('busy')
    if (!isAbsolute(workspacePath) || rootKey(workspacePath) !== rootKey(target.root)) throw new CheckpointAccessError('forbidden')
    const turnId = [...this.turns.values()].find(turn => turn.sessionId === sessionId)?.turnId
    await this.options.store.capture(target.root, { sessionId, turnId, source: 'pre-tool' }, signal)
    this.assertAccess(target)
  }

  private assertIdle(target: WorkspaceAccess): void {
    const key = rootKey(target.root)
    if (this.restoring.has(key) || this.changes.has(key)
      || [...this.turns.values()].some(turn => rootKey(turn.root) === key)) throw new CheckpointAccessError('busy')
  }

  async prepare(sessionId: string, checkpointId: string, paths?: string[], signal?: AbortSignal): Promise<CheckpointRestorePreview> {
    const target = this.access(sessionId)
    this.assertIdle(target)
    if (!this.options.approvalKey) throw new CheckpointAccessError('approval-unavailable')
    const checkpoint = await this.checkpoint(target, checkpointId, signal)
    const selection = paths?.slice()
    const preview = await this.options.store.previewRestore(target.root, checkpointId, selection, signal)
    this.assertAccess(target)
    this.assertIdle(target)
    if (preview.files.length === 0) return { files: [] }
    const now = this.now()
    for (const [key, entry] of this.challenges) if (entry.expiration < now) this.challenges.delete(key)
    if (this.challenges.size >= MAX_PENDING) this.challenges.delete(this.challenges.keys().next().value!)
    const challengeId = randomUUID()
    this.challenges.set(challengeId, {
      ...target, checkpoint, token: preview.token, paths: selection, expiration: now + NONCE_TTL,
      files: preview.files.length, deleteCount: preview.files.filter(file => file.status === 'deleted').length,
    })
    return { challengeId, files: preview.files }
  }

  private challenge(id: string): Challenge {
    const entry = this.challenges.get(id)
    if (!entry || entry.expiration < this.now()) {
      this.challenges.delete(id)
      throw new CheckpointAccessError('approval-required')
    }
    this.assertAccess(entry)
    this.assertIdle(entry)
    return entry
  }

  async describeApproval(challengeId: string): Promise<{ files: number; deleteCount: number; target: string }> {
    const entry = this.challenge(challengeId)
    return { files: entry.files, deleteCount: entry.deleteCount, target: entry.checkpoint.checkpointId }
  }

  async restore(sessionId: string, challengeId: string, proof: unknown, signal?: AbortSignal): Promise<CheckpointRestoreResult> {
    this.access(sessionId)
    const entry = this.challenge(challengeId)
    const key = this.options.approvalKey
    if (entry.sessionId !== sessionId || !key || !validProof(proof, challengeId, key, this.now())) {
      throw new CheckpointAccessError('approval-required')
    }
    this.challenges.delete(challengeId)
    const root = rootKey(entry.root)
    this.restoring.add(root)
    try {
      return await this.options.store.restore(entry.root, {
        checkpointId: entry.checkpoint.checkpointId, sessionId, turnId: entry.checkpoint.turnId,
        token: entry.token, paths: entry.paths, beforeApply: () => this.assertAccess(entry),
      }, signal)
    } finally { this.restoring.delete(root) }
  }

  async beginTurn(sessionId: string, turn: number, signal?: AbortSignal): Promise<void> {
    const target = this.access(sessionId)
    if (this.restoring.has(rootKey(target.root))) throw new CheckpointAccessError('busy')
    const key = sessionId + '\0' + turn
    if (this.turns.has(key)) return
    const turnId = String(turn)
    const active = { ...target, turnId } as ActiveTurn
    this.turns.set(key, active)
    const checkpoint = await this.options.store.capture(target.root, { sessionId, turnId, source: 'pre-turn' }, signal)
    active.baseCheckpointId = checkpoint?.checkpointId ?? (await this.options.store.list(target.root, undefined, signal))[0]?.checkpointId
  }

  async endTurn(sessionId: string, turn: number, signal?: AbortSignal, closing = true): Promise<void> {
    const key = sessionId + '\0' + turn
    const active = this.turns.get(key)
    if (!active) return
    try {
      this.assertAccess(active)
      active.captures ??= this.options.store.capture(active.root, {
        sessionId, turnId: active.turnId, source: 'post-turn', baseCheckpointId: active.baseCheckpointId,
      }, signal)
        .then(() => undefined)
      await active.captures
    } catch (error) {
      active.captures = undefined
      throw error
    } finally {
      if (closing && this.turns.get(key) === active) this.turns.delete(key)
    }
  }

  abandonSession(sessionId: string): void {
    for (const [key, turn] of this.turns) if (turn.sessionId === sessionId) this.turns.delete(key)
  }

  async beforeWorkspaceWrite(sessionId: string, workspacePath?: string, signal?: AbortSignal): Promise<() => Promise<void>> {
    const target = this.access(sessionId)
    if (workspacePath && (!isAbsolute(workspacePath) || rootKey(workspacePath) !== rootKey(target.root))) {
      throw new CheckpointAccessError('forbidden')
    }
    const root = rootKey(target.root)
    if (this.restoring.has(root)) throw new CheckpointAccessError('busy')
    const active = [...this.turns.values()].find(turn => turn.sessionId === sessionId)
    if (active) active.captures = undefined
    const turnId = active?.turnId
    this.changes.set(root, (this.changes.get(root) ?? 0) + 1)
    const release = () => {
      const count = this.changes.get(root) ?? 0
      if (count <= 1) this.changes.delete(root)
      else this.changes.set(root, count - 1)
    }
    try {
      await this.options.store.capture(target.root, { sessionId, turnId, source: 'pre-tool' }, signal)
      this.assertAccess(target)
    } catch (error) {
      release()
      throw error
    }
    let finished = false
    return async () => {
      if (finished) return
      finished = true
      try {
        this.assertAccess(target)
        await this.options.store.capture(target.root, {
          sessionId, turnId, source: 'post-tool', baseCheckpointId: active?.baseCheckpointId,
        }, AbortSignal.timeout(15_000))
      } finally { release() }
    }
  }
}
