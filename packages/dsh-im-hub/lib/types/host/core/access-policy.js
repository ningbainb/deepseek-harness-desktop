function matchesAllowlist(candidate, list) {
    if (!candidate)
        return false;
    for (const item of list) {
        if (item === '*' || item === candidate)
            return true;
    }
    return false;
}
export function evaluateAccess(message, policy) {
    if (message.chatType === 'group' && policy.groupMentionOnly && !message.mentioned) {
        return { allowed: false, reason: 'mention-required' };
    }
    if (policy.mode === 'open') {
        return { allowed: true };
    }
    if (message.chatType === 'direct') {
        return matchesAllowlist(message.senderId, policy.allowUsers)
            ? { allowed: true }
            : { allowed: false, reason: 'sender-not-allowed' };
    }
    if (!matchesAllowlist(message.conversationId, policy.allowGroups)) {
        return { allowed: false, reason: 'group-not-allowed' };
    }
    if (policy.allowUsers.length > 0 && !matchesAllowlist(message.senderId, policy.allowUsers)) {
        return { allowed: false, reason: 'sender-not-allowed' };
    }
    return { allowed: true };
}
export function isApprovalAuthorized(senderId, policy) {
    if (!senderId)
        return false;
    if (policy.mode === 'open')
        return true;
    return matchesAllowlist(senderId, policy.allowUsers);
}
