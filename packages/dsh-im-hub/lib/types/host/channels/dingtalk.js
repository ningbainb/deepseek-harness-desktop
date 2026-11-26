function defaultWebSocketFactory(url) {
    return new WebSocket(url);
}
export class DingTalkAdapter {
    id = 'dingtalk';
    getConfig;
    onMessage;
    onEvent;
    fetchImpl;
    webSocketFactory;
    tokenCache = null;
    ws = null;
    reconnectTimer = null;
    stopping = false;
    reconnectAttempts = 0;
    dedupIds = new Set();
    status = {
        id: 'dingtalk',
        enabled: false,
        state: 'disabled',
        messageCount: 0,
    };
    constructor(options) {
        this.getConfig = options.getConfig;
        this.onMessage = options.onMessage;
        this.onEvent = options.onEvent;
        this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
        this.webSocketFactory = options.webSocketFactory ?? defaultWebSocketFactory;
    }
    getStatus() {
        return { ...this.status };
    }
    async start() {
        await this.stop();
        const cfg = this.getConfig();
        this.stopping = false;
        if (!cfg.enabled) {
            this.status = { id: 'dingtalk', enabled: false, state: 'disabled', messageCount: this.status.messageCount };
            return;
        }
        if (!cfg.clientId || !cfg.clientSecret) {
            this.status = {
                id: 'dingtalk',
                enabled: true,
                state: 'error',
                lastError: 'missing clientId or clientSecret',
                messageCount: this.status.messageCount,
            };
            return;
        }
        this.status = {
            id: 'dingtalk',
            enabled: true,
            state: 'connecting',
            detail: 'opening dingtalk stream gateway',
            messageCount: this.status.messageCount,
        };
        try {
            const { endpoint, ticket } = await this.openGatewayConnection(cfg);
            if (this.stopping)
                return;
            const sep = endpoint.includes('?') ? '&' : '?';
            this.openWebSocket(`${endpoint}${sep}ticket=${encodeURIComponent(ticket)}`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.status = {
                id: 'dingtalk',
                enabled: true,
                state: 'error',
                lastError: message,
                messageCount: this.status.messageCount,
            };
            this.onEvent?.('error', `dingtalk start failed: ${message}`);
            this.scheduleReconnect();
        }
    }
    async stop() {
        this.stopping = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            const active = this.ws;
            this.ws = null;
            active.onopen = null;
            active.onmessage = null;
            active.onerror = null;
            active.onclose = null;
            try {
                active.close(1000, 'stopped');
            }
            catch {
                // Ignore close errors.
            }
        }
        this.tokenCache = null;
        const cfg = this.getConfig();
        this.status = {
            id: 'dingtalk',
            enabled: cfg.enabled,
            state: cfg.enabled ? 'idle' : 'disabled',
            messageCount: this.status.messageCount,
        };
    }
    async fetchAccessToken(cfg = this.getConfig()) {
        if (!cfg.clientId || !cfg.clientSecret) {
            throw new Error('dingtalk clientId and clientSecret are required');
        }
        const now = Date.now();
        if (this.tokenCache && now < this.tokenCache.expiresAt) {
            return this.tokenCache.token;
        }
        const response = await this.fetchImpl('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
            method: 'POST',
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                appKey: cfg.clientId,
                appSecret: cfg.clientSecret,
            }),
        });
        if (!response.ok) {
            throw new Error(`dingtalk token HTTP ${response.status}`);
        }
        const json = await response.json();
        if (!json.accessToken) {
            throw new Error(`dingtalk token error: ${json.message ?? 'missing accessToken'}`);
        }
        const ttlMs = Math.max(60, (json.expireIn ?? 7200) - 300) * 1000;
        this.tokenCache = {
            token: json.accessToken,
            expiresAt: now + ttlMs,
        };
        return json.accessToken;
    }
    async send(conversationId, reply) {
        const cfg = this.getConfig();
        const sessionWebhook = typeof reply.replyContext?.sessionWebhook === 'string'
            ? reply.replyContext.sessionWebhook
            : '';
        if (sessionWebhook) {
            const response = await this.fetchImpl(sessionWebhook, {
                method: 'POST',
                headers: { 'content-type': 'application/json; charset=utf-8' },
                body: JSON.stringify({
                    msgtype: 'markdown',
                    markdown: {
                        title: reply.title ?? 'DeepSeek Harness',
                        text: reply.text,
                    },
                }),
            });
            if (!response.ok) {
                throw new Error(`dingtalk sessionWebhook HTTP ${response.status}`);
            }
            return;
        }
        if (!cfg.robotCode) {
            throw new Error('dingtalk send requires sessionWebhook or robotCode');
        }
        const token = await this.fetchAccessToken(cfg);
        const response = await this.fetchImpl('https://api.dingtalk.com/v1.0/robot/groupMessages/send', {
            method: 'POST',
            headers: {
                'x-acs-dingtalk-access-token': token,
                'content-type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify({
                robotCode: cfg.robotCode,
                openConversationId: conversationId,
                msgKey: 'sampleMarkdown',
                msgParam: JSON.stringify({
                    title: reply.title ?? 'DeepSeek Harness',
                    text: reply.text,
                }),
            }),
        });
        if (!response.ok) {
            throw new Error(`dingtalk robot send HTTP ${response.status}`);
        }
    }
    async testConnection() {
        const cfg = this.getConfig();
        if (!cfg.clientId || !cfg.clientSecret) {
            return { ok: false, detail: 'Client ID 或 Client Secret 为空' };
        }
        try {
            this.tokenCache = null;
            await this.fetchAccessToken(cfg);
            return { ok: true, detail: '已成功通过钉钉 OAuth2 鉴权' };
        }
        catch (error) {
            return { ok: false, detail: error instanceof Error ? error.message : String(error) };
        }
    }
    async openGatewayConnection(cfg) {
        const response = await this.fetchImpl('https://api.dingtalk.com/v1.0/gateway/connections/open', {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'content-type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify({
                clientId: cfg.clientId,
                clientSecret: cfg.clientSecret,
                subscriptions: [
                    { type: 'EVENT', topic: '*' },
                    { type: 'CALLBACK', topic: '/v1.0/im/bot/messages/get' },
                ],
                ua: 'dsh-im-hub/0.1',
            }),
        });
        if (!response.ok) {
            throw new Error(`dingtalk gateway open HTTP ${response.status}`);
        }
        const json = await response.json();
        if (!json.endpoint || !json.ticket) {
            throw new Error(`dingtalk gateway invalid response: ${json.message ?? 'missing endpoint/ticket'}`);
        }
        return { endpoint: json.endpoint, ticket: json.ticket };
    }
    openWebSocket(url) {
        const ws = this.webSocketFactory(url);
        this.ws = ws;
        ws.onopen = () => {
            this.reconnectAttempts = 0;
            this.status = {
                id: 'dingtalk',
                enabled: true,
                state: 'connected',
                detail: 'stream connected',
                lastEventAt: Date.now(),
                messageCount: this.status.messageCount,
            };
            this.onEvent?.('info', 'dingtalk stream connected');
        };
        ws.onmessage = (event) => {
            if (typeof event.data !== 'string')
                return;
            void this.handleStreamFrame(ws, event.data);
        };
        ws.onerror = () => {
            this.status = {
                ...this.status,
                state: 'error',
                lastError: 'dingtalk stream socket error',
            };
        };
        ws.onclose = () => {
            if (!this.stopping) {
                this.status = {
                    ...this.status,
                    state: 'connecting',
                    detail: 'reconnecting',
                };
                this.scheduleReconnect();
            }
        };
    }
    scheduleReconnect() {
        if (this.stopping || this.reconnectTimer)
            return;
        const delayMs = Math.min(30_000, 1000 * Math.pow(2, this.reconnectAttempts));
        this.reconnectAttempts += 1;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (!this.stopping) {
                void this.start();
            }
        }, delayMs);
    }
    async handleStreamFrame(ws, raw) {
        let frame;
        try {
            frame = JSON.parse(raw);
        }
        catch {
            return;
        }
        const messageId = frame.headers?.messageId;
        const topic = frame.headers?.topic;
        if (frame.type === 'SYSTEM') {
            if (topic === 'ping') {
                ws.send(JSON.stringify({
                    code: 200,
                    headers: { messageId },
                    message: 'OK',
                    data: frame.data ?? '',
                }));
                return;
            }
            if (topic === 'disconnect') {
                try {
                    ws.close(1000, 'server disconnect');
                }
                catch {
                    // Ignore close error.
                }
            }
            return;
        }
        if (frame.type !== 'CALLBACK' || topic !== '/v1.0/im/bot/messages/get') {
            return;
        }
        ws.send(JSON.stringify({
            code: 200,
            headers: {
                contentType: 'application/json',
                messageId,
            },
            message: 'OK',
            data: '{}',
        }));
        if (!frame.data)
            return;
        let payload;
        try {
            payload = JSON.parse(frame.data);
        }
        catch {
            return;
        }
        const msgId = String(payload.msgId ?? messageId ?? '');
        const conversationId = String(payload.conversationId ?? payload.senderStaffId ?? payload.senderId ?? '');
        if (!msgId || !conversationId)
            return;
        if (this.recordSeen(msgId))
            return;
        const chatType = payload.conversationType === '2' ? 'group' : 'direct';
        const senderId = String(payload.senderStaffId ?? payload.senderId ?? 'unknown');
        const senderName = typeof payload.senderNick === 'string' ? payload.senderNick : undefined;
        const textObj = payload.text;
        const text = typeof textObj?.content === 'string'
            ? textObj.content.trim()
            : typeof payload.content === 'string'
                ? payload.content.trim()
                : '';
        const sessionWebhook = typeof payload.sessionWebhook === 'string' ? payload.sessionWebhook : undefined;
        this.status.lastEventAt = Date.now();
        this.status.messageCount += 1;
        await this.onMessage({
            channel: 'dingtalk',
            messageId: msgId,
            conversationId,
            chatType,
            senderId,
            senderName,
            text,
            mentioned: Boolean(payload.isInAtList) || chatType === 'direct',
            replyContext: sessionWebhook ? { sessionWebhook } : undefined,
            receivedAt: Date.now(),
        });
    }
    recordSeen(messageId) {
        if (this.dedupIds.has(messageId))
            return true;
        this.dedupIds.add(messageId);
        if (this.dedupIds.size > 512) {
            const oldest = this.dedupIds.values().next().value;
            if (oldest !== undefined)
                this.dedupIds.delete(oldest);
        }
        return false;
    }
}
