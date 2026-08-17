import { createExtensionOperationQueue } from './extension-operation-queue.mjs'

const pluginList = document.querySelector('#plugin-list')
const communityPluginList = document.querySelector('#community-plugin-list')
const skillList = document.querySelector('#skill-list')
const pluginCount = document.querySelector('#plugin-count')
const skillCount = document.querySelector('#skill-count')
const toast = document.querySelector('#toast')
const qqBotCard = document.querySelector('#qqbot-card')
const qqBotStateLabel = document.querySelector('#qqbot-state-label')
const qqBotUnbound = document.querySelector('#qqbot-unbound')
const qqBotScan = document.querySelector('#qqbot-scan')
const qqBotBound = document.querySelector('#qqbot-bound')
const qqBotQr = document.querySelector('#qqbot-qr')
const qqBotQrWait = document.querySelector('#qqbot-qr-wait')
const qqBotAppId = document.querySelector('#qqbot-appid')
const pluginUpdateState = document.querySelector('#plugin-update-state')
const checkPluginUpdatesButton = document.querySelector('#check-plugin-updates')
const refreshButton = document.querySelector('#refresh')
const recoveryCount = document.querySelector('#recovery-count')
const recoveryMode = document.querySelector('#recovery-mode')
const recoveryModeLabel = document.querySelector('#recovery-mode-label')
const restoreSafeMode = document.querySelector('#restore-safe-mode')
const recoveryIncidents = document.querySelector('#recovery-incidents')
const recoverySnapshots = document.querySelector('#recovery-snapshots')

function setOperationBusy(busy) {
  document.body.dataset.busy = String(busy)
  document.body.setAttribute('aria-busy', String(busy))
  for (const button of document.querySelectorAll('button:not([role="tab"])')) button.disabled = busy
}

const extensionOperations = createExtensionOperationQueue({ onBusyChange: setOperationBusy })

function escapeHtml(value) {
  const element = document.createElement('span')
  element.textContent = String(value)
  return element.innerHTML
}

function notify(message, error = false) {
  toast.textContent = message
  toast.classList.toggle('error', error)
  toast.hidden = false
  clearTimeout(notify.timer)
  notify.timer = setTimeout(() => { toast.hidden = true }, 4_000)
}

const compatibilityLabels = Object.freeze({
  compatible: '已适配',
  unknown: '未声明适配',
  incompatible: '不兼容',
})

function compatibilityReason(reason) {
  if (!reason) return ''
  const subject = reason.subject ? ` ${reason.subject}` : ''
  const range = reason.required ? `（需要 ${reason.required}${reason.actual ? `，当前 ${reason.actual}` : ''}）` : ''
  const messages = {
    'not-dsh-bundle': '该包不是可用的 DSH 插件',
    'invalid-manifest': '插件清单无法识别',
    'desktop-range': `不支持当前 Desktop 版本${range}`,
    'runtime-range': `不支持当前 DSH 运行时${range}`,
    'node-range': `不支持当前 Node.js 版本${range}`,
    'peer-range': `依赖${subject} 版本不匹配${range}`,
    'peer-missing': `缺少必需依赖${subject}${range}`,
    'invalid-range': `插件声明了无效的${subject} 版本范围`,
    'compatibility-undeclared': '作者未声明 Desktop/DSH 适配范围',
    'invalid-compatibility': '插件的适配信息格式无效',
    'invalid-peer-dependencies': '插件的依赖信息格式无效',
  }
  return messages[reason.code] ?? '插件适配信息异常'
}

