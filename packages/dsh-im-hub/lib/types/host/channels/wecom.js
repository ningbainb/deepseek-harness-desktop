import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
export function computeWeComSignature(token, timestamp, nonce, encrypt = '') {
    const parts = encrypt
        ? [token, timestamp, nonce, encrypt]
        : [token, timestamp, nonce];
    parts.sort();
    return createHash('sha1').update(parts.join(''), 'utf8').digest('hex');
}
export function verifyWeComSignature(expectedSig, token, timestamp, nonce, encrypt = '') {
    if (!expectedSig || !token || !timestamp || !nonce)
        return false;
    const actual = computeWeComSignature(token, timestamp, nonce, encrypt);
    const a = Buffer.from(actual, 'utf8');
    const b = Buffer.from(expectedSig.trim(), 'utf8');
    if (a.length !== b.length)
        return false;
    return timingSafeEqual(a, b);
}
function decodeWeComAesKey(encodingAesKey) {
    const trimmed = encodingAesKey.trim();
    const key = Buffer.from(trimmed.endsWith('=') ? trimmed : `${trimmed}=`, 'base64');
    if (key.length !== 32) {
        throw new Error('wecom encodingAesKey must decode to 32 bytes');
    }
    return { key, iv: key.subarray(0, 16) };
}
function pkcs7Unpad(buf) {
    if (buf.length === 0)
        throw new Error('empty plaintext buffer');
    const pad = buf[buf.length - 1];
    if (pad < 1 || pad > 32 || pad > buf.length) {
        throw new Error('invalid PKCS#7 padding');
    }
    return buf.subarray(0, buf.length - pad);
}
function pkcs7Pad(buf, blockSize = 32) {
    const remainder = buf.length % blockSize;
    const pad = remainder === 0 ? blockSize : blockSize - remainder;
    return Buffer.concat([buf, Buffer.alloc(pad, pad)]);
}
export function decryptWeComPayload(encodingAesKey, cipherBase64) {
    const { key, iv } = decodeWeComAesKey(encodingAesKey);
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    decipher.setAutoPadding(false);
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(cipherBase64, 'base64')),
        decipher.final(),
    ]);
    const unpadded = pkcs7Unpad(decrypted);
    if (unpadded.length < 20) {
        throw new Error('wecom decrypted payload too short');
    }
    const msgLength = unpadded.readUInt32BE(16);
    const msgEnd = 20 + msgLength;
    if (msgEnd > unpadded.length) {
        throw new Error('wecom message length out of bounds');
    }
    const message = unpadded.subarray(20, msgEnd).toString('utf8');
    const receiveId = unpadded.subarray(msgEnd).toString('utf8');
    return { message, receiveId };
}
export function encryptWeComPayload(encodingAesKey, plainText, corpId) {
    const { key, iv } = decodeWeComAesKey(encodingAesKey);
    const randomPrefix = randomBytes(16);
    const msgBuf = Buffer.from(plainText, 'utf8');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(msgBuf.length, 0);
    const corpBuf = Buffer.from(corpId, 'utf8');
    const padded = pkcs7Pad(Buffer.concat([randomPrefix, lenBuf, msgBuf, corpBuf]), 32);
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64');
}
export function extractXmlTag(xml, tag) {
    const cdataRe = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
    const cdataMatch = xml.match(cdataRe);
    if (cdataMatch)
        return cdataMatch[1];
    const plainRe = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const plainMatch = xml.match(plainRe);
    return plainMatch ? plainMatch[1].trim() : undefined;
}
export class WeComAdapter {
    id = 'wecom';
    getConfig;
    onMessage;
    onEvent;
    fetchImpl;
    tokenCache = null;
    dedupIds = new Set();
    status = {
        id: 'wecom',
        enabled: false,
        state: 'disabled',
        messageCount: 0,
    };
    constructor(options) {
        this.getConfig = options.getConfig;
        this.onMessage = options.onMessage;
        this.onEvent = options.onEvent;
        this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    }
    getStatus() {
        return { ...this.status };
    }
    async start() {
        const cfg = this.getConfig();
        if (!cfg.enabled) {
            this.status = { id: 'wecom', enabled: false, state: 'disabled', messageCount: this.status.messageCount };
            return;
        }
        if (cfg.mode === 'webhook') {
            if (!cfg.webhookUrl) {
                this.status = {
                    id: 'wecom',
                    enabled: true,
                    state: 'error',
                    lastError: 'missing webhookUrl',
                    messageCount: this.status.messageCount,
                };
                return;
            }
            this.status = {
                id: 'wecom',
                enabled: true,
                state: 'webhook-ready',
                detail: 'group robot webhook ready',
                messageCount: this.status.messageCount,
            };
            return;
        }
        if (!cfg.corpId || !cfg.corpSecret) {
            this.status = {
                id: 'wecom',
                enabled: true,
                state: 'error',
                lastError: 'missing corpId or corpSecret',
                messageCount: this.status.messageCount,
            };
            return;
        }
        this.status = {
            id: 'wecom',
            enabled: true,
            state: 'webhook-ready',
            detail: 'wecom app callback ready',
            messageCount: this.status.messageCount,
        };
    }
    async stop() {
        this.tokenCache = null;
        const cfg = this.getConfig();
        this.status = {
            id: 'wecom',
            enabled: cfg.enabled,
            state: cfg.enabled ? 'idle' : 'disabled',
            messageCount: this.status.messageCount,
        };
    }
    async fetchAccessToken(cfg = this.getConfig()) {
        if (!cfg.corpId || !cfg.corpSecret) {
            throw new Error('wecom corpId and corpSecret are required');
        }
        const now = Date.now();
        if (this.tokenCache && now < this.tokenCache.expiresAt) {
            return this.tokenCache.token;
        }
        const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(cfg.corpId)}&corpsecret=${encodeURIComponent(cfg.corpSecret)}`;
        const response = await this.fetchImpl(url, { method: 'GET' });
        if (!response.ok) {
            throw new Error(`wecom gettoken HTTP ${response.status}`);
        }
        const data = await response.json();
        if ((data.errcode !== undefined && data.errcode !== 0) || !data.access_token) {
            throw new Error(`wecom gettoken error: ${data.errmsg ?? data.errcode ?? 'missing token'}`);
        }
        const ttlMs = Math.max(60, (data.expires_in ?? 7200) - 300) * 1000;
        this.tokenCache = { token: data.access_token, expiresAt: now + ttlMs };
        return data.access_token;
    }
    async send(conversationId, reply) {
        const cfg = this.getConfig();
        if (cfg.mode === 'webhook') {
            if (!cfg.webhookUrl)
                throw new Error('wecom webhookUrl is empty');
            const response = await this.fetchImpl(cfg.webhookUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json; charset=utf-8' },
                body: JSON.stringify({
                    msgtype: 'markdown',
                    markdown: { content: reply.text },
                }),
            });
            if (!response.ok) {
                throw new Error(`wecom webhook send HTTP ${response.status}`);
            }
            const data = await response.json().catch(() => ({}));
            if (data.errcode !== undefined && data.errcode !== 0) {
                throw new Error(`wecom webhook error: ${data.errmsg ?? data.errcode}`);
            }
            return;
        }
        const token = await this.fetchAccessToken(cfg);
        const agentId = Number(cfg.agentId || 0);
        const isGroup = conversationId.startsWith('group:') || Boolean(reply.replyContext?.chatId);
        const chatId = typeof reply.replyContext?.chatId === 'string'
            ? reply.replyContext.chatId
            : conversationId.replace(/^group:/, '');
        const endpoint = isGroup
            ? `https://qyapi.weixin.qq.com/cgi-bin/appchat/send?access_token=${encodeURIComponent(token)}`
            : `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`;
        const payload = isGroup
            ? { chatid: chatId, msgtype: 'markdown', markdown: { content: reply.text } }
            : { touser: conversationId, agentid: agentId, msgtype: 'markdown', markdown: { content: reply.text } };
        const response = await this.fetchImpl(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            throw new Error(`wecom app send HTTP ${response.status}`);
        }
        const data = await response.json();
        if (data.errcode !== undefined && data.errcode !== 0) {
            throw new Error(`wecom app send error: ${data.errmsg ?? data.errcode}`);
        }
    }
    async handleWebhook(req) {
        const cfg = this.getConfig();
        if (!cfg.enabled) {
            return { status: 404, body: JSON.stringify({ error: 'wecom channel disabled' }) };
        }
        if (cfg.mode !== 'app') {
            return { status: 400, body: JSON.stringify({ error: 'callback only supported in app mode' }) };
        }
        if (!cfg.token || !cfg.encodingAesKey) {
            return { status: 500, body: JSON.stringify({ error: 'wecom token/encodingAesKey not configured' }) };
        }
        const url = new URL(req.url, 'http://localhost');
        const msgSignature = url.searchParams.get('msg_signature') ?? '';
        const timestamp = url.searchParams.get('timestamp') ?? '';
        const nonce = url.searchParams.get('nonce') ?? '';
        const method = req.method.toUpperCase();
        if (method === 'GET') {
            const echostr = url.searchParams.get('echostr') ?? '';
            if (!verifyWeComSignature(msgSignature, cfg.token, timestamp, nonce, echostr)) {
                return { status: 401, body: 'invalid signature' };
            }
            try {
                const decrypted = decryptWeComPayload(cfg.encodingAesKey, echostr);
                if (cfg.corpId && decrypted.receiveId && decrypted.receiveId !== cfg.corpId) {
                    return { status: 403, body: 'corpId mismatch' };
                }
                return {
                    status: 200,
                    headers: { 'content-type': 'text/plain; charset=utf-8' },
                    body: decrypted.message,
                };
            }
            catch {
                return { status: 400, body: 'invalid echostr' };
            }
        }
        if (method !== 'POST') {
            return { status: 405, body: 'method not allowed' };
        }
        let encrypted = extractXmlTag(req.rawBody, 'Encrypt');
        if (!encrypted && req.rawBody.trim().startsWith('{')) {
            try {
                const parsed = JSON.parse(req.rawBody);
                encrypted = parsed.Encrypt;
            }
            catch {
                // Ignore invalid JSON.
            }
        }
        if (!encrypted) {
            return { status: 400, body: 'missing Encrypt field' };
        }
        if (!verifyWeComSignature(msgSignature, cfg.token, timestamp, nonce, encrypted)) {
            return { status: 401, body: 'invalid signature' };
        }
        try {
            const { message, receiveId } = decryptWeComPayload(cfg.encodingAesKey, encrypted);
            if (cfg.corpId && receiveId && receiveId !== cfg.corpId) {
                return { status: 403, body: 'corpId mismatch' };
            }
            const msgId = extractXmlTag(message, 'MsgId') ?? `${timestamp}:${nonce}`;
            if (!this.recordSeen(msgId)) {
                const fromUser = extractXmlTag(message, 'FromUserName') ?? 'unknown';
                const chatId = extractXmlTag(message, 'ChatId');
                const content = (extractXmlTag(message, 'Content') ?? '').trim();
                const isGroup = Boolean(chatId);
                this.status.lastEventAt = Date.now();
                this.status.messageCount += 1;
                await this.onMessage({
                    channel: 'wecom',
                    messageId: msgId,
                    conversationId: isGroup ? `group:${chatId}` : fromUser,
                    chatType: isGroup ? 'group' : 'direct',
                    senderId: fromUser,
                    text: content,
                    mentioned: true,
                    replyContext: chatId ? { chatId } : undefined,
                    receivedAt: Date.now(),
                });
            }
            return {
                status: 200,
                headers: { 'content-type': 'text/plain; charset=utf-8' },
                body: 'success',
            };
        }
        catch (error) {
            this.onEvent?.('error', `wecom callback decrypt failed: ${error instanceof Error ? error.message : String(error)}`);
            return { status: 400, body: 'invalid encrypted payload' };
        }
    }
    async testConnection() {
        const cfg = this.getConfig();
        if (cfg.mode === 'webhook') {
            if (!cfg.webhookUrl) {
                return { ok: false, detail: '群机器人 Webhook URL 为空' };
            }
            try {
                const parsed = new URL(cfg.webhookUrl);
                if (!['https:', 'http:'].includes(parsed.protocol)) {
                    return { ok: false, detail: 'Webhook URL 协议必须为 http/https' };
                }
                return { ok: true, detail: `企微群机器人 Webhook URL 格式校验通过 (${parsed.host})` };
            }
            catch {
                return { ok: false, detail: 'Webhook URL 格式无效' };
            }
        }
        if (!cfg.corpId || !cfg.corpSecret) {
            return { ok: false, detail: 'CorpID 或 CorpSecret 为空' };
        }
        try {
            this.tokenCache = null;
            await this.fetchAccessToken(cfg);
            return { ok: true, detail: '已成功通过企业微信自建应用鉴权' };
        }
        catch (error) {
            return { ok: false, detail: error instanceof Error ? error.message : String(error) };
        }
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
