import { useCallback, useEffect, useState } from 'react'
import {
  CHANNEL_IDS,
  defaultSettings,
  type ChannelAccessPolicy,
  type ChannelId,
  type ChannelRuntimeState,
  type ImHubSettings,
} from '../core/settings.ts'
import {
  fetchImHubState,
  restartImHubChannel,
  saveImHubSettings,
  testImHubChannel,
  type ImHubStateResponse,
} from './api.ts'
import css from './ImHub.module.css'
import type { ImHubLocaleKey } from './locales.ts'

export interface ImHubCardProps {
  t: (key: ImHubLocaleKey) => string
}

function parseCsvList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function formatStateLabel(state: ChannelRuntimeState, t: (key: ImHubLocaleKey) => string): string {
  switch (state) {
    case 'disabled': return t('stateDisabled')
    case 'idle': return t('stateIdle')
    case 'connecting': return t('stateConnecting')
    case 'connected': return t('stateConnected')
    case 'webhook-ready': return t('stateWebhookReady')
    case 'error': return t('stateError')
  }
}

export function ImHubCard({ t }: ImHubCardProps) {
  const [state, setState] = useState<ImHubStateResponse | null>(null)
  const [draft, setDraft] = useState<ImHubSettings>(defaultSettings)
  const [activeTab, setActiveTab] = useState<ChannelId>('feishu')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await fetchImHubState()
      setState(next)
      setDraft(next.settings)
    } catch {
      setFeedback({ kind: 'err', text: t('errorNotice') })
    }
  }, [t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const tabLabel = (id: ChannelId): string => {
    switch (id) {
      case 'feishu': return t('tabFeishu')
      case 'dingtalk': return t('tabDingTalk')
      case 'wecom': return t('tabWeCom')
      case 'webhook': return t('tabWebhook')
    }
  }

  function updatePolicy(channel: ChannelId, patch: Partial<ChannelAccessPolicy>): void {
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
    }))
  }

  async function handleSave(): Promise<void> {
    setBusy(true)
    setFeedback(null)
    try {
      const res = await saveImHubSettings(draft)
      setDraft(res.settings)
      const nextState = await fetchImHubState()
      setState(nextState)
      setFeedback({
        kind: 'ok',
        text: res.problems.length > 0 ? `${t('savedNotice')} (${res.problems.join('; ')})` : t('savedNotice'),
      })
    } catch {
      setFeedback({ kind: 'err', text: t('errorNotice') })
    } finally {
      setBusy(false)
    }
  }

  async function handleTest(): Promise<void> {
    setBusy(true)
    setFeedback(null)
    try {
      await saveImHubSettings(draft)
      const res = await testImHubChannel(activeTab)
      setFeedback({ kind: res.ok ? 'ok' : 'err', text: res.detail })
      await refresh()
    } catch {
      setFeedback({ kind: 'err', text: t('errorNotice') })
    } finally {
      setBusy(false)
    }
  }

  async function handleRestart(): Promise<void> {
    setBusy(true)
    setFeedback(null)
    try {
      await restartImHubChannel(activeTab)
      setFeedback({ kind: 'ok', text: t('restartedNotice') })
      await refresh()
    } catch {
      setFeedback({ kind: 'err', text: t('errorNotice') })
    } finally {
      setBusy(false)
    }
  }

  const activeChannelCfg = draft.channels[activeTab]
  const activeStatus = state?.channels[activeTab]

  return (
    <section className={css.card} data-im-hub-settings>
      <header className={css.header}>
        <div>
          <h3 className={css.title}>{t('cardTitle')}</h3>
          <p className={css.description}>{t('cardDescription')}</p>
        </div>
        <span className={css.statusPill} data-active={draft.enabled ? 'true' : 'false'}>
          {draft.enabled ? t('statusActive') : t('statusDisabled')}
        </span>
      </header>

      <div className={css.coexistBanner}>{t('coexistenceHint')}</div>

      <label className={css.checkRow}>
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={e => setDraft(prev => ({ ...prev, enabled: e.target.checked }))}
        />
        <span>{t('masterEnableLabel')}</span>
      </label>

      <label className={css.checkRow}>
        <input
          type="checkbox"
          checked={draft.dualApproval}
          onChange={e => setDraft(prev => ({ ...prev, dualApproval: e.target.checked }))}
        />
        <span>{t('dualApprovalLabel')}</span>
      </label>

      <div className={css.grid}>
        <label className={css.field}>
          <span>{t('busyModeLabel')}</span>
          <select
            className={css.select}
            value={draft.busyMode}
            onChange={e => setDraft(prev => ({ ...prev, busyMode: e.target.value === 'steer' ? 'steer' : 'queue' }))}
          >
            <option value="queue">{t('busyQueue')}</option>
            <option value="steer">{t('busySteer')}</option>
          </select>
        </label>

        <label className={css.field}>
          <span>{t('maxReplyCharsLabel')}</span>
          <input
            className={css.input}
            type="number"
            min={500}
            max={16000}
            value={draft.maxReplyChars}
            onChange={e => setDraft(prev => ({ ...prev, maxReplyChars: Number(e.target.value) || 3500 }))}
          />
        </label>

        <label className={css.field}>
          <span>{t('defaultWorkspaceLabel')}</span>
          <input
            className={css.input}
            type="text"
            value={draft.defaultWorkspacePath}
            onChange={e => setDraft(prev => ({ ...prev, defaultWorkspacePath: e.target.value }))}
          />
        </label>
      </div>

      <div className={css.tabs} role="tablist">
        {CHANNEL_IDS.map((id) => {
          const chStatus = state?.channels[id]?.state ?? 'disabled'
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              data-active={activeTab === id ? 'true' : 'false'}
              className={css.tab}
              onClick={() => setActiveTab(id)}
            >
              <span className={css.dot} data-state={chStatus} />
              <span>{tabLabel(id)}</span>
            </button>
          )
        })}
      </div>

      <div className={css.panel}>
        <div className={css.panelTop}>
          <label className={css.checkRow}>
            <input
              type="checkbox"
              checked={activeChannelCfg.enabled}
              onChange={e => setDraft(prev => ({
                ...prev,
                channels: {
                  ...prev.channels,
                  [activeTab]: { ...prev.channels[activeTab], enabled: e.target.checked },
                },
              }))}
            />
            <span>{t('channelEnableLabel')}</span>
          </label>
          <div className={css.metaRow}>
            <span>
              {t('channelStateLabel')}: {formatStateLabel(activeStatus?.state ?? 'disabled', t)}
            </span>
            <span>
              {t('channelMsgsLabel')}: {activeStatus?.messageCount ?? 0}
            </span>
          </div>
        </div>

        {activeTab === 'feishu' && (
          <div className={css.grid}>
            <label className={css.field}>
              <span>{t('feishuDomainLabel')}</span>
              <select
                className={css.select}
                value={draft.channels.feishu.domain}
                onChange={e => setDraft(prev => ({
                  ...prev,
                  channels: {
                    ...prev.channels,
                    feishu: { ...prev.channels.feishu, domain: e.target.value === 'lark' ? 'lark' : 'feishu' },
                  },
                }))}
              >
                <option value="feishu">Feishu (open.feishu.cn)</option>
                <option value="lark">Lark (open.larksuite.com)</option>
              </select>
            </label>
            <label className={css.field}>
              <span>{t('feishuAppIdLabel')}</span>
              <input
                className={css.input}
                type="text"
                value={draft.channels.feishu.appId}
                onChange={e => setDraft(prev => ({
                  ...prev,
                  channels: { ...prev.channels, feishu: { ...prev.channels.feishu, appId: e.target.value } },
                }))}
              />
            </label>
            <label className={css.field}>
              <span>{t('feishuAppSecretLabel')}</span>
              <input
                className={css.input}
                type="password"
                value={draft.channels.feishu.appSecret}
                onChange={e => setDraft(prev => ({
                  ...prev,
                  channels: { ...prev.channels, feishu: { ...prev.channels.feishu, appSecret: e.target.value } },
                }))}
              />
            </label>
          </div>
        )}

        {activeTab === 'dingtalk' && (
          <div className={css.grid}>
            <label className={css.field}>
              <span>{t('dingtalkClientIdLabel')}</span>
              <input
                className={css.input}
                type="text"
                value={draft.channels.dingtalk.clientId}
                onChange={e => setDraft(prev => ({
                  ...prev,
                  channels: { ...prev.channels, dingtalk: { ...prev.channels.dingtalk, clientId: e.target.value } },
                }))}
              />
            </label>
            <label className={css.field}>
              <span>{t('dingtalkClientSecretLabel')}</span>
              <input
                className={css.input}
                type="password"
                value={draft.channels.dingtalk.clientSecret}
                onChange={e => setDraft(prev => ({
                  ...prev,
                  channels: { ...prev.channels, dingtalk: { ...prev.channels.dingtalk, clientSecret: e.target.value } },
                }))}
              />
            </label>
            <label className={css.field}>
              <span>{t('dingtalkRobotCodeLabel')}</span>
              <input
                className={css.input}
                type="text"
                value={draft.channels.dingtalk.robotCode}
                onChange={e => setDraft(prev => ({
                  ...prev,
                  channels: { ...prev.channels, dingtalk: { ...prev.channels.dingtalk, robotCode: e.target.value } },
                }))}
              />
            </label>
          </div>
        )}

        {activeTab === 'wecom' && (
          <>
            <div className={css.grid}>
              <label className={css.field}>
                <span>{t('wecomModeLabel')}</span>
                <select
                  className={css.select}
                  value={draft.channels.wecom.mode}
                  onChange={e => setDraft(prev => ({
                    ...prev,
                    channels: {
                      ...prev.channels,
                      wecom: { ...prev.channels.wecom, mode: e.target.value === 'app' ? 'app' : 'webhook' },
                    },
                  }))}
                >
                  <option value="webhook">{t('wecomModeWebhook')}</option>
                  <option value="app">{t('wecomModeApp')}</option>
                </select>
              </label>

              {draft.channels.wecom.mode === 'webhook' ? (
                <label className={css.field}>
                  <span>{t('wecomWebhookUrlLabel')}</span>
                  <input
                    className={css.input}
                    type="text"
                    value={draft.channels.wecom.webhookUrl}
                    onChange={e => setDraft(prev => ({
                      ...prev,
                      channels: { ...prev.channels, wecom: { ...prev.channels.wecom, webhookUrl: e.target.value } },
                    }))}
                  />
                </label>
              ) : (
                <>
                  <label className={css.field}>
                    <span>{t('wecomCorpIdLabel')}</span>
                    <input
                      className={css.input}
                      type="text"
                      value={draft.channels.wecom.corpId}
                      onChange={e => setDraft(prev => ({
                        ...prev,
                        channels: { ...prev.channels, wecom: { ...prev.channels.wecom, corpId: e.target.value } },
                      }))}
                    />
                  </label>
                  <label className={css.field}>
                    <span>{t('wecomCorpSecretLabel')}</span>
                    <input
                      className={css.input}
                      type="password"
                      value={draft.channels.wecom.corpSecret}
                      onChange={e => setDraft(prev => ({
                        ...prev,
                        channels: { ...prev.channels, wecom: { ...prev.channels.wecom, corpSecret: e.target.value } },
                      }))}
                    />
                  </label>
                  <label className={css.field}>
                    <span>{t('wecomAgentIdLabel')}</span>
                    <input
                      className={css.input}
                      type="text"
                      value={draft.channels.wecom.agentId}
                      onChange={e => setDraft(prev => ({
                        ...prev,
                        channels: { ...prev.channels, wecom: { ...prev.channels.wecom, agentId: e.target.value } },
                      }))}
                    />
                  </label>
                  <label className={css.field}>
                    <span>{t('wecomTokenLabel')}</span>
                    <input
                      className={css.input}
                      type="password"
                      value={draft.channels.wecom.token}
                      onChange={e => setDraft(prev => ({
                        ...prev,
                        channels: { ...prev.channels, wecom: { ...prev.channels.wecom, token: e.target.value } },
                      }))}
                    />
                  </label>
                  <label className={css.field}>
                    <span>{t('wecomEncodingAesKeyLabel')}</span>
                    <input
                      className={css.input}
                      type="password"
                      value={draft.channels.wecom.encodingAesKey}
                      onChange={e => setDraft(prev => ({
                        ...prev,
                        channels: { ...prev.channels, wecom: { ...prev.channels.wecom, encodingAesKey: e.target.value } },
                      }))}
                    />
                  </label>
                </>
              )}
            </div>
            <div className={css.codeHint}>
              {t('wecomCallbackHint')} <code>{state?.webhookEndpoints.wecom ?? '/api/dsh-im-hub/webhook/wecom'}</code>
            </div>
          </>
        )}

        {activeTab === 'webhook' && (
          <>
            <div className={css.grid}>
              <label className={css.field}>
                <span>{t('webhookSecretLabel')}</span>
                <input
                  className={css.input}
                  type="password"
                  value={draft.channels.webhook.signingSecret}
                  onChange={e => setDraft(prev => ({
                    ...prev,
                    channels: { ...prev.channels, webhook: { ...prev.channels.webhook, signingSecret: e.target.value } },
                  }))}
                />
              </label>
              <label className={css.field}>
                <span>{t('webhookOutboundUrlLabel')}</span>
                <input
                  className={css.input}
                  type="text"
                  value={draft.channels.webhook.outboundUrl}
                  onChange={e => setDraft(prev => ({
                    ...prev,
                    channels: { ...prev.channels, webhook: { ...prev.channels.webhook, outboundUrl: e.target.value } },
                  }))}
                />
              </label>
              <label className={css.field}>
                <span>{t('webhookReplayWindowLabel')}</span>
                <input
                  className={css.input}
                  type="number"
                  min={30}
                  max={3600}
                  value={draft.channels.webhook.replayWindowSec}
                  onChange={e => setDraft(prev => ({
                    ...prev,
                    channels: {
                      ...prev.channels,
                      webhook: { ...prev.channels.webhook, replayWindowSec: Number(e.target.value) || 300 },
                    },
                  }))}
                />
              </label>
            </div>
            <div className={css.codeHint}>
              {t('webhookEndpointHint')} <code>{state?.webhookEndpoints.webhook ?? '/api/dsh-im-hub/webhook/generic'}</code>
            </div>
          </>
        )}

        <div className={css.subSection}>
          <div className={css.subTitle}>{t('accessPolicyHeading')}</div>
          <div className={css.grid}>
            <label className={css.field}>
              <span>{t('accessModeLabel')}</span>
              <select
                className={css.select}
                value={activeChannelCfg.access.mode}
                onChange={e => updatePolicy(activeTab, { mode: e.target.value === 'open' ? 'open' : 'allowlist' })}
              >
                <option value="allowlist">{t('accessAllowlist')}</option>
                <option value="open">{t('accessOpen')}</option>
              </select>
            </label>
            <label className={css.field}>
              <span>{t('allowUsersLabel')}</span>
              <input
                className={css.input}
                type="text"
                value={activeChannelCfg.access.allowUsers.join(', ')}
                onChange={e => updatePolicy(activeTab, { allowUsers: parseCsvList(e.target.value) })}
              />
            </label>
            <label className={css.field}>
              <span>{t('allowGroupsLabel')}</span>
              <input
                className={css.input}
                type="text"
                value={activeChannelCfg.access.allowGroups.join(', ')}
                onChange={e => updatePolicy(activeTab, { allowGroups: parseCsvList(e.target.value) })}
              />
            </label>
          </div>
          <label className={css.checkRow}>
            <input
              type="checkbox"
              checked={activeChannelCfg.access.groupMentionOnly}
              onChange={e => updatePolicy(activeTab, { groupMentionOnly: e.target.checked })}
            />
            <span>{t('groupMentionOnlyLabel')}</span>
          </label>
        </div>
      </div>

      <details>
        <summary className={css.subTitle}>{t('diagnosticsTitle')} ({state?.events.length ?? 0})</summary>
        <div className={css.diagnostics}>
          {(!state || state.events.length === 0) ? (
            <span>{t('diagnosticsEmpty')}</span>
          ) : state.events.slice(0, 15).map((ev, index) => (
            <div key={`${ev.ts}-${index}`}>
              [{new Date(ev.ts).toISOString()}] [{ev.channel}/{ev.level}] {ev.message}
            </div>
          ))}
        </div>
      </details>

      <footer className={css.footer}>
        <div>
          {feedback && (
            <span className={feedback.kind === 'ok' ? css.notice : css.error}>{feedback.text}</span>
          )}
        </div>
        <div className={css.actions}>
          <button type="button" className={css.btn} disabled={busy} onClick={() => void refresh()}>
            {t('refreshAction')}
          </button>
          <button type="button" className={css.btn} disabled={busy} onClick={() => void handleTest()}>
            {t('testAction')}
          </button>
          <button type="button" className={css.btn} disabled={busy} onClick={() => void handleRestart()}>
            {t('restartAction')}
          </button>
          <button type="button" className={css.primaryBtn} disabled={busy} onClick={() => void handleSave()}>
            {busy ? t('saving') : t('saveAction')}
          </button>
        </div>
      </footer>
    </section>
  )
}
