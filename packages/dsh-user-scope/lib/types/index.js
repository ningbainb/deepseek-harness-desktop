import { randomUUID } from 'node:crypto';
import { Service } from '@deepseek-ai/cordis';
import { asDeviceId, asPrincipalId, asSessionId, asWorkspaceId, } from "./core/ids.js";
import { UserScopeRegistry, } from "./core/access.js";
import { emptyOwnershipSnapshot, } from "./core/schema.js";
import { UserScopeRequestContext } from "./context.js";
import { CorruptUserScopeError, UserScopeStore, UserScopeStoreError, } from "./store.js";
export { asDeviceId, asPrincipalId, asSessionId, asWorkspaceId, requireDeviceId, requirePrincipalId, requireSessionId, requireWorkspaceId, OPAQUE_ID_PATTERN, } from "./core/ids.js";
export { decideAccess, UserScopeRegistry } from "./core/access.js";
export { UserScopeRequestContext } from "./context.js";
export { USER_SCOPE_DIR_MODE, USER_SCOPE_FILE_MODE, CorruptUserScopeError, UnsupportedSchemaVersionError, UserScopeStore, UserScopeStoreError, } from "./store.js";
export const name = 'user-scope';
export const inject = ['sessions', 'workspaceRegistry'];
export class UserScopeUnavailableError extends Error {
    constructor() {
        super('user-scope is unavailable; access is closed');
        this.name = 'UserScopeUnavailableError';
    }
}
/** Host service shared by remote isolation, personal Prompt, and memory. */
export class UserScopeService extends Service {
    static inject = [];
    store;
    requests = new UserScopeRequestContext();
    now;
    localPrincipalValue;
    registryValue;
    availability = 'loading';
    bootError;
    bootPromise;
    constructor(ctx, config = {}) {
        super(ctx, 'userScope');
        this.now = config.now ?? (() => Date.now());
        this.store = new UserScopeStore(config);
        this.localPrincipalValue = this.newPrincipal('local-profile');
        this.registryValue = new UserScopeRegistry(this.localPrincipalValue);
        this.bootPromise = this.bootstrap();
    }
    async ready() {
        await this.bootPromise;
    }
    availabilityState() {
        return this.availability;
    }
    diagnostics() {
        return {
            state: this.availability,
            principalId: this.localPrincipalValue.id,
            ...(this.bootError instanceof UserScopeStoreError ? { errorCode: this.bootError.code } : {}),
        };
    }
    localPrincipal() {
        return { ...this.localPrincipalValue };
    }
    snapshot() {
        return this.registryValue.snapshot();
    }
    currentScope() {
        return this.requests.current();
    }
    /** The local profile scope used by unscoped Host lifecycle events. */
    desktopScope() {
        return this.availability === 'blocked'
            ? undefined
            : { principalId: this.localPrincipalValue.id, source: 'desktop' };
    }
    run(scope, callback) {
        return this.requests.run(scope, callback);
    }
    canAccess(scope, resource) {
        if (this.availability !== 'ready')
            return { allowed: false, reason: 'scope-unavailable' };
        return this.registryValue.access(scope, resource);
    }
    visibleSessions(scope) {
        if (this.availability !== 'ready')
            return [];
        return this.registryValue.visibleSessions(scope);
    }
    principalForDevice(deviceId) {
        const parsed = asDeviceId(deviceId);
        return parsed === undefined ? undefined : this.registryValue.principalForDevice(parsed);
    }
    touchDevice(deviceId) {
        if (this.availability !== 'ready')
            return false;
        const parsed = asDeviceId(deviceId);
        return parsed !== undefined && this.registryValue.touchDevice(parsed, this.now());
    }
    async bindDevice(deviceId, displayName) {
        await this.requireReady();
        const parsedDeviceId = asDeviceId(deviceId);
        if (parsedDeviceId === undefined)
            throw new TypeError('invalid device id');
        const existing = this.registryValue.device(parsedDeviceId);
        if (existing !== undefined) {
            if (existing.revokedAt !== undefined)
                throw new Error('device is revoked');
            return { deviceId: existing.deviceId, principalId: existing.principalId };
        }
        const principal = this.newPrincipal('paired-device');
        const binding = {
            deviceId: parsedDeviceId,
            principalId: principal.id,
            createdAt: this.now(),
            lastSeenAt: this.now(),
            ...(displayName === undefined ? {} : { displayName: displayName.slice(0, 128) }),
        };
        await this.commit(registry => {
            registry.addPrincipal(principal);
            registry.registerDevice(binding);
        });
        return { deviceId: parsedDeviceId, principalId: principal.id };
    }
    async revokeDevice(deviceId) {
        await this.requireReady();
        const parsed = asDeviceId(deviceId);
        if (parsed === undefined)
            throw new TypeError('invalid device id');
        let changed = false;
        await this.commit(registry => { changed = registry.revokeDevice(parsed, this.now()); });
        return changed;
    }
    async grantWorkspace(principalId, workspaceId) {
        await this.requireReady();
        const principal = asPrincipalId(principalId);
        const workspace = asWorkspaceId(workspaceId);
        if (principal === undefined || workspace === undefined)
            throw new TypeError('invalid workspace grant');
        await this.commit(registry => {
            registry.grantWorkspace({ principalId: principal, workspaceId: workspace, permission: 'use', createdAt: this.now() });
        });
    }
    async revokeWorkspace(principalId, workspaceId) {
        await this.requireReady();
        const principal = asPrincipalId(principalId);
        const workspace = asWorkspaceId(workspaceId);
        if (principal === undefined || workspace === undefined)
            throw new TypeError('invalid workspace grant');
        let changed = false;
        await this.commit(registry => { changed = registry.revokeWorkspace(principal, workspace); });
        return changed;
    }
    async grantSession(principalId, sessionId) {
        await this.requireReady();
        const principal = asPrincipalId(principalId);
        const session = asSessionId(sessionId);
        if (principal === undefined || session === undefined)
            throw new TypeError('invalid session grant');
        await this.commit(registry => { registry.grantSession(principal, session); });
    }
    async revokeSession(principalId, sessionId) {
        await this.requireReady();
        const principal = asPrincipalId(principalId);
        const session = asSessionId(sessionId);
        if (principal === undefined || session === undefined)
            throw new TypeError('invalid session grant');
        let changed = false;
        await this.commit(registry => { changed = registry.revokeSession(principal, session); });
        return changed;
    }
    async registerSession(input) {
        await this.requireReady();
        const sessionId = asSessionId(input.sessionId);
        const owner = asPrincipalId(input.createdByPrincipalId ?? this.localPrincipalValue.id);
        const workspaceId = input.workspaceId === undefined ? undefined : asWorkspaceId(input.workspaceId);
        if (sessionId === undefined || owner === undefined || (input.workspaceId !== undefined && workspaceId === undefined))
            throw new TypeError('invalid session ownership');
        const timestamp = input.createdAt ?? this.now();
        const ownership = {
            sessionId,
            ...(workspaceId === undefined ? {} : { workspaceId }),
            createdByPrincipalId: owner,
            createdAt: timestamp,
            updatedAt: this.now(),
        };
        await this.commit(registry => { registry.registerSession(ownership); });
    }
    async removeSession(sessionId) {
        await this.requireReady();
        const parsed = asSessionId(sessionId);
        if (parsed === undefined)
            throw new TypeError('invalid session id');
        let changed = false;
        await this.commit(registry => { changed = registry.removeSession(parsed); });
        return changed;
    }
    newPrincipal(kind) {
        const prefix = kind === 'local-profile' ? 'principal-local' : 'principal-device';
        const id = asPrincipalId(`${prefix}-${randomUUID()}`);
        if (id === undefined)
            throw new Error('failed to mint principal id');
        return { id, kind, createdAt: this.now() };
    }
    async bootstrap() {
        try {
            const local = await this.store.ensureLocalPrincipal(() => this.localPrincipalValue);
            this.localPrincipalValue = local;
            const existing = await this.store.loadOwnership();
            let ownership = existing;
            let needsWrite = false;
            if (ownership === undefined) {
                ownership = emptyOwnershipSnapshot(local);
                needsWrite = true;
            }
            else {
                const persistedLocal = ownership.principals.find(item => item.kind === 'local-profile');
                if (persistedLocal !== undefined && persistedLocal.id !== local.id)
                    throw new CorruptUserScopeError(this.store.ownershipFilename);
                if (persistedLocal === undefined) {
                    ownership = { ...ownership, principals: [{ ...local }, ...ownership.principals] };
                    needsWrite = true;
                }
            }
            this.registryValue = new UserScopeRegistry(local, ownership);
            if (needsWrite)
                await this.store.saveOwnership(ownership);
            this.availability = 'ready';
        }
        catch (error) {
            this.bootError = error;
            this.availability = 'blocked';
            // Do not include file contents or identifiers in the warning.
            console.warn('user-scope: persistent state unavailable; access is closed');
        }
    }
    async requireReady() {
        await this.ready();
        if (this.availability !== 'ready')
            throw new UserScopeUnavailableError();
    }
    async commit(change) {
        await this.requireReady();
        const next = await this.store.updateOwnership(current => {
            const source = current ?? this.registryValue.snapshot();
            const persistedLocal = source.principals.find(item => item.kind === 'local-profile');
            if (persistedLocal !== undefined && persistedLocal.id !== this.localPrincipalValue.id)
                throw new CorruptUserScopeError(this.store.ownershipFilename);
            const working = new UserScopeRegistry(this.localPrincipalValue, source);
            change(working);
            return working.snapshot();
        });
        this.registryValue.replace(next);
    }
}
/**
 * Register a live session from the official SessionStore lifecycle. Remote
 * sessions must already resolve to a workspace; the explicit mobile create
 * route registers them with its checked workspace after the Host call.
 */
