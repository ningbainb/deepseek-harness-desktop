import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { deferModalReveal } from './modal-reveal.mjs'
import { AFDIAN_SPONSOR_URL } from './community-links.mjs'
import { renderQrDataUrl } from './optional-integrations.mjs'

let sponsorQr
export function renderSponsorQr() {
  return sponsorQr ??= renderQrDataUrl(AFDIAN_SPONSOR_URL, { width: 288, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#10131aff', light: '#ffffffff' } }).catch(error => { sponsorQr = undefined; throw error })
}

// Follow the shipped Desktop manifest so release bumps cannot leave this prompt stale.
export const STAR_PROMPT_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const STAR_PROMPT_SURFACE_ID = 'dsh-desktop-star-prompt'

function normalizeShownVersions(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((version) => typeof version === 'string').slice(-32))]
}

export class StarPromptStore {
  #operation = Promise.resolve()

  constructor({ path, targetVersion = STAR_PROMPT_VERSION } = {}) {
    if (!path) throw new TypeError('star prompt state path is required')
    this.path = path
    this.targetVersion = targetVersion
  }

  claim(currentVersion) {
    const operation = this.#operation.then(() => this.#claim(currentVersion))
    this.#operation = operation.catch(() => {})
    return operation
  }

  async #claim(currentVersion) {
    if (currentVersion !== this.targetVersion) return false
    let shownVersions = []
    try {
      const state = JSON.parse(await readFile(this.path, 'utf8'))
      shownVersions = normalizeShownVersions(state?.shownVersions)
    } catch (error) {
      if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
    }
    if (shownVersions.includes(currentVersion)) return false

    const nextState = {
      schemaVersion: 1,
      shownVersions: normalizeShownVersions([...shownVersions, currentVersion]),
    }
    await mkdir(dirname(this.path), { recursive: true })
    const temporaryPath = `${this.path}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, this.path)
    return true
  }
}

export const STAR_PROMPT_CSS = `
#${STAR_PROMPT_SURFACE_ID} {
  position: fixed;
  z-index: 2147483645;
  inset: var(--dsh-desktop-window-chrome-height, 32px) 0 0;
  display: grid;
  place-items: center;
  padding: 24px;
  --dsh-star-fg: #10131a;
  --dsh-star-muted: #626a78;
  --dsh-star-tertiary: #818896;
  --dsh-star-layer: #f5f7fb;
  --dsh-star-hover: #eef1f6;
  color: var(--dsw-alias-label-primary, var(--dsh-star-fg));
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  opacity: 0;
  pointer-events: none;
  transition: opacity 280ms ease;
}

#${STAR_PROMPT_SURFACE_ID}[hidden] { display: none; }

html[data-dsh-desktop-chrome-theme="dark"] #${STAR_PROMPT_SURFACE_ID} {
  --dsh-star-fg: #e6f0f5;
  --dsh-star-muted: #9fb3c0;
  --dsh-star-tertiary: #7e95a1;
  --dsh-star-layer: #13232e;
  --dsh-star-hover: #1a303d;
}

html[data-dsh-desktop-chrome-theme="dark"] #${STAR_PROMPT_SURFACE_ID} .dsh-star-panel {
  background:
    radial-gradient(circle at 50% -10%, rgba(92, 133, 255, 0.2), transparent 42%),
    var(--dsw-alias-bg-base, #0f1a22);
}
#${STAR_PROMPT_SURFACE_ID}[data-open="true"] { opacity: 1; pointer-events: auto; }

#${STAR_PROMPT_SURFACE_ID} .dsh-star-mask {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--dsw-alias-bg-mask-1, rgba(8, 13, 28, 0.48)) 86%, rgba(22, 40, 82, 0.28));
  -webkit-backdrop-filter: blur(7px) saturate(112%);
  backdrop-filter: blur(7px) saturate(112%);
  opacity: 0;
  transition: opacity 360ms ease;
}

#${STAR_PROMPT_SURFACE_ID}[data-open="true"] .dsh-star-mask { opacity: 1; }

