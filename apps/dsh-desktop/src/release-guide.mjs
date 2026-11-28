import { DESKTOP_MANIFEST_VERSION } from './app-version.mjs'
import { deferModalReveal } from './modal-reveal.mjs'
import {
  claimVersionPrompt,
  isVersionPromptShown,
  markVersionPromptPending,
  markVersionPromptShown,
} from './version-prompt-state.mjs'

export const RELEASE_GUIDE_VERSION = DESKTOP_MANIFEST_VERSION
export const RELEASE_GUIDE_SURFACE_ID = 'dsh-desktop-release-guide'

export const RELEASE_GUIDES = Object.freeze({
  '5.7.0-test.1': Object.freeze({
    zh: Object.freeze({
      badge: '版本新功能',
      title: '欢迎使用 DeepSeek Harness Desktop',
      subtitle: '在对话中使用本机 Agent、读取资料和运行工具，并通过检查点审查工作区改动。',
      hint: '可在顶部「帮助 → 本版本新功能」随时查看',
      done: '开始使用',
      closeLabel: '关闭版本新功能引导',
      items: Object.freeze([
        Object.freeze({
          id: 'acp-and-nbfast',
          icon: 'terminal',
          title: '会话级 ACP 与 nbfast',
          description: '在对话中选择本机 Agent。用 nbfast 查看代码大纲、搜索语法结构、预览改写，并按需读取完整命令输出。',
          actionLabel: '查看模型设置',
          actionKind: 'models',
        }),
        Object.freeze({
          id: 'documents-and-search',
          icon: 'inbox',
          title: '文档读取与本地搜索',
          description: '拖入 Office 或 PDF 文档，也可提取已授权的网页。按工作区或日期检索记忆、本人会话和选入知识库的资料。',
        }),
        Object.freeze({
          id: 'apps-and-diagrams',
          icon: 'layout',
          title: 'MCP Apps 与图表导出',
          description: '在聊天卡片中与已配置的 MCP 工具交互。Mermaid 图表可离线渲染，并导出 SVG 或 PNG。',
        }),
        Object.freeze({
          id: 'workspace-checkpoints',
          icon: 'sparkles',
          title: '工作区检查点',
          description: '在轮次结束后对比文件改动。确认后可恢复单个文件或整轮改动，也可撤销恢复。',
        }),
      ]),
    }),
    en: Object.freeze({
      badge: "What's New",
      title: 'Welcome to DeepSeek Harness Desktop',
      subtitle: 'Use local agents, read documents, and run tools in a conversation. Review workspace changes with checkpoints.',
      hint: "Reopen anytime via Help → What's New",
      done: 'Get started',
      closeLabel: "Close What's New guide",
      items: Object.freeze([
        Object.freeze({
          id: 'acp-and-nbfast',
          icon: 'terminal',
          title: 'Per-conversation ACP and nbfast',
          description: 'Choose a local agent for the conversation. Use nbfast to explore code outlines, search syntax, preview rewrites, and retrieve full command output.',
          actionLabel: 'Open Model Settings',
          actionKind: 'models',
        }),
        Object.freeze({
          id: 'documents-and-search',
          icon: 'inbox',
          title: 'Document reading and local search',
          description: 'Drop in Office documents and PDFs, or extract a web page you approve. Search memories, your conversations, and selected knowledge sources by workspace or date.',
        }),
        Object.freeze({
          id: 'apps-and-diagrams',
          icon: 'layout',
          title: 'MCP Apps and diagram export',
          description: 'Interact with configured MCP tools in chat cards. Render Mermaid diagrams offline and export them as SVG or PNG.',
        }),
        Object.freeze({
          id: 'workspace-checkpoints',
          icon: 'sparkles',
          title: 'Workspace checkpoints',
          description: 'Compare file changes at the end of a turn. Review and confirm a single-file or whole-turn restore, and undo it if needed.',
        }),
      ]),
    }),
  }),
  '5.6.0': Object.freeze({
    zh: Object.freeze({
      badge: '版本新功能',
      title: '欢迎使用 DeepSeek Harness Desktop 5.6.0',
      subtitle: '多助手同窗协作、读写代码更省额度、Ctrl+K 秒搜历史、改文件自带恢复点，并内置国内加速更新。',
      hint: '可随时点击顶部状态栏「新功能」再次查看',
      done: '开始使用',
      closeLabel: '关闭版本新功能引导',
      items: Object.freeze([
        Object.freeze({
          id: 'acp-and-nbfast',
          icon: 'terminal',
          title: '多助手切换与省流加速',
          description: '在模型菜单或右侧栏随时切换 Gemini、Codex、OpenCode 协作；内置 nbfast 批量读写代码更省额度，底部可查看省流统计。',
          actionLabel: '查看模型设置',
          actionKind: 'models',
        }),
        Object.freeze({
          id: 'search-docs-and-office',
          icon: 'search',
          title: 'Ctrl+K 搜索与办公文档直读',
          description: '一键搜遍历史对话与工作区文档；拖入 Word、Excel、PPT、PDF 直接解析，办公模式输入栏更干净专注。',
        }),
        Object.freeze({
          id: 'checkpoints-and-artifacts',
          icon: 'history',
          title: '改文件恢复点与流程图存图',
          description: '每轮修改自动留档，支持左右分栏对比、单文件或整轮还原及撤销；流程图可离线渲染并导出 SVG/PNG 图片。',
        }),
        Object.freeze({
          id: 'cdn-im-and-reliability',
          icon: 'bolt',
          title: '国内加速更新与飞书钉钉企微通知',
          description: '内置国内加速下载线路并在异常时自动切回 GitHub；支持飞书/钉钉/企微通知、按需桌面操控及多项稳定性修复。',
          actionLabel: '打开拓展坞',
          actionKind: 'dock',
        }),
      ]),
    }),
    en: Object.freeze({
      badge: "What's New",
      title: 'Welcome to DeepSeek Harness Desktop 5.6.0',
      subtitle: 'Switch local AI assistants, save tokens on code edits, search history with Ctrl+K, undo file changes safely, and update faster.',
      hint: "Reopen anytime from What's New in the top bar",
      done: 'Get started',
      closeLabel: "Close What's New guide",
      items: Object.freeze([
        Object.freeze({
          id: 'acp-and-nbfast',
          icon: 'terminal',
          title: 'Local Assistants & Token Savings',
          description: 'Switch between Gemini, Codex, and OpenCode from the model menu or right sidebar; nbfast reads and edits code cleanly while tracking saved tokens.',
          actionLabel: 'Open Model Settings',
          actionKind: 'models',
        }),
        Object.freeze({
          id: 'search-docs-and-office',
          icon: 'search',
          title: 'Ctrl+K Search & Office Documents',
          description: 'Search past chats and project docs in seconds, drop in Word/Excel/PPT/PDF files directly, and enjoy a cleaner Office-mode composer.',
        }),
        Object.freeze({
          id: 'checkpoints-and-artifacts',
          icon: 'history',
          title: 'Safe Restore Points & Diagram Export',
          description: 'Compare edits side by side after each turn, restore individual files or whole turns, undo restores, and export Mermaid diagrams to SVG or PNG.',
        }),
        Object.freeze({
          id: 'cdn-im-and-reliability',
          icon: 'bolt',
          title: 'Faster Updates & Team Notifications',
          description: 'Built-in faster update mirror with automatic GitHub fallback, Feishu/DingTalk/WeCom alerts, on-demand desktop control, and key stability fixes.',
          actionLabel: 'Open Extension Dock',
          actionKind: 'dock',
        }),
      ]),
    }),
  }),
  '5.5.0': Object.freeze({
    zh: Object.freeze({
      badge: '版本新功能',
      title: '欢迎使用 DeepSeek Harness Desktop',
      subtitle: '在原生对话中使用办公连接器，并按所在地区选择更新下载线路。',
      hint: '可在顶部「帮助 → 本版本新功能」随时查看',
      done: '开始使用',
      closeLabel: '关闭版本新功能引导',
      items: Object.freeze([
        Object.freeze({
          id: 'work-mode',
          icon: 'layout',
          title: '办公模式',
          description: '在侧边栏切换到办公模式，从输入框上方连接飞书等八款办公应用。',
        }),
        Object.freeze({
          id: 'acp-local',
          icon: 'terminal',
          title: 'ACP v1 与本机 Antigravity',
          description: '支持符合 ACP v1 的本地 Agent。Antigravity 账号授权仅用于本机人工交互。',
          actionLabel: '查看模型设置',
          actionKind: 'models',
        }),
        Object.freeze({
          id: 'plugin-attribution',
          icon: 'inbox',
          title: '内置插件归属',
          description: '在拓展坞查看内置插件的来源与维护者。',
          actionLabel: '打开拓展坞',
          actionKind: 'dock',
        }),
        Object.freeze({
          id: 'update-downloads',
          icon: 'sparkles',
          title: '更新下载线路',
          description: '在更新面板自动或手动选线。默认使用 GitHub，配置 CDN 后可按地区优先尝试。',
        }),
      ]),
    }),
    en: Object.freeze({
      badge: "What's New",
      title: 'Welcome to DeepSeek Harness Desktop',
      subtitle: 'Use office connectors in native conversations and choose an update download route for your region.',
      hint: "Reopen anytime via Help → What's New",
      done: 'Get started',
      closeLabel: "Close What's New guide",
      items: Object.freeze([
        Object.freeze({
          id: 'work-mode',
          icon: 'layout',
          title: 'Work Mode',
          description: 'Switch to Work Mode in the sidebar and connect Feishu and seven other office apps above the composer.',
        }),
        Object.freeze({
          id: 'acp-local',
          icon: 'terminal',
          title: 'ACP v1 and local Antigravity',
          description: 'Connect local ACP v1 agents. Antigravity account authorization requires direct local interaction.',
          actionLabel: 'Open Model Settings',
          actionKind: 'models',
        }),
        Object.freeze({
          id: 'plugin-attribution',
          icon: 'inbox',
          title: 'Built-in plugin attribution',
          description: 'Find source and maintainer details for built-in plugins in the Extension Dock.',
          actionLabel: 'Open Extension Dock',
          actionKind: 'dock',
        }),
        Object.freeze({
          id: 'update-downloads',
          icon: 'sparkles',
          title: 'Update download routes',
          description: 'Choose an automatic or manual route in the update panel. GitHub is the default, with regional priority for a configured CDN.',
        }),
      ]),
    }),
  }),
  '5.4.0': Object.freeze({
    zh: Object.freeze({
      badge: '版本新功能',
      title: '欢迎使用 DeepSeek Harness Desktop',
      subtitle: '本次更新围绕模型接入、多 Agent 协作与原生界面一致性做了全面升级。',
      hint: '可在顶部「帮助 → 本版本新功能」随时查看',
      done: '开始使用',
      closeLabel: '关闭版本新功能引导',
      items: Object.freeze([
        Object.freeze({
          id: 'bai-relay',
          icon: 'sparkles',
          title: '聚合模型中转（bai）全新引导',
          description: '支持在登录前预览 Claude / GPT / Gemini / DeepSeek 系列，限流或超时支持一键切到中转继续对话。',
          actionLabel: '查看模型设置',
          actionKind: 'models',
        }),
        Object.freeze({
          id: 'agent-inbox',
          icon: 'inbox',
          title: '多 Agent 审批收件箱',
          description: '从顶部「展开工具」一键直达，在居中独立弹窗中集中处理待审批调用与工作区 Git Diff 总览。',
          actionLabel: '打开审批收件箱',
          actionKind: 'agent-inbox',
        }),
        Object.freeze({
          id: 'antigravity-cli',
          icon: 'terminal',
          title: 'Antigravity CLI (Gemini) 接入',
          description: '自动检测本机 agy 环境并同步可用 Gemini 模型，零手动配置即可在模型选择器中直接使用。',
          actionLabel: '前往配置',
          actionKind: 'models',
        }),
        Object.freeze({
          id: 'dock-and-window',
          icon: 'layout',
          title: '拓展坞规整与窗口直觉优化',
          description: '拓展坞层级与卡片风格全面统一，支持数据目录迁移；点减号最小化到底部栏，点叉号驻留托盘。',
          actionLabel: '打开拓展坞',
          actionKind: 'dock',
        }),
      ]),
    }),
    en: Object.freeze({
      badge: "What's New",
      title: 'Welcome to DeepSeek Harness Desktop',
      subtitle: 'Key improvements across multi-model relay onboarding, multi-agent approvals, and native UI consistency.',
      hint: "Reopen anytime via Help → What's New",
      done: 'Get started',
      closeLabel: "Close What's New guide",
      items: Object.freeze([
        Object.freeze({
          id: 'bai-relay',
          icon: 'sparkles',
          title: 'Multi-Model Relay (bai) Onboarding',
          description: 'Preview Claude, GPT, Gemini, and DeepSeek families before signing in, with quick switch recovery on rate limits or timeouts.',
          actionLabel: 'Open Model Settings',
          actionKind: 'models',
        }),
        Object.freeze({
          id: 'agent-inbox',
          icon: 'inbox',
          title: 'Multi-Agent Approval Inbox',
          description: 'Launch from "+ Tools" into a clean centered modal to review pending tool approvals and workspace diff summaries.',
          actionLabel: 'Open Approval Inbox',
          actionKind: 'agent-inbox',
        }),
        Object.freeze({
          id: 'antigravity-cli',
          icon: 'terminal',
          title: 'Antigravity CLI (Gemini)',
          description: 'Automatically detects your local agy runtime and syncs available Gemini models with zero manual configuration.',
          actionLabel: 'Configure Provider',
          actionKind: 'models',
        }),
        Object.freeze({
          id: 'dock-and-window',
          icon: 'layout',
          title: 'Extension Dock & Window Polish',
          description: 'Unified navigation and native cards across Extension Dock plus data directory migration; minimize stays on taskbar, close goes to tray.',
          actionLabel: 'Open Extension Dock',
          actionKind: 'dock',
        }),
      ]),
    }),
  }),
})

