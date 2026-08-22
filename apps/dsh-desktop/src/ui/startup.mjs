import {
  advanceStartupProgress,
  clampProgress,
  createStartupStatusGate,
  initialProgressForState,
  phaseIndexForProgress,
} from './startup-progress.mjs'
import { mountParticleWhale, OFFICIAL_WHALE_PATH } from './whale-particles.mjs'

const title = document.querySelector('#status-title')
const detail = document.querySelector('#status-detail')
const version = document.querySelector('#version')
const meter = document.querySelector('#startup-progress')
const progressValue = document.querySelector('#progress-value')
const meterTip = document.querySelector('.meter-tip')
meterTip.innerHTML = `<svg viewBox="0 0 50 50" focusable="false"><path d="${OFFICIAL_WHALE_PATH}"/></svg>`
const whaleCanvas = document.querySelector('#whale-canvas')

const STARTUP_STALL_NOTICE_MS = 30_000

const copy = {
  stopped: ['正在准备本地环境', '完整 Harness 正在本地启动'],
  starting: ['正在唤醒 Harness', '正在载入运行时、插件与技能'],
  ready: ['探索界面已经就绪', '正在进入 DeepSeek Harness'],
  stopping: ['正在安全停止服务', '请稍候，本地任务正在收束'],
  restarting: ['正在重新连接', '正在恢复本地运行时'],
  crashed: ['正在自动处理启动问题', '应用会自动重试并保留原有数据'],
}

const directCopy = Object.freeze({
  preparing: ['正在准备本地环境', '正在载入原有数据和全部插件'],
  'starting-full': ['正在启动全部插件', '原有数据会直接用于当前版本'],
  'retrying-full': ['正在自动恢复', '应用正在重新载入全部插件'],
  repairing: ['正在自动修复插件', '完成验证后会自动继续启动'],
  verifying: ['正在验证修复', '验证通过后会自动继续启动'],
  'ready-full': ['探索界面已经就绪', '正在进入 DeepSeek Harness'],
  'ready-builtins': ['正在载入内置插件', '原有数据保持不变'],
  'installation-repair-required': ['正在修复应用安装', '安装文件修复后会自动继续'],
})

let currentState = 'stopped'
let progress = 0
let latestStatus = { state: 'stopped' }
let startupStalled = false
let startupStallTimer

function renderProgress(value) {
  const previousRounded = Math.round(progress)
  progress = clampProgress(value)
  const rounded = Math.round(progress)
  meter.style.setProperty('--progress', `${progress.toFixed(2)}%`)
  meter.dataset.phase = String(phaseIndexForProgress(progress))
  meter.setAttribute('aria-valuenow', String(rounded))
  meter.setAttribute('aria-valuetext', `启动进度 ${rounded}%`)
  progressValue.value = `${String(rounded).padStart(2, '0')}%`
  progressValue.textContent = progressValue.value
  if (rounded !== previousRounded) {
    progressValue.classList.remove('is-ticking')
    void progressValue.offsetWidth
    progressValue.classList.add('is-ticking')
  }
}

function startingState(state) {
  return state === 'starting' || state === 'restarting'
}

function updateStartupStall(state, stateChanged) {
  if (!startingState(state)) {
    startupStalled = false
    if (startupStallTimer !== undefined) {
      window.clearTimeout(startupStallTimer)
      startupStallTimer = undefined
    }
    return
  }
  if (!stateChanged) return
  startupStalled = false
  if (startupStallTimer !== undefined) window.clearTimeout(startupStallTimer)
  startupStallTimer = window.setTimeout(() => {
    startupStallTimer = undefined
    if (!startingState(currentState)) return
    startupStalled = true
    render(latestStatus)
  }, STARTUP_STALL_NOTICE_MS)
}

function render(status) {
  const state = copy[status?.state] ? status.state : 'crashed'
  const [heading, message] = copy[state]
  const stateChanged = currentState !== state
  latestStatus = status ?? { state }
  currentState = state
  updateStartupStall(state, stateChanged)
  document.body.dataset.state = state
  title.textContent = heading
  const stalled = startupStalled && startingState(state)
  detail.textContent = status?.restartBlocked === 'repeated-crash'
    ? '已停止重复启动，应用正在准备下一步自动处理'
    : stalled
    ? '启动耗时较长，应用仍在自动处理；原有数据会继续保留'
    : message

  if (Number.isFinite(status?.previewProgress)) renderProgress(status.previewProgress)
  else if (stateChanged || progress === 0) renderProgress(initialProgressForState(state, progress))
}

mountParticleWhale(whaleCanvas)

window.setInterval(() => {
  if (currentState !== 'starting' && currentState !== 'restarting') return
  renderProgress(advanceStartupProgress(currentState, progress))
}, 220)

window.addEventListener('beforeunload', () => {
  if (startupStallTimer !== undefined) window.clearTimeout(startupStallTimer)
})

const previewState = new URLSearchParams(window.location.search).get('preview')
const directState = new URLSearchParams(window.location.search).get('directState')
if (directState && directCopy[directState]) {
  const [heading, message] = directCopy[directState]
  const directProgress = {
    preparing: 8,
    'starting-full': 24,
    'retrying-full': 39,
    repairing: 56,
    verifying: 78,
    'ready-builtins': 92,
    'ready-full': 100,
    'installation-repair-required': 18,
  }
  currentState = directState.startsWith('ready-') ? 'ready' : 'starting'
  document.body.dataset.state = currentState
  title.textContent = heading
  detail.textContent = message
  renderProgress(directProgress[directState] ?? 8)
} else if (previewState && copy[previewState]) {
  try {
    const info = await window.dshDesktop.getInfo()
    version.textContent = `DESKTOP ${info.version}`
  } catch {
    // Preview capture can still render when the desktop bridge is unavailable.
  }
  render({ state: previewState, previewProgress: previewState === 'starting' ? 46 : undefined })
} else {
  try {
    const statusGate = createStartupStatusGate(render)
    window.dshDesktop.onStatus(statusGate.live)
    const [info, initialStatus] = await Promise.all([
      window.dshDesktop.getInfo(),
      window.dshDesktop.getStatus(),
    ])
    version.textContent = `DESKTOP ${info.version}`
    statusGate.initial(initialStatus)
  } catch (error) {
    // The first splash is intentionally loaded before the complete Desktop
    // IPC surface is registered. Keep showing preparation until the normal
    // startup load replaces it; do not turn that short gap into an error UI.
    render({ state: 'stopped' })
  }
}