#${STAR_PROMPT_SURFACE_ID} .dsh-star-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(432px, calc(100vw - 40px));
  max-height: min(620px, calc(100vh - 72px));
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l2, #dce1eb) 58%, transparent);
  border-radius: 20px;
  background:
    radial-gradient(circle at 50% -18%, rgba(92, 133, 255, 0.16), transparent 44%),
    var(--dsw-alias-bg-base, #ffffff);
  box-shadow: 0 24px 64px rgba(4, 10, 28, 0.24), 0 4px 16px rgba(22, 44, 98, 0.08);
  transform: translateY(14px) scale(0.975);
  opacity: 0;
  transition: transform 620ms cubic-bezier(0.22, 1, 0.36, 1), opacity 320ms ease;
}

#${STAR_PROMPT_SURFACE_ID} .dsh-star-panel::before {
  content: "";
  position: absolute;
  z-index: 2;
  top: 0;
  left: 20%;
  width: 60%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(180, 204, 255, 0.78), rgba(244, 199, 102, 0.62), transparent);
  opacity: 0;
  transform: scaleX(0.35);
  transition: opacity 500ms ease 180ms, transform 900ms cubic-bezier(0.22, 1, 0.36, 1) 120ms;
}

#${STAR_PROMPT_SURFACE_ID}[data-open="true"] .dsh-star-panel {
  transform: translateY(0) scale(1);
  opacity: 1;
}

#${STAR_PROMPT_SURFACE_ID}[data-open="true"] .dsh-star-panel::before { opacity: 1; transform: scaleX(1); }

#${STAR_PROMPT_SURFACE_ID} .dsh-star-close {
  position: absolute;
  z-index: 4;
  top: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  color: var(--dsw-alias-label-secondary, var(--dsh-star-muted));
  background: transparent;
  cursor: pointer;
  font: 400 18px/28px "Segoe UI", sans-serif;
  transition: transform 180ms ease, background 180ms ease;
}

#${STAR_PROMPT_SURFACE_ID} .dsh-star-close:hover { transform: rotate(8deg); background: var(--dsw-alias-interactive-bg-hover, var(--dsh-star-hover)); }

#${STAR_PROMPT_SURFACE_ID} .dsh-star-visual {
  position: relative;
  flex: none;
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  margin: 18px auto 6px;
  opacity: 0;
  transform: translateY(8px) scale(0.96);
  transition: opacity 420ms ease 120ms, transform 720ms cubic-bezier(0.22, 1, 0.36, 1) 90ms;
}

#${STAR_PROMPT_SURFACE_ID}[data-open="true"] .dsh-star-visual { opacity: 1; transform: translateY(0) scale(1); }

#${STAR_PROMPT_SURFACE_ID} .dsh-star-orbit,
#${STAR_PROMPT_SURFACE_ID} .dsh-star-ripple {
  position: absolute;
  inset: 2px;
  border: 1px solid rgba(91, 128, 232, 0.24);
  border-radius: 50%;
}

#${STAR_PROMPT_SURFACE_ID} .dsh-star-orbit::before,
#${STAR_PROMPT_SURFACE_ID} .dsh-star-orbit::after {
  content: "";
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 2px;
  background: #7b9cff;
  box-shadow: 0 0 12px rgba(78, 119, 245, 0.65);
  transform: rotate(45deg);
}

#${STAR_PROMPT_SURFACE_ID} .dsh-star-orbit::before { top: 4px; left: 7px; }
#${STAR_PROMPT_SURFACE_ID} .dsh-star-orbit::after { right: 4px; bottom: 9px; width: 4px; height: 4px; background: #d7a64b; }

#${STAR_PROMPT_SURFACE_ID}[data-open="true"] .dsh-star-orbit { animation: dsh-star-prompt-orbit 18s linear 700ms infinite; }

#${STAR_PROMPT_SURFACE_ID} .dsh-star-ripple {
  inset: 10px;
  border-color: rgba(219, 166, 67, 0.24);
  opacity: 0;
}

#${STAR_PROMPT_SURFACE_ID}[data-open="true"] .dsh-star-ripple { animation: dsh-star-prompt-ripple 1.6s cubic-bezier(0.22, 1, 0.36, 1) 360ms 1; }

