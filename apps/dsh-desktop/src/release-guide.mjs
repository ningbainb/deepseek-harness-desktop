import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { deferModalReveal } from './modal-reveal.mjs'

export const RELEASE_GUIDE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
export const RELEASE_GUIDE_SURFACE_ID = 'dsh-desktop-release-guide'

export const RELEASE_GUIDES = Object.freeze({
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

function normalizeShownVersions(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((version) => typeof version === 'string').slice(-32))]
}

export class ReleaseGuideStore {
  #operation = Promise.resolve()

  constructor({ path, targetVersion = RELEASE_GUIDE_VERSION } = {}) {
    if (!path) throw new TypeError('release guide state path is required')
    this.path = path
    this.targetVersion = targetVersion
  }

  claim(currentVersion, options = {}) {
    const operation = this.#operation.then(() => this.#claim(currentVersion, options))
    this.#operation = operation.catch(() => {})
    return operation
  }

  markPending(currentVersion) {
    const operation = this.#operation.then(() => this.#markPending(currentVersion))
    this.#operation = operation.catch(() => {})
    return operation
  }

  async #readState() {
    let shownVersions = []
    let pendingVersion
    try {
      const state = JSON.parse(await readFile(this.path, 'utf8'))
      shownVersions = normalizeShownVersions(state?.shownVersions)
      if (typeof state?.pendingVersion === 'string') pendingVersion = state.pendingVersion
    } catch (error) {
      if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
    }
    return { shownVersions, pendingVersion }
  }

  async #writeState(nextState) {
    await mkdir(dirname(this.path), { recursive: true })
    const temporaryPath = `${this.path}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, this.path)
  }

  async #markPending(currentVersion) {
    if (currentVersion !== this.targetVersion || !getReleaseGuide(currentVersion)) return false
    const { shownVersions } = await this.#readState()
    if (shownVersions.includes(currentVersion)) return false
    await this.#writeState({
      schemaVersion: 1,
      shownVersions,
      pendingVersion: currentVersion,
    })
    return true
  }

  async #claim(currentVersion, { suppressIfUnmarked = false } = {}) {
    if (currentVersion !== this.targetVersion || !getReleaseGuide(currentVersion)) return false
    const { shownVersions, pendingVersion } = await this.#readState()
    if (shownVersions.includes(currentVersion)) return false
    if (suppressIfUnmarked && pendingVersion !== currentVersion) return false

    await this.#writeState({
      schemaVersion: 1,
      shownVersions: normalizeShownVersions([...shownVersions, currentVersion]),
    })
    return true
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
  color: var(--dsw-alias-label-primary, var(--dsh-rg-fg));
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  opacity: 0;
  pointer-events: none;
  transition: opacity 220ms ease;
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
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-mask {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 42%);
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(650px, calc(100vw - 40px));
  max-height: calc(100vh - 64px);
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2, var(--dsh-rg-border));
  border-radius: 16px;
  outline: none;
  background: var(--dsw-alias-bg-layer-1, var(--dsh-rg-surface));
  box-shadow: 0 20px 54px rgb(0 0 0 / 24%);
  transform: translateY(10px) scale(0.985);
  opacity: 0;
  transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease;
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
  padding: 20px 22px 14px;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  margin: 0 0 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, var(--dsh-rg-accent)) 11%, transparent);
  color: var(--dsw-alias-brand-primary, var(--dsh-rg-accent));
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-title {
  margin: 0;
  color: var(--dsw-alias-label-primary, var(--dsh-rg-fg));
  font-size: 18px;
  font-weight: 600;
  line-height: 1.35;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-subtitle {
  margin: 4px 0 0;
  color: var(--dsw-alias-label-tertiary, var(--dsh-rg-muted));
  font-size: 13px;
  line-height: 1.5;
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
  padding: 2px 22px 18px;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 15px;
  border: 1px solid var(--dsw-alias-border-l2, var(--dsh-rg-border));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2, var(--dsh-rg-card));
  transition: border-color 140ms ease, background-color 140ms ease;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-card:hover {
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary, var(--dsh-rg-accent)) 28%, var(--dsw-alias-border-l2, var(--dsh-rg-border)));
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
  width: 30px;
  height: 30px;
  border-radius: 8px;
  color: var(--dsw-alias-brand-primary, var(--dsh-rg-accent));
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, var(--dsh-rg-accent)) 10%, transparent);
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-card h3 {
  margin: 0;
  color: var(--dsw-alias-label-primary, var(--dsh-rg-fg));
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-card p {
  margin: 0;
  flex: 1;
  color: var(--dsw-alias-label-secondary, var(--dsh-rg-muted));
  font-size: 12px;
  line-height: 1.55;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-action {
  align-self: flex-start;
  padding: 2px 0 0;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-brand-primary, var(--dsh-rg-accent));
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-action:hover { text-decoration: underline; }

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 22px 18px;
  border-top: 1px solid var(--dsw-alias-border-l2, var(--dsh-rg-border));
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-hint {
  margin: 0;
  color: var(--dsw-alias-label-tertiary, var(--dsh-rg-muted));
  font-size: 11px;
  line-height: 1.45;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-primary {
  height: 36px;
  padding: 0 20px;
  border: 0;
  border-radius: 9px;
  background: var(--dsw-alias-brand-primary, var(--dsh-rg-accent));
  color: #ffffff;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

#${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-primary:hover { filter: brightness(1.06); }

#${RELEASE_GUIDE_SURFACE_ID} button:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, var(--dsh-rg-accent));
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  #${RELEASE_GUIDE_SURFACE_ID},
  #${RELEASE_GUIDE_SURFACE_ID} .dsh-rg-panel { transition: none !important; }
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
    badge.textContent = 'v' + options.version + ' · ' + copy.badge;
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
    const hide = () => {
      root.dataset.open = 'false';
      setTimeout(() => {
        root.hidden = true;
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      }, 220);
    };
    const show = () => {
      previousFocus = document.activeElement;
      root.hidden = false;
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
