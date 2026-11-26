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
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
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

  const protocolBadge = (id: ChannelId): string => {
    switch (id) {
      case 'feishu': return t('badgeFeishu')
      case 'dingtalk': return t('badgeDingTalk')
      case 'wecom': return draft.channels.wecom.mode === 'app' ? t('badgeWeComApp') : t('badgeWeComWebhook')
      case 'webhook': return t('badgeWebhook')
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

  async function handleCopy(pathText: string): Promise<void> {
    try {
      await navigator.clipboard?.writeText(pathText)
      setCopiedPath(pathText)
      setTimeout(() => {
        setCopiedPath(prev => (prev === pathText ? null : prev))
      }, 1500)
    } catch {}
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
  const isDirty = state !== null && JSON.stringify(draft) !== JSON.stringify(state.settings)
  const wecomPath = state?.webhookEndpoints.wecom ?? '/api/dsh-im-hub/webhook/wecom'
  const webhookPath = state?.webhookEndpoints.webhook ?? '/api/dsh-im-hub/webhook/generic'

  return (
    <section className={css.card} data-im-hub-settings>
      <header className={css.hero}>
        <div className={css.heroText}>
          <div className={css.titleRow}>
            <h3 className={css.title}>{t('cardTitle')}</h3>
            <span className={css.statusPill} data-active={draft.enabled ? 'true' : 'false'}>
              <span className={css.statusDot} aria-hidden="true" />
              <span>{draft.enabled ? t('statusActive') : t('statusDisabled')}</span>
            </span>
          </div>
          <p className={css.description}>{t('cardDescription')}</p>
        </div>

        <label className={css.heroControl}>
          <span className={css.masterText}>{t('masterEnableLabel')}</span>
          <span className={css.switchControl}>
            <input
              type="checkbox"
              role="switch"
              aria-label={t('masterEnableLabel')}
              className={css.switchInput}
              checked={draft.enabled}
              onChange={e => setDraft(prev => ({ ...prev, enabled: e.target.checked }))}
            />
            <span className={css.switchTrack} aria-hidden="true" />
          </span>
        </label>
      </header>

      <div className={css.coexistNote}>{t('coexistenceHint')}</div>

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
          <label className={css.channelSwitchRow}>
            <span className={css.switchControl}>
              <input
                type="checkbox"
                role="switch"
                aria-label={t('channelEnableLabel')}
                className={css.switchInput}
                checked={activeChannelCfg.enabled}
                onChange={e => setDraft(prev => ({
                  ...prev,
                  channels: {
                    ...prev.channels,
                    [activeTab]: { ...prev.channels[activeTab], enabled: e.target.checked },
                  },
                }))}
              />
              <span className={css.switchTrack} aria-hidden="true" />
            </span>
            <span className={css.channelSwitchLabel}>{t('channelEnableLabel')}</span>
            <span className={css.protocolTag}>{protocolBadge(activeTab)}</span>
          </label>
          <div className={css.metaRow}>
            <span>{t('channelStateLabel')}: {formatStateLabel(activeStatus?.state ?? 'disabled', t)}</span>
            <span>{t('channelMsgsLabel')}: {activeStatus?.messageCount ?? 0}</span>
          </div>
        </div>

        <div className={css.subBlock}>
          <div className={css.subHeading}>{t('connectSectionTitle')}</div>

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
                  placeholder="cli_a1b2c3d4..."
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
                  placeholder="dingxxxxxxxx"
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
                      placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
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
              <div className={css.copyBar}>
                <div className={css.copyBarLeft}>
                  <span className={css.copyLabel}>{t('wecomCallbackHint')}</span>
                  <code className={css.copyCode}>{wecomPath}</code>
                </div>
                <button type="button" className={css.copyBtn} onClick={() => void handleCopy(wecomPath)}>
                  {copiedPath === wecomPath ? t('copiedNotice') : t('copyAction')}
                </button>
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
                    placeholder="http://127.0.0.1:8080/callback"
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
              <div className={css.copyBar}>
                <div className={css.copyBarLeft}>
                  <span className={css.copyLabel}>{t('webhookEndpointHint')}</span>
                  <code className={css.copyCode}>{webhookPath}</code>
                </div>
                <button type="button" className={css.copyBtn} onClick={() => void handleCopy(webhookPath)}>
                  {copiedPath === webhookPath ? t('copiedNotice') : t('copyAction')}
                </button>
              </div>
            </>
          )}

          <div className={css.channelActions}>
            <button type="button" className={css.btn} disabled={busy} onClick={() => void handleTest()}>
              {t('testAction')}
            </button>
            <button type="button" className={css.btn} disabled={busy} onClick={() => void handleRestart()}>
              {t('restartAction')}
            </button>
          </div>
        </div>

        <div className={css.subSection}>
          <div className={css.subHeading}>{t('accessPolicyHeading')}</div>
          <div className={css.field}>
            <span>{t('accessModeLabel')}</span>
            <div className={css.segmented2} role="group" aria-label={t('accessModeLabel')}>
              <button
                type="button"
                className={css.segBtn}
                aria-pressed={activeChannelCfg.access.mode === 'allowlist'}
                onClick={() => updatePolicy(activeTab, { mode: 'allowlist' })}
              >
                {t('accessAllowlist')}
              </button>
              <button
                type="button"
                className={css.segBtn}
                aria-pressed={activeChannelCfg.access.mode === 'open'}
                onClick={() => updatePolicy(activeTab, { mode: 'open' })}
              >
                {t('accessOpen')}
              </button>
            </div>
          </div>

          {activeChannelCfg.access.mode === 'allowlist' ? (
            <div className={css.grid}>
              <label className={css.field}>
                <span>{t('allowUsersLabel')}</span>
                <input
                  className={css.input}
                  type="text"
                  placeholder="ou_xxx, *"
                  value={activeChannelCfg.access.allowUsers.join(', ')}
                  onChange={e => updatePolicy(activeTab, { allowUsers: parseCsvList(e.target.value) })}
                />
              </label>
              <label className={css.field}>
                <span>{t('allowGroupsLabel')}</span>
                <input
                  className={css.input}
                  type="text"
                  placeholder="oc_xxx, *"
                  value={activeChannelCfg.access.allowGroups.join(', ')}
                  onChange={e => updatePolicy(activeTab, { allowGroups: parseCsvList(e.target.value) })}
                />
              </label>
            </div>
          ) : (
            <div className={css.calloutAmber}>{t('accessOpenWarning')}</div>
          )}

          <div className={css.switchRow}>
            <div className={css.rowText}>
              <div className={css.rowTitle}>{t('groupMentionOnlyLabel')}</div>
              <div className={css.rowDesc}>{t('groupMentionOnlyDesc')}</div>
            </div>
            <label className={css.switchControl}>
              <input
                type="checkbox"
                role="switch"
                aria-label={t('groupMentionOnlyLabel')}
                className={css.switchInput}
                checked={activeChannelCfg.access.groupMentionOnly}
                onChange={e => updatePolicy(activeTab, { groupMentionOnly: e.target.checked })}
              />
              <span className={css.switchTrack} aria-hidden="true" />
            </label>
          </div>
        </div>
      </div>

      <details className={css.disclosure} data-im-hub-global>
        <summary className={css.disclosureSummary}>{t('globalSectionTitle')}</summary>
        <div className={css.disclosureBody}>
          <div className={css.switchRow}>
            <div className={css.rowText}>
              <div className={css.rowTitle}>{t('dualApprovalLabel')}</div>
              <div className={css.rowDesc}>{t('dualApprovalDesc')}</div>
            </div>
            <label className={css.switchControl}>
              <input
                type="checkbox"
                role="switch"
                aria-label={t('dualApprovalLabel')}
                className={css.switchInput}
                checked={draft.dualApproval}
                onChange={e => setDraft(prev => ({ ...prev, dualApproval: e.target.checked }))}
              />
              <span className={css.switchTrack} aria-hidden="true" />
            </label>
          </div>

          <label className={css.field}>
            <span>{t('defaultWorkspaceLabel')}</span>
            <input
              className={css.input}
              type="text"
              placeholder="D:\workspace\project"
              value={draft.defaultWorkspacePath}
              onChange={e => setDraft(prev => ({ ...prev, defaultWorkspacePath: e.target.value }))}
            />
          </label>

          <div className={css.grid}>
            <div className={css.field}>
              <span>{t('busyModeLabel')}</span>
              <div className={css.segmented2} role="group" aria-label={t('busyModeLabel')}>
                <button
                  type="button"
                  className={css.segBtn}
                  aria-pressed={draft.busyMode === 'queue'}
                  onClick={() => setDraft(prev => ({ ...prev, busyMode: 'queue' }))}
                >
                  {t('busyQueue')}
                </button>
                <button
                  type="button"
                  className={css.segBtn}
                  aria-pressed={draft.busyMode === 'steer'}
                  onClick={() => setDraft(prev => ({ ...prev, busyMode: 'steer' }))}
                >
                  {t('busySteer')}
                </button>
              </div>
            </div>

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
          </div>
        </div>
      </details>

      <details className={css.disclosure}>
        <summary className={css.disclosureSummary}>
          {`${t('diagnosticsTitle')} (${state?.events.length ?? 0})`}
        </summary>
        <div className={css.disclosureBody}>
          <div className={css.diagnostics}>
            {(!state || state.events.length === 0) ? (
              <span>{t('diagnosticsEmpty')}</span>
            ) : state.events.slice(0, 15).map((ev, index) => (
              <div key={`${ev.ts}-${index}`} className={css.diagLine}>
                <span className={css.diagLevel} data-level={ev.level}>{ev.level}</span>
                <span>[{new Date(ev.ts).toISOString()}] [{ev.channel}] {ev.message}</span>
              </div>
            ))}
          </div>
        </div>
      </details>

      <footer className={css.footer}>
        <div>
          {feedback ? (
            <span className={feedback.kind === 'ok' ? css.notice : css.error}>{feedback.text}</span>
          ) : isDirty ? (
            <span className={css.dirty}>{t('dirtyNotice')}</span>
          ) : null}
        </div>
        <div className={css.actions}>
          <button type="button" className={css.btn} disabled={busy} onClick={() => void refresh()}>
            {t('refreshAction')}
          </button>
          <button type="button" className={css.primaryBtn} disabled={busy} onClick={() => void handleSave()}>
            {busy ? t('saving') : t('saveAction')}
          </button>
        </div>
      </footer>
    </section>
  )
}