#${STAR_PROMPT_SURFACE_ID} .dsh-star-core {
  position: relative;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 1px solid rgba(255, 226, 164, 0.72);
  border-radius: 14px;
  color: #fff4cc;
  background: linear-gradient(145deg, #243b78 0%, #17295c 58%, #101b3f 100%);
  box-shadow: 0 10px 24px rgba(21, 45, 105, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.18);
  animation: dsh-star-prompt-float 5.2s ease-in-out 900ms infinite;
}

#${STAR_PROMPT_SURFACE_ID} .dsh-star-core::after {
  content: "";
  position: absolute;
  inset: -5px;
  border: 1px solid rgba(99, 137, 238, 0.16);
  border-radius: 18px;
  transform: rotate(8deg);
}

#${STAR_PROMPT_SURFACE_ID} .dsh-star-core svg { width: 22px; height: 22px; filter: drop-shadow(0 2px 6px rgba(239, 190, 82, 0.42)); }

#${STAR_PROMPT_SURFACE_ID} .dsh-star-content { min-height: 0; overflow: auto; padding: 0 24px 12px; text-align: center; }

#${STAR_PROMPT_SURFACE_ID} .dsh-star-content > * {
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 420ms ease, transform 620ms cubic-bezier(0.22, 1, 0.36, 1);
}

#${STAR_PROMPT_SURFACE_ID}[data-open="true"] .dsh-star-content > * { opacity: 1; transform: translateY(0); }
#${STAR_PROMPT_SURFACE_ID}[data-open="true"] .dsh-star-kicker { transition-delay: 180ms; }
#${STAR_PROMPT_SURFACE_ID}[data-open="true"] .dsh-star-title { transition-delay: 230ms; }
#${STAR_PROMPT_SURFACE_ID}[data-open="true"] .dsh-star-copy { transition-delay: 280ms; }
#${STAR_PROMPT_SURFACE_ID}[data-open="true"] .dsh-star-note { transition-delay: 330ms; }
#${STAR_PROMPT_SURFACE_ID}[data-open="true"] .dsh-star-repo { transition-delay: 380ms; }
#${STAR_PROMPT_SURFACE_ID}[data-open="true"] .dsh-star-actions { transition-delay: 430ms; }

#${STAR_PROMPT_SURFACE_ID} .dsh-star-kicker {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  margin: 0 0 8px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary, #4d78e8) 22%, transparent);
  border-radius: 999px;
  color: var(--dsw-alias-state-business-primary, #4d78e8);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #4d78e8) 9%, transparent);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

#${STAR_PROMPT_SURFACE_ID} .dsh-star-title {
  margin: 0;
  color: var(--dsw-alias-label-primary, var(--dsh-star-fg));
  font-size: 19px;
  font-weight: 680;
  letter-spacing: -0.025em;
  line-height: 1.3;
}

#${STAR_PROMPT_SURFACE_ID} .dsh-star-copy {
  margin: 8px auto 0;
  max-width: 356px;
  color: var(--dsw-alias-label-secondary, var(--dsh-star-muted));
  font-size: 12.5px;
  line-height: 1.62;
}

#${STAR_PROMPT_SURFACE_ID} .dsh-star-note {
  margin: 10px auto 0;
  padding: 7px 10px;
  border: 0;
  border-left: 2px solid color-mix(in srgb, #e2a93b 70%, transparent);
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary, var(--dsh-star-muted));
  background: var(--dsw-alias-bg-layer-2, var(--dsh-star-layer));
  font-size: 11.5px;
  line-height: 1.5;
  text-align: left;
}

#${STAR_PROMPT_SURFACE_ID} .dsh-star-repo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 10px;
  color: var(--dsw-alias-label-tertiary, var(--dsh-star-tertiary));
  font: 11px/1.3 "Cascadia Mono", "SFMono-Regular", Consolas, monospace;
}

#${STAR_PROMPT_SURFACE_ID} .dsh-star-repo i { width: 5px; height: 5px; border-radius: 50%; background: #4e78ea; box-shadow: 0 0 0 3px rgba(78, 120, 234, 0.12); }

#${STAR_PROMPT_SURFACE_ID} .dsh-star-actions { flex: none; display: grid; gap: 7px; padding: 12px 24px 16px; border-top: 1px solid var(--dsw-alias-border-l1, var(--dsh-star-layer)); }

