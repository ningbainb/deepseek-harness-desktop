export const WINDOW_CHROME_HEIGHT = 32

const WINDOW_CHROME_ID = 'dsh-desktop-window-chrome'

export const WINDOW_CHROME_THEMES = Object.freeze({
  dark: Object.freeze({ color: '#071117', symbolColor: '#d9edf4' }),
  light: Object.freeze({ color: '#f7f8fa', symbolColor: '#1f2937' }),
})

export function normalizeWindowChromeTheme(value) {
  if (typeof value !== 'string' || !(value in WINDOW_CHROME_THEMES)) {
    throw new TypeError(`invalid window chrome theme: ${JSON.stringify(value)}`)
  }
  return value
}

const windowChromeThemes = new WeakMap()

export function getWindowChromeTheme(browserWindow) {
  return windowChromeThemes.get(browserWindow) ?? 'dark'
}

export function setWindowChromeTheme(browserWindow, rawTheme) {
  const theme = normalizeWindowChromeTheme(rawTheme)
  if (browserWindow) windowChromeThemes.set(browserWindow, theme)
  browserWindow?.setTitleBarOverlay?.({
    ...WINDOW_CHROME_THEMES[theme],
    height: WINDOW_CHROME_HEIGHT,
  })
  return theme
}

export const WINDOW_CHROME_CSS = `
:root {
  --dsh-desktop-window-chrome-height: ${WINDOW_CHROME_HEIGHT}px;
}

html[data-dsh-desktop-window-chrome="true"] body {
  box-sizing: border-box !important;
  height: 100vh !important;
  min-height: 0 !important;
  padding-top: var(--dsh-desktop-window-chrome-height) !important;
}

/* The DSH web shell may pin #root to the viewport with fixed/absolute
   positioning, which ignores body padding. Bound the application root to the
   physical area below the native caption overlay in both positioned and
   normal-flow layouts. */
html[data-dsh-desktop-window-chrome="true"] body > #root {
  box-sizing: border-box !important;
  height: calc(100vh - var(--dsh-desktop-window-chrome-height)) !important;
  min-height: 0 !important;
  max-height: calc(100vh - var(--dsh-desktop-window-chrome-height)) !important;
}

html[data-dsh-desktop-window-chrome="true"] body > #root.dsh-desktop-viewport-root {
  top: var(--dsh-desktop-window-chrome-height) !important;
}

html[data-dsh-desktop-window-chrome="true"] body > #root [data-dsh-frame] {
  min-height: 0 !important;
  max-height: 100% !important;
}

/* Optional skins render their own decorative fixed title bar outside #root.
   Keep it visible, but never underneath the native Desktop controls. */
html[data-dsh-desktop-window-chrome="true"] body > [data-skin-chrome="titlebar"] {
  transform: translateY(var(--dsh-desktop-window-chrome-height)) !important;
}

#${WINDOW_CHROME_ID} {
  -webkit-app-region: drag;
  box-sizing: border-box;
  position: fixed;
  z-index: 2147483647;
  top: 0;
  right: 0;
  left: 0;
  display: flex;
  height: var(--dsh-desktop-window-chrome-height);
  align-items: center;
  padding: 0 140px 0 10px;
  overflow: visible;
  background-color: var(--dsh-desktop-chrome-bg, #071117);
  isolation: isolate;
  user-select: none;
}

html[data-dsh-desktop-chrome-theme="dark"] {
  --dsh-desktop-chrome-bg: #071117;
}

html[data-dsh-desktop-chrome-theme="light"] {
  --dsh-desktop-chrome-bg: #f7f8fa;
  --dsh-desktop-chrome-menu-hover: rgba(15, 23, 42, 0.06);
}

html[data-dsh-desktop-window-chrome="true"] .dsh-desktop-modal-layer {
  top: var(--dsh-desktop-window-chrome-height) !important;
  height: calc(100vh - var(--dsh-desktop-window-chrome-height)) !important;
  max-height: calc(100vh - var(--dsh-desktop-window-chrome-height)) !important;
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-menus {
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-tools,
#${WINDOW_CHROME_ID} .dsh-window-chrome-help {
  -webkit-app-region: no-drag;
  position: relative;
  z-index: 2;
  font: 12px/1.4 system-ui, "Microsoft YaHei UI", sans-serif;
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-menu-button {
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  min-height: 0;
  box-shadow: none;
  font: inherit;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-menu-button:hover,
#${WINDOW_CHROME_ID} .dsh-window-chrome-menu-button[aria-expanded="true"] {
  background: var(--dsh-desktop-chrome-menu-hover, rgba(255, 255, 255, 0.1));
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-menu-button:focus-visible,
#${WINDOW_CHROME_ID} .dsh-window-chrome-menu-item:focus-visible {
  outline: 2px solid #72d9f1;
  outline-offset: 1px;
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-menu-popup {
  position: absolute;
  top: 31px;
  right: 0;
  width: max-content;
  min-width: 214px;
  max-width: calc(100vw - 20px);
  padding: 6px;
  border: 1px solid rgba(173, 230, 244, 0.2);
  border-radius: 12px;
  background: rgba(6, 16, 23, 0.82);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  backdrop-filter: blur(24px) saturate(160%);
  animation: dsh-chrome-menu-in 160ms cubic-bezier(0.2, 0.75, 0.2, 1);
  box-shadow: 0 16px 40px rgba(0, 3, 7, 0.42);
  color: #e7f7fb;
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-menu-popup[hidden] {
  display: none;
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 22px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 7px;
  color: inherit;
  background: transparent;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-menu-shortcut {
  color: rgba(215, 239, 245, 0.62);
  font-size: 11px;
  white-space: nowrap;
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-menu-item:hover {
  background: rgba(114, 217, 241, 0.12);
}

html[data-dsh-desktop-chrome-theme="light"] #${WINDOW_CHROME_ID} .dsh-window-chrome-menu-popup {
  border-color: rgba(51, 65, 85, 0.16);
  background: rgba(250, 252, 255, 0.88);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
  color: #172033;
}

html[data-dsh-desktop-chrome-theme="light"] #${WINDOW_CHROME_ID} .dsh-window-chrome-menu-shortcut {
  color: rgba(23, 32, 51, 0.58);
}

html[data-dsh-desktop-chrome-theme="light"] #${WINDOW_CHROME_ID} .dsh-window-chrome-menu-button {
  border-color: rgba(0, 0, 0, 0.1);
  color: #0f1115;
  background: transparent;
}

html[data-dsh-desktop-chrome-theme="light"] #${WINDOW_CHROME_ID} .dsh-window-chrome-menu-button:hover,
html[data-dsh-desktop-chrome-theme="light"] #${WINDOW_CHROME_ID} .dsh-window-chrome-menu-button[aria-expanded="true"] {
  border-color: rgba(0, 0, 0, 0.14);
  background: #ebeff2;
}

@media (prefers-contrast: more) {
  #${WINDOW_CHROME_ID} {
    border-bottom: 1px solid rgba(190, 238, 250, 0.5);
    background: #071117;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}

@keyframes dsh-chrome-menu-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  #${WINDOW_CHROME_ID} .dsh-window-chrome-menu-popup { animation: none; }
}
`