function pluginMarkup(plugin) {
  const status = plugin.compatibility?.status ?? 'unknown'
  const badge = plugin.builtIn
    ? '<span class="badge builtin">DESKTOP</span>'
    : '<span class="badge">社区</span>'
  const compatibilityBadge = `<span class="badge ${escapeHtml(status)}">${escapeHtml(compatibilityLabels[status] ?? compatibilityLabels.unknown)}</span>`
  const version = plugin.version ? `v${plugin.version}` : '版本未知'
  const state = plugin.enabled ? '' : ' · 已停用'
  const latest = plugin.updateAvailable ? ` · 可更新至 v${plugin.latestVersion}` : ''
  const summary = plugin.builtIn
    ? `${version} · 随 Desktop 更新`
    : `${version} · ${plugin.requested}${state}${latest}`
  const installedReason = status === 'compatible' ? '' : compatibilityReason(plugin.compatibility?.reasons?.[0])
  const updateReason = plugin.updateAvailable && plugin.updateCompatibility?.status === 'incompatible'
    ? compatibilityReason(plugin.updateCompatibility?.reasons?.[0])
    : ''
  const description = [summary, updateReason ? `更新已拦截：${updateReason}` : installedReason].filter(Boolean).join(' · ')
  let updateAction = ''
  if (plugin.updateAvailable && plugin.updateCompatibility?.status === 'incompatible') {
    updateAction = '<span class="meta">已拦截更新</span>'
  } else if (plugin.updateAvailable) {
    updateAction = `<button type="button" class="item-action update" data-update-plugin="${escapeHtml(plugin.name)}" data-update-compatibility="${escapeHtml(plugin.updateCompatibility?.status ?? 'unknown')}">更新</button>`
  } else if (plugin.updateError) {
    updateAction = '<span class="meta">暂无法检查</span>'
  }
  const actions = plugin.builtIn
    ? '<span class="meta">内置保护</span>'
    : `${updateAction}<button type="button" class="item-action danger" data-remove-plugin="${escapeHtml(plugin.name)}">移除</button>`
  return `<article class="item"><div><div class="name-row"><span class="name">${escapeHtml(plugin.name)}</span>${badge}${compatibilityBadge}</div><p class="description">${escapeHtml(description)}</p></div><div class="item-actions">${actions}</div></article>`
}

function skillMarkup(skill) {
  const shadow = skill.shadowed ? '<span class="badge shadowed">SHADOWED</span>' : ''
  return `<article class="item"><div><div class="name-row"><span class="name">${escapeHtml(skill.name)}</span>${shadow}</div><p class="description">${escapeHtml(skill.description)}</p></div><button type="button" class="item-action" data-open-skill="${escapeHtml(skill.id)}">${escapeHtml(skill.source)}</button></article>`
}

function communityPluginMarkup(plugin) {
  const state = plugin.enabled ? '已启用' : '未启用'
  return `<article class="community-plugin-card"><div><div class="name-row"><span class="name">${escapeHtml(plugin.name)}</span><span class="badge">社区</span><span class="badge inactive">${state}</span></div><p class="description">${escapeHtml(plugin.description)}</p><p class="community-author">作者：${escapeHtml(plugin.author)} · 第三方插件与素材由作者仓库说明负责</p></div><button type="button" class="item-action community-open" data-open-community-plugin="${escapeHtml(plugin.id)}">查看作者仓库</button></article>`
}

const recoveryResolutionLabels = Object.freeze({
  'auto-disabled': '已自动停用',
  'disabled-by-user': '已手动停用',
  'safe-mode-auto': '已自动进入安全模式',
  'safe-mode': '已进入安全模式',
  'legacy-false-positive-repaired': '2.2 已自动修复误判',
  'restored-by-user': '已由用户恢复',
})

function incidentMarkup(incident) {
  const plugin = incident.pluginName ? `<span class="name">${escapeHtml(incident.pluginName)}</span>` : '<span class="name">未定位插件</span>'
  const resolution = recoveryResolutionLabels[incident.resolution] ?? '待处理'
  const actions = incident.pluginName
    ? `<button type="button" class="item-action update" data-reenable-plugin="${escapeHtml(incident.pluginName)}">重新启用</button><button type="button" class="item-action danger" data-recovery-remove="${escapeHtml(incident.pluginName)}">卸载</button>`
    : ''
  const details = incident.technicalDetails
    ? `<details class="incident-details"><summary>技术详情</summary><pre>${escapeHtml(incident.technicalDetails)}</pre></details>`
    : ''
  return `<article class="recovery-item"><div><div class="name-row">${plugin}<span class="badge inactive">${escapeHtml(resolution)}</span></div><p class="description">${escapeHtml(incident.summary ?? '插件启动失败')}</p><p class="recovery-time">${escapeHtml(incident.createdAt ?? '')}</p>${details}</div><div class="item-actions">${actions}</div></article>`
}

