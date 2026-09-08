import {
  SETTINGS_WINDOW_MARGIN,
  SETTINGS_WINDOW_MIN_HEIGHT,
  SETTINGS_WINDOW_MIN_WIDTH,
} from './settings-window-state.mjs'

const SETTINGS_DIALOG_CLASS = 'dsh-desktop-settings-window'
const SETTINGS_LAYER_CLASS = 'dsh-desktop-settings-layer'

export const SETTINGS_WINDOW_CSS = `
.${SETTINGS_LAYER_CLASS} {
  align-items: initial !important;
  justify-content: initial !important;
}

.${SETTINGS_DIALOG_CLASS} {
  box-sizing: border-box !important;
  position: absolute !important;
  left: var(--dsh-settings-window-x) !important;
  top: var(--dsh-settings-window-y) !important;
  width: var(--dsh-settings-window-width) !important;
  min-width: min(${SETTINGS_WINDOW_MIN_WIDTH}px, calc(100% - ${SETTINGS_WINDOW_MARGIN * 2}px)) !important;
  max-width: calc(100% - ${SETTINGS_WINDOW_MARGIN * 2}px) !important;
  height: var(--dsh-settings-window-height) !important;
  min-height: min(${SETTINGS_WINDOW_MIN_HEIGHT}px, calc(100% - ${SETTINGS_WINDOW_MARGIN * 2}px)) !important;
  max-height: calc(100% - ${SETTINGS_WINDOW_MARGIN * 2}px) !important;
  margin: 0 !important;
  container-type: inline-size;
}

.${SETTINGS_DIALOG_CLASS} > nav {
  box-sizing: border-box;
  flex: 0 0 clamp(132px, 24%, 188px) !important;
  min-width: 0 !important;
  max-width: 188px !important;
  overflow: auto !important;
  scrollbar-gutter: stable;
}

.${SETTINGS_DIALOG_CLASS} > nav + div {
  box-sizing: border-box;
  min-width: 0 !important;
  max-width: 100% !important;
  overflow: auto !important;
  scrollbar-gutter: stable;
}

.${SETTINGS_DIALOG_CLASS} input,
.${SETTINGS_DIALOG_CLASS} select,
.${SETTINGS_DIALOG_CLASS} textarea,
.${SETTINGS_DIALOG_CLASS} button {
  max-width: 100%;
}

.${SETTINGS_DIALOG_CLASS} [data-dsh-settings-drag-handle="true"] {
  cursor: move;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.${SETTINGS_DIALOG_CLASS} [data-dsh-settings-drag-handle="true"]:active { cursor: grabbing; }

.${SETTINGS_LAYER_CLASS} > [data-dsh-settings-resize] {
  position: absolute;
  z-index: 2147483647;
  display: block;
  pointer-events: auto !important;
  touch-action: none;
}

.${SETTINGS_LAYER_CLASS} > [data-dsh-settings-resize="n"],
.${SETTINGS_LAYER_CLASS} > [data-dsh-settings-resize="s"] {
  height: 8px;
  cursor: ns-resize;
}
.${SETTINGS_LAYER_CLASS} > [data-dsh-settings-resize="e"],
.${SETTINGS_LAYER_CLASS} > [data-dsh-settings-resize="w"] {
  width: 8px;
  cursor: ew-resize;
}
.${SETTINGS_LAYER_CLASS} > [data-dsh-settings-resize="ne"],
.${SETTINGS_LAYER_CLASS} > [data-dsh-settings-resize="nw"],
.${SETTINGS_LAYER_CLASS} > [data-dsh-settings-resize="se"],
.${SETTINGS_LAYER_CLASS} > [data-dsh-settings-resize="sw"] {
  width: 14px;
  height: 14px;
}
.${SETTINGS_LAYER_CLASS} > [data-dsh-settings-resize="ne"] { cursor: nesw-resize; }
.${SETTINGS_LAYER_CLASS} > [data-dsh-settings-resize="nw"] { cursor: nwse-resize; }
.${SETTINGS_LAYER_CLASS} > [data-dsh-settings-resize="se"] { cursor: nwse-resize; }
.${SETTINGS_LAYER_CLASS} > [data-dsh-settings-resize="sw"] { cursor: nesw-resize; }

@container (max-width: 620px) {
  .${SETTINGS_DIALOG_CLASS} > nav {
    flex-basis: 132px !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .${SETTINGS_DIALOG_CLASS} { transition: none !important; }
}
`

