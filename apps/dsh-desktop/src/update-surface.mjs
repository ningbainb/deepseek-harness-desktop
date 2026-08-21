const UPDATE_SURFACE_ID = 'dsh-desktop-update-surface'
const DESKTOP_UPDATE_TRIGGER_ATTRIBUTE = 'data-dsh-desktop-update-trigger'
const PLUGIN_UPDATE_TRIGGER_ATTRIBUTE = 'data-dsh-update-entry'

export const UPDATE_SURFACE_CSS = `
#${UPDATE_SURFACE_ID} {
  position: fixed;
  z-index: 2147483646;
  inset: var(--dsh-desktop-window-chrome-height, 32px) 0 0;
  display: grid;
  place-items: center;
  padding: 24px;
  --dsh-update-fg: #0f1115;
  --dsh-update-muted: #656b75;
  --dsh-update-panel-bg: #ffffff;
  --dsh-update-border: #e1e4e8;
  --dsh-update-layer: #f7f8fa;
  --dsh-update-hover: #f1f2f4;
  --dsh-update-track: #e8ebf0;
  color: var(--dsw-alias-label-primary, var(--dsh-update-fg));
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
}

#${UPDATE_SURFACE_ID}[hidden] { display: none; }

html[data-dsh-desktop-chrome-theme="dark"] #${UPDATE_SURFACE_ID} {
  --dsh-update-fg: #e6f0f5;
  --dsh-update-muted: #93a8b4;
  --dsh-update-panel-bg: #0e1a23;
  --dsh-update-border: #21333f;
  --dsh-update-layer: #12242f;
  --dsh-update-hover: #16303e;
  --dsh-update-track: #1b2f3c;
}

#${UPDATE_SURFACE_ID} .dsh-update-mask {
  position: absolute;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1, rgba(17, 24, 39, 0.32));
  -webkit-backdrop-filter: blur(10px) saturate(125%);
  backdrop-filter: blur(10px) saturate(125%);
}

#${UPDATE_SURFACE_ID} .dsh-update-panel {
  position: relative;
  width: min(520px, calc(100vw - 48px));
  max-height: min(680px, calc(100vh - 88px));
  padding: 22px 24px 24px;
  overflow: auto;
  border: 1px solid var(--dsw-alias-border-l2, var(--dsh-update-border));
  border-radius: 18px;
  background: var(--dsw-alias-bg-base, var(--dsh-update-panel-bg));
  box-shadow: var(--dsw-shadow-lv3, 0 0 1px rgba(0, 0, 0, 0.2), 0 0 4px rgba(0, 0, 0, 0.02), 0 12px 32px rgba(0, 0, 0, 0.08));
  animation: dsh-update-in 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

#${UPDATE_SURFACE_ID} .dsh-update-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

#${UPDATE_SURFACE_ID} .dsh-update-kicker {
  margin: 0 0 4px;
  color: var(--dsw-alias-label-secondary, var(--dsh-update-muted));
  font-size: 12px;
}

#${UPDATE_SURFACE_ID} .dsh-update-title {
  margin: 0;
  color: var(--dsw-alias-label-primary, var(--dsh-update-fg));
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

#${UPDATE_SURFACE_ID} .dsh-update-close {
  width: 30px;
  height: 30px;
  flex: none;
  border: 0;
  border-radius: 28px;
  color: var(--dsw-alias-label-secondary, var(--dsh-update-muted));
  background: transparent;
  cursor: pointer;
  font-size: 20px;
}

#${UPDATE_SURFACE_ID} .dsh-update-status {
  margin: 18px 0 0;
  color: var(--dsw-alias-label-secondary, var(--dsh-update-muted));
  font-size: 13px;
  line-height: 1.6;
}

#${UPDATE_SURFACE_ID} .dsh-update-version {
  display: flex;
  gap: 8px;
  margin: 14px 0 0;
  color: var(--dsw-alias-label-secondary, var(--dsh-update-muted));
  font-size: 12px;
}

#${UPDATE_SURFACE_ID} .dsh-update-version span {
  padding: 4px 8px;
  border: 0;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2, var(--dsh-update-layer));
  font-family: "Cascadia Mono", "SFMono-Regular", Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.02em;
}

#${UPDATE_SURFACE_ID} .dsh-update-notes {
  max-height: 230px;
  margin: 14px 0 0;
  padding: 12px 14px;
  overflow: auto;
  border: 1px solid var(--dsw-alias-border-l1, var(--dsh-update-border));
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary, var(--dsh-update-muted));
  background: var(--dsw-alias-bg-layer-2, var(--dsh-update-layer));
  font: 12px/1.65 "Segoe UI Variable Text", "Microsoft YaHei UI", sans-serif;
  white-space: pre-wrap;
}

#${UPDATE_SURFACE_ID} .dsh-update-progress {
  height: 4px;
  margin-top: 18px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover, var(--dsh-update-track));
}

#${UPDATE_SURFACE_ID} .dsh-update-progress i {
  display: block;
  width: var(--dsh-update-progress, 0%);
  height: 100%;
  border-radius: inherit;
  background: var(--dsw-alias-state-business-primary, #4d78e8);
  transition: width 260ms ease;
}

#${UPDATE_SURFACE_ID} .dsh-update-fallback {
  margin: 16px 0 0;
  padding: 12px 14px;
  border: 1px solid var(--dsw-alias-border-l1, var(--dsh-update-border));
  border-radius: 10px;
  color: var(--dsw-alias-label-secondary, var(--dsh-update-muted));
  background: var(--dsw-alias-bg-layer-2, var(--dsh-update-layer));
  font-size: 12px;
  line-height: 1.65;
}

#${UPDATE_SURFACE_ID} .dsh-update-fallback[hidden] { display: none; }

#${UPDATE_SURFACE_ID} .dsh-update-channel {
  display: grid;
  gap: 7px;
  margin: 16px 0 0;
  padding: 12px 14px;
  border: 1px solid var(--dsw-alias-border-l1, var(--dsh-update-border));
  border-radius: 10px;
  color: var(--dsw-alias-label-secondary, var(--dsh-update-muted));
  background: var(--dsw-alias-bg-layer-2, var(--dsh-update-layer));
  font-size: 12px;
  line-height: 1.55;
}

#${UPDATE_SURFACE_ID} .dsh-update-channel[hidden] { display: none; }

#${UPDATE_SURFACE_ID} .dsh-update-channel label {
  color: var(--dsw-alias-label-primary, var(--dsh-update-fg));
  font-weight: 600;
}

#${UPDATE_SURFACE_ID} .dsh-update-channel select {
  width: max-content;
  min-width: 150px;
  min-height: 28px;
  padding: 3px 8px;
  border: 1px solid var(--dsw-alias-border-l2, var(--dsh-update-border));
  border-radius: 7px;
  color: var(--dsw-alias-label-primary, var(--dsh-update-fg));
  background: var(--dsw-alias-bg-base, var(--dsh-update-panel-bg));
  font: inherit;
}

#${UPDATE_SURFACE_ID} .dsh-update-channel select:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

#${UPDATE_SURFACE_ID} .dsh-update-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 9px;
  margin-top: 20px;
}

#${UPDATE_SURFACE_ID} .dsh-update-action {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2, var(--dsh-update-border));
  border-radius: 14px;
  color: var(--dsw-alias-label-primary, var(--dsh-update-fg));
  background: var(--dsw-alias-bg-base, var(--dsh-update-panel-bg));
  cursor: pointer;
  font: 400 12px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

#${UPDATE_SURFACE_ID} .dsh-update-action[data-primary="true"] {
  min-height: 34px;
  padding-inline: 18px;
  border-color: transparent;
  border-radius: 999px;
  color: var(--dsw-alias-label-primary-foreground, #ffffff);
  background: var(--dsw-alias-button-info-fill, #4d78e8);
}

#${UPDATE_SURFACE_ID} .dsh-update-close:hover,
#${UPDATE_SURFACE_ID} .dsh-update-action:hover:not([data-primary="true"]) {
  background: var(--dsw-alias-interactive-bg-hover, var(--dsh-update-hover));
}

#${UPDATE_SURFACE_ID} .dsh-update-action[data-primary="true"]:hover {
  background: var(--dsw-alias-button-info-hover, #3d64d8);
}

#${UPDATE_SURFACE_ID} .dsh-update-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 8px;
  border: 2px solid var(--dsw-alias-border-l2, var(--dsh-update-border));
  border-top-color: var(--dsw-alias-state-business-primary, #4d78e8);
  border-radius: 50%;
  vertical-align: -2px;
  animation: dsh-update-spin 800ms linear infinite;
}

@keyframes dsh-update-spin { to { transform: rotate(360deg); } }

#${UPDATE_SURFACE_ID} button:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #4d78e8);
  outline-offset: 2px;
}

@keyframes dsh-update-in {
  from { opacity: 0; transform: translateY(10px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  #${UPDATE_SURFACE_ID} * { transition: none !important; }
  #${UPDATE_SURFACE_ID} .dsh-update-panel,
  #${UPDATE_SURFACE_ID} .dsh-update-spinner { animation: none !important; }
}
`

