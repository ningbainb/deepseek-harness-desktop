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
const errorLog = document.querySelector('#error-log')
const actions = document.querySelector('#actions')
const version = document.querySelector('#version')
const meter = document.querySelector('#startup-progress')
const progressValue = document.querySelector('#progress-value')
const meterTip = document.querySelector('.meter-tip')
meterTip.innerHTML = `<svg viewBox="0 0 50 50" focusable="false"><path d="${OFFICIAL_WHALE_PATH}"/></svg>`
const whaleCanvas = document.querySelector('#whale-canvas')
const recoverySummary = document.querySelector('#recovery-summary')
const recoveryTitle = document.querySelector('#recovery-title')
const recoveryReason = document.querySelector('#recovery-reason')
const disablePlugin = document.querySelector('#disable-plugin')
const safeMode = document.querySelector('#safe-mode')
const retry = document.querySelector('#retry')
const repair = document.querySelector('#repair')
const technicalDetails = document.querySelector('#technical-details')
const diagnosticExportStatus = document.querySelector('#diagnostic-export-status')

const STARTUP_STALL_NOTICE_MS = 30_000

const copy = {
  stopped: ['正在准备本地环境', '完整 Harness 正在本地启动'],
  starting: ['正在唤醒 Harness', '正在载入运行时、插件与技能'],
  ready: ['探索界面已经就绪', '正在进入 DeepSeek Harness'],
  stopping: ['正在安全停止服务', '请稍候，本地任务正在收束'],
  restarting: ['正在重新连接', '正在恢复本地运行时'],
  crashed: ['本地运行时启动失败', '请先重试；修复只会重建桌面版 Profile'],
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

function setDiagnosticExportStatus(message, failed = false) {
  diagnosticExportStatus.hidden = false
  diagnosticExportStatus.textContent = message
  diagnosticExportStatus.dataset.state = failed ? 'error' : 'success'
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
  const recovery = status?.recovery
  const incident = recovery?.currentIncident
  const stalled = startupStalled && startingState(state)
  detail.textContent = recovery?.safeMode
    ? recovery?.baselineQuarantineAvailable
      ? '桌面版正在使用基线恢复模式，无法识别的用户加载配置已被暂时隔离'
      : '桌面版正在使用只加载内置插件的安全模式'
    : status?.restartBlocked === 'repeated-crash'
    ? '已停止自动重启，避免反复崩溃；请打开日志查看底层错误'
    : stalled
    ? '启动耗时较长；可导出诊断日志，或进入安全模式（临时停用用户插件，保留聊天和模型设置）'
    : message

  const failed = state === 'crashed'
  const identifiedPlugin = failed && incident?.identified && incident?.pluginName
  recoverySummary.hidden = !failed && !stalled
  if (failed && incident) {
    recoveryTitle.textContent = identifiedPlugin
      ? `检测到插件 ${incident.pluginName} 导致启动失败`
      : '插件恢复中心已接管本次启动失败'
    recoveryReason.textContent = incident.summary || '未能可靠定位故障插件，请进入安全模式。'
  } else if (stalled) {
    recoveryTitle.textContent = '启动耗时较长'
    recoveryReason.textContent = '可先导出诊断日志；进入安全模式会临时停用用户安装的插件，保留聊天和模型设置；可随后在扩展中心逐一恢复。'
  }
  errorLog.hidden = true
  actions.hidden = !failed && !stalled
  errorLog.textContent = failed
    ? (incident?.technicalDetails || status?.error || 'Unknown runtime error')
    : ''
  disablePlugin.hidden = !identifiedPlugin
  safeMode.hidden = !failed && !stalled
  retry.hidden = !failed || Boolean(incident)
  repair.hidden = !failed || Boolean(incident)
  technicalDetails.hidden = !failed
  technicalDetails.textContent = '查看技术详情'

  if (Number.isFinite(status?.previewProgress)) renderProgress(status.previewProgress)
  else if (stateChanged || progress === 0) renderProgress(initialProgressForState(state, progress))
}

mountParticleWhale(whaleCanvas)

window.setInterval(() => {
  if (currentState !== 'starting' && currentState !== 'restarting') return
  renderProgress(advanceStartupProgress(currentState, progress))
}, 220)

for (const button of document.querySelectorAll('[data-action]')) {
  button.addEventListener('click', async () => {
    const buttons = [...document.querySelectorAll('[data-action]')]
    const action = button.dataset.action
    if (action === 'export-diagnostics') {
      setDiagnosticExportStatus('正在生成已脱敏的诊断日志…')
    }
    buttons.forEach((item) => { item.disabled = true })
    try {
      const result = await window.dshDesktop.action(action)
      if (action === 'export-diagnostics') {
        setDiagnosticExportStatus(result?.canceled
          ? '已取消导出。'
          : '诊断日志已导出，可附在问题反馈中。')
      }
    } catch (error) {
      if (action === 'export-diagnostics') {
        setDiagnosticExportStatus('导出失败。请重新选择一个可写入的位置后再试。', true)
      } else {
        render({ state: 'crashed', error: error.message })
      }
    } finally {
      buttons.forEach((item) => { item.disabled = false })
    }
  })
}

for (const button of document.querySelectorAll('[data-tool-action="terminal"]')) {
  button.addEventListener('click', async () => {
    button.disabled = true
    try {
      await window.dshDesktop.toolAction('terminal')
    } finally {
      button.disabled = false
    }
  })
}

technicalDetails.addEventListener('click', () => {
  errorLog.hidden = !errorLog.hidden
  technicalDetails.textContent = errorLog.hidden ? '查看技术详情' : '收起技术详情'
})

window.addEventListener('beforeunload', () => {
  if (startupStallTimer !== undefined) window.clearTimeout(startupStallTimer)
})

const previewState = new URLSearchParams(window.location.search).get('preview')
if (previewState && copy[previewState]) {
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
    render({
      state: 'crashed',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