#${STAR_PROMPT_SURFACE_ID} .dsh-star-sponsor { display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 12px; align-items: center; margin-top: 12px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1, rgba(16, 19, 26, 0.08)); border-radius: 12px; background: var(--dsw-alias-bg-layer-2, var(--dsh-star-layer)); text-align: left; }
#${STAR_PROMPT_SURFACE_ID} .dsh-star-sponsor img { display: block; width: 74px; height: 74px; padding: 3px; border-radius: 8px; border: 1px solid rgba(16, 19, 26, 0.08); background: white; box-sizing: border-box; }
#${STAR_PROMPT_SURFACE_ID} .dsh-star-sponsor img[hidden] { display: none; }
#${STAR_PROMPT_SURFACE_ID} .dsh-star-sponsor-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
#${STAR_PROMPT_SURFACE_ID} .dsh-star-sponsor p { margin: 6px 0 0; color: var(--dsw-alias-label-secondary, var(--dsh-star-muted)); font-size: 11.5px; line-height: 1.5; }
#${STAR_PROMPT_SURFACE_ID} .dsh-star-sponsor-link { overflow-wrap: anywhere; color: var(--dsw-alias-label-tertiary, var(--dsh-star-tertiary)); font-size: 11.5px; text-decoration: none; }
#${STAR_PROMPT_SURFACE_ID} .dsh-star-sponsor-link:hover { text-decoration: underline; color: var(--dsw-alias-state-business-primary, #4d78e8); }
#${STAR_PROMPT_SURFACE_ID} .dsh-star-sponsor button { min-height: 28px; padding: 0 10px; border-radius: 8px; font-size: 12px; }
#${STAR_PROMPT_SURFACE_ID} .dsh-star-sponsor-link:focus-visible { outline: 2px solid #5c83eb; outline-offset: 3px; }

#${STAR_PROMPT_SURFACE_ID} .dsh-star-action-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

#${STAR_PROMPT_SURFACE_ID} .dsh-star-primary,
#${STAR_PROMPT_SURFACE_ID} .dsh-star-community,
#${STAR_PROMPT_SURFACE_ID} .dsh-star-secondary {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  border-radius: 10px;
  cursor: pointer;
  font: 600 12.5px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
}

#${STAR_PROMPT_SURFACE_ID} .dsh-star-primary {
  overflow: visible;
  border: 0;
  border-radius: 999px;
  color: #ffffff;
  font-size: 13px;
  background: var(--dsw-alias-button-info-fill, #4d78e8);
  box-shadow: 0 8px 20px rgba(77, 120, 232, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.16);
  transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
}

#${STAR_PROMPT_SURFACE_ID} .dsh-star-primary::before {
  content: "";
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  background: linear-gradient(105deg, transparent 28%, rgba(255, 255, 255, 0.22) 46%, transparent 64%);
  transform: translateX(-120%);
  transition: transform 520ms ease;
}

#${STAR_PROMPT_SURFACE_ID} .dsh-star-primary:hover { transform: translateY(-1px); background: var(--dsw-alias-button-info-hover, #3d64d8); box-shadow: 0 12px 24px rgba(77, 120, 232, 0.28); }
#${STAR_PROMPT_SURFACE_ID} .dsh-star-primary:hover::before { transform: translateX(120%); }
#${STAR_PROMPT_SURFACE_ID} .dsh-star-primary:disabled { opacity: 1; cursor: progress; }
#${STAR_PROMPT_SURFACE_ID} .dsh-star-primary svg { z-index: 1; width: 15px; height: 15px; }
#${STAR_PROMPT_SURFACE_ID} .dsh-star-primary span { z-index: 1; }

#${STAR_PROMPT_SURFACE_ID} .dsh-star-community {
  min-height: 34px;
  border: 1px solid var(--dsw-alias-border-l2, #dfe4ee);
  color: var(--dsw-alias-label-primary, var(--dsh-star-fg));
  background: var(--dsw-alias-bg-layer-2, var(--dsh-star-layer));
  transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
}

