const deny = (reason) => ({ allowed: false, reason });
function workspaceExists(snapshot, workspaceId) {
    return snapshot.grants.some(item => item.workspaceId === workspaceId) || snapshot.sessions.some(item => item.workspaceId === workspaceId);
}
function hasWorkspaceGrant(snapshot, principalId, workspaceId) {
    return snapshot.grants.some(item => item.principalId === principalId && item.workspaceId === workspaceId && item.permission === 'use');
}
function hasSessionGrant(session, principalId) {
    return session.grantedPrincipalIds?.includes(principalId) === true;
}
function activeDevice(snapshot, scope) {
    if (scope.deviceId === undefined)
        return { ok: false, reason: 'missing-device' };
    const binding = snapshot.devices.find(item => item.deviceId === scope.deviceId);
    if (binding === undefined)
        return { ok: false, reason: 'unknown-device' };
    if (binding.revokedAt !== undefined)
        return { ok: false, reason: 'revoked-device' };
    if (binding.principalId !== scope.principalId)
        return { ok: false, reason: 'device-principal-mismatch' };
    return { ok: true };
}
/** Central authorization decision used by desktop and remote consumers. */
export function decideAccess(snapshot, localPrincipalId, scope, resource) {
    if (!snapshot.principals.some(item => item.id === scope.principalId))
        return deny('unknown-principal');
    if (scope.source === 'desktop') {
        if (scope.principalId !== localPrincipalId)
            return deny('other-principal');
        if (resource.kind === 'principal')
            return resource.principalId === localPrincipalId ? { allowed: true, reason: 'allowed' } : deny('other-principal');
        if (resource.kind === 'workspace')
            return workspaceExists(snapshot, resource.workspaceId) ? { allowed: true, reason: 'allowed' } : deny('unknown-resource');
        return snapshot.sessions.some(item => item.sessionId === resource.sessionId) ? { allowed: true, reason: 'allowed' } : deny('unknown-resource');
    }
    const device = activeDevice(snapshot, scope);
    if (!device.ok)
        return deny(device.reason);
    if (resource.kind === 'principal')
        return resource.principalId === scope.principalId ? { allowed: true, reason: 'allowed' } : deny('other-principal');
    if (resource.kind === 'workspace') {
        if (!workspaceExists(snapshot, resource.workspaceId))
            return deny('unknown-resource');
        return hasWorkspaceGrant(snapshot, scope.principalId, resource.workspaceId) ? { allowed: true, reason: 'allowed' } : deny('missing-workspace-grant');
    }
    const session = snapshot.sessions.find(item => item.sessionId === resource.sessionId);
    if (session === undefined)
        return deny('unknown-resource');
    if (session.createdByPrincipalId !== scope.principalId && !hasSessionGrant(session, scope.principalId))
        return deny('other-principal');
    if (session.workspaceId !== undefined && !hasWorkspaceGrant(snapshot, scope.principalId, session.workspaceId))
        return deny('missing-workspace-grant');
    return { allowed: true, reason: 'allowed' };
}