function snapshotMarkup(snapshot) {
  return `<article class="item"><div><div class="name-row"><span class="name">${escapeHtml(snapshot.label ?? 'Profile 配置')}</span><span class="badge">${escapeHtml(snapshot.kind ?? 'snapshot')}</span></div><p class="description">${escapeHtml(snapshot.createdAt ?? '')}</p></div><button type="button" class="item-action update" data-restore-snapshot="${escapeHtml(snapshot.id)}">恢复并重启</button></article>`
}

async function refreshRecovery() {
  const state = await window.dshDesktop.getPluginRecoveryState()
  recoveryCount.textContent = state.incidents.length
  recoveryMode.dataset.safe = String(state.safeMode)
  recoveryModeLabel.textContent = state.safeMode ? '安全模式，只加载内置插件' : '正常模式'
  restoreSafeMode.hidden = !state.safeMode
  restoreSafeMode.textContent = state.disabledPlugins.length > 0
    ? `恢复全部（${state.disabledPlugins.length}）并重启`
    : '退出安全模式并重启'
  recoveryIncidents.innerHTML = state.incidents.length
    ? state.incidents.map(incidentMarkup).join('')
    : '<p class="empty">没有记录到插件启动故障</p>'
  recoverySnapshots.innerHTML = state.snapshots.length
    ? state.snapshots.map(snapshotMarkup).join('')
    : '<p class="empty">启动成功后会在这里保存最近三份可用配置</p>'
}

function renderQqBot(status, eventType) {
  const bound = Boolean(status?.bound)
  const binding = Boolean(status?.binding)
  const pending = Boolean(status?.pending) || eventType === 'saving' || eventType === 'restarting'
  qqBotUnbound.hidden = bound || binding || pending
  qqBotScan.hidden = !binding
  qqBotBound.hidden = !bound
  qqBotCard.dataset.state = eventType === 'error' ? 'error' : bound ? 'bound' : binding || pending ? 'binding' : 'unbound'
  qqBotStateLabel.textContent = bound
    ? (eventType === 'restarting' ? '正在重启' : '已绑定')
    : binding
      ? (status.qrImage ? '等待扫码' : '获取二维码')
      : eventType === 'saving' ? '正在保存' : eventType === 'restarting' ? '正在重启' : eventType === 'error' ? '绑定失败' : '未绑定'
  qqBotAppId.textContent = status?.appId ?? '--'
  qqBotQr.hidden = !status?.qrImage
  qqBotQrWait.hidden = Boolean(status?.qrImage)
  if (status?.qrImage) qqBotQr.src = status.qrImage
  else qqBotQr.removeAttribute('src')
}

async function refresh() {
  try {
    const [inventory] = await Promise.all([
      window.dshDesktop.listExtensions(),
      refreshRecovery(),
    ])
    pluginCount.textContent = inventory.plugins.length
    skillCount.textContent = inventory.skills.length
    renderQqBot(inventory.qqbot)
    communityPluginList.innerHTML = inventory.communityPlugins?.length
      ? inventory.communityPlugins.map(communityPluginMarkup).join('')
      : '<p class="empty">暂无社区推荐</p>'
    renderPlugins(inventory.plugins)
    skillList.innerHTML = inventory.skills.length ? inventory.skills.map(skillMarkup).join('') : '<p class="empty">尚未发现技能</p>'
    if (extensionOperations.busy) setOperationBusy(true)
  } catch (error) {
    notify(error.message, true)
  }
}

function renderPlugins(plugins) {
  pluginCount.textContent = plugins.length
  pluginList.innerHTML = plugins.length ? plugins.map(pluginMarkup).join('') : '<p class="empty">暂无插件</p>'
  if (extensionOperations.busy) setOperationBusy(true)
}

