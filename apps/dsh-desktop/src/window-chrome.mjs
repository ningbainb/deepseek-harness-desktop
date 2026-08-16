export const WINDOW_CHROME_HEIGHT = 32

const WINDOW_CHROME_ID = 'dsh-desktop-window-chrome'

export const WINDOW_CHROME_THEMES = Object.freeze({
  dark: Object.freeze({ color: '#071117', symbolColor: '#d9edf4' }),
  light: Object.freeze({ color: '#eef2f8', symbolColor: '#1f2937' }),
})

export function normalizeWindowChromeTheme(value) {
  if (typeof value !== 'string' || !(value in WINDOW_CHROME_THEMES)) {
    throw new TypeError(`invalid window chrome theme: ${JSON.stringify(value)}`)
  }
  return value
}

export function setWindowChromeTheme(browserWindow, rawTheme) {
  const theme = normalizeWindowChromeTheme(rawTheme)
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
  border-bottom: 1px solid var(--dsh-desktop-chrome-border, rgba(174, 232, 245, 0.12));
  background-color: var(--dsh-desktop-chrome-bg, rgba(8, 18, 24, 0.7));
  background-image: linear-gradient(180deg, var(--dsh-desktop-chrome-highlight, rgba(255, 255, 255, 0.08)), transparent 58%);
  box-shadow: var(--dsh-desktop-chrome-shadow, inset 0 1px rgba(235, 251, 255, 0.1), 0 1px 6px rgba(0, 3, 7, 0.12));
  -webkit-backdrop-filter: blur(26px) saturate(145%);
  backdrop-filter: blur(26px) saturate(145%);
  isolation: isolate;
  user-select: none;
}

html[data-dsh-desktop-chrome-theme="dark"] {
  --dsh-desktop-chrome-border: rgba(174, 232, 245, 0.12);
  --dsh-desktop-chrome-bg: rgba(8, 18, 24, 0.7);
  --dsh-desktop-chrome-highlight: rgba(255, 255, 255, 0.08);
  --dsh-desktop-chrome-sheen: rgba(148, 226, 245, 0.055);
  --dsh-desktop-chrome-shadow: inset 0 1px rgba(235, 251, 255, 0.1), 0 1px 6px rgba(0, 3, 7, 0.12);
}

html[data-dsh-desktop-chrome-theme="light"] {
  --dsh-desktop-chrome-border: rgba(71, 85, 105, 0.13);
  --dsh-desktop-chrome-bg: rgba(246, 248, 252, 0.72);
  --dsh-desktop-chrome-highlight: rgba(255, 255, 255, 0.58);
  --dsh-desktop-chrome-sheen: rgba(255, 255, 255, 0.3);
  --dsh-desktop-chrome-shadow: inset 0 1px rgba(255, 255, 255, 0.82), 0 1px 6px rgba(15, 23, 42, 0.08);
}

html[data-dsh-desktop-window-chrome="true"] .dsh-desktop-modal-layer {
  top: var(--dsh-desktop-window-chrome-height) !important;
  height: calc(100vh - var(--dsh-desktop-window-chrome-height)) !important;
  max-height: calc(100vh - var(--dsh-desktop-window-chrome-height)) !important;
}

