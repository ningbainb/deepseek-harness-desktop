import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ConnectorCatalogDocument } from './types.ts'

const EMBEDDED_FALLBACK_CATALOG: ConnectorCatalogDocument = {
  schemaVersion: 1,
  catalogVersion: '2026.11.25-1',
  updatedAt: '2026-11-25T12:00:00.000Z',
  connectors: [
    {
      id: 'feishu',
      name: { zh: '飞书', en: 'Feishu / Lark' },
      summary: {
        zh: '读写飞书文档、多维表格、日历、任务、邮件与会话消息，附带官方 Agent Skills。',
        en: 'Read and write Feishu docs, Bitable, calendar, tasks, mail, and messages with official Agent Skills.',
      },
      category: 'office-suite',
      icon: 'feishu',
      color: '#3370ff',
      maintainer: 'official',
      platforms: ['win32', 'darwin', 'linux'],
      minDesktopVersion: '5.4.0',
      officialUrls: { repo: 'https://github.com/larksuite/cli', docs: 'https://github.com/larksuite/cli#readme', openPlatform: 'https://open.feishu.cn/' },
      drivers: [
        { kind: 'cli', id: 'feishu-cli', binary: 'lark-cli', installSource: { kind: 'npm', package: '@larksuite/cli' }, versionArgs: ['--version'] },
        { kind: 'mcp-stdio', id: 'feishu-openapi-mcp', command: 'npx', args: ['-y', '@larksuiteoapi/lark-mcp'], toolLoading: 'on-demand' },
      ],
      auth: {
        mode: 'cli-native',
        cliLoginCommand: ['lark-cli', 'auth', 'login'],
        guideSteps: {
          zh: ['安装飞书官方 CLI（lark-cli）并同步官方办公 Skills。', '通过官方登录命令完成授权。'],
          en: ['Install the official Feishu CLI (lark-cli).', 'Complete the native login command.'],
        },
      },
      healthCheck: { kind: 'cli-command', args: ['--version'], timeoutMs: 10000 },
      riskRules: [
        { actionPattern: 'docs.read|search|calendar.list', level: 'L0' },
        { actionPattern: 'docs.create|task.create', level: 'L1' },
        { actionPattern: 'calendar.update|docs.delete|base.batch', level: 'L2' },
        { actionPattern: 'im.send|mail.send|drive.share', level: 'L3' },
      ],
      examples: [{ title: { zh: '整理今日会议纪要', en: 'Summarize today meeting notes' }, prompt: { zh: '查找今天飞书里的会议纪要并整理待办。', en: 'Find today Feishu meeting notes and extract action items.' } }],
      troubleshooting: [],
    },
    {
      id: 'tencent-docs',
      name: { zh: '腾讯文档', en: 'Tencent Docs' },
      summary: {
        zh: '通过官方远程 MCP 检索、阅读、编辑腾讯文档与智能表格，零本地程序安装。',
        en: 'Search, read, and edit Tencent Docs via official remote MCP with zero local install.',
      },
      category: 'meeting-docs',
      icon: 'tencent-docs',
      color: '#0052d9',
      maintainer: 'official',
      platforms: ['win32', 'darwin', 'linux'],
      minDesktopVersion: '5.4.0',
      officialUrls: { docs: 'https://docs.qq.com/open/document/mcp/', openPlatform: 'https://docs.qq.com/open/auth/mcp.html' },
      drivers: [
        {
          kind: 'mcp-remote',
          id: 'tencent-docs-mcp',
          url: 'https://mcp.docs.qq.com/mcp',
          remoteTransport: 'streamable-http',
          toolLoading: 'on-demand',
          headersTemplate: { Authorization: 'Bearer ${credential:connector/tencent-docs/default/token}' },
          allowedTools: ['smartcanvas.read', 'smartcanvas.edit', 'smartcanvas.find', 'manage.create_file', 'manage.export_file', 'manage.search_file', 'manage.folder_list', 'manage.set_privilege'],
        },
      ],
      auth: {
        mode: 'personal-token',
        quickAuthUrl: 'https://docs.qq.com/open/auth/mcp.html',
        guideSteps: {
          zh: ['打开腾讯文档官方 MCP 授权页登录。', '复制个人访问 Token 粘贴保存并验证连接。'],
          en: ['Open the Tencent Docs MCP auth page and sign in.', 'Paste your personal token below and verify.'],
        },
        fields: [{ key: 'token', label: { zh: 'MCP 访问令牌', en: 'MCP Access Token' }, fieldType: 'password', required: true, secret: true }],
      },
      healthCheck: { kind: 'mcp-probe', timeoutMs: 10000 },
      riskRules: [
        { actionPattern: 'read|find|search|folder_list', level: 'L0' },
        { actionPattern: 'create_file|edit', level: 'L1' },
        { actionPattern: 'set_privilege', level: 'L3' },
      ],
      examples: [{ title: { zh: '保存工作周报', en: 'Save weekly report' }, prompt: { zh: '在腾讯文档中创建本周工作周报。', en: 'Create a weekly status report in Tencent Docs.' } }],
      troubleshooting: [],
    },
    {
      id: 'yuque',
      name: { zh: '语雀', en: 'Yuque' },
      summary: {
        zh: '通过官方本地 MCP Server 检索与读写语雀知识库和文档。',
        en: 'Search, read, and write Yuque books and docs via the official stdio MCP server.',
      },
      category: 'knowledge-notes',
      icon: 'yuque',
      color: '#22ab28',
      maintainer: 'official',
      platforms: ['win32', 'darwin', 'linux'],
      minDesktopVersion: '5.4.0',
      officialUrls: { repo: 'https://github.com/yuque/yuque-mcp-server', docs: 'https://github.com/yuque/yuque-mcp-server#readme', openPlatform: 'https://www.yuque.com/settings/tokens' },
      drivers: [
        {
          kind: 'mcp-stdio',
          id: 'yuque-mcp-stdio',
          command: 'yuque-mcp',
          args: [],
          installSource: { kind: 'npm', package: 'yuque-mcp' },
          envTemplate: { YUQUE_TOKEN: '${credential:connector/yuque/default/token}', YUQUE_BASE_URL: '${credential:connector/yuque/default/host}' },
          toolLoading: 'on-demand',
        },
      ],
      auth: {
        mode: 'personal-token',
        quickAuthUrl: 'https://www.yuque.com/settings/tokens',
        guideSteps: {
          zh: ['在语雀开发者设置创建个人令牌。', '保存并测试连接，DSH 将按需启动官方语雀 MCP。'],
          en: ['Create a personal token in Yuque settings.', 'Save and verify to connect via official stdio MCP.'],
        },
        fields: [
          { key: 'token', label: { zh: '语雀个人令牌', en: 'Yuque Personal Token' }, fieldType: 'password', required: true, secret: true },
          { key: 'host', label: { zh: '团队空间域名（可选）', en: 'Team Space Host (optional)' }, fieldType: 'url', required: false, secret: false },
        ],
      },
      healthCheck: { kind: 'mcp-probe', timeoutMs: 12000 },
      riskRules: [
        { actionPattern: 'search|get|list', level: 'L0' },
        { actionPattern: 'create|update', level: 'L1' },
        { actionPattern: 'delete', level: 'L2' },
      ],
      examples: [{ title: { zh: '汇总调研文档', en: 'Summarize research' }, prompt: { zh: '检索我的语雀知识库并整理调研摘要。', en: 'Search Yuque for research docs and summarize them.' } }],
      troubleshooting: [],
    },
    {
      id: 'kdocs',
      name: { zh: '金山文档', en: 'Kingsoft Docs (KDocs)' },
      summary: { zh: '通过金山文档官方 Skill 新建、编辑、搜索与整理云文档。', en: 'Create, edit, and search cloud docs via official KDocs Skill.' },
      category: 'meeting-docs',
      icon: 'kdocs',
      color: '#e53935',
      maintainer: 'official',
      platforms: ['win32', 'darwin', 'linux'],
      minDesktopVersion: '5.4.0',
      officialUrls: { repo: 'https://github.com/kdocs-app/kdocs-skill', docs: 'https://github.com/kdocs-app/kdocs-skill#readme' },
      drivers: [{ kind: 'skill', id: 'kdocs-official-skill', skillName: 'kdocs-skill', source: { kind: 'github-repo', ref: 'kdocs-app/kdocs-skill' } }],
      auth: {
        mode: 'personal-token',
        guideSteps: {
          zh: ['启用金山文档官方 Skill 并完成账号授权配置。'],
          en: ['Enable the official KDocs Skill and complete account authorization.'],
        },
      },
      healthCheck: { kind: 'skill-present', timeoutMs: 5000 },
      riskRules: [
        { actionPattern: 'search|read', level: 'L0' },
        { actionPattern: 'create|edit', level: 'L1' },
        { actionPattern: 'share', level: 'L3' },
      ],
      examples: [{ title: { zh: '检索云文档', en: 'Search cloud docs' }, prompt: { zh: '查找我金山文档里最近的月度总结并提取关键指标。', en: 'Find my recent monthly summary in KDocs.' } }],
      troubleshooting: [],
    },
    {
      id: 'wecom',
      name: { zh: '企业微信', en: 'WeCom' },
      summary: { zh: '通过官方 wecom-cli 操作企业微信文档、日程、待办、会议、邮件与微盘。', en: 'Manage WeCom docs, calendar, tasks, meetings, and drive via wecom-cli.' },
      category: 'office-suite',
      icon: 'wecom',
      color: '#2f7bf6',
      maintainer: 'official',
      platforms: ['win32', 'darwin', 'linux'],
      minDesktopVersion: '5.4.0',
      officialUrls: { repo: 'https://github.com/WecomTeam/wecom-cli', docs: 'https://work.weixin.qq.com/nl/index/aicli' },
      drivers: [{ kind: 'cli', id: 'wecom-cli', binary: 'wecom-cli', installSource: { kind: 'npm', package: '@wecom/cli' }, versionArgs: ['--version'] }],
      auth: {
        mode: 'cli-native',
        cliLoginCommand: ['wecom-cli', 'auth', 'init'],
        requiresEnterpriseAdmin: true,
        guideSteps: {
          zh: ['安装 @wecom/cli 并完成企业微信账号登录。'],
          en: ['Install @wecom/cli and complete WeCom sign-in.'],
        },
      },
      healthCheck: { kind: 'cli-command', args: ['--version'], timeoutMs: 10000 },
      riskRules: [
        { actionPattern: 'read|list|search', level: 'L0' },
        { actionPattern: 'create', level: 'L1' },
        { actionPattern: 'delete|cancel|update', level: 'L2' },
        { actionPattern: 'send|share', level: 'L3' },
      ],
      examples: [{ title: { zh: '创建企业微信待办', en: 'Create WeCom task' }, prompt: { zh: '在企业微信中创建明天的版本评审待办。', en: 'Create a WeCom task for tomorrow release review.' } }],
      troubleshooting: [],
    },
    {
      id: 'dingtalk',
      name: { zh: '钉钉', en: 'DingTalk Workspace' },
      summary: { zh: '通过官方钉钉 dws CLI 操作通讯录、聊天、日程、待办、文档与表格。', en: 'Operate DingTalk contacts, chat, calendar, tasks, and docs via official dws CLI.' },
      category: 'office-suite',
      icon: 'dingtalk',
      color: '#3296fa',
      maintainer: 'official',
      platforms: ['win32', 'darwin', 'linux'],
      minDesktopVersion: '5.4.0',
      officialUrls: { repo: 'https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli', docs: 'https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli#getting-started' },
      drivers: [{ kind: 'cli', id: 'dingtalk-dws-cli', binary: 'dws', installSource: { kind: 'github-release', repo: 'DingTalk-Real-AI/dingtalk-workspace-cli' }, versionArgs: ['--version'] }],
      auth: {
        mode: 'cli-native',
        cliLoginCommand: ['dws', 'auth', 'login', '--device', '--no-browser'],
        requiresEnterpriseAdmin: true,
        guideSteps: {
          zh: ['安装钉钉 dws CLI，联系企业管理员批准权限后完成登录授权。'],
          en: ['Install DingTalk dws CLI and request admin approval before signing in.'],
        },
      },
      healthCheck: { kind: 'cli-command', args: ['--version'], timeoutMs: 10000 },
      riskRules: [
        { actionPattern: 'read|search|list', level: 'L0' },
        { actionPattern: 'create', level: 'L1' },
        { actionPattern: 'update|delete', level: 'L2' },
        { actionPattern: 'send', level: 'L3' },
      ],
      examples: [{ title: { zh: '检索钉钉资料', en: 'Search DingTalk' }, prompt: { zh: '查询钉钉中与项目有关的最新文档。', en: 'Search DingTalk for recent project documents.' } }],
      troubleshooting: [],
    },
    {
      id: 'tencent-meeting',
      name: { zh: '腾讯会议', en: 'Tencent Meeting' },
      summary: { zh: '基于开放平台 OAuth2 授权管理腾讯会议、录制与智能纪要。', en: 'Manage Tencent Meeting schedules, recordings, and AI summaries via OAuth2 CLI.' },
      category: 'meeting-docs',
      icon: 'tencent-meeting',
      color: '#006eff',
      maintainer: 'official',
      platforms: ['win32', 'darwin', 'linux'],
      minDesktopVersion: '5.4.0',
      officialUrls: { repo: 'https://github.com/TencentCloud/tencentmeeting-cli', docs: 'https://meeting.tencent.com/meeting-cli/index.html' },
      drivers: [{ kind: 'cli', id: 'tencentmeeting-tmeet', binary: 'tmeet', installSource: { kind: 'npm', package: '@tencentcloud/tmeet' }, versionArgs: ['--version'] }],
      auth: {
        mode: 'cli-native',
        cliLoginCommand: ['tmeet', 'auth', 'login', '--no-browser'],
        guideSteps: {
          zh: ['安装 @tencentcloud/tmeet 并通过 OAuth2 设备码扫码授权。'],
          en: ['Install @tencentcloud/tmeet and authorize via OAuth2 device code.'],
        },
      },
      healthCheck: { kind: 'cli-command', args: ['--version'], timeoutMs: 10000 },
      riskRules: [
        { actionPattern: 'list|summary|transcript', level: 'L0' },
        { actionPattern: 'create|update|cancel', level: 'L2' },
        { actionPattern: 'share', level: 'L3' },
      ],
      examples: [{ title: { zh: '汇总本周会议纪要', en: 'Summarize weekly meetings' }, prompt: { zh: '汇总本周腾讯会议的相关记录与待办。', en: 'Summarize this week Tencent Meeting transcripts and action items.' } }],
      troubleshooting: [],
    },
    {
      id: 'wps365',
      name: { zh: 'WPS 365', en: 'WPS 365' },
      summary: { zh: 'WPS 365 官方 CLI，覆盖云文档、智能表格、多维表、日历与会议。', en: 'Official WPS 365 CLI covering cloud docs, sheets, calendar, and meetings.' },
      category: 'office-suite',
      icon: 'wps365',
      color: '#e5484d',
      maintainer: 'official',
      platforms: ['win32', 'darwin', 'linux'],
      minDesktopVersion: '5.4.0',
      officialUrls: { repo: 'https://github.com/wps365-open/cli', docs: 'https://open.wps.cn/documents/app-integration-dev/mcp-server/introduction' },
      drivers: [{ kind: 'cli', id: 'wps365-cli', binary: 'wps365-cli', installSource: { kind: 'github-release', repo: 'wps365-open/cli' }, versionArgs: ['--version'] }],
      auth: {
        mode: 'cli-native',
        cliLoginCommand: ['wps365-cli', 'auth', 'login', '--device'],
        guideSteps: {
          zh: ['安装 wps365-cli 并完成官方账号授权。'],
          en: ['Install wps365-cli and complete official login.'],
        },
      },
      healthCheck: { kind: 'cli-command', args: ['--version'], timeoutMs: 10000 },
      riskRules: [
        { actionPattern: 'list|search|read|get', level: 'L0' },
        { actionPattern: 'create|draft|append', level: 'L1' },
        { actionPattern: 'delete|update|end', level: 'L2' },
        { actionPattern: 'send|share', level: 'L3' },
      ],
      examples: [{ title: { zh: '整理 WPS 云文档', en: 'Summarize WPS docs' }, prompt: { zh: '查看最近更新的 WPS 云文档并生成汇报提纲。', en: 'Summarize my recently updated WPS 365 docs.' } }],
      troubleshooting: [],
    },
  ],
}

export function loadBuiltinCatalog(): ConnectorCatalogDocument {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(here, '../../../../apps/dsh-desktop/src/connectors/builtin-catalog.v1.json'),
    resolve(here, '../../../apps/dsh-desktop/src/connectors/builtin-catalog.v1.json'),
  ]
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as Partial<ConnectorCatalogDocument>
      if (parsed.schemaVersion === 1 && Array.isArray(parsed.connectors) && parsed.connectors.length > 0) {
        return parsed as ConnectorCatalogDocument
      }
    } catch {
      // Fall through to embedded fallback catalog.
    }
  }
  return EMBEDDED_FALLBACK_CATALOG
}