export function getReleaseGuide(version = RELEASE_GUIDE_VERSION) {
  return typeof version === 'string' && Object.hasOwn(RELEASE_GUIDES, version) ? RELEASE_GUIDES[version] : undefined
}

export class ReleaseGuideStore {
  #operation = Promise.resolve()

  constructor({ path, targetVersion = RELEASE_GUIDE_VERSION } = {}) {
    if (!path) throw new TypeError('release guide state path is required')
    this.path = path
    this.targetVersion = targetVersion
  }

  claim(currentVersion, options = {}) {
    return this.#update(currentVersion, () => claimVersionPrompt(this.path, currentVersion, options))
  }

  markPending(currentVersion) {
    return this.#update(currentVersion, () => markVersionPromptPending(this.path, currentVersion))
  }

  isUnread(currentVersion) {
    return this.#update(currentVersion, async () => !(await isVersionPromptShown(this.path, currentVersion)))
  }

  markSeen(currentVersion) {
    return this.#update(currentVersion, () => markVersionPromptShown(this.path, currentVersion))
  }

  #update(currentVersion, update) {
    const operation = this.#operation.then(() => {
      if (currentVersion !== this.targetVersion || !getReleaseGuide(currentVersion)) return false
      return update()
    })
    this.#operation = operation.catch(() => {})
    return operation
  }
}