async function checkPluginUpdates({ silent = false } = {}) {
  pluginUpdateState.textContent = '正在检查社区插件更新…'
  try {
    const plugins = await window.dshDesktop.checkPluginUpdates()
    renderPlugins(plugins)
    const available = plugins.filter((plugin) => plugin.updateAvailable).length
    pluginUpdateState.textContent = available > 0
      ? `发现 ${available} 个社区插件更新；不兼容版本已拦截。`
      : '社区插件已检查；内置插件随 Desktop 更新。'
    if (!silent) notify(available > 0 ? `发现 ${available} 个插件更新` : '插件已是最新状态')
  } catch (error) {
    pluginUpdateState.textContent = '插件更新源暂时不可用，已安装版本未改变。'
    if (!silent) notify(error.message, true)
  }
}

document.querySelector('#qqbot-bind').addEventListener('click', () => {
  void extensionOperations.run(async () => {
    try {
      renderQqBot(await window.dshDesktop.startQqBotBinding())
    } catch (error) {
      notify(error.message, true)
    }
  })
})

document.querySelector('#qqbot-cancel').addEventListener('click', () => {
  void extensionOperations.run(async () => {
    try {
      renderQqBot(await window.dshDesktop.cancelQqBotBinding())
    } catch (error) {
      notify(error.message, true)
    }
  })
})

document.querySelector('#qqbot-unbind').addEventListener('click', () => {
  if (!window.confirm('解除 QQ 机器人绑定并清除本机加密凭据？')) return
  void extensionOperations.run(async () => {
    try {
      renderQqBot({ bound: false, binding: false }, 'restarting')
      renderQqBot(await window.dshDesktop.unbindQqBot())
      notify('QQ 机器人已解绑，DSH 已重启')
    } catch (error) {
      notify(error.message, true)
      await refresh()
    }
  })
})

const removeQqBotEventListener = window.dshDesktop.onQqBotEvent((payload) => {
  renderQqBot(payload.status, payload.type)
  if (payload.type === 'bound') notify('QQ 机器人绑定成功，DSH 已重启')
  if (payload.type === 'error') notify(payload.error ?? 'QQ 机器人绑定失败', true)
})

const tabs = Array.from(document.querySelectorAll('[data-tab]'))
function activateTab(tab, focus = false) {
  for (const item of tabs) {
    const active = item === tab
    item.classList.toggle('active', active)
    item.setAttribute('aria-selected', String(active))
    item.tabIndex = active ? 0 : -1
  }
  for (const panel of document.querySelectorAll('.panel')) {
    const active = panel.id === tab.dataset.tab
    panel.hidden = !active
    panel.classList.toggle('active', active)
  }
  if (focus) tab.focus()
}

for (const [index, tab] of tabs.entries()) {
  tab.addEventListener('click', () => { activateTab(tab) })
  tab.addEventListener('keydown', (event) => {
    let nextIndex
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = tabs.length - 1
    if (nextIndex === undefined) return
    event.preventDefault()
    activateTab(tabs[nextIndex], true)
  })
}

document.querySelector('#plugin-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  const data = new FormData(form)
  const spec = data.get('spec')
  const allowUnknown = data.get('allowUnknown') === 'on'
  await extensionOperations.run(async () => {
    try {
      const result = await window.dshDesktop.installPlugin(spec, allowUnknown)
      notify(`${result.name} 已安装，DSH 已重启`)
      form.reset()
      await refresh()
    } catch (error) {
      notify(error.message, true)
    }
  })
})
window.addEventListener('beforeunload', removeQqBotEventListener, { once: true })

pluginList.addEventListener('click', async (event) => {
  const updateButton = event.target.closest('[data-update-plugin]')
  if (updateButton) {
    const allowUnknown = updateButton.dataset.updateCompatibility === 'unknown'
    if (allowUnknown && !window.confirm('该版本没有声明 Desktop/DSH 适配范围，仍要更新吗？失败时会自动回滚。')) return
    await extensionOperations.run(async () => {
      try {
        const result = await window.dshDesktop.updatePlugin(updateButton.dataset.updatePlugin, allowUnknown)
        notify(`${result.name} 已更新至 v${result.version}，DSH 已重启`)
        await refresh()
        await checkPluginUpdates({ silent: true })
      } catch (error) {
        notify(error.message, true)
      }
    })
    return
  }
  const button = event.target.closest('[data-remove-plugin]')
  if (!button) return
  await extensionOperations.run(async () => {
    try {
      await window.dshDesktop.removePlugin(button.dataset.removePlugin)
      notify(`${button.dataset.removePlugin} 已移除`)
      await refresh()
    } catch (error) {
      notify(error.message, true)
    }
  })
})

