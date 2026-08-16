const UPDATE_SURFACE_ID = 'dsh-desktop-update-surface'

export const UPDATE_SURFACE_CSS = `
#${UPDATE_SURFACE_ID} {
  position: fixed;
  z-index: 2147483646;
  inset: var(--dsh-desktop-window-chrome-height, 32px) 0 0;
  display: grid;
  place-items: center;
  padding: 28px;
  color: #edf7ff;
  font-family: "Segoe UI Variable Text", "Microsoft YaHei UI", sans-serif;
}

#${UPDATE_SURFACE_ID}[hidden] { display: none; }

#${UPDATE_SURFACE_ID} .dsh-update-mask {
  position: absolute;
  inset: 0;
  background: rgba(1, 7, 15, 0.52);
  -webkit-backdrop-filter: blur(9px) saturate(112%);
  backdrop-filter: blur(9px) saturate(112%);
}

#${UPDATE_SURFACE_ID} .dsh-update-panel {
  position: relative;
  width: min(560px, calc(100vw - 56px));
  max-height: min(680px, calc(100vh - 88px));
  padding: 28px;
  overflow: auto;
  border: 1px solid rgba(164, 220, 242, 0.2);
  border-radius: 24px;
  background:
    linear-gradient(145deg, rgba(22, 42, 58, 0.88), rgba(5, 15, 27, 0.78)),
    rgba(5, 15, 27, 0.82);
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.1), 0 32px 90px rgba(0, 3, 10, 0.52);
  -webkit-backdrop-filter: blur(32px) saturate(148%);
  backdrop-filter: blur(32px) saturate(148%);
}

#${UPDATE_SURFACE_ID} .dsh-update-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

#${UPDATE_SURFACE_ID} .dsh-update-kicker {
  margin: 0 0 9px;
  color: #75d8ef;
  font: 650 10px/1.2 "Cascadia Mono", Consolas, monospace;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

#${UPDATE_SURFACE_ID} .dsh-update-title {
  margin: 0;
  color: #f5fbff;
  font-size: 25px;
  font-weight: 610;
  letter-spacing: -0.025em;
}

#${UPDATE_SURFACE_ID} .dsh-update-close {
  width: 34px;
  height: 34px;
  flex: none;
  border: 1px solid rgba(183, 225, 241, 0.16);
  border-radius: 11px;
  color: #b8cfda;
  background: rgba(255, 255, 255, 0.055);
  cursor: pointer;
  font-size: 20px;
}

#${UPDATE_SURFACE_ID} .dsh-update-status {
  margin: 22px 0 0;
  color: #a8becb;
  font-size: 14px;
  line-height: 1.7;
}

#${UPDATE_SURFACE_ID} .dsh-update-version {
  display: flex;
  gap: 10px;
  margin: 17px 0 0;
  color: #dcebf2;
  font: 12px/1.5 "Cascadia Mono", Consolas, monospace;
}

#${UPDATE_SURFACE_ID} .dsh-update-version span {
  padding: 6px 9px;
  border: 1px solid rgba(157, 211, 233, 0.13);
  border-radius: 8px;
  background: rgba(2, 12, 22, 0.26);
}

#${UPDATE_SURFACE_ID} .dsh-update-notes {
  max-height: 230px;
  margin: 18px 0 0;
  padding: 15px 17px;
  overflow: auto;
  border: 1px solid rgba(157, 211, 233, 0.12);
  border-radius: 13px;
  color: #acc0cc;
  background: rgba(1, 8, 17, 0.34);
  font: 12px/1.7 "Cascadia Mono", Consolas, monospace;
  white-space: pre-wrap;
}

#${UPDATE_SURFACE_ID} .dsh-update-progress {
  height: 5px;
  margin-top: 22px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(136, 195, 222, 0.12);
}

#${UPDATE_SURFACE_ID} .dsh-update-progress i {
  display: block;
  width: var(--dsh-update-progress, 0%);
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2f87c8, #70daf0, #c8f5ff);
  box-shadow: 0 0 18px rgba(112, 218, 240, 0.52);
  transition: width 260ms ease;
}

#${UPDATE_SURFACE_ID} .dsh-update-actions {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  margin-top: 24px;
}

#${UPDATE_SURFACE_ID} .dsh-update-action {
  min-height: 39px;
  padding: 0 16px;
  border: 1px solid rgba(145, 213, 237, 0.2);
  border-radius: 11px;
  color: #d8edf5;
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  font: 560 12px "Segoe UI Variable Text", "Microsoft YaHei UI", sans-serif;
}

#${UPDATE_SURFACE_ID} .dsh-update-action[data-primary="true"] {
  border-color: rgba(121, 222, 242, 0.64);
  color: #041017;
  background: linear-gradient(135deg, #baf2fc, #67d1e9);
  box-shadow: 0 10px 28px rgba(63, 180, 211, 0.2);
}

#${UPDATE_SURFACE_ID} button:focus-visible {
  outline: 2px solid #baf2fc;
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  #${UPDATE_SURFACE_ID} * { transition: none !important; }
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
    kicker.textContent = 'DESKTOP UPDATE';
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
    const versions = document.createElement('div');
    versions.className = 'dsh-update-version';
    const notes = document.createElement('pre');
    notes.className = 'dsh-update-notes';
    const progress = document.createElement('div');
    progress.className = 'dsh-update-progress';
    progress.setAttribute('role', 'progressbar');
    const progressFill = document.createElement('i');
    progress.append(progressFill);
    const actions = document.createElement('div');
    actions.className = 'dsh-update-actions';
    panel.append(header, status, versions, notes, progress, actions);
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
    const later = button('稍后 / Later', 'later');
    const recheck = button('重新检查 / Check again', 'check');
    const install = button('重启并安装 / Restart and install', 'install', true);

    const hide = () => { root.hidden = true; };
    const show = () => { root.hidden = false; close.focus(); };
    const render = (value = {}) => {
      const phase = value.phase || 'idle';
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
      actions.replaceChildren();

      if (phase === 'checking') {
        title.textContent = '正在检查更新';
        status.textContent = '正在连接桌面版更新服务，请稍候。';
        actions.append(later);
      } else if (phase === 'downloading') {
        title.textContent = '正在后台下载';
        status.textContent = '新版本正在静默下载，你可以继续当前工作。已完成 ' + Math.round(percent) + '%。';
        actions.append(later);
      } else if (phase === 'ready') {
        title.textContent = '新版本已准备就绪';
        status.textContent = '更新已经下载完成。重启前会安全停止本地 Harness 运行时。';
        actions.append(later, install);
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
        actions.append(later, recheck);
      } else {
        title.textContent = '桌面版更新';
        status.textContent = '点击检查以获取最新桌面版本。';
        actions.append(later, recheck);
      }
      if (value.visible || phase === 'ready') show();
    };

    close.addEventListener('click', hide);
    mask.addEventListener('click', hide);
    later.addEventListener('click', hide);
    recheck.addEventListener('click', () => { void api.checkForUpdates(); });
    install.addEventListener('click', () => { install.disabled = true; void api.installUpdate().finally(() => { install.disabled = false; }); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !root.hidden) hide(); });
    api.onUpdateStatus?.(render);
    void api.getUpdateStatus().then(render).catch(() => {});
    return true;
  })()`
}

export async function applyUpdateSurface({ webContents }) {
  if (!webContents || webContents.isDestroyed?.()) return false
  await webContents.insertCSS(UPDATE_SURFACE_CSS, { cssOrigin: 'author' })
  return webContents.executeJavaScript(createUpdateSurfaceScript(), true)
}

export function installUpdateSurface({ browserWindow, onError = () => {} }) {
  const { webContents } = browserWindow
  const apply = () => {
    void applyUpdateSurface({ webContents }).catch(onError)
  }
  webContents.on('did-finish-load', apply)
  return () => webContents.removeListener('did-finish-load', apply)
}