function registerLiveSession(service, session, workspaceRegistry) {
    const scope = service.currentScope() ?? service.desktopScope();
    if (scope === undefined)
        return;
    let workspaceId;
    try {
        workspaceId = workspaceRegistry.list()
            .find(workspace => workspace.sessionIds.some(sessionId => String(sessionId) === String(session.id)))?.id;
    }
    catch {
        // A workspace registry fault must not turn into an unscoped remote
        // session. Local registration can still be attempted and will fail
        // closed if user-scope storage is unavailable.
    }
    if (scope.source === 'remote' && workspaceId === undefined)
        return;
    void service.registerSession({
        sessionId: String(session.id),
        ...(workspaceId === undefined ? {} : { workspaceId }),
        createdByPrincipalId: scope.principalId,
        createdAt: session.header.createdAt,
    }).catch(() => {
        // Lifecycle observers are non-blocking. The authoritative route checks
        // the persisted registry before returning any remote resource.
    });
}
/** Cordis plugin entry; the service registration is intentionally host-only. */
export function apply(ctx, config = {}) {
    const service = new UserScopeService(ctx, config);
    ctx.on('session/created', (session) => {
        registerLiveSession(service, session, ctx.workspaceRegistry);
    });
    // Recover ownership for sessions that were already live when this plugin
    // mounted. Persisted ownership remains authoritative on restart; a
    // collision is rejected by UserScopeRegistry rather than reassigned.
    for (const session of ctx.sessions.list()) {
        registerLiveSession(service, session, ctx.workspaceRegistry);
    }
}