communityPluginList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-open-community-plugin]')
  if (!button) return
  await extensionOperations.run(async () => {
    try {
      await window.dshDesktop.openCommunityPlugin(button.dataset.openCommunityPlugin)
    } catch (error) {
      notify(error.message, true)
    }
  })
})

skillList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-open-skill]')
  if (!button) return
  await extensionOperations.run(async () => {
    try {
      await window.dshDesktop.openSkill(button.dataset.openSkill)
    } catch (error) {
      notify(error.message, true)
    }
  })
})

recoveryIncidents.addEventListener('click', async (event) => {
  const enableButton = event.target.closest('[data-reenable-plugin]')
  if (enableButton) {
    await extensionOperations.run(async () => {
      try {
        await window.dshDesktop.setPluginEnabled(enableButton.dataset.reenablePlugin, true)
        notify(`${enableButton.dataset.reenablePlugin} 已重新启用，DSH 已重启`)
        await refresh()
      } catch (error) {
        notify(error.message, true)
      }
    })
    return
  }
  const removeButton = event.target.closest('[data-recovery-remove]')
  if (!removeButton) return
  if (!window.confirm(`卸载 ${removeButton.dataset.recoveryRemove}？聊天记录和个人设置不会被删除。`)) return
  await extensionOperations.run(async () => {
    try {
      await window.dshDesktop.removePlugin(removeButton.dataset.recoveryRemove)
      notify(`${removeButton.dataset.recoveryRemove} 已卸载`)
      await refresh()
    } catch (error) {
      notify(error.message, true)
    }
  })
})

recoverySnapshots.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-restore-snapshot]')
  if (!button) return
  if (!window.confirm('恢复这份插件配置并重启 DSH？聊天记录和个人设置不会受影响。')) return
  await extensionOperations.run(async () => {
    try {
      await window.dshDesktop.restorePluginSnapshot(button.dataset.restoreSnapshot)
      notify('插件配置已恢复，DSH 已重启')
      await refresh()
    } catch (error) {
      notify(error.message, true)
    }
  })
})

restoreSafeMode.addEventListener('click', async () => {
  if (!window.confirm('恢复安全模式停用的全部插件并重启 DSH？如果插件本身仍有故障，可再次进入安全模式。')) return
  await extensionOperations.run(async () => {
    try {
      const result = await window.dshDesktop.restoreDisabledPlugins()
      const count = result.restored?.length ?? 0
      notify(count > 0 ? `已恢复 ${count} 个插件，DSH 已重启` : '已退出安全模式，DSH 已重启')
      await refresh()
    } catch (error) {
      notify(error.message, true)
      await refresh()
    }
  })
})

document.querySelector('#export-diagnostics').addEventListener('click', () => {
  void extensionOperations.run(async () => {
    try {
      const result = await window.dshDesktop.exportPluginDiagnostics()
      if (!result.canceled) notify('插件诊断包已导出')
    } catch (error) {
      notify(error.message, true)
    }
  })
})

document.querySelector('#import-skill').addEventListener('click', async () => {
  await extensionOperations.run(async () => {
    try {
      const result = await window.dshDesktop.importSkill()
      if (!result.canceled) {
        notify(`${result.skill.name} 已导入`)
        await refresh()
      }
    } catch (error) {
      notify(error.message, true)
    }
  })
})
document.querySelector('#open-skill-root').addEventListener('click', () => {
  void extensionOperations.run(async () => {
    try {
      await window.dshDesktop.openSkillRoot()
    } catch (error) {
      notify(error.message, true)
    }
  })
})
checkPluginUpdatesButton.addEventListener('click', () => {
  void extensionOperations.run(() => checkPluginUpdates())
})
refreshButton.addEventListener('click', () => {
  void extensionOperations.run(async () => {
    await refresh()
    await checkPluginUpdates({ silent: true })
  })
})

await extensionOperations.run(refresh)
void extensionOperations.run(() => checkPluginUpdates({ silent: true }))