export function windowChromeBrowserOptions(rawTheme = 'dark') {
  const theme = WINDOW_CHROME_THEMES[normalizeWindowChromeTheme(rawTheme)]
  return {
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      ...theme,
      height: WINDOW_CHROME_HEIGHT,
    },
  }
}

export function createWindowChromeScript({ showHelpMenu = false, showToolsMenu = false } = {}) {
  const data = JSON.stringify({
    id: WINDOW_CHROME_ID,
    chromeHeight: WINDOW_CHROME_HEIGHT,
    showHelpMenu: Boolean(showHelpMenu),
    showToolsMenu: Boolean(showToolsMenu),
  })
  return `(() => {
    const data = ${data};
    document.getElementById(data.id)?.remove();
    const chrome = document.createElement('div');
    chrome.id = data.id;
    const canShowTools = data.showToolsMenu && typeof window.dshDesktop?.toolAction === 'function';
    const canShowHelp = data.showHelpMenu && typeof window.dshDesktop?.helpAction === 'function';
    if (canShowTools || canShowHelp) {
      const menus = document.createElement('div');
      menus.className = 'dsh-window-chrome-menus';
      const states = [];
      const closeMenus = ({ restoreFocus = false } = {}) => {
        const active = states.find((state) => !state.menu.hidden);
        for (const state of states) {
          state.menu.hidden = true;
          state.button.setAttribute('aria-expanded', 'false');
        }
        if (restoreFocus) active?.button.focus();
      };
      const addMenu = ({ kind, label, entries, invoke }) => {
        const root = document.createElement('div');
        root.className = 'dsh-window-chrome-' + kind;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dsh-window-chrome-menu-button';
        button.textContent = label;
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
        const menu = document.createElement('div');
        menu.className = 'dsh-window-chrome-menu-popup';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', label);
        menu.hidden = true;
        const state = { button, menu };
        states.push(state);
        for (const entry of entries) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'dsh-window-chrome-menu-item';
          item.setAttribute('role', 'menuitem');
          item.setAttribute('aria-label', entry.label);
          const itemLabel = document.createElement('span');
          itemLabel.textContent = entry.label;
          item.append(itemLabel);
          if (entry.shortcut) {
            const shortcut = document.createElement('span');
            shortcut.className = 'dsh-window-chrome-menu-shortcut';
            shortcut.setAttribute('aria-hidden', 'true');
            shortcut.textContent = entry.shortcut;
            item.append(shortcut);
          }
          item.addEventListener('click', () => {
            closeMenus();
            void Promise.resolve(invoke(entry.action)).catch(() => {});
          });
          menu.append(item);
        }
        button.addEventListener('click', () => {
          const open = menu.hidden;
          closeMenus();
          menu.hidden = !open;
          button.setAttribute('aria-expanded', String(open));
          if (open) menu.querySelector('[role="menuitem"]')?.focus();
        });
        root.append(button, menu);
        menus.append(root);
      };
      if (canShowTools) addMenu({
        kind: 'tools',
        label: '工具 / Tools',
        entries: [
          { label: '内置终端 / Built-in Terminal', action: 'terminal', shortcut: 'Ctrl+Alt+T' },
          { label: '扩展坞 / Extension Dock', action: 'extensions', shortcut: 'Ctrl+Shift+X' },
          { label: '从其他 AI 工具导入 / Migrate from Other AI Tools', action: 'conversation-import' },
        ],
        invoke: (action) => window.dshDesktop.toolAction(action),
      });
      if (canShowHelp) addMenu({
        kind: 'help',
        label: '帮助 / Help',
        entries: [
          { label: '加入社群', action: 'community' },
          { label: '提交建议', action: 'feedback' },
          { label: 'GitHub 项目', action: 'project' },
          { label: '隐私政策', action: 'privacy' },
          { label: '导出诊断日志', action: 'export-diagnostics' },
          { label: '检查更新', action: 'updates' },
        ],
        invoke: (action) => window.dshDesktop.helpAction(action),
      });
      document.addEventListener('pointerdown', (event) => {
        if (!menus.contains(event.target)) closeMenus();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeMenus({ restoreFocus: true });
      });
      chrome.append(menus);
    }
    document.documentElement.dataset.dshDesktopWindowChrome = 'true';
    document.body.prepend(chrome);

    const isDark = () => {
      const pageTheme = document.documentElement.dataset.dshDesktopTheme;
      if (pageTheme === 'dark') return true;
      if (pageTheme === 'light') return false;
      if (document.body.hasAttribute('data-ds-dark-theme')) return true;
      const scheme = getComputedStyle(document.documentElement).colorScheme;
      if (scheme && scheme !== 'normal') return scheme.includes('dark');
      const rgb = getComputedStyle(document.body).backgroundColor.match(/\\d+(?:\\.\\d+)?/g)?.slice(0, 3).map(Number);
      return Array.isArray(rgb) && rgb.length === 3 && (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) < 128000;
    };
    let activeTheme;
    const syncTheme = () => {
      const theme = isDark() ? 'dark' : 'light';
      if (document.documentElement.dataset.dshDesktopChromeTheme !== theme) {
        document.documentElement.dataset.dshDesktopChromeTheme = theme;
      }
      if (theme !== activeTheme) {
        activeTheme = theme;
        Promise.resolve(window.dshDesktop?.setWindowChromeTheme?.(theme)).catch(() => {});
      }
    };
    const markModalLayers = () => {
      document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]').forEach((dialog) => {
        let layer = dialog;
        while (layer.parentElement && layer.parentElement !== document.body) {
          if (getComputedStyle(layer).position === 'fixed') break;
          layer = layer.parentElement;
        }
        if (getComputedStyle(layer).position === 'fixed' && !layer.classList.contains('dsh-desktop-modal-layer')) {
          layer.classList.add('dsh-desktop-modal-layer');
        }
      });
    };
    const markViewportRoot = () => {
      const root = document.body.querySelector(':scope > #root');
      if (!root) return;
      const position = getComputedStyle(root).position;
      const overlapsChrome = (position === 'fixed' || position === 'absolute')
        && root.getBoundingClientRect().top < data.chromeHeight;
      root.classList.toggle('dsh-desktop-viewport-root', overlapsChrome);
    };
    const sync = () => { syncTheme(); markViewportRoot(); markModalLayers(); };
    new MutationObserver(sync).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-ds-dark-theme'],
      childList: true,
      subtree: true,
    });
    sync();
    return true;
  })()`
}