#${WINDOW_CHROME_ID}::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  content: "";
  pointer-events: none;
  background:
    linear-gradient(108deg, var(--dsh-desktop-chrome-sheen, rgba(148, 226, 245, 0.055)), transparent 24%),
    linear-gradient(90deg, transparent 54%, rgba(255, 255, 255, 0.025) 72%, transparent 90%);
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-icon {
  position: relative;
  z-index: 1;
  width: 18px;
  height: 18px;
  flex: none;
  border-radius: 5px;
  object-fit: contain;
  filter: saturate(106%) drop-shadow(0 1px 2px rgba(0, 8, 18, 0.3));
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-help {
  -webkit-app-region: no-drag;
  position: relative;
  z-index: 2;
  margin-left: auto;
  font: 12px/1.4 system-ui, "Microsoft YaHei UI", sans-serif;
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-help-button {
  height: 26px;
  padding: 0 10px;
  border: 1px solid rgba(173, 230, 244, 0.16);
  border-radius: 7px;
  color: inherit;
  background: rgba(255, 255, 255, 0.055);
  cursor: pointer;
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-help-button:hover,
#${WINDOW_CHROME_ID} .dsh-window-chrome-help-button[aria-expanded="true"] {
  border-color: rgba(173, 230, 244, 0.32);
  background: rgba(255, 255, 255, 0.11);
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-help-button:focus-visible,
#${WINDOW_CHROME_ID} .dsh-window-chrome-help-item:focus-visible {
  outline: 2px solid #72d9f1;
  outline-offset: 1px;
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-help-menu {
  position: absolute;
  top: 31px;
  right: 0;
  width: 214px;
  padding: 6px;
  border: 1px solid rgba(173, 230, 244, 0.2);
  border-radius: 10px;
  background: rgba(6, 16, 23, 0.97);
  box-shadow: 0 16px 40px rgba(0, 3, 7, 0.42);
  color: #e7f7fb;
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-help-menu[hidden] {
  display: none;
}

#${WINDOW_CHROME_ID} .dsh-window-chrome-help-item {
  display: block;
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

#${WINDOW_CHROME_ID} .dsh-window-chrome-help-item:hover {
  background: rgba(114, 217, 241, 0.12);
}

html[data-dsh-desktop-chrome-theme="light"] #${WINDOW_CHROME_ID} .dsh-window-chrome-help-menu {
  border-color: rgba(51, 65, 85, 0.16);
  background: rgba(250, 252, 255, 0.98);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
  color: #172033;
}

@media (prefers-contrast: more) {
  #${WINDOW_CHROME_ID} {
    border-bottom-color: rgba(190, 238, 250, 0.5);
    background: #071117;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}
`

export function windowChromeBrowserOptions() {
  const theme = WINDOW_CHROME_THEMES.dark
  return {
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      ...theme,
      height: WINDOW_CHROME_HEIGHT,
    },
  }
}

export function createWindowChromeScript({ iconDataUrl = '', showHelpMenu = false } = {}) {
  const data = JSON.stringify({
    iconDataUrl: String(iconDataUrl),
    id: WINDOW_CHROME_ID,
    showHelpMenu: Boolean(showHelpMenu),
  })
  return `(() => {
    const data = ${data};
    document.getElementById(data.id)?.remove();
    const chrome = document.createElement('div');
    chrome.id = data.id;
    const icon = document.createElement('img');
    icon.className = 'dsh-window-chrome-icon';
    icon.alt = '';
    icon.draggable = false;
    if (data.iconDataUrl) icon.src = data.iconDataUrl;
    chrome.append(icon);
    if (data.showHelpMenu && typeof window.dshDesktop?.helpAction === 'function') {
      const help = document.createElement('div');
      help.className = 'dsh-window-chrome-help';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dsh-window-chrome-help-button';
      button.textContent = '帮助 / Help';
      button.setAttribute('aria-haspopup', 'menu');
      button.setAttribute('aria-expanded', 'false');
      const menu = document.createElement('div');
      menu.className = 'dsh-window-chrome-help-menu';
      menu.setAttribute('role', 'menu');
      menu.hidden = true;
      const closeMenu = ({ restoreFocus = false } = {}) => {
        menu.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        if (restoreFocus) button.focus();
      };
      const entries = [
        { label: '加入社群 / Join QQ Group', action: 'community' },
        { label: '提建议 / Suggest an Idea', action: 'feedback' },
        { label: 'GitHub 项目', action: 'project' },
        { label: '检查更新 / Check for Updates', action: 'updates' },
      ];
      for (const entry of entries) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'dsh-window-chrome-help-item';
        item.setAttribute('role', 'menuitem');
        item.textContent = entry.label;
        item.addEventListener('click', () => {
          closeMenu();
          void Promise.resolve(window.dshDesktop.helpAction(entry.action)).catch(() => {});
        });
        menu.append(item);
      }
      button.addEventListener('click', () => {
        const open = menu.hidden;
        menu.hidden = !open;
        button.setAttribute('aria-expanded', String(open));
        if (open) menu.querySelector('[role="menuitem"]')?.focus();
      });
      document.addEventListener('pointerdown', (event) => {
        if (!help.contains(event.target)) closeMenu();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !menu.hidden) closeMenu({ restoreFocus: true });
      });
      help.append(button, menu);
      chrome.append(help);
    }
    document.documentElement.dataset.dshDesktopWindowChrome = 'true';
    document.body.prepend(chrome);

    const isDark = () => {
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
        window.dshDesktop?.setWindowChromeTheme?.(theme);
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
    const sync = () => { syncTheme(); markModalLayers(); };
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

export async function applyWindowChrome({ webContents, iconDataUrl, showHelpMenu = false }) {
  if (!webContents || webContents.isDestroyed?.()) return false
  await webContents.insertCSS(WINDOW_CHROME_CSS, { cssOrigin: 'author' })
  return webContents.executeJavaScript(createWindowChromeScript({ iconDataUrl, showHelpMenu }), true)
}

export function installWindowChrome({ browserWindow, iconDataUrl, showHelpMenu = false, onError = () => {} }) {
  const { webContents } = browserWindow
  const apply = () => {
    void applyWindowChrome({ webContents, iconDataUrl, showHelpMenu }).catch(onError)
  }
  webContents.on('did-finish-load', apply)
  return () => webContents.removeListener('did-finish-load', apply)
}
