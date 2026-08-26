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
const startupStepsContainer = document.querySelector('#startup-steps')
const startupSteps = [...document.querySelectorAll('[data-startup-step]')]
const startupGuidance = document.querySelector('#startup-guidance')

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
  'system-startup-failed': ['启动未能完成', '完整模式和内置模式都无法启动；请查看日志或导出诊断'],
})

const directReasonCopy = Object.freeze({
  'full-retry-failed': { heading: '已使用内置插件启动', message: '自动修复未完成，应用已使用内置插件启动；原有对话和设置仍在。', guidance: '可在设置页查看脱敏修复记录，确认模型配置后再尝试。' },
  'missing-credentials': { heading: '自动修复未启用', message: '未配置模型 Key，应用已使用内置插件启动。', guidance: '请在模型设置中填写 Key 并保存，然后点击“保存后重新尝试”。' },
  'no-model': { heading: '自动修复未启用', message: '未配置可用的修复模型，应用已使用内置插件启动。', guidance: '请在模型设置中选择修复模型并配置 Key。' },
  'unsupported-tools': { heading: '自动修复暂不可用', message: '当前模型不支持自动修复所需的工具，应用已使用内置插件启动。', guidance: '请改用支持工具调用的模型后再尝试。' },
  'repair-failed': { heading: '自动修复未完成', message: '自动修复未通过验证，应用已使用内置插件启动；原有对话和设置仍在。', guidance: '可在设置页查看脱敏修复记录，确认模型配置后再尝试。' },
  'budget-exhausted': { heading: '自动修复未完成', message: '自动修复达到安全尝试上限，应用已使用内置插件启动。', guidance: '可在设置页查看脱敏修复记录，稍后再尝试。' },
  'profile-permission': { heading: '正在修复应用安装', message: '应用数据目录权限阻止了完整启动，应用已使用内置插件启动。', guidance: '请检查应用数据目录权限后再尝试。' },
  'profile-installation': { heading: '正在修复应用安装', message: '应用安装文件阻止了完整启动，应用已使用内置插件启动。', guidance: '请修复或重新安装应用后再尝试。' },
  'profile-failed': { heading: '已使用内置插件启动', message: '应用数据目录未能完成启动，应用已使用内置插件启动；原有对话和设置仍在。', guidance: '可检查本地日志了解安装问题，再尝试启动。' },
  'rollback-failed': { heading: '插件修复已回滚', message: '自动修复启动失败后已恢复原插件文件，但部分文件未能完全复原；应用已使用内置插件启动。', guidance: '可在设置页导出脱敏诊断了解详情，必要时手动恢复插件目录。' },
})
function safeDirectReason(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(directReasonCopy, value)
    ? value
    : undefined
}
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

function hideDirectProcess() {
  if (startupStepsContainer) startupStepsContainer.hidden = true
  for (const step of startupSteps) {
    step.removeAttribute('aria-current')
    delete step.dataset.status
  }
  if (startupGuidance) {
    startupGuidance.hidden = true
    startupGuidance.textContent = ''
  }
  document.body.removeAttribute('data-direct-state')
}

function directCopyFor(state, reason) {
  const reasonCopy = directReasonCopy[reason]
  if (state === 'ready-builtins' && reasonCopy !== undefined) {
    return [reasonCopy.heading, reasonCopy.message]
  }
  return directCopy[state]
}

function renderDirectProcess(state, reason) {
  if (!startupStepsContainer) return
  startupStepsContainer.hidden = state === 'preparing' || state === 'system-startup-failed'
  const currentStep = {
    'starting-full': 0,
    'retrying-full': 1,
    repairing: 2,
    verifying: 3,
    'installation-repair-required': 0,
  }[state] ?? -1
  const completedThrough = {
    'retrying-full': 0,
    repairing: 1,
    verifying: 2,
    'ready-full': 3,
    'ready-builtins': 4,
  }[state] ?? -1
  const skipModelProcess = state === 'ready-builtins'
    && ['missing-credentials', 'no-model', 'unsupported-tools'].includes(reason)
  startupSteps.forEach((step, index) => {
    let status = index <= completedThrough ? 'done' : 'pending'
    if (index === currentStep) status = 'current'
    if (skipModelProcess && (index === 2 || index === 3)) status = 'skipped'
    if (state === 'ready-full' && index === 4) status = 'skipped'
    step.dataset.status = status
    if (status === 'current') step.setAttribute('aria-current', 'step')
    else step.removeAttribute('aria-current')
  })
  if (startupGuidance) {
    const reasonCopy = directReasonCopy[reason] ?? directReasonCopy['full-retry-failed']
    startupGuidance.hidden = state !== 'ready-builtins'
    startupGuidance.textContent = state === 'ready-builtins' ? reasonCopy.guidance : ''
  }
  document.body.dataset.directState = state
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
  hideDirectProcess()
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
const directReasonKey = new URLSearchParams(window.location.search).get('directReason')
const directReason = safeDirectReason(directReasonKey)
if (directState && directCopy[directState]) {
  const [heading, message] = directCopyFor(directState, directReason)
  const directProgress = {
    preparing: 8,
    'starting-full': 24,
    'retrying-full': 39,
    repairing: 56,
    verifying: 78,
    'ready-builtins': 92,
    'ready-full': 100,
    'installation-repair-required': 18,
    'system-startup-failed': 100,
  }
  currentState = directState.startsWith('ready-') || directState === 'system-startup-failed'
    ? 'ready'
    : 'starting'
  document.body.dataset.state = currentState
  title.textContent = heading
  detail.textContent = message
  renderProgress(directProgress[directState] ?? 8)
  renderDirectProcess(directState, directReason)
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