export const RELEASE_GUIDE_CSS = `
#${RELEASE_GUIDE_SURFACE_ID} {
  position: fixed;
  z-index: 2147483640;
  inset: var(--dsh-desktop-window-chrome-height, 32px) 0 0;
  display: grid;
  place-items: center;
  padding: 20px;
  --dsh-rg-fg: #10131a;
  --dsh-rg-muted: #5d6472;
  --dsh-rg-surface: #ffffff;
  --dsh-rg-card: #f7f8fb;
  --dsh-rg-border: #e4e7ef;
  --dsh-rg-accent: #3370ff;
  --dsh-rg-mask: rgb(15 23 42 / 34%);
  --dsh-rg-shadow: 0 24px 60px -12px rgb(15 23 42 / 22%), 0 2px 10px rgb(15 23 42 / 8%);
  color: var(--dsw-alias-label-primary, var(--dsh-rg-fg));
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  opacity: 0;
  pointer-events: none;
  transition: opacity 200ms ease;
}

#${RELEASE_GUIDE_SURFACE_ID}[hidden] { display: none; }
#${RELEASE_GUIDE_SURFACE_ID}[data-open="true"] { opacity: 1; pointer-events: auto; }

html[data-dsh-desktop-chrome-theme="dark"] #${RELEASE_GUIDE_SURFACE_ID} {
  --dsh-rg-fg: #e8eef5;
  --dsh-rg-muted: #9aa7b8;
  --dsh-rg-surface: #151b26;
  --dsh-rg-card: #1c2432;
  --dsh-rg-border: #283244;
  --dsh-rg-accent: #6390ff;
  --dsh-rg-mask: rgb(3 7 15 / 56%);
  --dsh-rg-shadow: 0 28px 68px -12px rgb(0 0 0 / 56%), 0 0 0 1px rgb(255 255 255 / 4%) inset;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-mask {
  position: absolute;
  inset: 0;
  background: var(--dsh-rg-mask);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(676px, calc(100vw - 40px));
  max-height: calc(100vh - 64px);
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2, var(--dsh-rg-border));
  border-radius: 18px;
  outline: none;
  background: var(--dsw-alias-bg-layer-1, var(--dsh-rg-surface));
  box-shadow: var(--dsh-rg-shadow);
  transform: translateY(10px) scale(0.985);
  opacity: 0;
  transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease;
}

#${RELEASE_GUIDE_SURFACE_ID}[data-open="true"] .dsh-rg-panel {
  transform: translateY(0) scale(1);
  opacity: 1;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 24px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--dsw-alias-border-l2, var(--dsh-rg-border)) 65%, transparent);
  background: radial-gradient(ellipse 80% 120% at 12% 0%, color-mix(in srgb, var(--dsw-alias-state-business-primary, var(--dsh-rg-accent)) 9%, transparent), transparent 72%);
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  margin: 0 0 10px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary, var(--dsh-rg-accent)) 22%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, var(--dsh-rg-accent)) 10%, transparent);
  color: var(--dsw-alias-state-business-primary, var(--dsh-rg-accent));
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.4;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-title {
  margin: 0;
  color: var(--dsw-alias-label-primary, var(--dsh-rg-fg));
  font-size: 19px;
  font-weight: 650;
  letter-spacing: -0.015em;
  line-height: 1.35;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-subtitle {
  margin: 6px 0 0;
  color: var(--dsw-alias-label-tertiary, var(--dsh-rg-muted));
  font-size: 13px;
  line-height: 1.55;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-close {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  color: var(--dsw-alias-label-tertiary, var(--dsh-rg-muted));
  background: transparent;
  cursor: pointer;
  transition: color 140ms ease, background-color 140ms ease;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-close:hover {
  color: var(--dsw-alias-label-primary, var(--dsh-rg-fg));
  background: color-mix(in srgb, var(--dsh-rg-muted) 14%, transparent);
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  min-height: 0;
  overflow: auto;
  padding: 16px 24px 20px;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 17px;
  border: 1px solid var(--dsw-alias-border-l2, var(--dsh-rg-border));
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-2, var(--dsh-rg-card));
  transition: border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-card:hover {
  border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary, var(--dsh-rg-accent)) 34%, var(--dsw-alias-border-l2, var(--dsh-rg-border)));
  box-shadow: 0 6px 18px -6px rgb(15 23 42 / 10%);
  transform: translateY(-1px);
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary, var(--dsh-rg-accent)) 18%, transparent);
  border-radius: 9px;
  color: var(--dsw-alias-state-business-primary, var(--dsh-rg-accent));
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, var(--dsh-rg-accent)) 10%, transparent);
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-card h3 {
  margin: 0;
  color: var(--dsw-alias-label-primary, var(--dsh-rg-fg));
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.4;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-card p {
  margin: 0;
  flex: 1;
  color: var(--dsw-alias-label-secondary, var(--dsh-rg-muted));
  font-size: 12.25px;
  line-height: 1.58;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  padding: 4px 10px;
  margin-top: 2px;
  border: 0;
  border-radius: 7px;
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, var(--dsh-rg-accent)) 10%, transparent);
  color: var(--dsw-alias-state-business-primary, var(--dsh-rg-accent));
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  transition: background-color 140ms ease;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-action:hover {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, var(--dsh-rg-accent)) 16%, transparent);
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 24px 18px;
  border-top: 1px solid var(--dsw-alias-border-l2, var(--dsh-rg-border));
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2, var(--dsh-rg-card)) 55%, transparent);
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-hint {
  margin: 0;
  color: var(--dsw-alias-label-tertiary, var(--dsh-rg-muted));
  font-size: 11.5px;
  line-height: 1.45;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-primary {
  height: 36px;
  padding: 0 22px;
  border: 0;
  border-radius: 10px;
  background: var(--dsw-alias-button-primary-fill, var(--dsh-rg-accent));
  box-shadow: 0 1px 2px rgb(0 0 0 / 12%);
  color: var(--dsw-alias-label-primary-foreground, #ffffff);
  font: inherit;
  font-size: 13px;
  font-weight: 550;
  cursor: pointer;
  transition: background-color 140ms ease, filter 140ms ease;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-primary:hover {
  background: var(--dsw-alias-button-primary-hover, var(--dsw-alias-button-primary-fill, var(--dsh-rg-accent)));
  filter: brightness(1.04);
}

#${RELEASE_GUIDE_SURFACE_ID} button:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, var(--dsh-rg-accent));
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  #${RELEASE_GUIDE_SURFACE_ID},
  #${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-panel,
  #${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-card { transition: none !important; transform: none !important; }
}

@media (max-width: 580px) {
  #${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-grid { grid-template-columns: 1fr; }
  #${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-footer { flex-direction: column; align-items: stretch; }
  #${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-primary { width: 100%; }
}
`

