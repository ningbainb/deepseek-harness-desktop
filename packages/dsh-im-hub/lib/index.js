import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
//#region src/core/host-types.ts
function getHostService(ctx, name) {
	const candidate = ctx;
	try {
		return candidate.get?.(name) ?? candidate[name];
	} catch {
		return;
	}
}
//#endregion
//#region src/core/settings.ts
const PACKAGE_ID = "@ningbainb/dsh-im-hub";
const ROUTE_PREFIX = "/api/dsh-im-hub";
const SETTINGS_FILE = "im-hub.json";
const SECRET_MASK = "••••••••";
const CHANNEL_IDS = [
	"feishu",
	"dingtalk",
	"wecom",
	"webhook"
];
function defaultAccessPolicy() {
	return {
		mode: "allowlist",
		allowUsers: [],
		allowGroups: [],
		groupMentionOnly: true
	};
}
function defaultSettings() {
	return {
		version: 1,
		enabled: false,
		busyMode: "queue",
		dualApproval: true,
		maxReplyChars: 3500,
		defaultWorkspacePath: "",
		channels: {
			feishu: {
				enabled: false,
				appId: "",
				appSecret: "",
				domain: "feishu",
				access: defaultAccessPolicy()
			},
			dingtalk: {
				enabled: false,
				clientId: "",
				clientSecret: "",
				robotCode: "",
				access: defaultAccessPolicy()
			},
			wecom: {
				enabled: false,
				mode: "webhook",
				webhookUrl: "",
				corpId: "",
				corpSecret: "",
				agentId: "",
				token: "",
				encodingAesKey: "",
				access: defaultAccessPolicy()
			},
			webhook: {
				enabled: false,
				signingSecret: "",
				outboundUrl: "",
				outboundHeaders: {},
				replayWindowSec: 300,
				access: defaultAccessPolicy()
			}
		}
	};
}
function asRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function asTrimmedString(value, fallback = "") {
	return typeof value === "string" ? value.trim() : fallback;
}
function mergeSecret(incoming, existing) {
	if (typeof incoming !== "string") return existing ?? "";
	const trimmed = incoming.trim();
	if (trimmed === "••••••••") return existing ?? "";
	return trimmed;
}
function normalizeStringList(value) {
	if (!Array.isArray(value)) return [];
	const seen = /* @__PURE__ */ new Set();
	const output = [];
	for (const item of value) {
		if (typeof item !== "string") continue;
		const trimmed = item.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		output.push(trimmed);
	}
	return output;
}
function normalizeHeaders(value) {
	const raw = asRecord(value);
	const out = {};
	for (const [key, val] of Object.entries(raw)) {
		const k = key.trim();
		if (!k || typeof val !== "string") continue;
		out[k] = val.trim();
	}
	return out;
}
function normalizeAccessPolicy(raw, fallback) {
	const rec = asRecord(raw);
	const mode = rec.mode === "open" ? "open" : fallback.mode;
	return {
		mode: rec.mode === "open" || rec.mode === "allowlist" ? rec.mode : mode,
		allowUsers: Array.isArray(rec.allowUsers) ? normalizeStringList(rec.allowUsers) : [...fallback.allowUsers],
		allowGroups: Array.isArray(rec.allowGroups) ? normalizeStringList(rec.allowGroups) : [...fallback.allowGroups],
		groupMentionOnly: typeof rec.groupMentionOnly === "boolean" ? rec.groupMentionOnly : fallback.groupMentionOnly
	};
}
function clampInteger(value, fallback, min, max) {
	const num = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(num)) return fallback;
	return Math.max(min, Math.min(max, Math.round(num)));
}
function isMaskedSecretWebhookUrl(url) {
	const qIndex = url.indexOf("?");
	if (qIndex < 0) return false;
	return url.slice(qIndex).includes(SECRET_MASK);
}
function normalizeSettings(raw, existing) {
	const problems = [];
	const base = existing ? structuredCloneSafe(existing) : defaultSettings();
	const rec = asRecord(raw);
	const rawChannels = asRecord(rec.channels);
	const feishuRaw = asRecord(rawChannels.feishu);
	const dingtalkRaw = asRecord(rawChannels.dingtalk);
	const wecomRaw = asRecord(rawChannels.wecom);
	const webhookRaw = asRecord(rawChannels.webhook);
	const incomingWebhookUrl = typeof wecomRaw.webhookUrl === "string" ? wecomRaw.webhookUrl.trim() : void 0;
	const mergedWeComWebhookUrl = incomingWebhookUrl === void 0 ? base.channels.wecom.webhookUrl : incomingWebhookUrl === "••••••••" || isMaskedSecretWebhookUrl(incomingWebhookUrl) ? base.channels.wecom.webhookUrl : incomingWebhookUrl;
	const settings = {
		version: 1,
		enabled: typeof rec.enabled === "boolean" ? rec.enabled : base.enabled,
		busyMode: rec.busyMode === "steer" || rec.busyMode === "queue" ? rec.busyMode : base.busyMode,
		dualApproval: typeof rec.dualApproval === "boolean" ? rec.dualApproval : base.dualApproval,
		maxReplyChars: clampInteger(rec.maxReplyChars, base.maxReplyChars, 500, 16e3),
		defaultWorkspacePath: typeof rec.defaultWorkspacePath === "string" ? rec.defaultWorkspacePath.trim() : base.defaultWorkspacePath,
		channels: {
			feishu: {
				enabled: typeof feishuRaw.enabled === "boolean" ? feishuRaw.enabled : base.channels.feishu.enabled,
				appId: asTrimmedString(feishuRaw.appId, base.channels.feishu.appId),
				appSecret: mergeSecret(feishuRaw.appSecret, base.channels.feishu.appSecret),
				domain: feishuRaw.domain === "lark" || feishuRaw.domain === "feishu" ? feishuRaw.domain : base.channels.feishu.domain,
				access: normalizeAccessPolicy(feishuRaw.access, base.channels.feishu.access)
			},
			dingtalk: {
				enabled: typeof dingtalkRaw.enabled === "boolean" ? dingtalkRaw.enabled : base.channels.dingtalk.enabled,
				clientId: asTrimmedString(dingtalkRaw.clientId, base.channels.dingtalk.clientId),
				clientSecret: mergeSecret(dingtalkRaw.clientSecret, base.channels.dingtalk.clientSecret),
				robotCode: asTrimmedString(dingtalkRaw.robotCode, base.channels.dingtalk.robotCode),
				access: normalizeAccessPolicy(dingtalkRaw.access, base.channels.dingtalk.access)
			},
			wecom: {
				enabled: typeof wecomRaw.enabled === "boolean" ? wecomRaw.enabled : base.channels.wecom.enabled,
				mode: wecomRaw.mode === "app" || wecomRaw.mode === "webhook" ? wecomRaw.mode : base.channels.wecom.mode,
				webhookUrl: mergedWeComWebhookUrl,
				corpId: asTrimmedString(wecomRaw.corpId, base.channels.wecom.corpId),
				corpSecret: mergeSecret(wecomRaw.corpSecret, base.channels.wecom.corpSecret),
				agentId: asTrimmedString(wecomRaw.agentId, base.channels.wecom.agentId),
				token: mergeSecret(wecomRaw.token, base.channels.wecom.token),
				encodingAesKey: mergeSecret(wecomRaw.encodingAesKey, base.channels.wecom.encodingAesKey),
				access: normalizeAccessPolicy(wecomRaw.access, base.channels.wecom.access)
			},
			webhook: {
				enabled: typeof webhookRaw.enabled === "boolean" ? webhookRaw.enabled : base.channels.webhook.enabled,
				signingSecret: mergeSecret(webhookRaw.signingSecret, base.channels.webhook.signingSecret),
				outboundUrl: asTrimmedString(webhookRaw.outboundUrl, base.channels.webhook.outboundUrl),
				outboundHeaders: webhookRaw.outboundHeaders !== void 0 ? normalizeHeaders(webhookRaw.outboundHeaders) : { ...base.channels.webhook.outboundHeaders },
				replayWindowSec: clampInteger(webhookRaw.replayWindowSec, base.channels.webhook.replayWindowSec, 30, 3600),
				access: normalizeAccessPolicy(webhookRaw.access, base.channels.webhook.access)
			}
		}
	};
	if (settings.channels.feishu.enabled && (!settings.channels.feishu.appId || !settings.channels.feishu.appSecret)) problems.push("feishu: appId and appSecret are recommended when enabled");
	if (settings.channels.dingtalk.enabled && (!settings.channels.dingtalk.clientId || !settings.channels.dingtalk.clientSecret)) problems.push("dingtalk: clientId and clientSecret are recommended when enabled");
	if (settings.channels.wecom.enabled) {
		if (settings.channels.wecom.mode === "webhook" && !settings.channels.wecom.webhookUrl) problems.push("wecom: webhookUrl is recommended in webhook mode");
		if (settings.channels.wecom.mode === "app" && (!settings.channels.wecom.corpId || !settings.channels.wecom.corpSecret)) problems.push("wecom: corpId and corpSecret are recommended in app mode");
	}
	if (settings.channels.webhook.enabled && !settings.channels.webhook.signingSecret) problems.push("webhook: signingSecret is required for inbound verification");
	return {
		settings,
		problems
	};
}
function maskSecret(value) {
	return value.trim() === "" ? "" : SECRET_MASK;
}
function maskWebhookUrl(url) {
	const trimmed = url.trim();
	if (!trimmed) return "";
	const keyIndex = trimmed.indexOf("key=");
	if (keyIndex < 0) return trimmed;
	const prefix = trimmed.slice(0, keyIndex + 4);
	const rest = trimmed.slice(keyIndex + 4);
	const ampIndex = rest.indexOf("&");
	const suffix = ampIndex >= 0 ? rest.slice(ampIndex) : "";
	return `${prefix}${SECRET_MASK}${suffix}`;
}
function redactSettingsForClient(settings) {
	const cloned = structuredCloneSafe(settings);
	cloned.channels.feishu.appSecret = maskSecret(cloned.channels.feishu.appSecret);
	cloned.channels.dingtalk.clientSecret = maskSecret(cloned.channels.dingtalk.clientSecret);
	cloned.channels.wecom.corpSecret = maskSecret(cloned.channels.wecom.corpSecret);
	cloned.channels.wecom.token = maskSecret(cloned.channels.wecom.token);
	cloned.channels.wecom.encodingAesKey = maskSecret(cloned.channels.wecom.encodingAesKey);
	cloned.channels.wecom.webhookUrl = maskWebhookUrl(cloned.channels.wecom.webhookUrl);
	cloned.channels.webhook.signingSecret = maskSecret(cloned.channels.webhook.signingSecret);
	return cloned;
}
function structuredCloneSafe(value) {
	return JSON.parse(JSON.stringify(value));
}
//#endregion
//#region src/host/channels/dingtalk.ts
function defaultWebSocketFactory$1(url) {
	return new WebSocket(url);
}
var DingTalkAdapter = class {
	id = "dingtalk";
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
	dedupIds = /* @__PURE__ */ new Set();
	status = {
		id: "dingtalk",
		enabled: false,
		state: "disabled",
		messageCount: 0
	};
	constructor(options) {
		this.getConfig = options.getConfig;
		this.onMessage = options.onMessage;
		this.onEvent = options.onEvent;
		this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
		this.webSocketFactory = options.webSocketFactory ?? defaultWebSocketFactory$1;
	}
	getStatus() {
		return { ...this.status };
	}
	async start() {
		await this.stop();
		const cfg = this.getConfig();
		this.stopping = false;
		if (!cfg.enabled) {
			this.status = {
				id: "dingtalk",
				enabled: false,
				state: "disabled",
				messageCount: this.status.messageCount
			};
			return;
		}
		if (!cfg.clientId || !cfg.clientSecret) {
			this.status = {
				id: "dingtalk",
				enabled: true,
				state: "error",
				lastError: "missing clientId or clientSecret",
				messageCount: this.status.messageCount
			};
			return;
		}
		this.status = {
			id: "dingtalk",
			enabled: true,
			state: "connecting",
			detail: "opening dingtalk stream gateway",
			messageCount: this.status.messageCount
		};
		try {
			const { endpoint, ticket } = await this.openGatewayConnection(cfg);
			if (this.stopping) return;
			const sep = endpoint.includes("?") ? "&" : "?";
			this.openWebSocket(`${endpoint}${sep}ticket=${encodeURIComponent(ticket)}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.status = {
				id: "dingtalk",
				enabled: true,
				state: "error",
				lastError: message,
				messageCount: this.status.messageCount
			};
			this.onEvent?.("error", `dingtalk start failed: ${message}`);
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
				active.close(1e3, "stopped");
			} catch {}
		}
		this.tokenCache = null;
		const cfg = this.getConfig();
		this.status = {
			id: "dingtalk",
			enabled: cfg.enabled,
			state: cfg.enabled ? "idle" : "disabled",
			messageCount: this.status.messageCount
		};
	}
	async fetchAccessToken(cfg = this.getConfig()) {
		if (!cfg.clientId || !cfg.clientSecret) throw new Error("dingtalk clientId and clientSecret are required");
		const now = Date.now();
		if (this.tokenCache && now < this.tokenCache.expiresAt) return this.tokenCache.token;
		const response = await this.fetchImpl("https://api.dingtalk.com/v1.0/oauth2/accessToken", {
			method: "POST",
			headers: { "content-type": "application/json; charset=utf-8" },
			body: JSON.stringify({
				appKey: cfg.clientId,
				appSecret: cfg.clientSecret
			})
		});
		if (!response.ok) throw new Error(`dingtalk token HTTP ${response.status}`);
		const json = await response.json();
		if (!json.accessToken) throw new Error(`dingtalk token error: ${json.message ?? "missing accessToken"}`);
		const ttlMs = Math.max(60, (json.expireIn ?? 7200) - 300) * 1e3;
		this.tokenCache = {
			token: json.accessToken,
			expiresAt: now + ttlMs
		};
		return json.accessToken;
	}
	async send(conversationId, reply) {
		const cfg = this.getConfig();
		const sessionWebhook = typeof reply.replyContext?.sessionWebhook === "string" ? reply.replyContext.sessionWebhook : "";
		if (sessionWebhook) {
			const response = await this.fetchImpl(sessionWebhook, {
				method: "POST",
				headers: { "content-type": "application/json; charset=utf-8" },
				body: JSON.stringify({
					msgtype: "markdown",
					markdown: {
						title: reply.title ?? "DeepSeek Harness",
						text: reply.text
					}
				})
			});
			if (!response.ok) throw new Error(`dingtalk sessionWebhook HTTP ${response.status}`);
			return;
		}
		if (!cfg.robotCode) throw new Error("dingtalk send requires sessionWebhook or robotCode");
		const token = await this.fetchAccessToken(cfg);
		const response = await this.fetchImpl("https://api.dingtalk.com/v1.0/robot/groupMessages/send", {
			method: "POST",
			headers: {
				"x-acs-dingtalk-access-token": token,
				"content-type": "application/json; charset=utf-8"
			},
			body: JSON.stringify({
				robotCode: cfg.robotCode,
				openConversationId: conversationId,
				msgKey: "sampleMarkdown",
				msgParam: JSON.stringify({
					title: reply.title ?? "DeepSeek Harness",
					text: reply.text
				})
			})
		});
		if (!response.ok) throw new Error(`dingtalk robot send HTTP ${response.status}`);
	}
	async testConnection() {
		const cfg = this.getConfig();
		if (!cfg.clientId || !cfg.clientSecret) return {
			ok: false,
			detail: "Client ID 或 Client Secret 为空"
		};
		try {
			this.tokenCache = null;
			await this.fetchAccessToken(cfg);
			return {
				ok: true,
				detail: "已成功通过钉钉 OAuth2 鉴权"
			};
		} catch (error) {
			return {
				ok: false,
				detail: error instanceof Error ? error.message : String(error)
			};
		}
	}
	async openGatewayConnection(cfg) {
		const response = await this.fetchImpl("https://api.dingtalk.com/v1.0/gateway/connections/open", {
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/json; charset=utf-8"
			},
			body: JSON.stringify({
				clientId: cfg.clientId,
				clientSecret: cfg.clientSecret,
				subscriptions: [{
					type: "EVENT",
					topic: "*"
				}, {
					type: "CALLBACK",
					topic: "/v1.0/im/bot/messages/get"
				}],
				ua: "dsh-im-hub/0.1"
			})
		});
		if (!response.ok) throw new Error(`dingtalk gateway open HTTP ${response.status}`);
		const json = await response.json();
		if (!json.endpoint || !json.ticket) throw new Error(`dingtalk gateway invalid response: ${json.message ?? "missing endpoint/ticket"}`);
		return {
			endpoint: json.endpoint,
			ticket: json.ticket
		};
	}
	openWebSocket(url) {
		const ws = this.webSocketFactory(url);
		this.ws = ws;
		ws.onopen = () => {
			this.reconnectAttempts = 0;
			this.status = {
				id: "dingtalk",
				enabled: true,
				state: "connected",
				detail: "stream connected",
				lastEventAt: Date.now(),
				messageCount: this.status.messageCount
			};
			this.onEvent?.("info", "dingtalk stream connected");
		};
		ws.onmessage = (event) => {
			if (typeof event.data !== "string") return;
			this.handleStreamFrame(ws, event.data);
		};
		ws.onerror = () => {
			this.status = {
				...this.status,
				state: "error",
				lastError: "dingtalk stream socket error"
			};
		};
		ws.onclose = () => {
			if (!this.stopping) {
				this.status = {
					...this.status,
					state: "connecting",
					detail: "reconnecting"
				};
				this.scheduleReconnect();
			}
		};
	}
	scheduleReconnect() {
		if (this.stopping || this.reconnectTimer) return;
		const delayMs = Math.min(3e4, 1e3 * Math.pow(2, this.reconnectAttempts));
		this.reconnectAttempts += 1;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			if (!this.stopping) this.start();
		}, delayMs);
	}
	async handleStreamFrame(ws, raw) {
		let frame;
		try {
			frame = JSON.parse(raw);
		} catch {
			return;
		}
		const messageId = frame.headers?.messageId;
		const topic = frame.headers?.topic;
		if (frame.type === "SYSTEM") {
			if (topic === "ping") {
				ws.send(JSON.stringify({
					code: 200,
					headers: { messageId },
					message: "OK",
					data: frame.data ?? ""
				}));
				return;
			}
			if (topic === "disconnect") try {
				ws.close(1e3, "server disconnect");
			} catch {}
			return;
		}
		if (frame.type !== "CALLBACK" || topic !== "/v1.0/im/bot/messages/get") return;
		ws.send(JSON.stringify({
			code: 200,
			headers: {
				contentType: "application/json",
				messageId
			},
			message: "OK",
			data: "{}"
		}));
		if (!frame.data) return;
		let payload;
		try {
			payload = JSON.parse(frame.data);
		} catch {
			return;
		}
		const msgId = String(payload.msgId ?? messageId ?? "");
		const conversationId = String(payload.conversationId ?? payload.senderStaffId ?? payload.senderId ?? "");
		if (!msgId || !conversationId) return;
		if (this.recordSeen(msgId)) return;
		const chatType = payload.conversationType === "2" ? "group" : "direct";
		const senderId = String(payload.senderStaffId ?? payload.senderId ?? "unknown");
		const senderName = typeof payload.senderNick === "string" ? payload.senderNick : void 0;
		const textObj = payload.text;
		const text = typeof textObj?.content === "string" ? textObj.content.trim() : typeof payload.content === "string" ? payload.content.trim() : "";
		const sessionWebhook = typeof payload.sessionWebhook === "string" ? payload.sessionWebhook : void 0;
		this.status.lastEventAt = Date.now();
		this.status.messageCount += 1;
		await this.onMessage({
			channel: "dingtalk",
			messageId: msgId,
			conversationId,
			chatType,
			senderId,
			senderName,
			text,
			mentioned: Boolean(payload.isInAtList) || chatType === "direct",
			replyContext: sessionWebhook ? { sessionWebhook } : void 0,
			receivedAt: Date.now()
		});
	}
	recordSeen(messageId) {
		if (this.dedupIds.has(messageId)) return true;
		this.dedupIds.add(messageId);
		if (this.dedupIds.size > 512) {
			const oldest = this.dedupIds.values().next().value;
			if (oldest !== void 0) this.dedupIds.delete(oldest);
		}
		return false;
	}
};
//#endregion
//#region src/host/channels/feishu.ts
function defaultWebSocketFactory(url) {
	return new WebSocket(url);
}
function resolveFeishuBaseUrl(domain) {
	return domain === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";
}
function extractFeishuTextContent(rawContent) {
	if (!rawContent) return "";
	try {
		const parsed = JSON.parse(rawContent);
		if (typeof parsed.text === "string") return parsed.text.trim();
	} catch {}
	return rawContent.trim();
}
var FeishuAdapter = class {
	id = "feishu";
	getConfig;
	onMessage;
	onEvent;
	fetchImpl;
	webSocketFactory;
	tokenCache = null;
	ws = null;
	pingTimer = null;
	reconnectTimer = null;
	stopping = false;
	reconnectAttempts = 0;
	dedupIds = /* @__PURE__ */ new Set();
	status = {
		id: "feishu",
		enabled: false,
		state: "disabled",
		messageCount: 0
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
			this.status = {
				id: "feishu",
				enabled: false,
				state: "disabled",
				messageCount: this.status.messageCount
			};
			return;
		}
		if (!cfg.appId || !cfg.appSecret) {
			this.status = {
				id: "feishu",
				enabled: true,
				state: "error",
				lastError: "missing appId or appSecret",
				messageCount: this.status.messageCount
			};
			return;
		}
		this.status = {
			id: "feishu",
			enabled: true,
			state: "connecting",
			detail: "requesting ws endpoint",
			messageCount: this.status.messageCount
		};
		try {
			const wsUrl = await this.requestWsEndpoint(cfg);
			if (this.stopping) return;
			this.openWebSocket(wsUrl);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.status = {
				id: "feishu",
				enabled: true,
				state: "error",
				lastError: message,
				messageCount: this.status.messageCount
			};
			this.onEvent?.("error", `feishu start failed: ${message}`);
			this.scheduleReconnect();
		}
	}
	async stop() {
		this.stopping = true;
		if (this.pingTimer) {
			clearInterval(this.pingTimer);
			this.pingTimer = null;
		}
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
				active.close(1e3, "stopped");
			} catch {}
		}
		this.tokenCache = null;
		const cfg = this.getConfig();
		this.status = {
			id: "feishu",
			enabled: cfg.enabled,
			state: cfg.enabled ? "idle" : "disabled",
			messageCount: this.status.messageCount
		};
	}
	async fetchTenantAccessToken(cfg = this.getConfig()) {
		if (!cfg.appId || !cfg.appSecret) throw new Error("feishu appId and appSecret are required");
		const now = Date.now();
		if (this.tokenCache && now < this.tokenCache.expiresAt) return this.tokenCache.token;
		const baseUrl = resolveFeishuBaseUrl(cfg.domain);
		const response = await this.fetchImpl(`${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
			method: "POST",
			headers: { "content-type": "application/json; charset=utf-8" },
			body: JSON.stringify({
				app_id: cfg.appId,
				app_secret: cfg.appSecret
			})
		});
		if (!response.ok) throw new Error(`feishu token HTTP ${response.status}`);
		const json = await response.json();
		if (json.code !== void 0 && json.code !== 0 || !json.tenant_access_token) throw new Error(`feishu token error: ${json.msg ?? json.code ?? "missing token"}`);
		const ttlMs = Math.max(60, (json.expire ?? 7200) - 300) * 1e3;
		this.tokenCache = {
			token: json.tenant_access_token,
			expiresAt: now + ttlMs
		};
		return json.tenant_access_token;
	}
	async send(conversationId, reply) {
		const cfg = this.getConfig();
		const token = await this.fetchTenantAccessToken(cfg);
		const baseUrl = resolveFeishuBaseUrl(cfg.domain);
		const body = reply.title || reply.text.includes("\n") ? {
			receive_id: conversationId,
			msg_type: "interactive",
			content: JSON.stringify({
				header: { title: {
					tag: "plain_text",
					content: reply.title ?? "DeepSeek Harness"
				} },
				elements: [{
					tag: "markdown",
					content: reply.text
				}]
			})
		} : {
			receive_id: conversationId,
			msg_type: "text",
			content: JSON.stringify({ text: reply.text })
		};
		const response = await this.fetchImpl(`${baseUrl}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${token}`,
				"content-type": "application/json; charset=utf-8"
			},
			body: JSON.stringify(body)
		});
		if (!response.ok) throw new Error(`feishu send HTTP ${response.status}`);
		const data = await response.json();
		if (data.code !== void 0 && data.code !== 0) throw new Error(`feishu send error: ${data.msg ?? data.code}`);
	}
	async testConnection() {
		const cfg = this.getConfig();
		if (!cfg.appId || !cfg.appSecret) return {
			ok: false,
			detail: "App ID 或 App Secret 为空"
		};
		try {
			this.tokenCache = null;
			await this.fetchTenantAccessToken(cfg);
			return {
				ok: true,
				detail: `已成功获取 Feishu (${cfg.domain}) tenant_access_token`
			};
		} catch (error) {
			return {
				ok: false,
				detail: error instanceof Error ? error.message : String(error)
			};
		}
	}
	async requestWsEndpoint(cfg) {
		const baseUrl = resolveFeishuBaseUrl(cfg.domain);
		const response = await this.fetchImpl(`${baseUrl}/callback/ws/endpoint`, {
			method: "POST",
			headers: { "content-type": "application/json; charset=utf-8" },
			body: JSON.stringify({
				AppID: cfg.appId,
				AppSecret: cfg.appSecret
			})
		});
		if (!response.ok) throw new Error(`feishu ws endpoint HTTP ${response.status}`);
		const json = await response.json();
		const url = json.data?.URL ?? json.data?.url;
		if (json.code !== void 0 && json.code !== 0 || !url) throw new Error(`feishu ws endpoint error: ${json.msg ?? json.code ?? "missing URL"}`);
		return url;
	}
	openWebSocket(url) {
		const ws = this.webSocketFactory(url);
		this.ws = ws;
		ws.onopen = () => {
			this.reconnectAttempts = 0;
			this.status = {
				id: "feishu",
				enabled: true,
				state: "connected",
				detail: "websocket connected",
				lastEventAt: Date.now(),
				messageCount: this.status.messageCount
			};
			this.onEvent?.("info", "feishu websocket connected");
			if (this.pingTimer) clearInterval(this.pingTimer);
			this.pingTimer = setInterval(() => {
				try {
					ws.send(JSON.stringify({
						type: "ping",
						ts: Date.now()
					}));
				} catch {}
			}, 3e4);
		};
		ws.onmessage = (event) => {
			this.handleWsFrame(ws, event.data);
		};
		ws.onerror = () => {
			this.status = {
				...this.status,
				state: "error",
				lastError: "feishu websocket error"
			};
		};
		ws.onclose = () => {
			if (this.pingTimer) {
				clearInterval(this.pingTimer);
				this.pingTimer = null;
			}
			if (!this.stopping) {
				this.status = {
					...this.status,
					state: "connecting",
					detail: "reconnecting"
				};
				this.scheduleReconnect();
			}
		};
	}
	scheduleReconnect() {
		if (this.stopping || this.reconnectTimer) return;
		const delayMs = Math.min(3e4, 1e3 * Math.pow(2, this.reconnectAttempts));
		this.reconnectAttempts += 1;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			if (!this.stopping) this.start();
		}, delayMs);
	}
	async handleWsFrame(ws, rawData) {
		const text = decodeFrameText(rawData);
		if (!text) return;
		let frame;
		try {
			frame = JSON.parse(text);
		} catch {
			return;
		}
		const frameId = frame.message_id ?? frame.seq ?? frame.headers?.message_id;
		if (frameId !== void 0 && frame.type !== "pong") try {
			ws.send(JSON.stringify({
				code: 200,
				message_id: frameId,
				data: "{}"
			}));
		} catch {}
		const header = frame.header;
		if ((header?.event_type ?? frame.event_type) !== "im.message.receive_v1") return;
		const event = frame.event ?? frame.data ?? frame;
		const msg = event.message;
		const sender = event.sender;
		const senderIds = sender?.sender_id;
		if (!msg) return;
		const messageId = String(msg.message_id ?? header?.event_id ?? "");
		const chatId = String(msg.chat_id ?? "");
		if (!messageId || !chatId) return;
		if (this.recordSeen(messageId)) return;
		const chatType = msg.chat_type === "group" ? "group" : "direct";
		const senderId = String(senderIds?.open_id ?? senderIds?.user_id ?? senderIds?.union_id ?? "unknown");
		const textContent = extractFeishuTextContent(typeof msg.content === "string" ? msg.content : void 0);
		const mentions = Array.isArray(msg.mentions) ? msg.mentions : [];
		this.status.lastEventAt = Date.now();
		this.status.messageCount += 1;
		await this.onMessage({
			channel: "feishu",
			messageId,
			conversationId: chatId,
			chatType,
			senderId,
			senderName: typeof sender?.sender_type === "string" ? void 0 : void 0,
			text: textContent,
			mentioned: mentions.length > 0,
			replyContext: {
				chatId,
				messageId
			},
			receivedAt: Date.now()
		});
	}
	recordSeen(messageId) {
		if (this.dedupIds.has(messageId)) return true;
		this.dedupIds.add(messageId);
		if (this.dedupIds.size > 512) {
			const oldest = this.dedupIds.values().next().value;
			if (oldest !== void 0) this.dedupIds.delete(oldest);
		}
		return false;
	}
};
function decodeFrameText(raw) {
	if (typeof raw === "string") return raw;
	if (raw instanceof Uint8Array || raw instanceof ArrayBuffer) {
		const view = raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw;
		const decoded = new TextDecoder("utf-8").decode(view);
		const jsonStart = decoded.indexOf("{");
		if (jsonStart >= 0) return decoded.slice(jsonStart);
	}
	return null;
}
//#endregion
//#region src/host/channels/webhook.ts
function signWebhookPayload(secret, timestamp, rawBody) {
	return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex")}`;
}
function verifyWebhookSignature(options) {
	const { secret, timestamp, signature, rawBody } = options;
	if (!secret) return {
		ok: false,
		reason: "signing secret not configured"
	};
	if (!timestamp || !signature) return {
		ok: false,
		reason: "missing timestamp or signature header"
	};
	const tsNum = Number(timestamp);
	if (!Number.isFinite(tsNum)) return {
		ok: false,
		reason: "invalid timestamp"
	};
	const nowSec = (options.nowMs ?? Date.now()) / 1e3;
	const tsSec = tsNum > 0xe8d4a51000 ? tsNum / 1e3 : tsNum;
	const windowSec = Math.max(30, options.replayWindowSec ?? 300);
	if (Math.abs(nowSec - tsSec) > windowSec) return {
		ok: false,
		reason: "timestamp outside replay window"
	};
	const expected = signWebhookPayload(secret, timestamp, rawBody);
	const a = Buffer.from(expected, "utf8");
	const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
	if (a.length !== b.length || !timingSafeEqual(a, b)) return {
		ok: false,
		reason: "signature mismatch"
	};
	return { ok: true };
}
function headerValue(headers, name) {
	const target = name.toLowerCase();
	for (const [k, v] of Object.entries(headers)) {
		if (k.toLowerCase() !== target) continue;
		return Array.isArray(v) ? v[0] : v;
	}
}
var GenericWebhookAdapter = class {
	id = "webhook";
	getConfig;
	onMessage;
	onEvent;
	fetchImpl;
	nowMs;
	dedupIds = /* @__PURE__ */ new Set();
	status = {
		id: "webhook",
		enabled: false,
		state: "disabled",
		messageCount: 0
	};
	constructor(options) {
		this.getConfig = options.getConfig;
		this.onMessage = options.onMessage;
		this.onEvent = options.onEvent;
		this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
		this.nowMs = options.nowMs ?? (() => Date.now());
	}
	getStatus() {
		return { ...this.status };
	}
	async start() {
		const cfg = this.getConfig();
		if (!cfg.enabled) {
			this.status = {
				id: "webhook",
				enabled: false,
				state: "disabled",
				messageCount: this.status.messageCount
			};
			return;
		}
		if (!cfg.signingSecret) {
			this.status = {
				id: "webhook",
				enabled: true,
				state: "error",
				lastError: "missing signingSecret",
				messageCount: this.status.messageCount
			};
			return;
		}
		this.status = {
			id: "webhook",
			enabled: true,
			state: "webhook-ready",
			detail: "hmac-sha256 webhook ready",
			messageCount: this.status.messageCount
		};
	}
	async stop() {
		const cfg = this.getConfig();
		this.status = {
			id: "webhook",
			enabled: cfg.enabled,
			state: cfg.enabled ? "idle" : "disabled",
			messageCount: this.status.messageCount
		};
	}
	async send(conversationId, reply) {
		const cfg = this.getConfig();
		const targetUrl = typeof reply.replyContext?.replyUrl === "string" && reply.replyContext.replyUrl ? reply.replyContext.replyUrl : cfg.outboundUrl;
		if (!targetUrl) return;
		const timestamp = String(Math.floor(this.nowMs() / 1e3));
		const payload = JSON.stringify({
			conversationId,
			title: reply.title ?? "DeepSeek Harness",
			text: reply.text,
			timestamp
		});
		const headers = {
			...cfg.outboundHeaders,
			"content-type": "application/json; charset=utf-8",
			"x-im-hub-timestamp": timestamp
		};
		if (cfg.signingSecret) headers["x-im-hub-signature"] = signWebhookPayload(cfg.signingSecret, timestamp, payload);
		const response = await this.fetchImpl(targetUrl, {
			method: "POST",
			headers,
			body: payload
		});
		if (!response.ok) throw new Error(`webhook outbound HTTP ${response.status}`);
	}
	async handleWebhook(req) {
		const cfg = this.getConfig();
		if (!cfg.enabled) return {
			status: 404,
			headers: { "content-type": "application/json; charset=utf-8" },
			body: JSON.stringify({ error: "webhook channel disabled" })
		};
		if (req.method.toUpperCase() !== "POST") return {
			status: 405,
			headers: { "content-type": "application/json; charset=utf-8" },
			body: JSON.stringify({ error: "method not allowed" })
		};
		const timestamp = headerValue(req.headers, "x-im-hub-timestamp");
		const signature = headerValue(req.headers, "x-im-hub-signature") ?? headerValue(req.headers, "x-signature-256");
		const check = verifyWebhookSignature({
			secret: cfg.signingSecret,
			timestamp,
			signature,
			rawBody: req.rawBody,
			nowMs: this.nowMs(),
			replayWindowSec: cfg.replayWindowSec
		});
		if (!check.ok) return {
			status: 401,
			headers: { "content-type": "application/json; charset=utf-8" },
			body: JSON.stringify({ error: check.reason ?? "unauthorized" })
		};
		let body;
		try {
			body = JSON.parse(req.rawBody);
		} catch {
			return {
				status: 400,
				headers: { "content-type": "application/json; charset=utf-8" },
				body: JSON.stringify({ error: "invalid JSON body" })
			};
		}
		const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
		const senderId = typeof body.senderId === "string" ? body.senderId.trim() : "";
		const text = typeof body.text === "string" ? body.text.trim() : "";
		if (!conversationId || !senderId || !text) return {
			status: 400,
			headers: { "content-type": "application/json; charset=utf-8" },
			body: JSON.stringify({ error: "conversationId, senderId, and text are required" })
		};
		const messageId = typeof body.messageId === "string" && body.messageId.trim() ? body.messageId.trim() : randomUUID();
		if (this.recordSeen(messageId)) return {
			status: 202,
			headers: { "content-type": "application/json; charset=utf-8" },
			body: JSON.stringify({
				accepted: true,
				duplicate: true,
				messageId
			})
		};
		const chatType = body.chatType === "group" ? "group" : "direct";
		const replyUrl = typeof body.replyUrl === "string" ? body.replyUrl.trim() : void 0;
		this.status.lastEventAt = this.nowMs();
		this.status.messageCount += 1;
		await this.onMessage({
			channel: "webhook",
			messageId,
			conversationId,
			chatType,
			senderId,
			senderName: typeof body.senderName === "string" ? body.senderName : void 0,
			text,
			mentioned: typeof body.mentioned === "boolean" ? body.mentioned : chatType === "direct",
			replyContext: replyUrl ? { replyUrl } : void 0,
			receivedAt: this.nowMs()
		});
		return {
			status: 202,
			headers: { "content-type": "application/json; charset=utf-8" },
			body: JSON.stringify({
				accepted: true,
				messageId
			})
		};
	}
	async testConnection() {
		const cfg = this.getConfig();
		if (!cfg.signingSecret) return {
			ok: false,
			detail: "入站签名密钥 (signingSecret) 为空"
		};
		if (!cfg.outboundUrl) return {
			ok: true,
			detail: "HMAC-SHA256 签名密钥已就绪（仅入站回调模式）"
		};
		try {
			const timestamp = String(Math.floor(this.nowMs() / 1e3));
			const payload = JSON.stringify({
				type: "ping",
				source: "dsh-im-hub",
				timestamp
			});
			const response = await this.fetchImpl(cfg.outboundUrl, {
				method: "POST",
				headers: {
					...cfg.outboundHeaders,
					"content-type": "application/json; charset=utf-8",
					"x-im-hub-timestamp": timestamp,
					"x-im-hub-signature": signWebhookPayload(cfg.signingSecret, timestamp, payload)
				},
				body: payload
			});
			if (!response.ok) return {
				ok: false,
				detail: `出站回调返回 HTTP ${response.status}`
			};
			return {
				ok: true,
				detail: `出站回调探测成功 (HTTP ${response.status})`
			};
		} catch (error) {
			this.onEvent?.("warn", `webhook ping failed: ${error instanceof Error ? error.message : String(error)}`);
			return {
				ok: false,
				detail: error instanceof Error ? error.message : String(error)
			};
		}
	}
	recordSeen(messageId) {
		if (this.dedupIds.has(messageId)) return true;
		this.dedupIds.add(messageId);
		if (this.dedupIds.size > 512) {
			const oldest = this.dedupIds.values().next().value;
			if (oldest !== void 0) this.dedupIds.delete(oldest);
		}
		return false;
	}
};
//#endregion
//#region src/host/channels/wecom.ts
function computeWeComSignature(token, timestamp, nonce, encrypt = "") {
	const parts = encrypt ? [
		token,
		timestamp,
		nonce,
		encrypt
	] : [
		token,
		timestamp,
		nonce
	];
	parts.sort();
	return createHash("sha1").update(parts.join(""), "utf8").digest("hex");
}
function verifyWeComSignature(expectedSig, token, timestamp, nonce, encrypt = "") {
	if (!expectedSig || !token || !timestamp || !nonce) return false;
	const actual = computeWeComSignature(token, timestamp, nonce, encrypt);
	const a = Buffer.from(actual, "utf8");
	const b = Buffer.from(expectedSig.trim(), "utf8");
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}
function decodeWeComAesKey(encodingAesKey) {
	const trimmed = encodingAesKey.trim();
	const key = Buffer.from(trimmed.endsWith("=") ? trimmed : `${trimmed}=`, "base64");
	if (key.length !== 32) throw new Error("wecom encodingAesKey must decode to 32 bytes");
	return {
		key,
		iv: key.subarray(0, 16)
	};
}
function pkcs7Unpad(buf) {
	if (buf.length === 0) throw new Error("empty plaintext buffer");
	const pad = buf[buf.length - 1];
	if (pad < 1 || pad > 32 || pad > buf.length) throw new Error("invalid PKCS#7 padding");
	return buf.subarray(0, buf.length - pad);
}
function pkcs7Pad(buf, blockSize = 32) {
	const remainder = buf.length % blockSize;
	const pad = remainder === 0 ? blockSize : blockSize - remainder;
	return Buffer.concat([buf, Buffer.alloc(pad, pad)]);
}
function decryptWeComPayload(encodingAesKey, cipherBase64) {
	const { key, iv } = decodeWeComAesKey(encodingAesKey);
	const decipher = createDecipheriv("aes-256-cbc", key, iv);
	decipher.setAutoPadding(false);
	const unpadded = pkcs7Unpad(Buffer.concat([decipher.update(Buffer.from(cipherBase64, "base64")), decipher.final()]));
	if (unpadded.length < 20) throw new Error("wecom decrypted payload too short");
	const msgEnd = 20 + unpadded.readUInt32BE(16);
	if (msgEnd > unpadded.length) throw new Error("wecom message length out of bounds");
	return {
		message: unpadded.subarray(20, msgEnd).toString("utf8"),
		receiveId: unpadded.subarray(msgEnd).toString("utf8")
	};
}
function encryptWeComPayload(encodingAesKey, plainText, corpId) {
	const { key, iv } = decodeWeComAesKey(encodingAesKey);
	const randomPrefix = randomBytes(16);
	const msgBuf = Buffer.from(plainText, "utf8");
	const lenBuf = Buffer.alloc(4);
	lenBuf.writeUInt32BE(msgBuf.length, 0);
	const corpBuf = Buffer.from(corpId, "utf8");
	const padded = pkcs7Pad(Buffer.concat([
		randomPrefix,
		lenBuf,
		msgBuf,
		corpBuf
	]), 32);
	const cipher = createCipheriv("aes-256-cbc", key, iv);
	cipher.setAutoPadding(false);
	return Buffer.concat([cipher.update(padded), cipher.final()]).toString("base64");
}
function extractXmlTag(xml, tag) {
	const cdataRe = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i");
	const cdataMatch = xml.match(cdataRe);
	if (cdataMatch) return cdataMatch[1];
	const plainRe = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
	const plainMatch = xml.match(plainRe);
	return plainMatch ? plainMatch[1].trim() : void 0;
}
var WeComAdapter = class {
	id = "wecom";
	getConfig;
	onMessage;
	onEvent;
	fetchImpl;
	tokenCache = null;
	dedupIds = /* @__PURE__ */ new Set();
	status = {
		id: "wecom",
		enabled: false,
		state: "disabled",
		messageCount: 0
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
			this.status = {
				id: "wecom",
				enabled: false,
				state: "disabled",
				messageCount: this.status.messageCount
			};
			return;
		}
		if (cfg.mode === "webhook") {
			if (!cfg.webhookUrl) {
				this.status = {
					id: "wecom",
					enabled: true,
					state: "error",
					lastError: "missing webhookUrl",
					messageCount: this.status.messageCount
				};
				return;
			}
			this.status = {
				id: "wecom",
				enabled: true,
				state: "webhook-ready",
				detail: "group robot webhook ready",
				messageCount: this.status.messageCount
			};
			return;
		}
		if (!cfg.corpId || !cfg.corpSecret) {
			this.status = {
				id: "wecom",
				enabled: true,
				state: "error",
				lastError: "missing corpId or corpSecret",
				messageCount: this.status.messageCount
			};
			return;
		}
		this.status = {
			id: "wecom",
			enabled: true,
			state: "webhook-ready",
			detail: "wecom app callback ready",
			messageCount: this.status.messageCount
		};
	}
	async stop() {
		this.tokenCache = null;
		const cfg = this.getConfig();
		this.status = {
			id: "wecom",
			enabled: cfg.enabled,
			state: cfg.enabled ? "idle" : "disabled",
			messageCount: this.status.messageCount
		};
	}
	async fetchAccessToken(cfg = this.getConfig()) {
		if (!cfg.corpId || !cfg.corpSecret) throw new Error("wecom corpId and corpSecret are required");
		const now = Date.now();
		if (this.tokenCache && now < this.tokenCache.expiresAt) return this.tokenCache.token;
		const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(cfg.corpId)}&corpsecret=${encodeURIComponent(cfg.corpSecret)}`;
		const response = await this.fetchImpl(url, { method: "GET" });
		if (!response.ok) throw new Error(`wecom gettoken HTTP ${response.status}`);
		const data = await response.json();
		if (data.errcode !== void 0 && data.errcode !== 0 || !data.access_token) throw new Error(`wecom gettoken error: ${data.errmsg ?? data.errcode ?? "missing token"}`);
		const ttlMs = Math.max(60, (data.expires_in ?? 7200) - 300) * 1e3;
		this.tokenCache = {
			token: data.access_token,
			expiresAt: now + ttlMs
		};
		return data.access_token;
	}
	async send(conversationId, reply) {
		const cfg = this.getConfig();
		if (cfg.mode === "webhook") {
			if (!cfg.webhookUrl) throw new Error("wecom webhookUrl is empty");
			const response = await this.fetchImpl(cfg.webhookUrl, {
				method: "POST",
				headers: { "content-type": "application/json; charset=utf-8" },
				body: JSON.stringify({
					msgtype: "markdown",
					markdown: { content: reply.text }
				})
			});
			if (!response.ok) throw new Error(`wecom webhook send HTTP ${response.status}`);
			const data = await response.json().catch(() => ({}));
			if (data.errcode !== void 0 && data.errcode !== 0) throw new Error(`wecom webhook error: ${data.errmsg ?? data.errcode}`);
			return;
		}
		const token = await this.fetchAccessToken(cfg);
		const agentId = Number(cfg.agentId || 0);
		const isGroup = conversationId.startsWith("group:") || Boolean(reply.replyContext?.chatId);
		const chatId = typeof reply.replyContext?.chatId === "string" ? reply.replyContext.chatId : conversationId.replace(/^group:/, "");
		const endpoint = isGroup ? `https://qyapi.weixin.qq.com/cgi-bin/appchat/send?access_token=${encodeURIComponent(token)}` : `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`;
		const payload = isGroup ? {
			chatid: chatId,
			msgtype: "markdown",
			markdown: { content: reply.text }
		} : {
			touser: conversationId,
			agentid: agentId,
			msgtype: "markdown",
			markdown: { content: reply.text }
		};
		const response = await this.fetchImpl(endpoint, {
			method: "POST",
			headers: { "content-type": "application/json; charset=utf-8" },
			body: JSON.stringify(payload)
		});
		if (!response.ok) throw new Error(`wecom app send HTTP ${response.status}`);
		const data = await response.json();
		if (data.errcode !== void 0 && data.errcode !== 0) throw new Error(`wecom app send error: ${data.errmsg ?? data.errcode}`);
	}
	async handleWebhook(req) {
		const cfg = this.getConfig();
		if (!cfg.enabled) return {
			status: 404,
			body: JSON.stringify({ error: "wecom channel disabled" })
		};
		if (cfg.mode !== "app") return {
			status: 400,
			body: JSON.stringify({ error: "callback only supported in app mode" })
		};
		if (!cfg.token || !cfg.encodingAesKey) return {
			status: 500,
			body: JSON.stringify({ error: "wecom token/encodingAesKey not configured" })
		};
		const url = new URL(req.url, "http://localhost");
		const msgSignature = url.searchParams.get("msg_signature") ?? "";
		const timestamp = url.searchParams.get("timestamp") ?? "";
		const nonce = url.searchParams.get("nonce") ?? "";
		const method = req.method.toUpperCase();
		if (method === "GET") {
			const echostr = url.searchParams.get("echostr") ?? "";
			if (!verifyWeComSignature(msgSignature, cfg.token, timestamp, nonce, echostr)) return {
				status: 401,
				body: "invalid signature"
			};
			try {
				const decrypted = decryptWeComPayload(cfg.encodingAesKey, echostr);
				if (cfg.corpId && decrypted.receiveId && decrypted.receiveId !== cfg.corpId) return {
					status: 403,
					body: "corpId mismatch"
				};
				return {
					status: 200,
					headers: { "content-type": "text/plain; charset=utf-8" },
					body: decrypted.message
				};
			} catch {
				return {
					status: 400,
					body: "invalid echostr"
				};
			}
		}
		if (method !== "POST") return {
			status: 405,
			body: "method not allowed"
		};
		let encrypted = extractXmlTag(req.rawBody, "Encrypt");
		if (!encrypted && req.rawBody.trim().startsWith("{")) try {
			encrypted = JSON.parse(req.rawBody).Encrypt;
		} catch {}
		if (!encrypted) return {
			status: 400,
			body: "missing Encrypt field"
		};
		if (!verifyWeComSignature(msgSignature, cfg.token, timestamp, nonce, encrypted)) return {
			status: 401,
			body: "invalid signature"
		};
		try {
			const { message, receiveId } = decryptWeComPayload(cfg.encodingAesKey, encrypted);
			if (cfg.corpId && receiveId && receiveId !== cfg.corpId) return {
				status: 403,
				body: "corpId mismatch"
			};
			const msgId = extractXmlTag(message, "MsgId") ?? `${timestamp}:${nonce}`;
			if (!this.recordSeen(msgId)) {
				const fromUser = extractXmlTag(message, "FromUserName") ?? "unknown";
				const chatId = extractXmlTag(message, "ChatId");
				const content = (extractXmlTag(message, "Content") ?? "").trim();
				const isGroup = Boolean(chatId);
				this.status.lastEventAt = Date.now();
				this.status.messageCount += 1;
				await this.onMessage({
					channel: "wecom",
					messageId: msgId,
					conversationId: isGroup ? `group:${chatId}` : fromUser,
					chatType: isGroup ? "group" : "direct",
					senderId: fromUser,
					text: content,
					mentioned: true,
					replyContext: chatId ? { chatId } : void 0,
					receivedAt: Date.now()
				});
			}
			return {
				status: 200,
				headers: { "content-type": "text/plain; charset=utf-8" },
				body: "success"
			};
		} catch (error) {
			this.onEvent?.("error", `wecom callback decrypt failed: ${error instanceof Error ? error.message : String(error)}`);
			return {
				status: 400,
				body: "invalid encrypted payload"
			};
		}
	}
	async testConnection() {
		const cfg = this.getConfig();
		if (cfg.mode === "webhook") {
			if (!cfg.webhookUrl) return {
				ok: false,
				detail: "群机器人 Webhook URL 为空"
			};
			try {
				const parsed = new URL(cfg.webhookUrl);
				if (!["https:", "http:"].includes(parsed.protocol)) return {
					ok: false,
					detail: "Webhook URL 协议必须为 http/https"
				};
				return {
					ok: true,
					detail: `企微群机器人 Webhook URL 格式校验通过 (${parsed.host})`
				};
			} catch {
				return {
					ok: false,
					detail: "Webhook URL 格式无效"
				};
			}
		}
		if (!cfg.corpId || !cfg.corpSecret) return {
			ok: false,
			detail: "CorpID 或 CorpSecret 为空"
		};
		try {
			this.tokenCache = null;
			await this.fetchAccessToken(cfg);
			return {
				ok: true,
				detail: "已成功通过企业微信自建应用鉴权"
			};
		} catch (error) {
			return {
				ok: false,
				detail: error instanceof Error ? error.message : String(error)
			};
		}
	}
	recordSeen(messageId) {
		if (this.dedupIds.has(messageId)) return true;
		this.dedupIds.add(messageId);
		if (this.dedupIds.size > 512) {
			const oldest = this.dedupIds.values().next().value;
			if (oldest !== void 0) this.dedupIds.delete(oldest);
		}
		return false;
	}
};
//#endregion
//#region src/host/core/access-policy.ts
function matchesAllowlist(candidate, list) {
	if (!candidate) return false;
	for (const item of list) if (item === "*" || item === candidate) return true;
	return false;
}
function evaluateAccess(message, policy) {
	if (message.chatType === "group" && policy.groupMentionOnly && !message.mentioned) return {
		allowed: false,
		reason: "mention-required"
	};
	if (policy.mode === "open") return { allowed: true };
	if (message.chatType === "direct") return matchesAllowlist(message.senderId, policy.allowUsers) ? { allowed: true } : {
		allowed: false,
		reason: "sender-not-allowed"
	};
	if (!matchesAllowlist(message.conversationId, policy.allowGroups)) return {
		allowed: false,
		reason: "group-not-allowed"
	};
	if (policy.allowUsers.length > 0 && !matchesAllowlist(message.senderId, policy.allowUsers)) return {
		allowed: false,
		reason: "sender-not-allowed"
	};
	return { allowed: true };
}
function isApprovalAuthorized(senderId, policy) {
	if (!senderId) return false;
	if (policy.mode === "open") return true;
	return matchesAllowlist(senderId, policy.allowUsers);
}
//#endregion
//#region src/host/core/approval-bridge.ts
const COMMAND_CLIP = 400;
function summarizeToolRequest(request) {
	if (request.callId === void 0) return void 0;
	const events = request.agent.session?.snapshotEvents?.();
	if (!Array.isArray(events)) return void 0;
	for (let i = events.length - 1; i >= 0; i -= 1) {
		const event = events[i];
		if (!event || event.type !== "tool/call") continue;
		const data = event.data;
		if (String(data?.callId) !== String(request.callId)) continue;
		const raw = data?.arguments;
		if (typeof raw !== "string") return void 0;
		try {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === "object" && typeof parsed.command === "string") return parsed.command.length <= COMMAND_CLIP ? parsed.command : `${parsed.command.slice(0, COMMAND_CLIP)}…`;
		} catch {}
		return raw.length <= COMMAND_CLIP ? raw : `${raw.slice(0, COMMAND_CLIP)}…`;
	}
}
var ApprovalBridge = class {
	pending = /* @__PURE__ */ new Map();
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
			if (entry.conversationKey !== conversationKey) continue;
			items.push({
				id: entry.id,
				toolName: entry.toolName,
				commandPreview: entry.commandPreview,
				createdAt: entry.createdAt
			});
		}
		return items.sort((a, b) => b.createdAt - a.createdAt);
	}
	install(ctx) {
		const dispose = ctx.on("approval/request", (request, next) => this.handleRequest(request, next), {
			global: true,
			prepend: true
		});
		return () => {
			dispose();
			this.disposeAll();
		};
	}
	async handleRequest(request, next) {
		const binding = this.lookupBinding(request.agent.id);
		if (!binding) return next();
		if (request.signal?.aborted) return "cancelled";
		const id = randomUUID().replace(/-/g, "").slice(0, 6).toLowerCase();
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
			signal: request.signal
		};
		if (request.signal) {
			const onAbort = () => this.finishEntry(id, "cancelled");
			entry.onAbort = onAbort;
			request.signal.addEventListener("abort", onAbort, { once: true });
		}
		this.pending.set(id, entry);
		const lines = [
			`🔐 工具审批请求 [${id}]`,
			`工具: \`${request.toolName}\``,
			...commandPreview ? [`参数: \`${commandPreview}\``] : [],
			`回复 \`/approve ${id}\` 允许，或 \`/reject ${id}\` 拒绝${this.dualApproval ? "（也可直接在桌面端确认）" : ""}`
		];
		try {
			await binding.sendPrompt(lines.join("\n"));
		} catch (error) {
			this.onLog?.("warn", `failed to deliver IM approval [${id}]: ${error instanceof Error ? error.message : String(error)}`);
			this.cleanupEntry(id);
			if (this.dualApproval) return next();
			return "unavailable";
		}
		try {
			if (this.dualApproval) return await Promise.race([imDecision, next()]);
			return await imDecision;
		} finally {
			this.cleanupEntry(id);
		}
	}
	resolveFromIm(conversationKey, approvalId, decision, senderId, policy) {
		if (!isApprovalAuthorized(senderId, policy)) {
			this.onLog?.("warn", `unauthorized approval attempt from ${senderId} on ${conversationKey}`);
			return {
				ok: false,
				message: "⚠️ 当前发送者不在白名单中，无权执行审批操作。"
			};
		}
		const candidates = this.pendingForConversation(conversationKey);
		if (candidates.length === 0) return {
			ok: false,
			message: "ℹ️ 当前会话没有等待确认的审批请求。"
		};
		const normalizedId = approvalId?.trim().toLowerCase();
		const target = normalizedId ? candidates.find((item) => item.id === normalizedId) : candidates[0];
		if (!target) return {
			ok: false,
			message: `⚠️ 未找到编号为 \`${approvalId}\` 的待审批请求。`
		};
		if (!this.finishEntry(target.id, decision)) return {
			ok: false,
			message: `ℹ️ 审批 [${target.id}] 已被桌面端或其他方式处理。`
		};
		return {
			ok: true,
			id: target.id,
			toolName: target.toolName,
			message: decision === "allowed-once" ? `✅ 已允许 [${target.id}] (\`${target.toolName}\`)` : `🛑 已拒绝 [${target.id}] (\`${target.toolName}\`)`
		};
	}
	resolveById(approvalId, decision) {
		return this.finishEntry(approvalId.trim().toLowerCase(), decision);
	}
	cancelConversation(conversationKey) {
		for (const entry of [...this.pending.values()]) if (entry.conversationKey === conversationKey) this.finishEntry(entry.id, "cancelled");
	}
	disposeAll() {
		for (const entry of [...this.pending.values()]) this.finishEntry(entry.id, "unavailable");
	}
	finishEntry(id, outcome) {
		const entry = this.pending.get(id);
		if (!entry) return false;
		this.cleanupEntry(id);
		entry.resolve(outcome);
		return true;
	}
	cleanupEntry(id) {
		const entry = this.pending.get(id);
		if (!entry) return;
		this.pending.delete(id);
		if (entry.onAbort && entry.signal) entry.signal.removeEventListener("abort", entry.onAbort);
	}
};
//#endregion
//#region src/host/core/commands.ts
function stripLeadingMentions(text) {
	return text.replace(/^(?:<at[^>]*>.*?<\/at>\s*|@\S+\s*)+/iu, "").trim();
}
function parseControlCommand(rawText) {
	const cleaned = stripLeadingMentions(rawText);
	if (!cleaned.startsWith("/")) return null;
	const [rawHead, ...rest] = cleaned.split(/\s+/);
	const head = (rawHead ?? "").toLowerCase();
	const arg = rest.join(" ").trim() || void 0;
	switch (head) {
		case "/new":
		case "/reset": return { kind: "new" };
		case "/stop":
		case "/cancel": return { kind: "stop" };
		case "/status": return { kind: "status" };
		case "/help": return { kind: "help" };
		case "/approve":
		case "/allow": return {
			kind: "approve",
			approvalId: arg
		};
		case "/reject":
		case "/deny": return {
			kind: "reject",
			approvalId: arg
		};
		case "/workspace":
		case "/ws": return {
			kind: "workspace",
			path: arg
		};
		default: return null;
	}
}
function splitMessageChunks(text, maxChars = 3500) {
	const limit = Math.max(500, Math.min(16e3, Math.round(maxChars)));
	const normalized = text.trim();
	if (!normalized) return [];
	if (normalized.length <= limit) return [normalized];
	const chunks = [];
	let remaining = normalized;
	let openFence = null;
	while (remaining.length > limit) {
		const window = remaining.slice(0, limit);
		let splitAt = window.lastIndexOf("\n\n");
		if (splitAt < Math.floor(limit * .45)) splitAt = window.lastIndexOf("\n");
		if (splitAt < Math.floor(limit * .3)) splitAt = window.lastIndexOf(" ");
		if (splitAt <= 0) splitAt = limit;
		let piece = remaining.slice(0, splitAt).trimEnd();
		if (!piece) {
			piece = remaining.slice(0, limit);
			splitAt = limit;
		}
		const fenceMatches = piece.match(/```[^\n]*/g) ?? [];
		for (const marker of fenceMatches) openFence = openFence === null ? marker : null;
		if (openFence !== null) piece = `${piece}\n\`\`\``;
		chunks.push(piece);
		remaining = remaining.slice(splitAt).trimStart();
		if (openFence !== null && remaining.length > 0) remaining = `${openFence}\n${remaining}`;
		openFence = null;
	}
	if (remaining.length > 0) chunks.push(remaining);
	return chunks;
}
function formatHelpMessage(channel) {
	return [
		`🤖 DSH IM Hub (${channel}) 命令帮助`,
		"- `/new` — 开启新对话上下文",
		"- `/stop` — 中止当前正在生成的回复",
		"- `/status` — 查看当前会话与工作区状态",
		"- `/workspace <路径>` — 切换或查看当前绑定工作区",
		"- `/approve [编号]` — 允许待审工具调用",
		"- `/reject [编号]` — 拒绝待审工具调用",
		"- `/help` — 显示本帮助"
	].join("\n");
}
//#endregion
//#region src/host/core/conversation-queue.ts
var ConversationQueue = class {
	lanes = /* @__PURE__ */ new Map();
	maxQueued;
	constructor(maxQueued = 16) {
		this.maxQueued = Math.max(1, maxQueued);
	}
	depth(key) {
		return this.lanes.get(key)?.depth ?? 0;
	}
	isBusy(key) {
		return this.lanes.get(key)?.busy ?? false;
	}
	clear(key) {
		this.lanes.delete(key);
	}
	async enqueue(key, task) {
		let lane = this.lanes.get(key);
		if (!lane) {
			lane = {
				tail: Promise.resolve(),
				depth: 0,
				busy: false
			};
			this.lanes.set(key, lane);
		}
		if (lane.depth >= this.maxQueued) throw new Error(`conversation queue full (${this.maxQueued}) for ${key}`);
		lane.depth += 1;
		const run = lane.tail.then(async () => {
			lane.busy = true;
			try {
				return await task();
			} finally {
				lane.busy = false;
				lane.depth = Math.max(0, lane.depth - 1);
				if (lane.depth === 0 && !lane.busy && this.lanes.get(key) === lane) this.lanes.delete(key);
			}
		});
		lane.tail = run.then(() => void 0, () => void 0);
		return run;
	}
};
//#endregion
//#region src/host/core/harness-bridge.ts
function extractTextBlocks(content) {
	if (!Array.isArray(content)) return "";
	const parts = [];
	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		const rec = block;
		if (rec.type === "text" && typeof rec.text === "string" && rec.text.trim()) parts.push(rec.text);
	}
	return parts.join("\n");
}
function buildConversationKey(channel, conversationId) {
	return `${channel}:${conversationId}`;
}
var HarnessBridge = class {
	ctx;
	getDefaultWorkspacePath;
	getMaxReplyChars;
	customTurnRunner;
	onLog;
	bindings = /* @__PURE__ */ new Map();
	sessionToKey = /* @__PURE__ */ new Map();
	workspaceOverrides = /* @__PURE__ */ new Map();
	inflightOpen = /* @__PURE__ */ new Map();
	turnCollectors = /* @__PURE__ */ new Map();
	constructor(options) {
		this.ctx = options.ctx;
		this.getDefaultWorkspacePath = options.getDefaultWorkspacePath;
		this.getMaxReplyChars = options.getMaxReplyChars;
		this.customTurnRunner = options.turnRunner;
		this.onLog = options.onLog;
	}
	install(ctx) {
		const dispose = ctx.on("session/event", (session, event) => {
			const sessionId = session?.header?.id ?? session?.id;
			if (!sessionId) return;
			const collector = this.turnCollectors.get(sessionId);
			if (!collector) return;
			if (event.type === "assistant/message") {
				const text = extractTextBlocks(event.content);
				if (text) collector.chunks.push(text);
			} else if (event.type === "turn/end") {
				const reason = event.reason;
				if (reason && typeof reason.message === "string" && reason.code !== "ABORTED") collector.error = reason.message;
			}
		});
		return () => {
			dispose();
			this.disposeAll();
		};
	}
	getBinding(conversationKey) {
		return this.bindings.get(conversationKey);
	}
	getBindingByAgentId(agentId) {
		const key = this.sessionToKey.get(agentId);
		if (key) return this.bindings.get(key);
		for (const binding of this.bindings.values()) if (binding.agentId === agentId || binding.sessionId === agentId) return binding;
	}
	resolveWorkspacePath(conversationKey) {
		const override = this.workspaceOverrides.get(conversationKey);
		if (override) return override;
		const configured = this.getDefaultWorkspacePath().trim();
		if (configured) return configured;
		if (this.ctx) {
			const first = getHostService(this.ctx, "workspaceRegistry")?.list?.()?.[0]?.path;
			if (first) return first;
		}
		return process.cwd();
	}
	async setWorkspace(conversationKey, nextPath) {
		const resolved = nextPath.trim();
		if (!resolved) return this.resolveWorkspacePath(conversationKey);
		this.workspaceOverrides.set(conversationKey, resolved);
		await this.resetConversation(conversationKey);
		return resolved;
	}
	async stopConversation(conversationKey) {
		const binding = this.bindings.get(conversationKey);
		if (!binding) return false;
		binding.agent.cancel?.({ kind: "user" });
		return true;
	}
	async resetConversation(conversationKey) {
		const binding = this.bindings.get(conversationKey);
		if (!binding) return false;
		this.bindings.delete(conversationKey);
		this.sessionToKey.delete(binding.sessionId);
		this.sessionToKey.delete(binding.agentId);
		this.turnCollectors.delete(binding.sessionId);
		binding.agent.cancel?.({ kind: "user" });
		await binding.handle?.dispose().catch(() => {});
		return true;
	}
	async runTurn(message, sendReply) {
		const key = buildConversationKey(message.channel, message.conversationId);
		const workspacePath = this.resolveWorkspacePath(key);
		let replyText = "";
		if (this.customTurnRunner) replyText = await this.customTurnRunner(message, key, workspacePath);
		else {
			const binding = await this.getOrCreateBinding(key, workspacePath);
			binding.lastActivity = Date.now();
			binding.lastReplyContext = message.replyContext;
			replyText = await this.executeAgentTurn(binding, message);
		}
		const chunks = splitMessageChunks(replyText, this.getMaxReplyChars());
		for (const chunk of chunks) await sendReply({
			text: chunk,
			replyContext: message.replyContext
		});
	}
	async disposeAll() {
		const keys = [...this.bindings.keys()];
		for (const key of keys) await this.resetConversation(key);
	}
	async getOrCreateBinding(conversationKey, workspacePath) {
		const existing = this.bindings.get(conversationKey);
		if (existing) return existing;
		const inflight = this.inflightOpen.get(conversationKey);
		if (inflight) return inflight;
		const task = this.createBinding(conversationKey, workspacePath);
		this.inflightOpen.set(conversationKey, task);
		try {
			return await task;
		} finally {
			this.inflightOpen.delete(conversationKey);
		}
	}
	async createBinding(conversationKey, workspacePath) {
		const agents = this.ctx ? getHostService(this.ctx, "agents") : void 0;
		if (!agents?.create) throw new Error("DSH agents service is unavailable");
		const sessionId = `session-${randomUUID()}`;
		const created = await agents.create({
			sessionId,
			meta: { cwd: workspacePath }
		});
		const binding = {
			conversationKey,
			sessionId,
			agentId: created.agent.id,
			agent: created.agent,
			handle: created,
			workspacePath,
			lastActivity: Date.now()
		};
		this.bindings.set(conversationKey, binding);
		this.sessionToKey.set(sessionId, conversationKey);
		this.sessionToKey.set(created.agent.id, conversationKey);
		return binding;
	}
	async executeAgentTurn(binding, message) {
		const collector = {
			chunks: [],
			error: void 0
		};
		this.turnCollectors.set(binding.sessionId, collector);
		const promptText = `${message.chatType === "group" ? `[${message.senderName ?? message.senderId} (${message.senderId})] ` : ""}${message.text}`;
		try {
			binding.agent.followup({
				role: "user",
				content: [{
					type: "text",
					text: promptText
				}],
				source: { kind: "user" }
			});
			await binding.agent.whenIdle();
		} catch (error) {
			this.onLog?.("warn", `turn interrupted for ${binding.conversationKey}: ${error instanceof Error ? error.message : String(error)}`);
			if (collector.chunks.length === 0) return `⚠️ 执行中断: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			this.turnCollectors.delete(binding.sessionId);
		}
		const body = collector.chunks.join("\n\n").trim();
		if (collector.error && !body) return `⚠️ 本轮执行异常: ${collector.error}`;
		if (collector.error && body) return `${body}\n\n⚠️ ${collector.error}`;
		return body || "（无文本输出）";
	}
};
//#endregion
//#region src/host/hub.ts
var ImHubManager = class {
	settings;
	queue = new ConversationQueue(16);
	events = [];
	adapters;
	approvalBridge;
	harnessBridge;
	lastContextByConversation = /* @__PURE__ */ new Map();
	disposed = false;
	constructor(options = {}) {
		this.settings = options.initialSettings ?? defaultSettings();
		this.harnessBridge = new HarnessBridge({
			ctx: options.ctx,
			getDefaultWorkspacePath: () => this.settings.defaultWorkspacePath,
			getMaxReplyChars: () => this.settings.maxReplyChars,
			turnRunner: options.turnRunner,
			onLog: (level, message) => this.pushEvent("hub", level, message)
		});
		this.approvalBridge = new ApprovalBridge({
			dualApproval: this.settings.dualApproval,
			onLog: (level, message) => this.pushEvent("hub", level, message),
			lookupBinding: (agentId) => {
				const binding = this.harnessBridge.getBindingByAgentId(agentId);
				if (!binding) return void 0;
				const [channel, ...rest] = binding.conversationKey.split(":");
				const conversationId = rest.join(":");
				const adapter = this.adapters[channel];
				if (!adapter) return void 0;
				return {
					conversationKey: binding.conversationKey,
					sendPrompt: (text) => adapter.send(conversationId, {
						text,
						replyContext: this.lastContextByConversation.get(binding.conversationKey) ?? binding.lastReplyContext
					})
				};
			}
		});
		const onInbound = (msg) => this.handleInbound(msg);
		this.adapters = {
			feishu: new FeishuAdapter({
				getConfig: () => this.settings.channels.feishu,
				onMessage: onInbound,
				onEvent: (level, message) => this.pushEvent("feishu", level, message),
				fetchImpl: options.fetchImpl,
				webSocketFactory: options.webSocketFactory
			}),
			dingtalk: new DingTalkAdapter({
				getConfig: () => this.settings.channels.dingtalk,
				onMessage: onInbound,
				onEvent: (level, message) => this.pushEvent("dingtalk", level, message),
				fetchImpl: options.fetchImpl,
				webSocketFactory: options.webSocketFactory
			}),
			wecom: new WeComAdapter({
				getConfig: () => this.settings.channels.wecom,
				onMessage: onInbound,
				onEvent: (level, message) => this.pushEvent("wecom", level, message),
				fetchImpl: options.fetchImpl
			}),
			webhook: new GenericWebhookAdapter({
				getConfig: () => this.settings.channels.webhook,
				onMessage: onInbound,
				onEvent: (level, message) => this.pushEvent("webhook", level, message),
				fetchImpl: options.fetchImpl,
				nowMs: options.nowMs
			})
		};
	}
	install(ctx) {
		const stopHarness = this.harnessBridge.install(ctx);
		const stopApproval = this.approvalBridge.install(ctx);
		return () => {
			stopApproval();
			stopHarness();
			this.dispose();
		};
	}
	getSettings() {
		return this.settings;
	}
	async applySettings(next) {
		this.settings = next;
		this.approvalBridge.setDualApproval(next.dualApproval);
		if (!next.enabled) {
			await Promise.all(CHANNEL_IDS.map((id) => this.adapters[id].stop()));
			this.pushEvent("hub", "info", "IM Hub disabled; all channels stopped");
			return;
		}
		await Promise.all(CHANNEL_IDS.map(async (id) => {
			if (next.channels[id].enabled) await this.adapters[id].start();
			else await this.adapters[id].stop();
		}));
	}
	async restartChannel(channelId) {
		const adapter = this.adapters[channelId];
		await adapter.stop();
		if (this.settings.enabled && this.settings.channels[channelId].enabled) await adapter.start();
		return adapter.getStatus();
	}
	async testChannel(channelId) {
		return this.adapters[channelId].testConnection();
	}
	async handleWebhook(channelId, req) {
		if (!this.settings.enabled) return {
			status: 404,
			headers: { "content-type": "application/json; charset=utf-8" },
			body: JSON.stringify({ error: "im-hub disabled" })
		};
		const adapter = this.adapters[channelId];
		if (!adapter.handleWebhook) return {
			status: 404,
			headers: { "content-type": "application/json; charset=utf-8" },
			body: JSON.stringify({ error: "webhook not supported" })
		};
		return adapter.handleWebhook(req);
	}
	async handleInbound(message) {
		if (this.disposed || !this.settings.enabled) return;
		const policy = this.settings.channels[message.channel].access;
		const access = evaluateAccess(message, policy);
		if (!access.allowed) {
			this.pushEvent(message.channel, "warn", `blocked message from ${message.senderId}: ${access.reason}`);
			return;
		}
		const key = buildConversationKey(message.channel, message.conversationId);
		if (message.replyContext) this.lastContextByConversation.set(key, message.replyContext);
		const adapter = this.adapters[message.channel];
		const sendReply = async (text) => {
			await adapter.send(message.conversationId, {
				text,
				replyContext: message.replyContext ?? this.lastContextByConversation.get(key)
			});
		};
		const cmd = parseControlCommand(message.text);
		if (cmd) switch (cmd.kind) {
			case "help":
				await sendReply(formatHelpMessage(message.channel));
				return;
			case "status": {
				const binding = this.harnessBridge.getBinding(key);
				const wsPath = this.harnessBridge.resolveWorkspacePath(key);
				const pending = this.approvalBridge.pendingForConversation(key);
				await sendReply([
					`📊 IM Hub 状态 (${message.channel})`,
					`- 会话绑定: ${binding ? `已连接 (${binding.sessionId})` : "未启动（发送消息后自动创建）"}`,
					`- 当前工作区: \`${wsPath}\``,
					`- 队列忙碌: ${this.queue.isBusy(key) ? "是" : "否"} (深度 ${this.queue.depth(key)})`,
					`- 待审工具调用: ${pending.length}`
				].join("\n"));
				return;
			}
			case "stop":
				await sendReply(await this.harnessBridge.stopConversation(key) ? "⏹️ 已请求中止当前回复。" : "ℹ️ 当前没有正在执行的回复。");
				return;
			case "new":
				this.approvalBridge.cancelConversation(key);
				await this.harnessBridge.resetConversation(key);
				await sendReply("🆕 已开启新对话上下文。");
				return;
			case "workspace":
				if (!cmd.path) {
					await sendReply(`📁 当前绑定工作区: \`${this.harnessBridge.resolveWorkspacePath(key)}\``);
					return;
				}
				await sendReply(`📁 已切换工作区为 \`${await this.harnessBridge.setWorkspace(key, cmd.path)}\` 并重置会话上下文。`);
				return;
			case "approve":
				await sendReply(this.approvalBridge.resolveFromIm(key, cmd.approvalId, "allowed-once", message.senderId, policy).message);
				return;
			case "reject":
				await sendReply(this.approvalBridge.resolveFromIm(key, cmd.approvalId, "rejected", message.senderId, policy).message);
				return;
		}
		if (this.settings.busyMode === "steer" && this.queue.isBusy(key)) await this.harnessBridge.stopConversation(key);
		await this.queue.enqueue(key, async () => {
			try {
				await this.harnessBridge.runTurn(message, (reply) => adapter.send(message.conversationId, reply));
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				this.pushEvent(message.channel, "error", `turn failed: ${msg}`);
				await sendReply(`⚠️ 处理消息时出现异常: ${msg}`).catch(() => {});
			}
		});
	}
	getStateSnapshot() {
		return {
			settings: redactSettingsForClient(this.settings),
			channels: {
				feishu: this.adapters.feishu.getStatus(),
				dingtalk: this.adapters.dingtalk.getStatus(),
				wecom: this.adapters.wecom.getStatus(),
				webhook: this.adapters.webhook.getStatus()
			},
			events: [...this.events],
			pendingApprovals: this.approvalBridge.pendingCount(),
			webhookEndpoints: {
				wecom: `${ROUTE_PREFIX}/webhook/wecom`,
				webhook: `${ROUTE_PREFIX}/webhook/generic`
			}
		};
	}
	async dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.approvalBridge.disposeAll();
		await Promise.all(CHANNEL_IDS.map((id) => this.adapters[id].stop()));
		await this.harnessBridge.disposeAll();
	}
	pushEvent(channel, level, message) {
		this.events.unshift({
			ts: Date.now(),
			channel,
			level,
			message
		});
		if (this.events.length > 50) this.events.length = 50;
	}
};
//#endregion
//#region src/host/settings-store.ts
function resolveDshHome(env = process.env) {
	const fromEnv = String(env.DSH_HOME ?? "").trim();
	return fromEnv === "" ? join(homedir(), ".dsh") : fromEnv;
}
function settingsFilePath(home = resolveDshHome()) {
	return join(home, SETTINGS_FILE);
}
async function readSettings(home = resolveDshHome()) {
	try {
		const raw = await readFile(settingsFilePath(home), "utf8");
		return normalizeSettings(JSON.parse(raw)).settings;
	} catch {
		return defaultSettings();
	}
}
async function writeSettingsAtomic(input, home = resolveDshHome(), platform = process.platform) {
	const normalized = normalizeSettings(input, await readSettingsIfPresent(home));
	const target = settingsFilePath(home);
	await mkdir(dirname(target), { recursive: true });
	const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const tmpPath = `${target}.tmp-${suffix}`;
	const backupPath = `${target}.backup-${suffix}`;
	await writeFile(tmpPath, `${JSON.stringify(normalized.settings, null, 2)}\n`, {
		encoding: "utf8",
		mode: 384,
		flag: "wx"
	});
	let backedUp = false;
	try {
		try {
			await rename(target, backupPath);
			backedUp = true;
		} catch (error) {
			if (error?.code !== "ENOENT" && platform !== "win32") throw error;
		}
		await rename(tmpPath, target).catch(async (error) => {
			if (platform !== "win32" || error?.code !== "EEXIST") throw error;
			if (!backedUp) {
				await rename(target, backupPath);
				backedUp = true;
			}
			await rename(tmpPath, target);
		});
		if (backedUp) await rm(backupPath, { force: true });
	} catch (error) {
		await rm(tmpPath, { force: true }).catch(() => {});
		if (backedUp) await rename(backupPath, target).catch(() => {});
		throw error;
	}
	return normalized;
}
async function readSettingsIfPresent(home) {
	try {
		const raw = await readFile(settingsFilePath(home), "utf8");
		return normalizeSettings(JSON.parse(raw)).settings;
	} catch {
		return;
	}
}
//#endregion
//#region src/index.ts
function sendJson(response, status, body) {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	response.end(JSON.stringify(body));
}
async function readTextBody(request, maxBytes = 256 * 1024) {
	const chunks = [];
	let total = 0;
	if (Symbol.asyncIterator in request && typeof request[Symbol.asyncIterator] === "function") for await (const chunk of request) {
		const buf = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);
		total += buf.byteLength;
		if (total > maxBytes) throw new Error("request body too large");
		chunks.push(buf);
	}
	return Buffer.concat(chunks).toString("utf8");
}
function isAuthorizedAdminRequest(ctx, request, peer) {
	const addr = request.socket?.remoteAddress;
	if (addr !== void 0 && ![
		"127.0.0.1",
		"::1",
		"::ffff:127.0.0.1"
	].includes(addr)) return false;
	if (request.headers["x-dsh-im-hub"] !== "1") return false;
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	if (peer?.principal?.kind !== void 0 && peer.principal.kind !== "owner") return false;
	const userScope = getHostService(ctx, "userScope");
	if (userScope?.currentScope) {
		const current = userScope.currentScope();
		const scope = userScope.desktopScope?.();
		if (current?.source !== void 0 && current.source !== "desktop") return false;
		if (current !== void 0 && scope !== void 0 && current.principalId !== scope.principalId) return false;
	}
	return true;
}
function isChannelId(value) {
	return typeof value === "string" && CHANNEL_IDS.includes(value);
}
function apply(ctx, options = {}) {
	const home = options.home ?? resolveDshHome();
	const hub = new ImHubManager({
		ctx,
		initialSettings: options.initialSettings ?? defaultSettings(),
		fetchImpl: options.fetchImpl,
		webSocketFactory: options.webSocketFactory,
		turnRunner: options.turnRunner,
		nowMs: options.nowMs
	});
	if (!options.initialSettings) readSettings(home).then((loaded) => hub.applySettings(loaded)).catch(() => {});
	else hub.applySettings(options.initialSettings).catch(() => {});
	const handleRequest = async (request, response, peer) => {
		const url = new URL(request.url ?? "/", "http://localhost");
		const method = (request.method ?? "GET").toUpperCase();
		if (url.pathname === `/api/dsh-im-hub/webhook/wecom`) {
			try {
				const rawBody = method === "GET" ? "" : await readTextBody(request);
				const out = await hub.handleWebhook("wecom", {
					method,
					url: request.url ?? url.pathname,
					headers: request.headers,
					rawBody
				});
				response.writeHead(out.status, {
					"cache-control": "no-store",
					...out.headers ?? { "content-type": "text/plain; charset=utf-8" }
				});
				response.end(out.body);
			} catch (error) {
				sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
			}
			return;
		}
		if (url.pathname === `/api/dsh-im-hub/webhook/generic`) {
			try {
				const rawBody = await readTextBody(request);
				const out = await hub.handleWebhook("webhook", {
					method,
					url: request.url ?? url.pathname,
					headers: request.headers,
					rawBody
				});
				response.writeHead(out.status, {
					"cache-control": "no-store",
					...out.headers ?? { "content-type": "application/json; charset=utf-8" }
				});
				response.end(out.body);
			} catch (error) {
				sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
			}
			return;
		}
		if (!isAuthorizedAdminRequest(ctx, request, peer)) {
			sendJson(response, 403, { error: "forbidden" });
			return;
		}
		try {
			if (method === "GET" && url.pathname === `/api/dsh-im-hub/state`) {
				sendJson(response, 200, hub.getStateSnapshot());
				return;
			}
			if (method === "GET" && url.pathname === `/api/dsh-im-hub/settings`) {
				const loaded = await readSettings(home);
				await hub.applySettings(loaded);
				sendJson(response, 200, { settings: hub.getStateSnapshot().settings });
				return;
			}
			if (method === "POST" && url.pathname === `/api/dsh-im-hub/settings`) {
				const rawText = await readTextBody(request);
				const saved = await writeSettingsAtomic(rawText.trim() === "" ? {} : JSON.parse(rawText), home);
				await hub.applySettings(saved.settings);
				sendJson(response, 200, {
					settings: hub.getStateSnapshot().settings,
					problems: saved.problems
				});
				return;
			}
			if (method === "POST" && url.pathname === `/api/dsh-im-hub/channel/test`) {
				const rawText = await readTextBody(request);
				const body = rawText.trim() === "" ? {} : JSON.parse(rawText);
				if (!isChannelId(body.channel)) {
					sendJson(response, 400, { error: "invalid channel" });
					return;
				}
				sendJson(response, 200, await hub.testChannel(body.channel));
				return;
			}
			if (method === "POST" && url.pathname === `/api/dsh-im-hub/channel/restart`) {
				const rawText = await readTextBody(request);
				const body = rawText.trim() === "" ? {} : JSON.parse(rawText);
				if (!isChannelId(body.channel)) {
					sendJson(response, 400, { error: "invalid channel" });
					return;
				}
				sendJson(response, 200, { status: await hub.restartChannel(body.channel) });
				return;
			}
			if (method === "POST" && url.pathname === `/api/dsh-im-hub/approvals/decision`) {
				const rawText = await readTextBody(request);
				const body = rawText.trim() === "" ? {} : JSON.parse(rawText);
				if (typeof body.id !== "string" || body.decision !== "allowed-once" && body.decision !== "rejected") {
					sendJson(response, 400, { error: "invalid decision" });
					return;
				}
				const accepted = hub.approvalBridge.resolveById(body.id, body.decision);
				sendJson(response, accepted ? 200 : 409, { accepted });
				return;
			}
			sendJson(response, 404, { error: "not-found" });
		} catch (error) {
			sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
		}
	};
	ctx.effect(() => hub.install(ctx));
	ctx.effect(() => {
		const webServer = getHostService(ctx, "webServer");
		if (!webServer) return () => {};
		if (typeof webServer.register === "function") return webServer.register({
			path: "/api/dsh-im-hub",
			kind: "prefix",
			handler: handleRequest
		}) ?? (() => {});
		const stops = [
			["GET", `${ROUTE_PREFIX}/state`],
			["GET", `${ROUTE_PREFIX}/settings`],
			["POST", `${ROUTE_PREFIX}/settings`],
			["POST", `${ROUTE_PREFIX}/channel/test`],
			["POST", `${ROUTE_PREFIX}/channel/restart`],
			["POST", `${ROUTE_PREFIX}/approvals/decision`],
			["GET", `${ROUTE_PREFIX}/webhook/wecom`],
			["POST", `${ROUTE_PREFIX}/webhook/wecom`],
			["POST", `${ROUTE_PREFIX}/webhook/generic`]
		].map(([method, path]) => webServer.route?.(method, path, handleRequest)).filter((d) => typeof d === "function");
		return () => {
			for (const stop of stops) stop();
		};
	});
	return hub;
}
//#endregion
export { ApprovalBridge, CHANNEL_IDS, ConversationQueue, DingTalkAdapter, FeishuAdapter, GenericWebhookAdapter, HarnessBridge, ImHubManager, PACKAGE_ID, ROUTE_PREFIX, SECRET_MASK, SETTINGS_FILE, WeComAdapter, apply, buildConversationKey, computeWeComSignature, decryptWeComPayload, defaultAccessPolicy, defaultSettings, encryptWeComPayload, evaluateAccess, extractFeishuTextContent, extractXmlTag, formatHelpMessage, isApprovalAuthorized, normalizeSettings, parseControlCommand, readSettings, redactSettingsForClient, resolveDshHome, resolveFeishuBaseUrl, signWebhookPayload, splitMessageChunks, summarizeToolRequest, verifyWeComSignature, verifyWebhookSignature, writeSettingsAtomic };
