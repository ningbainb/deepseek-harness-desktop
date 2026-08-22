const bridge = window.dshPreflightRecovery
const title = document.querySelector('#recovery-summary-title')
const summary = document.querySelector('#recovery-summary')
const incident = document.querySelector('#recovery-incident')
const status = document.querySelector('#action-status')
const retryButton = document.querySelector('[data-action="retry"]')
const installManagedGitButton = document.querySelector('[data-action="install-managed-git"]')
const enterFreeModeButton = document.querySelector('[data-action="enter-free-mode"]')
const revokeExternalPluginTrustButton = document.querySelector('[data-action="revoke-external-plugin-trust"]')
const cloneExistingProfileButton = document.querySelector('[data-action="clone-existing-profile"]')
const chooseExternalPluginButton = document.querySelector('[data-action="choose-external-plugin"]')
const externalPluginSource = document.querySelector('#external-plugin-source')
const externalPluginSourceInput = document.querySelector('#external-plugin-source-input')
const continueMigrationButton = document.querySelector('[data-action="continue-migration"]')
const rollbackMigrationButton = document.querySelector('[data-action="rollback-migration"]')

const COPY = Object.freeze({
  retry: Object.freeze({
    pending: '正在重新尝试启动。',
    accepted: '已开始重新尝试启动。',
    unavailable: '暂时无法重新尝试启动。你仍可打开日志后再试。',
  }),
  'install-managed-git': Object.freeze({
    pending: '正在等待确认并校验 Desktop 管理的 Git。',
    accepted: '已开始安装并准备重新启动本地运行时。',
    unavailable: '暂时无法安装 Desktop 管理的 Git。你仍可保留在修复界面中。',
  }),
  'enter-free-mode': Object.freeze({
    pending: '正在准备隔离恢复会话。',
    accepted: '已开始进入隔离恢复会话。Desktop 不会主动改写原配置；获准代码仍按当前用户文件权限运行。',
    unavailable: '暂时无法进入隔离恢复会话。你仍可保留在修复界面中。',
  }),
  'revoke-external-plugin-trust': Object.freeze({
    pending: '正在撤销主 Runtime 和外来插件的完整权限授权。',
    accepted: '已撤销主 Runtime 和外来插件的完整权限授权；下次启动或安装时会再次请求确认。',
    unavailable: '暂时无法撤销长期信任。你仍可保留在修复界面中。',
  }),
  'clone-existing-profile': Object.freeze({
    pending: '正在复制当前 Desktop 配置和用户插件到隔离会话。',
    accepted: '已开始使用隔离副本进入完整权限恢复会话。Desktop 的复制操作不改写原配置；获准代码仍按当前用户文件权限运行。',
    unavailable: '暂时无法复制当前配置。你仍可使用干净隔离恢复会话或选择单个本地插件。',
  }),
  'choose-external-plugin': Object.freeze({
    pending: '正在打开本地插件选择窗口。',
    accepted: '已开始使用所选插件进入完整权限隔离恢复会话。',
    unavailable: '暂时无法选择或启动本地插件。你仍可保留在修复界面中。',
  }),
  'load-external-plugin-source': Object.freeze({
    pending: '正在等待确认并准备隔离的全权限插件会话。',
    accepted: '已开始使用该来源进入完整权限隔离恢复会话。',
    unavailable: '暂时无法加载该来源。请检查来源后重试，或选择本地插件。',
  }),
  'continue-migration': Object.freeze({
    pending: '正在继续记录的迁移步骤。',
    accepted: '已开始继续迁移。',
    unavailable: '暂时无法继续迁移。恢复信息仍会保留。',
  }),
  'rollback-migration': Object.freeze({
    pending: '正在从私有快照回滚迁移。',
    accepted: '已开始回滚迁移。',
    unavailable: '暂时无法回滚迁移。恢复信息仍会保留。',
  }),
  'open-logs': Object.freeze({
    pending: '正在打开本地日志文件夹。',
    accepted: '已请求打开本地日志文件夹。',
    unavailable: '暂时无法打开日志文件夹。请稍后再试。',
  }),
  exit: Object.freeze({
    pending: '正在退出 Desktop。',
    accepted: '正在退出 Desktop。',
    unavailable: '暂时无法退出 Desktop。请使用窗口关闭按钮。',
  }),
})