#${STAR_PROMPT_SURFACE_ID} .dsh-star-community:hover {
  border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary, #4d78e8) 45%, transparent);
  background: var(--dsw-alias-interactive-bg-hover, var(--dsh-star-hover));
}

#${STAR_PROMPT_SURFACE_ID} .dsh-star-community svg { width: 15px; height: 15px; color: var(--dsw-alias-state-business-primary, #4d78e8); }

#${STAR_PROMPT_SURFACE_ID} .dsh-star-secondary {
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  color: var(--dsw-alias-label-secondary, var(--dsh-star-muted));
  background: transparent;
}

#${STAR_PROMPT_SURFACE_ID} .dsh-star-secondary:hover { color: var(--dsw-alias-label-primary, var(--dsh-star-fg)); background: var(--dsw-alias-interactive-bg-hover, var(--dsh-star-hover)); }

#${STAR_PROMPT_SURFACE_ID} button:focus-visible { outline: 2px solid #5c83eb; outline-offset: 3px; }

#${STAR_PROMPT_SURFACE_ID} .dsh-star-particle {
  position: absolute;
  z-index: 8;
  left: var(--particle-origin-x);
  top: var(--particle-origin-y);
  width: var(--particle-w, 6px);
  height: var(--particle-h, 9px);
  border-radius: var(--particle-radius, 2px);
  background: var(--particle-color, #f1c45f);
  pointer-events: none;
  opacity: 0;
  animation: dsh-star-prompt-burst var(--particle-duration, 1240ms) cubic-bezier(0.16, 0.6, 0.34, 1) var(--particle-delay, 0ms) forwards;
}

@keyframes dsh-star-prompt-ripple { 0% { opacity: 0; transform: scale(0.72); } 35% { opacity: 0.7; } 100% { opacity: 0; transform: scale(1.45); } }
@keyframes dsh-star-prompt-orbit { to { transform: rotate(360deg); } }
@keyframes dsh-star-prompt-float { 0%, 100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-5px) rotate(1deg); } }
@keyframes dsh-star-prompt-burst {
  0% { opacity: 0; transform: translate(-50%, -50%) rotate(0deg) scale(0.4); }
  6% { opacity: 1; }
  38% { opacity: 1; transform: translate(calc(-50% + var(--particle-x)), calc(-50% + var(--particle-y))) rotate(var(--particle-spin, 220deg)) scale(1); }
  72% { opacity: 1; }
  100% { opacity: 0; transform: translate(calc(-50% + var(--particle-x) * 1.3), calc(-50% + var(--particle-y) + var(--particle-fall, 170px))) rotate(calc(var(--particle-spin, 220deg) * 2.1)) scale(0.9); }
}

@media (prefers-reduced-motion: reduce) {
  #${STAR_PROMPT_SURFACE_ID},
  #${STAR_PROMPT_SURFACE_ID} .dsh-star-mask,
  #${STAR_PROMPT_SURFACE_ID} .dsh-star-panel,
  #${STAR_PROMPT_SURFACE_ID} .dsh-star-panel::before,
  #${STAR_PROMPT_SURFACE_ID} .dsh-star-visual,
  #${STAR_PROMPT_SURFACE_ID} .dsh-star-content > *,
  #${STAR_PROMPT_SURFACE_ID} .dsh-star-primary,
  #${STAR_PROMPT_SURFACE_ID} .dsh-star-primary::before,
  #${STAR_PROMPT_SURFACE_ID} .dsh-star-community { transition: none !important; }
  #${STAR_PROMPT_SURFACE_ID} .dsh-star-ripple,
  #${STAR_PROMPT_SURFACE_ID} .dsh-star-orbit,
  #${STAR_PROMPT_SURFACE_ID} .dsh-star-core,
  #${STAR_PROMPT_SURFACE_ID} .dsh-star-particle { animation: none !important; }
}

