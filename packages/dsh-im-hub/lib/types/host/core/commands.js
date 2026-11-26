function stripLeadingMentions(text) {
    return text
        .replace(/^(?:<at[^>]*>.*?<\/at>\s*|@\S+\s*)+/iu, '')
        .trim();
}
export function parseControlCommand(rawText) {
    const cleaned = stripLeadingMentions(rawText);
    if (!cleaned.startsWith('/'))
        return null;
    const [rawHead, ...rest] = cleaned.split(/\s+/);
    const head = (rawHead ?? '').toLowerCase();
    const arg = rest.join(' ').trim() || undefined;
    switch (head) {
        case '/new':
        case '/reset':
            return { kind: 'new' };
        case '/stop':
        case '/cancel':
            return { kind: 'stop' };
        case '/status':
            return { kind: 'status' };
        case '/help':
            return { kind: 'help' };
        case '/approve':
        case '/allow':
            return { kind: 'approve', approvalId: arg };
        case '/reject':
        case '/deny':
            return { kind: 'reject', approvalId: arg };
        case '/workspace':
        case '/ws':
            return { kind: 'workspace', path: arg };
        default:
            return null;
    }
}
export function splitMessageChunks(text, maxChars = 3500) {
    const limit = Math.max(500, Math.min(16000, Math.round(maxChars)));
    const normalized = text.trim();
    if (!normalized)
        return [];
    if (normalized.length <= limit)
        return [normalized];
    const chunks = [];
    let remaining = normalized;
    let openFence = null;
    while (remaining.length > limit) {
        const window = remaining.slice(0, limit);
        let splitAt = window.lastIndexOf('\n\n');
        if (splitAt < Math.floor(limit * 0.45)) {
            splitAt = window.lastIndexOf('\n');
        }
        if (splitAt < Math.floor(limit * 0.3)) {
            splitAt = window.lastIndexOf(' ');
        }
        if (splitAt <= 0) {
            splitAt = limit;
        }
        let piece = remaining.slice(0, splitAt).trimEnd();
        if (!piece) {
            piece = remaining.slice(0, limit);
            splitAt = limit;
        }
        // Track whether a markdown code fence stays open across the chunk boundary.
        const fenceMatches = piece.match(/```[^\n]*/g) ?? [];
        for (const marker of fenceMatches) {
            openFence = openFence === null ? marker : null;
        }
        if (openFence !== null) {
            piece = `${piece}\n\`\`\``;
        }
        chunks.push(piece);
        remaining = remaining.slice(splitAt).trimStart();
        if (openFence !== null && remaining.length > 0) {
            remaining = `${openFence}\n${remaining}`;
        }
        openFence = null;
    }
    if (remaining.length > 0) {
        chunks.push(remaining);
    }
    return chunks;
}
export function formatHelpMessage(channel) {
    return [
        `🤖 DSH IM Hub (${channel}) 命令帮助`,
        '- `/new` — 开启新对话上下文',
        '- `/stop` — 中止当前正在生成的回复',
        '- `/status` — 查看当前会话与工作区状态',
        '- `/workspace <路径>` — 切换或查看当前绑定工作区',
        '- `/approve [编号]` — 允许待审工具调用',
        '- `/reject [编号]` — 拒绝待审工具调用',
        '- `/help` — 显示本帮助',
    ].join('\n');
}