export function createUpdateSurfaceScript() {
  return `(() => {
    const id = '${UPDATE_SURFACE_ID}';
    document.getElementById(id)?.remove();
    const api = window.dshDesktop;
    if (typeof api?.getUpdateStatus !== 'function') return false;

    const root = document.createElement('div');
    root.id = id;
    root.hidden = true;
    const mask = document.createElement('div');
    mask.className = 'dsh-update-mask';
    const panel = document.createElement('section');
    panel.className = 'dsh-update-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'dsh-update-title');

    const header = document.createElement('header');
    header.className = 'dsh-update-header';
    const heading = document.createElement('div');
    const kicker = document.createElement('p');
    kicker.className = 'dsh-update-kicker';
    kicker.textContent = '桌面版更新';
    const title = document.createElement('h2');
    title.id = 'dsh-update-title';
    title.className = 'dsh-update-title';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'dsh-update-close';
    close.setAttribute('aria-label', '关闭更新窗口');
    close.textContent = '×';
    heading.append(kicker, title);
    header.append(heading, close);

    const status = document.createElement('p');
    status.className = 'dsh-update-status';
    const spinner = document.createElement('i');
    spinner.className = 'dsh-update-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const versions = document.createElement('div');
    versions.className = 'dsh-update-version';
    const notes = document.createElement('pre');
    notes.className = 'dsh-update-notes';
    const progress = document.createElement('div');
    progress.className = 'dsh-update-progress';
    progress.setAttribute('role', 'progressbar');
    const progressFill = document.createElement('i');
    progress.append(progressFill);
    const fallback = document.createElement('p');
    fallback.className = 'dsh-update-fallback';
    fallback.textContent = '如果 GitHub 下载速度较慢，可以加入用户交流群。群内会同步提供最新版本安装包，可直接下载安装。';
    fallback.hidden = true;
    const channelSection = document.createElement('section');
    channelSection.className = 'dsh-update-channel';
    channelSection.hidden = true;
    const channelLabel = document.createElement('label');
    channelLabel.htmlFor = 'dsh-update-channel';
    channelLabel.textContent = '更新通道';
    const channel = document.createElement('select');
    channel.id = 'dsh-update-channel';
    const stableChannel = document.createElement('option');
    stableChannel.value = 'stable';
    stableChannel.textContent = '稳定版 Stable';
    const betaChannel = document.createElement('option');
    betaChannel.value = 'beta';
    betaChannel.textContent = '测试版 Beta';
    channel.append(stableChannel, betaChannel);
    const channelHint = document.createElement('p');
    channelHint.className = 'dsh-update-channel-hint';
    channelSection.append(channelLabel, channel, channelHint);
    const actions = document.createElement('div');
    actions.className = 'dsh-update-actions';
    panel.append(header, status, versions, notes, progress, fallback, channelSection, actions);
    root.append(mask, panel);
    document.body.append(root);

    const button = (label, action, primary = false) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'dsh-update-action';
      item.dataset.action = action;
      item.dataset.primary = String(primary);
      item.textContent = label;
      return item;
    };
    const github = button('前往 GitHub 下载', 'github');
    const community = button('加入用户群', 'community');
    const later = button('稍后更新', 'later');
    const recheck = button('重新检查', 'check');
    const install = button('重启并安装', 'install', true);

    let currentPhase = 'idle';
    const hide = () => { root.hidden = true; };
    const show = () => { root.hidden = false; close.focus(); };
    const renderChannel = (value = {}) => {
      const selected = value.channel === 'beta' ? 'beta' : 'stable';
      channel.value = selected;
      channelSection.hidden = false;
      const updateInProgress = ['downloading', 'ready', 'installing'].includes(currentPhase);
      channel.disabled = updateInProgress;
      channelHint.textContent = updateInProgress
        ? '正在处理已发现的更新，完成后可切换通道。'
        : '切换到稳定通道不会自动降级：已安装的较高 Beta 将保留，直到有更高的稳定版可用。';
    };
    const render = (value = {}) => {
      const phase = value.phase || 'idle';
      currentPhase = phase;
      const percent = Math.max(0, Math.min(100, Number(value.percent) || 0));
      progress.style.setProperty('--dsh-update-progress', percent + '%');
      progress.setAttribute('aria-valuenow', String(Math.round(percent)));
      versions.replaceChildren();
      if (value.currentVersion) {
        const current = document.createElement('span');
        current.textContent = '当前 ' + value.currentVersion;
        versions.append(current);
      }
      if (value.version) {
        const next = document.createElement('span');
        next.textContent = '最新 ' + value.version;
        versions.append(next);
      }
      notes.textContent = value.releaseNotes || '';
      notes.hidden = !value.releaseNotes;
      progress.hidden = phase !== 'downloading';
      fallback.hidden = !['downloading', 'ready', 'error'].includes(phase);
      actions.replaceChildren();

      if (phase === 'checking') {
        title.textContent = '正在检查更新';
        status.textContent = '正在连接桌面版更新服务，请稍候。';
        actions.append(later);
      } else if (phase === 'downloading') {
        title.textContent = '正在后台下载';
        status.textContent = '新版本正在静默下载，你可以继续当前工作。已完成 ' + Math.round(percent) + '%。'
          + (value.source ? ' 下载源：' + value.source + '。' : '');
        actions.append(github, community, later);
      } else if (phase === 'ready') {
        title.textContent = '新版本已准备就绪';
        status.textContent = '更新已经下载完成。重启前会安全停止本地 Harness 运行时。';
        actions.append(github, community, later, install);
      } else if (phase === 'installing') {
        title.textContent = '正在启动更新程序';
        status.textContent = '正在安全停止本地 Harness 运行时并启动安装程序，请稍候。';
      } else if (phase === 'current') {
        title.textContent = '已经是最新版本';
        status.textContent = '当前桌面版无需更新。';
        actions.append(later, recheck);
      } else if (phase === 'unavailable') {
        title.textContent = '当前环境无法检查更新';
        status.textContent = '桌面更新仅在已安装的 Windows 版本中可用。';
        actions.append(later);
      } else if (phase === 'error') {
        title.textContent = '更新没有完成';
        status.textContent = value.message || '请检查网络连接后重试。';
        actions.append(github, community, later, recheck);
      } else {
        title.textContent = '桌面版更新';
        status.textContent = '点击检查以获取最新桌面版本。';
        actions.append(later, recheck);
      }
      if (!channelSection.hidden) renderChannel({ channel: channel.value });
      if (phase === 'checking' || phase === 'installing') status.prepend(spinner);
      else spinner.remove();
      if (value.visible || phase === 'ready') show();
    };

    close.addEventListener('click', hide);
    mask.addEventListener('click', hide);
    later.addEventListener('click', hide);
    github.addEventListener('click', () => { void api.helpAction('downloads').catch(() => {}); });
    community.addEventListener('click', () => { void api.helpAction('community').catch(() => {}); });
    recheck.addEventListener('click', () => { void api.checkForUpdates().catch(() => {}); });
    install.addEventListener('click', () => { install.disabled = true; void api.installUpdate().catch(() => {}).finally(() => { install.disabled = false; }); });
    channel.addEventListener('change', () => {
      const selected = channel.value;
      channel.disabled = true;
      void api.setUpdateChannel(selected).then(renderChannel).catch(() => {
        channelHint.textContent = '更新通道未保存，请稍后重试。';
        void api.getUpdateChannel().then(renderChannel).catch(() => {
          channel.disabled = ['downloading', 'ready', 'installing'].includes(currentPhase);
        });
      });
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !root.hidden) hide(); });
    api.onUpdateStatus?.(render);
    api.onDeepLink?.((link) => {
      if (link?.kind !== 'updates') return;
      show();
      void api.checkForUpdates().catch(() => {});
    });
    void api.getUpdateStatus().then(render).catch(() => {});
    void api.getContract?.().then((contract) => {
      const hasChannelControl = Array.isArray(contract?.capabilities)
        && contract.capabilities.includes('updates.channel.manage');
      if (!hasChannelControl || typeof api.getUpdateChannel !== 'function' || typeof api.setUpdateChannel !== 'function') return;
      void api.getUpdateChannel().then(renderChannel).catch(() => {});
    }).catch(() => {});
    return true;
  })()`
}