const FEATURE_ICON_PATHS = {
  sparkles: '<path d="M12 2l2.1 5.2L19.5 9.3l-5.4 2.1L12 16.5l-2.1-5.1L4.5 9.3l5.4-2.1z" />',
  inbox: '<path d="M4 13l2.4-6.5h11.2L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M4 13h5l1 2h4l1-2h5" />',
  terminal: '<polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" />',
  search: '<circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" />',
  bolt: '<path d="M13 2L4.5 13.5H12L11 22L19.5 10.5H12L13 2Z" />',
}

export function createReleaseGuideSurfaceScript({
  version = RELEASE_GUIDE_VERSION,
  forceVisible = false,
  showDelayMs = 1_400,
} = {}) {
  const guide = getReleaseGuide(version)
  if (!guide) return 'false'
  const payload = JSON.stringify({
    version,
    forceVisible,
    showDelayMs,
    guide,
    icons: FEATURE_ICON_PATHS,
  })
  return `(() => {
    const id = '${RELEASE_GUIDE_SURFACE_ID}';
    document.getElementById(id)?.remove();
    const api = window.dshDesktop;
    const options = ${payload};
    const english = document.documentElement.lang.toLowerCase().startsWith('en');
    const isHarnessPage = location.protocol === 'dsh-runtime:' || location.protocol === 'http:' || location.protocol === 'https:';
    if (!options.forceVisible && (!isHarnessPage || typeof api?.claimReleaseGuide !== 'function')) return false;

    const copy = english ? options.guide.en : options.guide.zh;
    const root = document.createElement('div');
    root.id = id;
    root.hidden = true;
    const mask = document.createElement('div');
    mask.className = 'dsh-rg-mask';
    const panel = document.createElement('section');
    panel.className = 'dsh-rg-panel';
    panel.tabIndex = -1;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'dsh-rg-title');

    const header = document.createElement('header');
    header.className = 'dsh-rg-header';
    const headingGroup = document.createElement('div');
    const badge = document.createElement('p');
    badge.className = 'dsh-rg-badge';
    const badgeDot = document.createElement('span');
    badgeDot.className = 'dsh-rg-badge-dot';
    badgeDot.setAttribute('aria-hidden', 'true');
    badge.append(badgeDot, document.createTextNode('v' + options.version + ' · ' + copy.badge));
    const title = document.createElement('h2');
    title.id = 'dsh-rg-title';
    title.className = 'dsh-rg-title';
    title.textContent = copy.title;
    const subtitle = document.createElement('p');
    subtitle.className = 'dsh-rg-subtitle';
    subtitle.textContent = copy.subtitle;
    headingGroup.append(badge, title, subtitle);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'dsh-rg-close';
    close.setAttribute('aria-label', copy.closeLabel);
    close.setAttribute('title', copy.closeLabel);
    close.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    header.append(headingGroup, close);

    const grid = document.createElement('div');
    grid.className = 'dsh-rg-grid';
    const actionButtons = [];

    const runAction = (kind) => {
      hide();
      if (kind === 'models') {
        void api?.openExtensionDock?.({ setting: 'models' })?.catch(() => {});
        return;
      }
      if (kind === 'dock') {
        void api?.openExtensionDock?.()?.catch(() => {});
        return;
      }
      if (kind === 'agent-inbox') {
        const direct = document.querySelector('[data-agent-inbox-entry]');
        if (direct instanceof HTMLElement) {
          direct.click();
          return;
        }
        const toggle = document.querySelector('[data-dsh-tools-toggle]');
        if (toggle instanceof HTMLElement) {
          toggle.click();
          setTimeout(() => {
            const entry = document.querySelector('[data-agent-inbox-entry]');
            if (entry instanceof HTMLElement) entry.click();
          }, 80);
          return;
        }
        void api?.openExtensionDock?.({ setting: 'models' })?.catch(() => {});
      }
    };

    for (const item of copy.items) {
      const card = document.createElement('article');
      card.className = 'dsh-rg-card';
      const head = document.createElement('div');
      head.className = 'dsh-rg-card-head';
      const iconBox = document.createElement('span');
      iconBox.className = 'dsh-rg-icon';
      iconBox.setAttribute('aria-hidden', 'true');
      iconBox.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (options.icons[item.icon] || options.icons.sparkles) + '</svg>';
      const h3 = document.createElement('h3');
      h3.textContent = item.title;
      head.append(iconBox, h3);

      const desc = document.createElement('p');
      desc.textContent = item.description;

      card.append(head, desc);
      if (item.actionKind) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dsh-rg-action';
        btn.textContent = item.actionLabel + ' →';
        btn.addEventListener('click', () => runAction(item.actionKind));
        actionButtons.push(btn);
        card.append(btn);
      }
      grid.append(card);
    }

    const footer = document.createElement('footer');
    footer.className = 'dsh-rg-footer';
    const hint = document.createElement('p');
    hint.className = 'dsh-rg-hint';
    hint.textContent = copy.hint;
    const primary = document.createElement('button');
    primary.type = 'button';
    primary.className = 'dsh-rg-primary';
    primary.textContent = copy.done;
    footer.append(hint, primary);

    panel.append(header, grid, footer);
    root.append(mask, panel);
    document.body.append(root);

    let previousFocus;
    let hideTimer;
    const hide = () => {
      root.dataset.open = 'false';
      if (hideTimer !== undefined) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        hideTimer = undefined;
        root.hidden = true;
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      }, 220);
    };
    const show = () => {
      if (hideTimer !== undefined) {
        clearTimeout(hideTimer);
        hideTimer = undefined;
      }
      previousFocus = document.activeElement;
      root.hidden = false;
      if (typeof window.CustomEvent === 'function') {
        window.dispatchEvent(new window.CustomEvent('dsh-release-guide-seen', {
          detail: { version: options.version },
        }));
      }
      requestAnimationFrame(() => {
        root.dataset.open = 'true';
        panel.focus({ preventScroll: true });
      });
    };

    close.addEventListener('click', hide);
    mask.addEventListener('click', hide);
    primary.addEventListener('click', hide);
    document.addEventListener('keydown', (event) => {
      if (root.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        hide();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = [close, ...actionButtons, primary];
        const current = focusable.indexOf(document.activeElement);
        const next = event.shiftKey
          ? (current <= 0 ? focusable.length - 1 : current - 1)
          : (current === focusable.length - 1 ? 0 : current + 1);
        event.preventDefault();
        focusable[next].focus();
      }
    });

    const delayMs = Math.max(0, Number(options.showDelayMs) || 0);
    if (options.forceVisible) setTimeout(show, delayMs);
    else (${deferModalReveal.toString()})({
      root,
      document,
      window,
      delayMs,
      claim: () => api.claimReleaseGuide(),
      reveal: show,
      onError: () => root.remove(),
    });
    return true;
  })()`
}

export async function applyReleaseGuideSurface({ webContents, version = RELEASE_GUIDE_VERSION, forceVisible = false, showDelayMs } = {}) {
  if (!webContents || webContents.isDestroyed?.()) return false
  if (!getReleaseGuide(version)) return false
  await webContents.insertCSS(RELEASE_GUIDE_CSS, { cssOrigin: 'author' })
  if (webContents.isDestroyed?.()) return false
  return webContents.executeJavaScript(createReleaseGuideSurfaceScript({ version, forceVisible, showDelayMs }), true)
}

export function installReleaseGuideSurface({ browserWindow, version = RELEASE_GUIDE_VERSION, forceVisible = false, onError = () => {} }) {
  const { webContents } = browserWindow
  const apply = () => {
    void applyReleaseGuideSurface({ webContents, version, forceVisible }).catch(onError)
  }
  webContents.on('did-finish-load', apply)
  return () => webContents.removeListener('did-finish-load', apply)
}