export function createSettingsWindowScript() {
  const config = JSON.stringify({
    dialogClass: SETTINGS_DIALOG_CLASS,
    layerClass: SETTINGS_LAYER_CLASS,
    margin: SETTINGS_WINDOW_MARGIN,
    minWidth: SETTINGS_WINDOW_MIN_WIDTH,
    minHeight: SETTINGS_WINDOW_MIN_HEIGHT,
  })
  return `(() => {
    const config = ${config};
    const api = window.dshDesktop;
    if (typeof api?.getSettingsWindowBounds !== 'function' || typeof api?.setSettingsWindowBounds !== 'function') return false;
    const controllerKey = '__dshDesktopSettingsWindowController';
    window[controllerKey]?.dispose?.();
    let active;
    let persistedBounds;
    let gesture;
    let frame;
    let pendingBounds;

    const normalize = (input = {}, layer) => {
      const layerRect = gesture?.layerRect || layer.getBoundingClientRect();
      const viewportWidth = Math.max(1, Math.round(layerRect.width || innerWidth));
      const viewportHeight = Math.max(1, Math.round(layerRect.height || innerHeight));
      const maximumWidth = Math.max(1, viewportWidth - config.margin * 2);
      const maximumHeight = Math.max(1, viewportHeight - config.margin * 2);
      const minimumWidth = Math.min(config.minWidth, maximumWidth);
      const minimumHeight = Math.min(config.minHeight, maximumHeight);
      const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
      const width = clamp(Number.isFinite(input.width) ? Math.round(input.width) : 800, minimumWidth, maximumWidth);
      const height = clamp(Number.isFinite(input.height) ? Math.round(input.height) : 680, minimumHeight, maximumHeight);
      const defaultX = Math.round((viewportWidth - width) / 2);
      const defaultY = Math.round((viewportHeight - height) / 2);
      const x = clamp(Number.isFinite(input.x) ? Math.round(input.x) : defaultX, config.margin, Math.max(config.margin, viewportWidth - config.margin - width));
      const y = clamp(Number.isFinite(input.y) ? Math.round(input.y) : defaultY, config.margin, Math.max(config.margin, viewportHeight - config.margin - height));
      return { x, y, width, height };
    };
    const positionResizeHandles = (bounds) => {
      if (!active?.handles) return;
      const edge = 8;
      const corner = 14;
      const inset = 10;
      const styles = {
        n: { left: bounds.x + inset, top: bounds.y - edge, width: Math.max(0, bounds.width - inset * 2), height: edge },
        ne: { left: bounds.x + bounds.width, top: bounds.y - corner, width: corner, height: corner },
        e: { left: bounds.x + bounds.width, top: bounds.y + inset, width: edge, height: Math.max(0, bounds.height - inset * 2) },
        se: { left: bounds.x + bounds.width, top: bounds.y + bounds.height, width: corner, height: corner },
        s: { left: bounds.x + inset, top: bounds.y + bounds.height, width: Math.max(0, bounds.width - inset * 2), height: edge },
        sw: { left: bounds.x - corner, top: bounds.y + bounds.height, width: corner, height: corner },
        w: { left: bounds.x - edge, top: bounds.y + inset, width: edge, height: Math.max(0, bounds.height - inset * 2) },
        nw: { left: bounds.x - corner, top: bounds.y - corner, width: corner, height: corner },
      };
      for (const [name, handle] of active.handles) {
        const next = styles[name];
        if (!next) continue;
        handle.style.left = next.left + 'px';
        handle.style.top = next.top + 'px';
        handle.style.width = next.width + 'px';
        handle.style.height = next.height + 'px';
      }
    };
    const applyBounds = (input) => {
      if (!active?.dialog?.isConnected) return;
      const bounds = normalize(input, active.layer);
      active.bounds = bounds;
      persistedBounds = bounds;
      active.dialog.style.setProperty('--dsh-settings-window-x', bounds.x + 'px');
      active.dialog.style.setProperty('--dsh-settings-window-y', bounds.y + 'px');
      active.dialog.style.setProperty('--dsh-settings-window-width', bounds.width + 'px');
      active.dialog.style.setProperty('--dsh-settings-window-height', bounds.height + 'px');
      positionResizeHandles(bounds);
    };
    const saveBounds = () => {
      if (!active?.bounds) return;
      void api.setSettingsWindowBounds(active.bounds).catch(() => {});
    };
    const flushGesture = () => {
      frame = undefined;
      if (!pendingBounds || !gesture || !active) return;
      const bounds = normalize(pendingBounds, active.layer);
      pendingBounds = undefined;
      if (gesture.edge === 'move') {
        active.bounds = bounds;
        active.dialog.style.transform = 'translate3d(' + (bounds.x - gesture.bounds.x) + 'px,' + (bounds.y - gesture.bounds.y) + 'px,0)';
      } else applyBounds(bounds);
    };
    const stopGesture = () => {
      if (!gesture) return;
      if (frame !== undefined) cancelAnimationFrame(frame);
      flushGesture();
      if (active) {
        active.dialog.style.transform = '';
        active.dialog.style.willChange = '';
        active.dialog.removeAttribute('data-dsh-settings-dragging');
        applyBounds(active.bounds);
      }
      gesture = undefined;
      window.dispatchEvent(new CustomEvent('dsh:window-motion', { detail: false }));
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', stopGesture, true);
      window.removeEventListener('pointercancel', stopGesture, true);
      window.removeEventListener('blur', stopGesture);
      saveBounds();
    };
    const onPointerMove = (event) => {
      if (!gesture || !active) return;
      if (event.buttons === 0) { stopGesture(); return; }
      const dx = event.clientX - gesture.clientX;
      const dy = event.clientY - gesture.clientY;
      const next = { ...gesture.bounds };
      if (gesture.edge === 'move') {
        next.x += dx;
        next.y += dy;
      } else {
        if (gesture.edge.includes('e')) next.width += dx;
        if (gesture.edge.includes('s')) next.height += dy;
        if (gesture.edge.includes('w')) { next.x += dx; next.width -= dx; }
        if (gesture.edge.includes('n')) { next.y += dy; next.height -= dy; }
      }
      pendingBounds = next;
      if (frame === undefined) frame = requestAnimationFrame(flushGesture);
      event.preventDefault();
    };
    const startGesture = (event, edge) => {
      if (event.button !== 0 || !active?.bounds) return;
      if (edge === 'move' && event.target.closest?.('button, input, select, textarea, a')) return;
      stopGesture();
      gesture = { edge, clientX: event.clientX, clientY: event.clientY, bounds: { ...active.bounds }, layerRect: active.layer.getBoundingClientRect() };
      active.dialog.setAttribute('data-dsh-settings-dragging', 'true');
      window.dispatchEvent(new CustomEvent('dsh:window-motion', { detail: true }));
      if (edge === 'move') active.dialog.style.willChange = 'transform';
      window.addEventListener('pointermove', onPointerMove, true);
      window.addEventListener('pointerup', stopGesture, true);
      window.addEventListener('pointercancel', stopGesture, true);
      window.addEventListener('blur', stopGesture);
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const detachActive = () => {
      if (!active) return;
      stopGesture();
      for (const handle of active.handles?.values?.() ?? []) handle.remove();
      active = undefined;
    };
    const attach = (dialog) => {
      if (dialog.classList.contains(config.dialogClass)) return;
      const settingsHeaderSlot = dialog.querySelector('[data-slot="settings.header"]');
      const dragHandle = settingsHeaderSlot?.parentElement;
      const layer = dialog.parentElement;
      if (!dragHandle || !layer) return;
      const box = dialog.getBoundingClientRect();
      const layerBox = layer.getBoundingClientRect();
      dialog.classList.add(config.dialogClass);
      layer.classList.add(config.layerClass);
      dragHandle.dataset.dshSettingsDragHandle = 'true';
      dragHandle.title = '拖动设置窗口 / Drag settings window';
      dragHandle.addEventListener('pointerdown', (event) => startGesture(event, 'move'));
      const handles = new Map();
      for (const edge of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
        const handle = document.createElement('span');
        handle.dataset.dshSettingsResize = edge;
        handle.setAttribute('aria-hidden', 'true');
        handle.addEventListener('pointerdown', (event) => startGesture(event, edge));
        layer.append(handle);
        handles.set(edge, handle);
      }
      active = { dialog, layer, handles, bounds: undefined };
      void api.settingsOpened?.().catch(() => {});
      applyBounds(persistedBounds ?? {
        x: box.x - layerBox.x,
        y: box.y - layerBox.y,
        width: box.width,
        height: box.height,
      });
    };
    const scan = () => {
      if (active && !active.dialog.isConnected) detachActive();
      document.querySelectorAll('[role="dialog"]').forEach(attach);
    };
    const observer = new MutationObserver(scan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const onResize = () => { stopGesture(); if (active?.bounds) applyBounds(active.bounds); };
    window.addEventListener('resize', onResize);
    void api.getSettingsWindowBounds().then((bounds) => {
      if (bounds) persistedBounds = bounds;
      if (active && persistedBounds) applyBounds(persistedBounds);
    }).catch(() => {});
    scan();
    window[controllerKey] = {
      dispose: () => {
        stopGesture();
        detachActive();
        observer.disconnect();
        window.removeEventListener('resize', onResize);
      },
    };
    return true;
  })()`
}

export async function applySettingsWindow({ webContents }) {
  if (!webContents || webContents.isDestroyed?.()) return false
  await webContents.insertCSS(SETTINGS_WINDOW_CSS, { cssOrigin: 'author' })
  return webContents.executeJavaScript(createSettingsWindowScript(), true)
}

export function installSettingsWindow({ browserWindow, onError = () => {} }) {
  const { webContents } = browserWindow
  const apply = () => {
    void applySettingsWindow({ webContents }).catch(onError)
  }
  webContents.on('did-finish-load', apply)
  return () => webContents.removeListener('did-finish-load', apply)
}