/**
 * Keep the sidebar download seat owned by Desktop even when a bundled plugin
 * is upgraded or re-renders its React tree. The plugin currently delegates to
 * the bridge itself, but this capture-phase guard is the Desktop-owned source
 * of truth and therefore does not depend on any particular plugin release.
 */
export function createDesktopUpdateTriggerGuardScript() {
  return `(() => {
    const api = window.dshDesktop;
    if (typeof api?.checkForUpdates !== 'function') return false;

    const guardKey = '__dshDesktopUpdateTriggerGuard';
    window[guardKey]?.dispose?.();
    // Old plugin releases say "plugin" and the 2.4-aware release says
    // "desktop" when the Electron bridge exists. Claim both: the Desktop
    // shell, not the currently installed plugin version, owns this seat.
    const pluginSelector = 'button[${PLUGIN_UPDATE_TRIGGER_ATTRIBUTE}]';
    const legacySelector = [
      'button[aria-label="检查更新"]',
      'button[aria-label="Check for updates"]',
      'button[title="检查更新"]',
      'button[title="Check for updates"]',
    ].join(',');
    const selector = pluginSelector + ',' + legacySelector;
    const ownedSelector = 'button[${DESKTOP_UPDATE_TRIGGER_ATTRIBUTE}="true"]';
    const excludedSelector = '#${UPDATE_SURFACE_ID},#dsh-desktop-window-chrome';

    const isExcluded = (button) => button.closest(excludedSelector) !== null;
    const claim = (button) => {
      if (!button || isExcluded(button)) return false;
      const previous = button.getAttribute('aria-label') || button.getAttribute('title') || '';
      const english = previous.startsWith('Check');
      const label = english ? 'Check for Desktop updates' : '检查桌面版更新';
      button.setAttribute('${DESKTOP_UPDATE_TRIGGER_ATTRIBUTE}', 'true');
      if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
      if (button.getAttribute('title') !== label) button.setAttribute('title', label);
      return true;
    };
    const claimAll = () => document.querySelectorAll(selector).forEach(claim);
    const findButton = (target) => {
      if (!(target instanceof Element)) return null;
      const button = target.closest(ownedSelector + ',' + selector);
      return button && !isExcluded(button) ? button : null;
    };
    const onClick = (event) => {
      const button = findButton(event.target);
      if (!button) return;
      claim(button);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void api.checkForUpdates().catch(() => {});
    };
    const observer = new MutationObserver(claimAll);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'title', '${PLUGIN_UPDATE_TRIGGER_ATTRIBUTE}'],
    });
    document.addEventListener('click', onClick, true);
    claimAll();
    window[guardKey] = {
      dispose() {
        observer.disconnect();
        document.removeEventListener('click', onClick, true);
      },
    };
    return true;
  })()`
}

export async function applyUpdateSurface({ webContents }) {
  if (!webContents || webContents.isDestroyed?.()) return false
  await webContents.insertCSS(UPDATE_SURFACE_CSS, { cssOrigin: 'author' })
  const mounted = await webContents.executeJavaScript(createUpdateSurfaceScript(), true)
  const guarded = await webContents.executeJavaScript(createDesktopUpdateTriggerGuardScript(), true)
  return Boolean(mounted && guarded)
}

export function installUpdateSurface({ browserWindow, onError = () => {} }) {
  const { webContents } = browserWindow
  const apply = () => {
    void applyUpdateSurface({ webContents }).catch(onError)
  }
  webContents.on('did-finish-load', apply)
  return () => webContents.removeListener('did-finish-load', apply)
}
