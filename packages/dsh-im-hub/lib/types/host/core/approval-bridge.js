import { randomUUID } from 'node:crypto';
import { isApprovalAuthorized } from "./access-policy.js";
const COMMAND_CLIP = 400;
export function summarizeToolRequest(request) {
    if (request.callId === undefined)
        return undefined;
    const events = request.agent.session?.snapshotEvents?.();
    if (!Array.isArray(events))
        return undefined;
    for (let i = events.length - 1; i >= 0; i -= 1) {
        const event = events[i];
        if (!event || event.type !== 'tool/call')
            continue;
        const data = event.data;
        if (String(data?.callId) !== String(request.callId))
            continue;
        const raw = data?.arguments;
        if (typeof raw !== 'string')
            return undefined;
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && typeof parsed.command === 'string') {
                return parsed.command.length <= COMMAND_CLIP
                    ? parsed.command
                    : `${parsed.command.slice(0, COMMAND_CLIP)}…`;
            }
        }
        catch {
            // Fallback to raw arguments string when payload is not valid JSON.
        }
        return raw.length <= COMMAND_CLIP ? raw : `${raw.slice(0, COMMAND_CLIP)}…`;
    }
    return undefined;
}
export class ApprovalBridge {
    pending = new Map();
    dualApproval = true;
    lookupBinding;
    onLog;
    constructor(options) {
        this.lookupBinding = options.lookupBinding;
        this.dualApproval = options.dualApproval ?? true;
        this.onLog = options.onLog;
    }
    setDualApproval(enabled) {
        this.dualApproval = enabled;
    }
    pendingCount() {
        return this.pending.size;
    }
    pendingForConversation(conversationKey) {
        const items = [];
        for (const entry of this.pending.values()) {
            if (entry.conversationKey !== conversationKey)
                continue;
            items.push({
                id: entry.id,
                toolName: entry.toolName,
                commandPreview: entry.commandPreview,
                createdAt: entry.createdAt,
            });
        }
        return items.sort((a, b) => b.createdAt - a.createdAt);
    }
    install(ctx) {
        const registrar = ctx;
        const dispose = registrar.on('approval/request', (request, next) => this.handleRequest(request, next), { global: true, prepend: true });
        return () => {
            dispose();
            this.disposeAll();
        };
    }
    async handleRequest(request, next) {
        const binding = this.lookupBinding(request.agent.id);
        if (!binding)
            return next();
        if (request.signal?.aborted)
            return 'cancelled';
        const id = randomUUID().replace(/-/g, '').slice(0, 6).toLowerCase();
        const commandPreview = summarizeToolRequest(request);
        let settle;
        const imDecision = new Promise((resolve) => {
            settle = resolve;
        });
        const entry = {
            id,
            conversationKey: binding.conversationKey,
            toolName: request.toolName,
            commandPreview,
            createdAt: Date.now(),
            resolve: settle,
            signal: request.signal,
        };
        if (request.signal) {
            const onAbort = () => this.finishEntry(id, 'cancelled');
            entry.onAbort = onAbort;
            request.signal.addEventListener('abort', onAbort, { once: true });
        }
        this.pending.set(id, entry);
        const lines = [
            `🔐 工具审批请求 [${id}]`,
            `工具: \`${request.toolName}\``,
            ...(commandPreview ? [`参数: \`${commandPreview}\``] : []),
            `回复 \`/approve ${id}\` 允许，或 \`/reject ${id}\` 拒绝${this.dualApproval ? '（也可直接在桌面端确认）' : ''}`,
        ];
        try {
            await binding.sendPrompt(lines.join('\n'));
        }
        catch (error) {
            this.onLog?.('warn', `failed to deliver IM approval [${id}]: ${error instanceof Error ? error.message : String(error)}`);
            this.cleanupEntry(id);
            if (this.dualApproval)
                return next();
            return 'unavailable';
        }
        try {
            if (this.dualApproval) {
                return await Promise.race([imDecision, next()]);
            }
            return await imDecision;
        }
        finally {
            this.cleanupEntry(id);
        }
    }
    resolveFromIm(conversationKey, approvalId, decision, senderId, policy) {
        if (!isApprovalAuthorized(senderId, policy)) {
            this.onLog?.('warn', `unauthorized approval attempt from ${senderId} on ${conversationKey}`);
            return { ok: false, message: '⚠️ 当前发送者不在白名单中，无权执行审批操作。' };
        }
        const candidates = this.pendingForConversation(conversationKey);
        if (candidates.length === 0) {
            return { ok: false, message: 'ℹ️ 当前会话没有等待确认的审批请求。' };
        }
        const normalizedId = approvalId?.trim().toLowerCase();
        const target = normalizedId
            ? candidates.find((item) => item.id === normalizedId)
            : candidates[0];
        if (!target) {
            return { ok: false, message: `⚠️ 未找到编号为 \`${approvalId}\` 的待审批请求。` };
        }
        const settled = this.finishEntry(target.id, decision);
        if (!settled) {
            return { ok: false, message: `ℹ️ 审批 [${target.id}] 已被桌面端或其他方式处理。` };
        }
        return {
            ok: true,
            id: target.id,
            toolName: target.toolName,
            message: decision === 'allowed-once'
                ? `✅ 已允许 [${target.id}] (\`${target.toolName}\`)`
                : `🛑 已拒绝 [${target.id}] (\`${target.toolName}\`)`,
        };
    }
    resolveById(approvalId, decision) {
        return this.finishEntry(approvalId.trim().toLowerCase(), decision);
    }
    cancelConversation(conversationKey) {
        for (const entry of [...this.pending.values()]) {
            if (entry.conversationKey === conversationKey) {
                this.finishEntry(entry.id, 'cancelled');
            }
        }
    }
    disposeAll() {
        for (const entry of [...this.pending.values()]) {
            this.finishEntry(entry.id, 'unavailable');
        }
    }
    finishEntry(id, outcome) {
        const entry = this.pending.get(id);
        if (!entry)
            return false;
        this.cleanupEntry(id);
        entry.resolve(outcome);
        return true;
    }
    cleanupEntry(id) {
        const entry = this.pending.get(id);
        if (!entry)
            return;
        this.pending.delete(id);
        if (entry.onAbort && entry.signal) {
            entry.signal.removeEventListener('abort', entry.onAbort);
        }
    }
}