function showActionStatus(message) {
  status.hidden = false
  status.textContent = message
}

function render(state) {
  const usableState = state && typeof state === 'object' ? state : undefined
  title.textContent = usableState?.runtimeAvailable
    ? '本地修复界面已就绪'
    : '完整运行时暂时不可用'
  summary.textContent = typeof usableState?.summary === 'string'
    ? usableState.summary
    : 'Desktop 保留在本地修复界面中，原始资料不会被自动改写。'
  const fingerprint = typeof usableState?.fingerprint === 'string' ? usableState.fingerprint : undefined
  incident.hidden = fingerprint === undefined
  incident.textContent = fingerprint === undefined ? '' : `事件编号：${fingerprint}`
  retryButton.hidden = usableState?.actions?.includes('retry-runtime') === false
  installManagedGitButton.hidden = usableState?.actions?.includes('install-managed-git') !== true
  enterFreeModeButton.hidden = usableState?.actions?.includes('enter-free-mode') !== true
  revokeExternalPluginTrustButton.hidden = usableState?.actions?.includes('revoke-external-plugin-trust') !== true
  cloneExistingProfileButton.hidden = usableState?.actions?.includes('clone-existing-profile') !== true
  chooseExternalPluginButton.hidden = usableState?.actions?.includes('choose-external-plugin') !== true
  const sourceAvailable = usableState?.actions?.includes('load-external-plugin-source') === true
  externalPluginSource.hidden = !sourceAvailable
  if (!sourceAvailable) externalPluginSourceInput.value = ''
  continueMigrationButton.hidden = usableState?.actions?.includes('continue-migration') !== true
  rollbackMigrationButton.hidden = usableState?.actions?.includes('rollback-migration') !== true
}

let refreshPending = false

async function refreshState() {
  if (refreshPending) return
  refreshPending = true
  if (!bridge?.getState) {
    render(undefined)
    refreshPending = false
    return
  }
  try {
    render(await bridge.getState())
  } catch {
    render(undefined)
  } finally {
    refreshPending = false
  }
}

for (const button of document.querySelectorAll('[data-action]')) {
  button.addEventListener('click', async () => {
    const action = button.dataset.action
    const copy = COPY[action]
    const method = action === 'open-logs'
      ? 'openLogs'
      : action === 'install-managed-git'
        ? 'installManagedGit'
      : action === 'enter-free-mode'
        ? 'enterFreeMode'
      : action === 'revoke-external-plugin-trust'
        ? 'revokeExternalPluginTrust'
      : action === 'choose-external-plugin'
        ? 'chooseExternalPlugin'
      : action === 'load-external-plugin-source'
        ? 'loadExternalPluginSource'
      : action === 'clone-existing-profile'
        ? 'cloneExistingProfile'
      : action === 'continue-migration'
        ? 'continueMigration'
        : action === 'rollback-migration'
          ? 'rollbackMigration'
          : action
    if (!copy || typeof bridge?.[method] !== 'function') {
      showActionStatus('此恢复操作暂时不可用。')
      return
    }
    const sourceReference = action === 'load-external-plugin-source'
      ? externalPluginSourceInput.value.trim()
      : undefined
    if (action === 'load-external-plugin-source' && sourceReference.length === 0) {
      showActionStatus('请输入 npm、Git 或 HTTPS 插件来源。')
      externalPluginSourceInput.focus()
      return
    }
    const buttons = [...document.querySelectorAll('[data-action]')]
    buttons.forEach((item) => { item.disabled = true })
    externalPluginSourceInput.disabled = true
    showActionStatus(copy.pending)
    try {
      const result = action === 'load-external-plugin-source'
        ? await bridge[method](sourceReference)
        : await bridge[method]()
      showActionStatus(result?.accepted === true ? copy.accepted : copy.unavailable)
    } catch {
      showActionStatus(copy.unavailable)
    } finally {
      buttons.forEach((item) => { item.disabled = false })
      externalPluginSourceInput.disabled = false
      if (action === 'load-external-plugin-source') externalPluginSourceInput.value = ''
    }
  })
}

void refreshState()
const refreshTimer = globalThis.setInterval(() => { void refreshState() }, 1_000)
globalThis.addEventListener('beforeunload', () => globalThis.clearInterval(refreshTimer), { once: true })
