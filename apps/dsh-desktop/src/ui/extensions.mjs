const pluginList = document.querySelector('#plugin-list')
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
  document.body.dataset.busy = 'true'
  try {
    const inventory = await window.dshDesktop.listExtensions()
    pluginCount.textContent = inventory.plugins.length
    skillCount.textContent = inventory.skills.length
    renderQqBot(inventory.qqbot)
    renderPlugins(inventory.plugins)
    skillList.innerHTML = inventory.skills.length ? inventory.skills.map(skillMarkup).join('') : '<p class="empty">尚未发现技能</p>'
  } catch (error) {
    notify(error.message, true)
  } finally {
    delete document.body.dataset.busy
  }
}

function renderPlugins(plugins) {
  pluginCount.textContent = plugins.length
  pluginList.innerHTML = plugins.length ? plugins.map(pluginMarkup).join('') : '<p class="empty">暂无插件</p>'
}

async function checkPluginUpdates({ silent = false } = {}) {
  checkPluginUpdatesButton.disabled = true
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
  } finally {
    checkPluginUpdatesButton.disabled = false
  }
}

document.querySelector('#qqbot-bind').addEventListener('click', async (event) => {
  event.currentTarget.disabled = true
  try {
    renderQqBot(await window.dshDesktop.startQqBotBinding())
  } catch (error) {
    notify(error.message, true)
  } finally {
    event.currentTarget.disabled = false
  }
})

document.querySelector('#qqbot-cancel').addEventListener('click', async (event) => {
  event.currentTarget.disabled = true
  try {
    renderQqBot(await window.dshDesktop.cancelQqBotBinding())
  } catch (error) {
    notify(error.message, true)
  } finally {
    event.currentTarget.disabled = false
  }
})

document.querySelector('#qqbot-unbind').addEventListener('click', async (event) => {
  if (!window.confirm('解除 QQ 机器人绑定并清除本机加密凭据？')) return
  event.currentTarget.disabled = true
  try {
    renderQqBot({ bound: false, binding: false }, 'restarting')
    renderQqBot(await window.dshDesktop.unbindQqBot())
    notify('QQ 机器人已解绑，DSH 已重启')
  } catch (error) {
    notify(error.message, true)
    await refresh()
  } finally {
    event.currentTarget.disabled = false
  }
})

window.dshDesktop.onQqBotEvent((payload) => {
  renderQqBot(payload.status, payload.type)
  if (payload.type === 'bound') notify('QQ 机器人绑定成功，DSH 已重启')
  if (payload.type === 'error') notify(payload.error ?? 'QQ 机器人绑定失败', true)
})

for (const tab of document.querySelectorAll('[data-tab]')) {
  tab.addEventListener('click', () => {
    for (const item of document.querySelectorAll('[data-tab]')) item.classList.toggle('active', item === tab)
    for (const panel of document.querySelectorAll('.panel')) {
      const active = panel.id === tab.dataset.tab
      panel.hidden = !active
      panel.classList.toggle('active', active)
    }
  })
}

document.querySelector('#plugin-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const spec = new FormData(event.currentTarget).get('spec')
  const allowUnknown = new FormData(event.currentTarget).get('allowUnknown') === 'on'
  const button = event.currentTarget.querySelector('button')
  button.disabled = true
  try {
    const result = await window.dshDesktop.installPlugin(spec, allowUnknown)
    notify(`${result.name} 已安装，DSH 已重启`)
    event.currentTarget.reset()
    await refresh()
  } catch (error) {
    notify(error.message, true)
  } finally {
    button.disabled = false
  }
})

pluginList.addEventListener('click', async (event) => {
  const updateButton = event.target.closest('[data-update-plugin]')
  if (updateButton) {
    const allowUnknown = updateButton.dataset.updateCompatibility === 'unknown'
    if (allowUnknown && !window.confirm('该版本没有声明 Desktop/DSH 适配范围，仍要更新吗？失败时会自动回滚。')) return
    updateButton.disabled = true
    try {
      const result = await window.dshDesktop.updatePlugin(updateButton.dataset.updatePlugin, allowUnknown)
      notify(`${result.name} 已更新至 v${result.version}，DSH 已重启`)
      await refresh()
      await checkPluginUpdates({ silent: true })
    } catch (error) {
      notify(error.message, true)
      updateButton.disabled = false
    }
    return
  }
  const button = event.target.closest('[data-remove-plugin]')
  if (!button) return
  button.disabled = true
  try {
    await window.dshDesktop.removePlugin(button.dataset.removePlugin)
    notify(`${button.dataset.removePlugin} 已移除`)
    await refresh()
  } catch (error) {
    notify(error.message, true)
    button.disabled = false
  }
})

skillList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-open-skill]')
  if (button) await window.dshDesktop.openSkill(button.dataset.openSkill)
})

document.querySelector('#import-skill').addEventListener('click', async () => {
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
document.querySelector('#open-skill-root').addEventListener('click', () => window.dshDesktop.openSkillRoot())
checkPluginUpdatesButton.addEventListener('click', () => checkPluginUpdates())
document.querySelector('#refresh').addEventListener('click', async () => {
  await refresh()
  await checkPluginUpdates({ silent: true })
})

await refresh()
void checkPluginUpdates({ silent: true })
