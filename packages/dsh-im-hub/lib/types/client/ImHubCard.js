import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { CHANNEL_IDS, defaultSettings, } from "../core/settings.js";
import { fetchImHubState, restartImHubChannel, saveImHubSettings, testImHubChannel, } from "./api.js";
import css from './ImHub.module.css';
function parseCsvList(raw) {
    return raw
        .split(/[\n,]/)
        .map(item => item.trim())
        .filter(Boolean);
}
function formatStateLabel(state, t) {
    switch (state) {
        case 'disabled': return t('stateDisabled');
        case 'idle': return t('stateIdle');
        case 'connecting': return t('stateConnecting');
        case 'connected': return t('stateConnected');
        case 'webhook-ready': return t('stateWebhookReady');
        case 'error': return t('stateError');
    }
}
export function ImHubCard({ t }) {
    const [state, setState] = useState(null);
    const [draft, setDraft] = useState(defaultSettings);
    const [activeTab, setActiveTab] = useState('feishu');
    const [busy, setBusy] = useState(false);
    const [copiedPath, setCopiedPath] = useState(null);
    const [feedback, setFeedback] = useState(null);
    const refresh = useCallback(async () => {
        try {
            const next = await fetchImHubState();
            setState(next);
            setDraft(next.settings);
        }
        catch {
            setFeedback({ kind: 'err', text: t('errorNotice') });
        }
    }, [t]);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    const tabLabel = (id) => {
        switch (id) {
            case 'feishu': return t('tabFeishu');
            case 'dingtalk': return t('tabDingTalk');
            case 'wecom': return t('tabWeCom');
            case 'webhook': return t('tabWebhook');
        }
    };
    const protocolBadge = (id) => {
        switch (id) {
            case 'feishu': return t('badgeFeishu');
            case 'dingtalk': return t('badgeDingTalk');
            case 'wecom': return draft.channels.wecom.mode === 'app' ? t('badgeWeComApp') : t('badgeWeComWebhook');
            case 'webhook': return t('badgeWebhook');
        }
    };
    function updatePolicy(channel, patch) {
        setDraft(prev => ({
            ...prev,
            channels: {
                ...prev.channels,
                [channel]: {
                    ...prev.channels[channel],
                    access: {
                        ...prev.channels[channel].access,
                        ...patch,
                    },
                },
            },
        }));
    }
    async function handleCopy(pathText) {
        try {
            await navigator.clipboard?.writeText(pathText);
            setCopiedPath(pathText);
            setTimeout(() => {
                setCopiedPath(prev => (prev === pathText ? null : prev));
            }, 1500);
        }
        catch { }
    }
    async function handleSave() {
        setBusy(true);
        setFeedback(null);
        try {
            const res = await saveImHubSettings(draft);
            setDraft(res.settings);
            const nextState = await fetchImHubState();
            setState(nextState);
            setFeedback({
                kind: 'ok',
                text: res.problems.length > 0 ? `${t('savedNotice')} (${res.problems.join('; ')})` : t('savedNotice'),
            });
        }
        catch {
            setFeedback({ kind: 'err', text: t('errorNotice') });
        }
        finally {
            setBusy(false);
        }
    }
    async function handleTest() {
        setBusy(true);
        setFeedback(null);
        try {
            await saveImHubSettings(draft);
            const res = await testImHubChannel(activeTab);
            setFeedback({ kind: res.ok ? 'ok' : 'err', text: res.detail });
            await refresh();
        }
        catch {
            setFeedback({ kind: 'err', text: t('errorNotice') });
        }
        finally {
            setBusy(false);
        }
    }
    async function handleRestart() {
        setBusy(true);
        setFeedback(null);
        try {
            await restartImHubChannel(activeTab);
            setFeedback({ kind: 'ok', text: t('restartedNotice') });
            await refresh();
        }
        catch {
            setFeedback({ kind: 'err', text: t('errorNotice') });
        }
        finally {
            setBusy(false);
        }
    }
    const activeChannelCfg = draft.channels[activeTab];
    const activeStatus = state?.channels[activeTab];
    const isDirty = state !== null && JSON.stringify(draft) !== JSON.stringify(state.settings);
    const wecomPath = state?.webhookEndpoints.wecom ?? '/api/dsh-im-hub/webhook/wecom';
    const webhookPath = state?.webhookEndpoints.webhook ?? '/api/dsh-im-hub/webhook/generic';
    return (_jsxs("section", { className: css.card, "data-im-hub-settings": true, children: [_jsxs("header", { className: css.hero, children: [_jsxs("div", { className: css.heroText, children: [_jsxs("div", { className: css.titleRow, children: [_jsx("h3", { className: css.title, children: t('cardTitle') }), _jsxs("span", { className: css.statusPill, "data-active": draft.enabled ? 'true' : 'false', children: [_jsx("span", { className: css.statusDot, "aria-hidden": "true" }), _jsx("span", { children: draft.enabled ? t('statusActive') : t('statusDisabled') })] })] }), _jsx("p", { className: css.description, children: t('cardDescription') })] }), _jsxs("label", { className: css.heroControl, children: [_jsx("span", { className: css.masterText, children: t('masterEnableLabel') }), _jsxs("span", { className: css.switchControl, children: [_jsx("input", { type: "checkbox", role: "switch", "aria-label": t('masterEnableLabel'), className: css.switchInput, checked: draft.enabled, onChange: e => setDraft(prev => ({ ...prev, enabled: e.target.checked })) }), _jsx("span", { className: css.switchTrack, "aria-hidden": "true" })] })] })] }), _jsx("div", { className: css.coexistNote, children: t('coexistenceHint') }), _jsx("div", { className: css.tabs, role: "tablist", children: CHANNEL_IDS.map((id) => {
                    const chStatus = state?.channels[id]?.state ?? 'disabled';
                    return (_jsxs("button", { type: "button", role: "tab", "aria-selected": activeTab === id, "data-active": activeTab === id ? 'true' : 'false', className: css.tab, onClick: () => setActiveTab(id), children: [_jsx("span", { className: css.dot, "data-state": chStatus }), _jsx("span", { children: tabLabel(id) })] }, id));
                }) }), _jsxs("div", { className: css.panel, children: [_jsxs("div", { className: css.panelTop, children: [_jsxs("label", { className: css.channelSwitchRow, children: [_jsxs("span", { className: css.switchControl, children: [_jsx("input", { type: "checkbox", role: "switch", "aria-label": t('channelEnableLabel'), className: css.switchInput, checked: activeChannelCfg.enabled, onChange: e => setDraft(prev => ({
                                                    ...prev,
                                                    channels: {
                                                        ...prev.channels,
                                                        [activeTab]: { ...prev.channels[activeTab], enabled: e.target.checked },
                                                    },
                                                })) }), _jsx("span", { className: css.switchTrack, "aria-hidden": "true" })] }), _jsx("span", { className: css.channelSwitchLabel, children: t('channelEnableLabel') }), _jsx("span", { className: css.protocolTag, children: protocolBadge(activeTab) })] }), _jsxs("div", { className: css.metaRow, children: [_jsxs("span", { children: [t('channelStateLabel'), ": ", formatStateLabel(activeStatus?.state ?? 'disabled', t)] }), _jsxs("span", { children: [t('channelMsgsLabel'), ": ", activeStatus?.messageCount ?? 0] })] })] }), _jsxs("div", { className: css.subBlock, children: [_jsx("div", { className: css.subHeading, children: t('connectSectionTitle') }), activeTab === 'feishu' && (_jsxs("div", { className: css.grid, children: [_jsxs("label", { className: css.field, children: [_jsx("span", { children: t('feishuDomainLabel') }), _jsxs("select", { className: css.select, value: draft.channels.feishu.domain, onChange: e => setDraft(prev => ({
                                                    ...prev,
                                                    channels: {
                                                        ...prev.channels,
                                                        feishu: { ...prev.channels.feishu, domain: e.target.value === 'lark' ? 'lark' : 'feishu' },
                                                    },
                                                })), children: [_jsx("option", { value: "feishu", children: "Feishu (open.feishu.cn)" }), _jsx("option", { value: "lark", children: "Lark (open.larksuite.com)" })] })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('feishuAppIdLabel') }), _jsx("input", { className: css.input, type: "text", placeholder: "cli_a1b2c3d4...", value: draft.channels.feishu.appId, onChange: e => setDraft(prev => ({
                                                    ...prev,
                                                    channels: { ...prev.channels, feishu: { ...prev.channels.feishu, appId: e.target.value } },
                                                })) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('feishuAppSecretLabel') }), _jsx("input", { className: css.input, type: "password", value: draft.channels.feishu.appSecret, onChange: e => setDraft(prev => ({
                                                    ...prev,
                                                    channels: { ...prev.channels, feishu: { ...prev.channels.feishu, appSecret: e.target.value } },
                                                })) })] })] })), activeTab === 'dingtalk' && (_jsxs("div", { className: css.grid, children: [_jsxs("label", { className: css.field, children: [_jsx("span", { children: t('dingtalkClientIdLabel') }), _jsx("input", { className: css.input, type: "text", placeholder: "dingxxxxxxxx", value: draft.channels.dingtalk.clientId, onChange: e => setDraft(prev => ({
                                                    ...prev,
                                                    channels: { ...prev.channels, dingtalk: { ...prev.channels.dingtalk, clientId: e.target.value } },
                                                })) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('dingtalkClientSecretLabel') }), _jsx("input", { className: css.input, type: "password", value: draft.channels.dingtalk.clientSecret, onChange: e => setDraft(prev => ({
                                                    ...prev,
                                                    channels: { ...prev.channels, dingtalk: { ...prev.channels.dingtalk, clientSecret: e.target.value } },
                                                })) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('dingtalkRobotCodeLabel') }), _jsx("input", { className: css.input, type: "text", value: draft.channels.dingtalk.robotCode, onChange: e => setDraft(prev => ({
                                                    ...prev,
                                                    channels: { ...prev.channels, dingtalk: { ...prev.channels.dingtalk, robotCode: e.target.value } },
                                                })) })] })] })), activeTab === 'wecom' && (_jsxs(_Fragment, { children: [_jsxs("div", { className: css.grid, children: [_jsxs("label", { className: css.field, children: [_jsx("span", { children: t('wecomModeLabel') }), _jsxs("select", { className: css.select, value: draft.channels.wecom.mode, onChange: e => setDraft(prev => ({
                                                            ...prev,
                                                            channels: {
                                                                ...prev.channels,
                                                                wecom: { ...prev.channels.wecom, mode: e.target.value === 'app' ? 'app' : 'webhook' },
                                                            },
                                                        })), children: [_jsx("option", { value: "webhook", children: t('wecomModeWebhook') }), _jsx("option", { value: "app", children: t('wecomModeApp') })] })] }), draft.channels.wecom.mode === 'webhook' ? (_jsxs("label", { className: css.field, children: [_jsx("span", { children: t('wecomWebhookUrlLabel') }), _jsx("input", { className: css.input, type: "text", placeholder: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...", value: draft.channels.wecom.webhookUrl, onChange: e => setDraft(prev => ({
                                                            ...prev,
                                                            channels: { ...prev.channels, wecom: { ...prev.channels.wecom, webhookUrl: e.target.value } },
                                                        })) })] })) : (_jsxs(_Fragment, { children: [_jsxs("label", { className: css.field, children: [_jsx("span", { children: t('wecomCorpIdLabel') }), _jsx("input", { className: css.input, type: "text", value: draft.channels.wecom.corpId, onChange: e => setDraft(prev => ({
                                                                    ...prev,
                                                                    channels: { ...prev.channels, wecom: { ...prev.channels.wecom, corpId: e.target.value } },
                                                                })) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('wecomCorpSecretLabel') }), _jsx("input", { className: css.input, type: "password", value: draft.channels.wecom.corpSecret, onChange: e => setDraft(prev => ({
                                                                    ...prev,
                                                                    channels: { ...prev.channels, wecom: { ...prev.channels.wecom, corpSecret: e.target.value } },
                                                                })) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('wecomAgentIdLabel') }), _jsx("input", { className: css.input, type: "text", value: draft.channels.wecom.agentId, onChange: e => setDraft(prev => ({
                                                                    ...prev,
                                                                    channels: { ...prev.channels, wecom: { ...prev.channels.wecom, agentId: e.target.value } },
                                                                })) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('wecomTokenLabel') }), _jsx("input", { className: css.input, type: "password", value: draft.channels.wecom.token, onChange: e => setDraft(prev => ({
                                                                    ...prev,
                                                                    channels: { ...prev.channels, wecom: { ...prev.channels.wecom, token: e.target.value } },
                                                                })) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('wecomEncodingAesKeyLabel') }), _jsx("input", { className: css.input, type: "password", value: draft.channels.wecom.encodingAesKey, onChange: e => setDraft(prev => ({
                                                                    ...prev,
                                                                    channels: { ...prev.channels, wecom: { ...prev.channels.wecom, encodingAesKey: e.target.value } },
                                                                })) })] })] }))] }), _jsxs("div", { className: css.copyBar, children: [_jsxs("div", { className: css.copyBarLeft, children: [_jsx("span", { className: css.copyLabel, children: t('wecomCallbackHint') }), _jsx("code", { className: css.copyCode, children: wecomPath })] }), _jsx("button", { type: "button", className: css.copyBtn, onClick: () => void handleCopy(wecomPath), children: copiedPath === wecomPath ? t('copiedNotice') : t('copyAction') })] })] })), activeTab === 'webhook' && (_jsxs(_Fragment, { children: [_jsxs("div", { className: css.grid, children: [_jsxs("label", { className: css.field, children: [_jsx("span", { children: t('webhookSecretLabel') }), _jsx("input", { className: css.input, type: "password", value: draft.channels.webhook.signingSecret, onChange: e => setDraft(prev => ({
                                                            ...prev,
                                                            channels: { ...prev.channels, webhook: { ...prev.channels.webhook, signingSecret: e.target.value } },
                                                        })) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('webhookOutboundUrlLabel') }), _jsx("input", { className: css.input, type: "text", placeholder: "http://127.0.0.1:8080/callback", value: draft.channels.webhook.outboundUrl, onChange: e => setDraft(prev => ({
                                                            ...prev,
                                                            channels: { ...prev.channels, webhook: { ...prev.channels.webhook, outboundUrl: e.target.value } },
                                                        })) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('webhookReplayWindowLabel') }), _jsx("input", { className: css.input, type: "number", min: 30, max: 3600, value: draft.channels.webhook.replayWindowSec, onChange: e => setDraft(prev => ({
                                                            ...prev,
                                                            channels: {
                                                                ...prev.channels,
                                                                webhook: { ...prev.channels.webhook, replayWindowSec: Number(e.target.value) || 300 },
                                                            },
                                                        })) })] })] }), _jsxs("div", { className: css.copyBar, children: [_jsxs("div", { className: css.copyBarLeft, children: [_jsx("span", { className: css.copyLabel, children: t('webhookEndpointHint') }), _jsx("code", { className: css.copyCode, children: webhookPath })] }), _jsx("button", { type: "button", className: css.copyBtn, onClick: () => void handleCopy(webhookPath), children: copiedPath === webhookPath ? t('copiedNotice') : t('copyAction') })] })] })), _jsxs("div", { className: css.channelActions, children: [_jsx("button", { type: "button", className: css.btn, disabled: busy, onClick: () => void handleTest(), children: t('testAction') }), _jsx("button", { type: "button", className: css.btn, disabled: busy, onClick: () => void handleRestart(), children: t('restartAction') })] })] }), _jsxs("div", { className: css.subSection, children: [_jsx("div", { className: css.subHeading, children: t('accessPolicyHeading') }), _jsxs("div", { className: css.field, children: [_jsx("span", { children: t('accessModeLabel') }), _jsxs("div", { className: css.segmented2, role: "group", "aria-label": t('accessModeLabel'), children: [_jsx("button", { type: "button", className: css.segBtn, "aria-pressed": activeChannelCfg.access.mode === 'allowlist', onClick: () => updatePolicy(activeTab, { mode: 'allowlist' }), children: t('accessAllowlist') }), _jsx("button", { type: "button", className: css.segBtn, "aria-pressed": activeChannelCfg.access.mode === 'open', onClick: () => updatePolicy(activeTab, { mode: 'open' }), children: t('accessOpen') })] })] }), activeChannelCfg.access.mode === 'allowlist' ? (_jsxs("div", { className: css.grid, children: [_jsxs("label", { className: css.field, children: [_jsx("span", { children: t('allowUsersLabel') }), _jsx("input", { className: css.input, type: "text", placeholder: "ou_xxx, *", value: activeChannelCfg.access.allowUsers.join(', '), onChange: e => updatePolicy(activeTab, { allowUsers: parseCsvList(e.target.value) }) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('allowGroupsLabel') }), _jsx("input", { className: css.input, type: "text", placeholder: "oc_xxx, *", value: activeChannelCfg.access.allowGroups.join(', '), onChange: e => updatePolicy(activeTab, { allowGroups: parseCsvList(e.target.value) }) })] })] })) : (_jsx("div", { className: css.calloutAmber, children: t('accessOpenWarning') })), _jsxs("div", { className: css.switchRow, children: [_jsxs("div", { className: css.rowText, children: [_jsx("div", { className: css.rowTitle, children: t('groupMentionOnlyLabel') }), _jsx("div", { className: css.rowDesc, children: t('groupMentionOnlyDesc') })] }), _jsxs("label", { className: css.switchControl, children: [_jsx("input", { type: "checkbox", role: "switch", "aria-label": t('groupMentionOnlyLabel'), className: css.switchInput, checked: activeChannelCfg.access.groupMentionOnly, onChange: e => updatePolicy(activeTab, { groupMentionOnly: e.target.checked }) }), _jsx("span", { className: css.switchTrack, "aria-hidden": "true" })] })] })] })] }), _jsxs("details", { className: css.disclosure, "data-im-hub-global": true, children: [_jsx("summary", { className: css.disclosureSummary, children: t('globalSectionTitle') }), _jsxs("div", { className: css.disclosureBody, children: [_jsxs("div", { className: css.switchRow, children: [_jsxs("div", { className: css.rowText, children: [_jsx("div", { className: css.rowTitle, children: t('dualApprovalLabel') }), _jsx("div", { className: css.rowDesc, children: t('dualApprovalDesc') })] }), _jsxs("label", { className: css.switchControl, children: [_jsx("input", { type: "checkbox", role: "switch", "aria-label": t('dualApprovalLabel'), className: css.switchInput, checked: draft.dualApproval, onChange: e => setDraft(prev => ({ ...prev, dualApproval: e.target.checked })) }), _jsx("span", { className: css.switchTrack, "aria-hidden": "true" })] })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('defaultWorkspaceLabel') }), _jsx("input", { className: css.input, type: "text", placeholder: "D:\\workspace\\project", value: draft.defaultWorkspacePath, onChange: e => setDraft(prev => ({ ...prev, defaultWorkspacePath: e.target.value })) })] }), _jsxs("div", { className: css.grid, children: [_jsxs("div", { className: css.field, children: [_jsx("span", { children: t('busyModeLabel') }), _jsxs("div", { className: css.segmented2, role: "group", "aria-label": t('busyModeLabel'), children: [_jsx("button", { type: "button", className: css.segBtn, "aria-pressed": draft.busyMode === 'queue', onClick: () => setDraft(prev => ({ ...prev, busyMode: 'queue' })), children: t('busyQueue') }), _jsx("button", { type: "button", className: css.segBtn, "aria-pressed": draft.busyMode === 'steer', onClick: () => setDraft(prev => ({ ...prev, busyMode: 'steer' })), children: t('busySteer') })] })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('maxReplyCharsLabel') }), _jsx("input", { className: css.input, type: "number", min: 500, max: 16000, value: draft.maxReplyChars, onChange: e => setDraft(prev => ({ ...prev, maxReplyChars: Number(e.target.value) || 3500 })) })] })] })] })] }), _jsxs("details", { className: css.disclosure, children: [_jsx("summary", { className: css.disclosureSummary, children: `${t('diagnosticsTitle')} (${state?.events.length ?? 0})` }), _jsx("div", { className: css.disclosureBody, children: _jsx("div", { className: css.diagnostics, children: (!state || state.events.length === 0) ? (_jsx("span", { children: t('diagnosticsEmpty') })) : state.events.slice(0, 15).map((ev, index) => (_jsxs("div", { className: css.diagLine, children: [_jsx("span", { className: css.diagLevel, "data-level": ev.level, children: ev.level }), _jsxs("span", { children: ["[", new Date(ev.ts).toISOString(), "] [", ev.channel, "] ", ev.message] })] }, `${ev.ts}-${index}`))) }) })] }), _jsxs("footer", { className: css.footer, children: [_jsx("div", { children: feedback ? (_jsx("span", { className: feedback.kind === 'ok' ? css.notice : css.error, children: feedback.text })) : isDirty ? (_jsx("span", { className: css.dirty, children: t('dirtyNotice') })) : null }), _jsxs("div", { className: css.actions, children: [_jsx("button", { type: "button", className: css.btn, disabled: busy, onClick: () => void refresh(), children: t('refreshAction') }), _jsx("button", { type: "button", className: css.primaryBtn, disabled: busy, onClick: () => void handleSave(), children: busy ? t('saving') : t('saveAction') })] })] })] }));
}