@media (max-width: 480px) {
  #${STAR_PROMPT_SURFACE_ID} { padding: 14px; }
  #${STAR_PROMPT_SURFACE_ID} .dsh-star-panel { width: calc(100vw - 28px); }
  #${STAR_PROMPT_SURFACE_ID} .dsh-star-content { padding-inline: 24px; }
  #${STAR_PROMPT_SURFACE_ID} .dsh-star-action-row { grid-template-columns: 1fr; }
}
@media (max-width: 360px) {
  #${STAR_PROMPT_SURFACE_ID} .dsh-star-sponsor { grid-template-columns: 1fr; }
  #${STAR_PROMPT_SURFACE_ID} .dsh-star-sponsor img { margin-inline: auto; }
}
`

export function createStarPromptSurfaceScript({ forceVisible = false, showDelayMs = 1_100, sponsorQrDataUrl = '' } = {}) {
  const options = JSON.stringify({ forceVisible, showDelayMs, sponsorUrl: AFDIAN_SPONSOR_URL, sponsorQrDataUrl: /^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(sponsorQrDataUrl) ? sponsorQrDataUrl : '' })
  return `(() => {
    const id = '${STAR_PROMPT_SURFACE_ID}';
    document.getElementById(id)?.remove();
    const api = window.dshDesktop;
    const options = ${options};
    const english = document.documentElement.lang.toLowerCase().startsWith('en');
    const isHarnessPage = location.protocol === 'dsh-runtime:' || location.protocol === 'http:' || location.protocol === 'https:';
    if (!options.forceVisible && (!isHarnessPage || typeof api?.claimStarPrompt !== 'function')) return false;

    const root = document.createElement('div');
    root.id = id;
    root.hidden = true;
    const mask = document.createElement('div');
    mask.className = 'dsh-star-mask';
    const panel = document.createElement('section');
    panel.className = 'dsh-star-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'dsh-star-title');
    panel.setAttribute('aria-describedby', 'dsh-star-copy');

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'dsh-star-close';
    close.setAttribute('aria-label', english ? 'Close community support' : '关闭 Star 与赞助提示');
    close.textContent = '×';

    const visual = document.createElement('div');
    visual.className = 'dsh-star-visual';
    const orbit = document.createElement('div');
    orbit.className = 'dsh-star-orbit';
    const ripple = document.createElement('div');
    ripple.className = 'dsh-star-ripple';
    const core = document.createElement('div');
    core.className = 'dsh-star-core';
    core.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2.35l2.85 5.78 6.38.93-4.62 4.5 1.09 6.36L12 16.92l-5.7 3 1.09-6.36-4.62-4.5 6.38-.93L12 2.35z"/></svg>';
    visual.append(orbit, ripple, core);

    const content = document.createElement('div');
    content.className = 'dsh-star-content';
    const kicker = document.createElement('p');
    kicker.className = 'dsh-star-kicker';
    kicker.textContent = '${STAR_PROMPT_VERSION} · 社区支持';
    const title = document.createElement('h2');
    title.id = 'dsh-star-title';
    title.className = 'dsh-star-title';
    title.textContent = english ? 'Help this little project go further' : '愿这个小项目，陪你走得更远';
    const copy = document.createElement('p');
    copy.id = 'dsh-star-copy';
    copy.className = 'dsh-star-copy';
    copy.textContent = english ? 'If this app has saved you a little time, or helped turn an idea into something real, that is why I keep building it. A Star, thoughtful feedback, or a small contribution tells me: someone on the other side of the screen cares about this work too.' : '如果它曾替你省下一点时间，陪你把一个想法变成现实，这些看似微小的瞬间，就是我继续打磨它的意义。一个 Star、一条认真反馈，或一份力所能及的赞助，都会让我知道：屏幕的另一端，有人也珍惜这份努力。';
    const note = document.createElement('p');
    note.className = 'dsh-star-note';
    note.textContent = '如果你以前点过 Star，也欢迎重新确认一次：仓库恢复公开后，原有 Star 未能保留。感谢你再次支持。';
    const repo = document.createElement('div');
    repo.className = 'dsh-star-repo';
    const repoDot = document.createElement('i');
    repoDot.setAttribute('aria-hidden', 'true');
    const repoName = document.createElement('span');
    repoName.textContent = 'ningbainb / deepseek-harness-desktop';
    repo.append(repoDot, repoName);

    const sponsor = document.createElement('section');
    sponsor.className = 'dsh-star-sponsor';
    sponsor.setAttribute('aria-label', english ? 'Support on Afdian' : '爱发电赞助');
    const qr = document.createElement('img');
    qr.alt = english ? 'Scan to open Ningbai on Afdian' : '扫码打开凝白的爱发电主页';
    qr.width = 74; qr.height = 74;
    if (options.sponsorQrDataUrl) qr.src = options.sponsorQrDataUrl;
    else qr.hidden = true;
    const sponsorDetails = document.createElement('div');
    const sponsorHead = document.createElement('div');
    sponsorHead.className = 'dsh-star-sponsor-head';
    const sponsorButton = document.createElement('button');
    sponsorButton.type = 'button';
    sponsorButton.className = 'dsh-star-community';
    sponsorButton.textContent = english ? 'Support on Afdian' : '在爱发电支持我';
    const sponsorNote = document.createElement('p');
    sponsorNote.textContent = english ? 'Scan or open my page to contribute, only if it feels right. Using and sharing the app already means a lot.' : '扫码或打开主页，自愿、量力而行。不赞助也没关系，你愿意使用、分享和反馈，已经很珍贵。';
    const sponsorLink = document.createElement('a');
    sponsorLink.className = 'dsh-star-sponsor-link';
    sponsorLink.href = options.sponsorUrl;
    sponsorLink.textContent = options.sponsorUrl.replace('https://', '').replace('http://', '');
    sponsorLink.rel = 'noreferrer';
    sponsorHead.append(sponsorButton, sponsorLink);
    sponsorDetails.append(sponsorHead, sponsorNote);
    sponsor.append(qr, sponsorDetails);

    const actions = document.createElement('div');
    actions.className = 'dsh-star-actions';
    const primary = document.createElement('button');
    primary.type = 'button';
    primary.className = 'dsh-star-primary';
    primary.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2.35l2.85 5.78 6.38.93-4.62 4.5 1.09 6.36L12 16.92l-5.7 3 1.09-6.36-4.62-4.5 6.38-.93L12 2.35z"/></svg><span>去 GitHub 点个 Star</span>';
    const actionRow = document.createElement('div');
    actionRow.className = 'dsh-star-action-row';
    const community = document.createElement('button');
    community.type = 'button';
    community.className = 'dsh-star-community';
    community.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 19c0-2.2-1.8-4-4-4H7c-2.2 0-4 1.8-4 4"/><circle cx="9.5" cy="8" r="3"/><path d="M16 7.5a2.5 2.5 0 0 1 0 5M18 15c1.7.5 3 2.1 3 4"/></svg><span>加入社群，随时反馈 Bug</span>';
    const secondary = document.createElement('button');
    secondary.type = 'button';
    secondary.className = 'dsh-star-secondary';
    secondary.textContent = '先继续使用';
    actionRow.append(community, secondary);
    actions.append(primary, actionRow);
    content.append(kicker, title, copy, sponsor, note, repo);
    panel.append(close, visual, content, actions);
    root.append(mask, panel);
    document.body.append(root);

    let previousFocus;
    const hide = () => {
      root.dataset.open = 'false';
      setTimeout(() => {
        root.hidden = true;
        if (previousFocus instanceof HTMLElement) previousFocus.focus();
      }, 360);
    };
    const show = () => {
      previousFocus = document.activeElement;
      root.hidden = false;
      requestAnimationFrame(() => {
        root.dataset.open = 'true';
        primary.focus({ focusVisible: false });
        setTimeout(panelCannons, 480);
      });
    };
    const confettiColors = ['#f4c15d', '#7fa2ff', '#f492b6', '#7fd8c9', '#b79bff', '#ffe9a8'];
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    const fireConfettiCannon = (originX, originY, { count = 24, direction = 0, spread = 120, lift = 150 } = {}) => {
      if (reducedMotion) return;
      for (let index = 0; index < count; index += 1) {
        const duration = 1050 + Math.random() * 450;
        const delay = Math.random() * 120;
        const drift = direction === 0
          ? (Math.random() - 0.5) * spread
          : direction * (34 + Math.random() * spread * 0.62);
        const particle = document.createElement('i');
        particle.className = 'dsh-star-particle';
        particle.style.setProperty('--particle-origin-x', originX + 'px');
        particle.style.setProperty('--particle-origin-y', originY + 'px');
        particle.style.setProperty('--particle-x', drift.toFixed(1) + 'px');
        particle.style.setProperty('--particle-y', (-(lift + Math.random() * 95)).toFixed(1) + 'px');
        particle.style.setProperty('--particle-fall', (150 + Math.random() * 140).toFixed(0) + 'px');
        particle.style.setProperty('--particle-spin', (160 + Math.random() * 340).toFixed(0) + 'deg');
        particle.style.setProperty('--particle-duration', duration.toFixed(0) + 'ms');
        particle.style.setProperty('--particle-delay', delay.toFixed(0) + 'ms');
        particle.style.setProperty('--particle-color', confettiColors[index % confettiColors.length]);
        if (index % 3 === 2) {
          particle.style.setProperty('--particle-w', '5px');
          particle.style.setProperty('--particle-h', '5px');
          particle.style.setProperty('--particle-radius', '50%');
        }
        root.append(particle);
        setTimeout(() => particle.remove(), duration + delay + 120);
      }
    };
    const panelCannons = () => {
      const rootBounds = root.getBoundingClientRect();
      const panelBounds = panel.getBoundingClientRect();
      const baseY = panelBounds.bottom - rootBounds.top - 30;
      fireConfettiCannon(panelBounds.left - rootBounds.left + 40, baseY, { direction: 1, count: 22 });
      setTimeout(() => {
        if (root.hidden) return;
        fireConfettiCannon(panelBounds.right - rootBounds.left - 40, baseY, { direction: -1, count: 22 });
      }, 150);
    };
    const celebrate = () => {
      const rootBounds = root.getBoundingClientRect();
      const buttonBounds = primary.getBoundingClientRect();
      fireConfettiCannon(
        buttonBounds.left - rootBounds.left + buttonBounds.width / 2,
        buttonBounds.top - rootBounds.top + buttonBounds.height / 2,
        { count: 30, spread: 190, lift: 170 },
      );
      panelCannons();
    };

    close.addEventListener('click', hide);
    mask.addEventListener('click', hide);
    secondary.addEventListener('click', hide);
    const openSponsor = (event) => {
      event.preventDefault();
      if (!options.forceVisible) void api?.helpAction?.('sponsor').catch(() => {});
    };
    sponsorButton.addEventListener('click', openSponsor);
    sponsorLink.addEventListener('click', openSponsor);
    community.addEventListener('click', () => {
      if (!options.forceVisible) void api?.helpAction?.('community').catch(() => {});
      hide();
    });
    primary.addEventListener('click', () => {
      if (primary.disabled) return;
      primary.disabled = true;
      celebrate();
      setTimeout(() => {
        if (!options.forceVisible) void api?.helpAction?.('project').catch(() => {});
        hide();
      }, 700);
    });
    document.addEventListener('keydown', (event) => {
      if (root.hidden) return;
      if (event.key === 'Escape') hide();
      if (event.key === 'Tab') {
        const focusable = [close, sponsorButton, sponsorLink, primary, community, secondary];
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
    else (${deferModalReveal.toString()})({ root, document, window, delayMs,
      claim: () => api.claimStarPrompt(), reveal: show, onError: () => root.remove() });
    return true;
  })()`
}

export async function applyStarPromptSurface({ webContents, forceVisible = false, showDelayMs } = {}) {
  if (!webContents || webContents.isDestroyed?.()) return false
  await webContents.insertCSS(STAR_PROMPT_CSS, { cssOrigin: 'author' })
  const sponsorQrDataUrl = await renderSponsorQr().catch(() => '')
  if (webContents.isDestroyed?.()) return false
  return webContents.executeJavaScript(createStarPromptSurfaceScript({ forceVisible, showDelayMs, sponsorQrDataUrl }), true)
}

export function installStarPromptSurface({ browserWindow, forceVisible = false, onError = () => {} }) {
  const { webContents } = browserWindow
  const apply = () => {
    void applyStarPromptSurface({ webContents, forceVisible }).catch(onError)
  }
  webContents.on('did-finish-load', apply)
  return () => webContents.removeListener('did-finish-load', apply)
}