export async function applyWindowChrome({ webContents, iconDataUrl, showHelpMenu = false, showToolsMenu = false }) {
  if (!webContents || webContents.isDestroyed?.()) return false
  await webContents.insertCSS(WINDOW_CHROME_CSS, { cssOrigin: 'author' })
  return webContents.executeJavaScript(createWindowChromeScript({ iconDataUrl, showHelpMenu, showToolsMenu }), true)
}

export function installWindowChrome({ browserWindow, iconDataUrl, showHelpMenu = false, showToolsMenu = false, onError = () => {} }) {
  const { webContents } = browserWindow
  const readFlag = (value) => typeof value === 'function' ? value() : value
  const apply = () => {
    void applyWindowChrome({
      webContents,
      iconDataUrl,
      showHelpMenu: readFlag(showHelpMenu),
      showToolsMenu: readFlag(showToolsMenu),
    }).catch(onError)
  }
  const reapplyOverlayTheme = () => {
    if (!browserWindow.isDestroyed?.()) setWindowChromeTheme(browserWindow, getWindowChromeTheme(browserWindow))
  }
  webContents.on('did-finish-load', apply)
  browserWindow.on?.('restore', reapplyOverlayTheme)
  return () => {
    webContents.removeListener('did-finish-load', apply)
    browserWindow.removeListener?.('restore', reapplyOverlayTheme)
  }
}
