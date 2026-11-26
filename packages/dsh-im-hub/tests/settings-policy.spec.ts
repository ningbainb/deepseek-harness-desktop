import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SECRET_MASK,
  defaultAccessPolicy,
  defaultSettings,
  evaluateAccess,
  isApprovalAuthorized,
  normalizeSettings,
  readSettings,
  redactSettingsForClient,
  writeSettingsAtomic,
} from '../src/index.ts'

describe('dsh-im-hub settings and access policy', () => {
  it('defaults to fail-closed allowlist and disabled channels', () => {
    const s = defaultSettings()
    expect(s.enabled).toBe(false)
    expect(s.dualApproval).toBe(true)
    expect(s.busyMode).toBe('queue')
    expect(s.channels.feishu.enabled).toBe(false)
    expect(s.channels.feishu.access.mode).toBe('allowlist')
    expect(s.channels.feishu.access.groupMentionOnly).toBe(true)
  })

  it('masks secrets for client and preserves stored secrets when masked round-trips', async () => {
    const home = await mkdtemp(join(tmpdir(), 'im-hub-settings-'))
    try {
      const initial = defaultSettings()
      initial.enabled = true
      initial.channels.feishu.enabled = true
      initial.channels.feishu.appId = 'cli_123'
      initial.channels.feishu.appSecret = 'super-secret-feishu'
      initial.channels.wecom.webhookUrl = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=my-secret-key'
      initial.channels.webhook.signingSecret = 'hmac-top-secret'

      const saved = await writeSettingsAtomic(initial, home)
      expect(saved.problems).toEqual([])

      const redacted = redactSettingsForClient(saved.settings)
      expect(redacted.channels.feishu.appSecret).toBe(SECRET_MASK)
      expect(redacted.channels.wecom.webhookUrl).toContain(`key=${SECRET_MASK}`)
      expect(redacted.channels.webhook.signingSecret).toBe(SECRET_MASK)

      // Client edits busyMode and sends back redacted secrets -> stored secrets remain intact!
      redacted.busyMode = 'steer'
      const updated = await writeSettingsAtomic(redacted, home)
      expect(updated.settings.busyMode).toBe('steer')
      expect(updated.settings.channels.feishu.appSecret).toBe('super-secret-feishu')
      expect(updated.settings.channels.wecom.webhookUrl).toBe(
        'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=my-secret-key',
      )
      expect(updated.settings.channels.webhook.signingSecret).toBe('hmac-top-secret')

      const reread = await readSettings(home)
      expect(reread.channels.feishu.appSecret).toBe('super-secret-feishu')
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it('clamps maxReplyChars and replayWindowSec and flags missing credentials', () => {
    const { settings, problems } = normalizeSettings({
      enabled: true,
      maxReplyChars: 999999,
      channels: {
        webhook: { enabled: true, replayWindowSec: 5 },
      },
    })
    expect(settings.maxReplyChars).toBe(16000)
    expect(settings.channels.webhook.replayWindowSec).toBe(30)
    expect(problems.some((p) => p.includes('signingSecret'))).toBe(true)
  })

  it('enforces direct allowlist, group allowlist, and mention gate fail-closed', () => {
    const policy = defaultAccessPolicy()
    policy.allowUsers = ['u1']
    policy.allowGroups = ['g1']

    expect(
      evaluateAccess(
        {
          channel: 'feishu',
          messageId: 'm1',
          conversationId: 'c1',
          chatType: 'direct',
          senderId: 'u2',
          text: 'hi',
          receivedAt: Date.now(),
        },
        policy,
      ),
    ).toEqual({ allowed: false, reason: 'sender-not-allowed' })

    expect(
      evaluateAccess(
        {
          channel: 'feishu',
          messageId: 'm2',
          conversationId: 'c1',
          chatType: 'direct',
          senderId: 'u1',
          text: 'hi',
          receivedAt: Date.now(),
        },
        policy,
      ),
    ).toEqual({ allowed: true })

    expect(
      evaluateAccess(
        {
          channel: 'feishu',
          messageId: 'm3',
          conversationId: 'g1',
          chatType: 'group',
          senderId: 'u1',
          text: 'hi',
          mentioned: false,
          receivedAt: Date.now(),
        },
        policy,
      ),
    ).toEqual({ allowed: false, reason: 'mention-required' })

    expect(
      evaluateAccess(
        {
          channel: 'feishu',
          messageId: 'm4',
          conversationId: 'g2',
          chatType: 'group',
          senderId: 'u1',
          text: 'hi',
          mentioned: true,
          receivedAt: Date.now(),
        },
        policy,
      ),
    ).toEqual({ allowed: false, reason: 'group-not-allowed' })

    expect(isApprovalAuthorized('u1', policy)).toBe(true)
    expect(isApprovalAuthorized('u2', policy)).toBe(false)
  })
})
