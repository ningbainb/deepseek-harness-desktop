import { createExtensionOperationQueue } from './extension-operation-queue.mjs'
import {
  communityMarketInstallPresentation,
  selectCommunityMarketPlugins,
} from './community-market-view.mjs'

const themeQuery = new URLSearchParams(window.location.search).get('theme')
if (themeQuery === 'dark' || themeQuery === 'light') {
  document.documentElement.dataset.dshDesktopTheme = themeQuery
}

const pluginList = document.querySelector('#plugin-list')
const communityPluginList = document.querySelector('#community-plugin-list')
const skillList = document.querySelector('#skill-list')
const pluginCount = document.querySelector('#plugin-count')
const skillCount = document.querySelector('#skill-count')
const marketCount = document.querySelector('#market-count')
const marketTotal = document.querySelector('#market-total')
const marketUpdated = document.querySelector('#market-updated')
const marketQuery = document.querySelector('#market-query')
const marketCategory = document.querySelector('#market-category')
const marketSort = document.querySelector('#market-sort')
const marketResultState = document.querySelector('#market-result-state')
const marketList = document.querySelector('#market-list')
const marketPagination = document.querySelector('#market-pagination')
const marketPageState = document.querySelector('#market-page-state')
const marketPrevious = document.querySelector('#market-previous')
const marketNext = document.querySelector('#market-next')
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
const revokeFullUserTrust = document.querySelector('#revoke-full-user-trust')
const recoveryIncidents = document.querySelector('#recovery-incidents')
const recoverySnapshots = document.querySelector('#recovery-snapshots')
const activationBanner = document.querySelector('#activation-banner')
const activationMessage = document.querySelector('#activation-message')
const restartRuntimeButton = document.querySelector('#restart-runtime')
const presetPlanElement = document.querySelector('#preset-plan')
const presetProgress = document.querySelector('#preset-progress')
const presetProgressSteps = document.querySelector('#preset-progress-steps')
const presetPackages = document.querySelector('#preset-packages')
const presetConfig = document.querySelector('#preset-config')
let activePresetPlan
let activeMigrationPlan
let marketCatalog
let marketPage = 1
let marketView
let installedMarketReferences = new Set()
const marketInstallPhases = new Map()

const MARKET_PAGE_SIZE = 20
const compactNumber = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 })

function setOperationBusy(busy) {
  document.body.dataset.busy = String(busy)
  document.body.setAttribute('aria-busy', String(busy))
  for (const button of document.querySelectorAll('button:not([role="tab"])')) button.disabled = busy
  if (!busy) syncMarketPaginationState()
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

function showActivation(message, activation = { mode: 'refresh' }) {
  activationMessage.textContent = message
  restartRuntimeButton.hidden = activation.mode !== 'restart'
  activationBanner.hidden = false
}

const presetStatusLabels = Object.freeze({
  install: '安装',
  conflict: '冲突',
  skip: '已满足，跳过',
})

function conflictSelect(attribute, value, conflict) {
  if (!conflict) return '<span class="meta">使用 Preset</span>'
  return `<select class="preset-select" ${attribute}="${escapeHtml(value)}"><option value="cancel">取消导入</option><option value="skip">跳过此项</option><option value="preset">使用 Preset 精确版本</option></select>`
}

function renderPresetPlan(plan) {
  activePresetPlan = plan
  document.querySelector('#preset-name').textContent = plan.manifest.name
  document.querySelector('#preset-description').textContent = plan.manifest.description ?? ''
  document.querySelector('#preset-trust').textContent = plan.trust.integrityVerified ? '完整性已验证 · 发布者未信任' : '未验证'
  const missingCapabilities = plan.capabilities.filter((item) => !item.available)
  const facts = [
    `SHA-256 ${plan.sha256.slice(0, 12)}…`,
    `${plan.packages.length} 个插件`,
    `${plan.skills.length} 个技能`,
    `${plan.taskTemplates} 个任务模板`,
    plan.requiredSecrets.length ? `需要 Secret 名称：${plan.requiredSecrets.join(', ')}` : '不需要 Secret',
    missingCapabilities.length ? `缺少能力：${missingCapabilities.map((item) => item.id).join(', ')}` : 'Runtime 能力满足',
  ]
  document.querySelector('#preset-facts').innerHTML = facts
    .map((fact, index) => `<span class="preset-fact${index === facts.length - 1 && missingCapabilities.length ? ' error' : ''}">${escapeHtml(fact)}</span>`)
    .join('')
  presetPackages.innerHTML = plan.packages.length
    ? plan.packages.map((item) => `<article class="item"><div><div class="name-row"><span class="name">${escapeHtml(item.name)}</span><span class="badge ${item.status === 'conflict' || item.review.status !== 'compatible' ? 'unknown' : 'compatible'}">${escapeHtml(presetStatusLabels[item.status] ?? item.status)}</span></div><p class="description">Preset v${escapeHtml(item.version)}${item.currentVersion ? ` · 当前 v${escapeHtml(item.currentVersion)}` : ''} · 兼容性 ${escapeHtml(item.review.status)} · Bundle ${item.review.bundle === true ? '已验证' : '未验证'} · Registry integrity ${item.review.integrityVerified === true ? '一致' : '不一致'}${item.review.error ? ` · ${escapeHtml(item.review.error)}` : ''}</p></div>${conflictSelect('data-preset-package', item.name, item.status === 'conflict' || item.review.status !== 'compatible' || item.review.bundle !== true || item.review.integrityVerified !== true)}</article>`).join('')
    : '<p class="empty">Preset 不包含社区插件</p>'
  const skillRows = plan.skills.map((item) => `<article class="item"><div><div class="name-row"><span class="name">${escapeHtml(item.name)}</span><span class="badge ${item.status === 'conflict' ? 'unknown' : 'compatible'}">${escapeHtml(presetStatusLabels[item.status] ?? item.status)}</span></div><p class="description">技能目录内容，不包含可执行脚本</p></div>${conflictSelect('data-preset-skill', item.name, item.status === 'conflict')}</article>`)
  skillRows.push(`<article class="item"><div><span class="name">Settings</span><p class="description">允许字段：${escapeHtml(plan.settings.join(', ') || '无')}</p></div><select class="preset-select" data-preset-config="settings"><option value="preset">使用 Preset</option><option value="skip">跳过</option><option value="cancel">取消导入</option></select></article>`)
  skillRows.push(`<article class="item"><div><span class="name">Task templates</span><p class="description">${plan.taskTemplates} 项</p></div><select class="preset-select" data-preset-config="taskTemplates"><option value="preset">使用 Preset</option><option value="skip">跳过</option><option value="cancel">取消导入</option></select></article>`)
  presetConfig.innerHTML = skillRows.join('')
  document.querySelector('#preset-confirm').checked = false
  presetProgress.hidden = true
  presetProgressSteps.innerHTML = ''
  presetPlanElement.hidden = false
}

const progressLabels = Object.freeze({
  preparing: '解析计划并验证兼容性',
  prefetched: '精确包已预取到本地 store',
  stopping: '正在停止 DeepSeek Harness',
  applying: '正在应用插件与配置',
  starting: '正在启动并进行健康检查',
  committed: '导入成功，事务已提交',
  'rolling-back': '导入失败，正在完整回滚',
  restored: '旧环境与 Runtime 已恢复',
})

function renderProgress(payload) {
  if (payload.operation !== 'preset-import') return
  presetProgress.hidden = false
  for (const item of presetProgressSteps.querySelectorAll('li.current')) item.classList.remove('current')
  const item = document.createElement('li')
  item.textContent = progressLabels[payload.phase] ?? payload.phase
  item.classList.add(payload.phase === 'restored' ? 'failed' : 'current')
  presetProgressSteps.append(item)
}

const migrationStatusLabels = Object.freeze({
  install: '可安装',
  update: '可更新',
  unknown: '兼容性未声明',
  incompatible: '不兼容',
  missing: '注册表缺失',
  managed: 'Desktop 管理',
  'already-installed': '已安装相同版本',
})

function renderMigrationPlan(plan) {
  const element = document.querySelector('#migration-plan')
  const list = document.querySelector('#migration-items')
  if (!plan.available) {
    activeMigrationPlan = undefined
    element.hidden = true
    notify('未发现可迁移的 Web Profile')
    return
  }
  activeMigrationPlan = plan
  const configurationNote = `<article class="item"><div><span class="name">相关 Profile 配置</span><p class="description">将迁移 ${plan.configuration?.fragments ?? 0} 个可归属配置片段；已跳过 ${plan.configuration?.skipped ?? 0} 个含敏感字段的片段。配置内容不会发送给 Renderer。</p></div></article>`
  list.innerHTML = configurationNote + (plan.items.length
    ? plan.items.map((item) => {
      const eligible = ['install', 'update', 'unknown'].includes(item.status)
      const detail = [
        item.version ? `目标 v${item.version}` : `请求 ${String(item.requested ?? '未知')}`,
        item.currentVersion ? `Desktop 当前 v${item.currentVersion}` : '',
        item.sourceMissing ? 'Web Profile 本地包缺失，将以注册表精确版本为准' : '',
        item.reason ?? '',
      ].filter(Boolean).join(' · ')
      return `<article class="item"><div><div class="name-row"><label class="risk-check"><input type="checkbox" data-migration-plugin="${escapeHtml(item.name)}"${eligible && item.status !== 'unknown' ? ' checked' : ''}${eligible ? '' : ' disabled'}><span class="name">${escapeHtml(item.name)}</span></label><span class="badge ${eligible ? 'unknown' : 'incompatible'}">${escapeHtml(migrationStatusLabels[item.status] ?? item.status)}</span></div><p class="description">${escapeHtml(detail)}</p></div></article>`
    }).join('')
    : '<p class="empty">Web Profile 没有插件条目</p>')
  document.querySelector('#migration-allow-unknown').checked = false
  element.hidden = false
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
    'desktop-api-range': `不支持当前 Desktop API${range}`,
    'runtime-range': `不支持当前 DSH 运行时${range}`,
    'node-range': `不支持当前 Node.js 版本${range}`,
    'capability-missing': `缺少 Desktop 能力${subject}`,
    'surface-unsupported': `当前窗口 Surface 不支持${subject}`,
    'peer-range': `依赖${subject} 版本不匹配${range}`,
    'peer-missing': `缺少必需依赖${subject}${range}`,
    'invalid-range': `插件声明了无效的${subject} 版本范围`,
    'compatibility-undeclared': '作者未声明 Desktop/DSH 适配范围',
    'invalid-compatibility': '插件的适配信息格式无效',
    'invalid-capabilities': '插件声明了无效的 Desktop 能力需求',
    'invalid-surfaces': '插件声明了无效的 Desktop Surface 需求',
    'invalid-runtime-evidence': '插件声明了无效的运行时测试证据',
    'invalid-peer-dependencies': '插件的依赖信息格式无效',
  }
  return messages[reason.code] ?? '插件适配信息异常'
}

function compatibilityFacts(compatibility) {
  const requirements = compatibility?.details?.requirements
  const tested = compatibility?.details?.tested
  if (!requirements && !tested) return []
  const facts = []
  if (typeof requirements?.desktop === 'string') facts.push(`Desktop ${requirements.desktop}`)
  if (typeof requirements?.runtime === 'string') facts.push(`DSH ${requirements.runtime}`)
  if (typeof requirements?.desktopApi === 'string') facts.push(`Desktop API ${requirements.desktopApi}`)
  if (Array.isArray(requirements?.capabilities) && requirements.capabilities.length > 0) {
    facts.push(`需要能力 ${requirements.capabilities.join(', ')}`)
  }
  if (Array.isArray(requirements?.surfaces) && requirements.surfaces.length > 0) {
    facts.push(`需要 Surface ${requirements.surfaces.join(', ')}`)
  }
  if (typeof tested?.runtime === 'string') {
    facts.push(`已测 DSH ${tested.runtime}${typeof tested.desktop === 'string' ? ` / Desktop ${tested.desktop}` : ''}`)
  } else if (typeof tested?.matrixArtifact === 'string') {
    facts.push(`测试矩阵 ${tested.matrixArtifact}`)
  }
  return facts
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
  const description = [
    summary,
    updateReason ? `更新已拦截：${updateReason}` : installedReason,
    ...compatibilityFacts(plugin.compatibility),
  ].filter(Boolean).join(' · ')
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
  return `<article class="community-plugin-card"><div><div class="name-row"><span class="name">${escapeHtml(plugin.name)}</span><span class="badge">社区</span><span class="badge inactive">${state}</span></div><p class="description">${escapeHtml(plugin.description)}</p><p class="community-author">作者：${escapeHtml(plugin.author)} · 第三方插件与素材由作者仓库说明负责</p></div><div class="item-actions"><button type="button" class="item-action community-open" data-open-community-plugin="${escapeHtml(plugin.id)}">查看作者仓库</button></div></article>`
}

function marketDescription(plugin) {
  const description = plugin.description?.zh ?? plugin.description?.en ?? '社区目录暂未提供说明。'
  if (!plugin.deprecated) return description
  return `${description}${plugin.replacement ? ` 已停止维护，建议改用 ${plugin.replacement}。` : ' 已停止维护。'}`
}

function marketPluginMarkup(plugin) {
  const sourceBadge = plugin.sourceKind === 'npm' ? 'NPM' : 'GIT'
  const deprecatedBadge = plugin.deprecated ? '<span class="badge inactive">已弃用</span>' : ''
  const presentation = communityMarketInstallPresentation({
    installed: plugin.installed,
    phase: marketInstallPhases.get(plugin.id),
  })
  const action = presentation.kind === 'installed'
    ? '<span class="market-installed">已安装</span>'
    : `<button type="button" class="primary market-install" data-install-market-plugin="${escapeHtml(plugin.id)}" data-state="${escapeHtml(presentation.kind)}" aria-busy="${presentation.kind === 'installing' ? 'true' : 'false'}"${presentation.disabled ? ' disabled' : ''}>${escapeHtml(presentation.label)}</button>`
  const operationState = presentation.status
    ? `<p class="market-operation-state ${escapeHtml(presentation.kind)}" role="status">${escapeHtml(presentation.status)}</p>`
    : ''
  const downloads = Number.isSafeInteger(plugin.downloads) ? compactNumber.format(plugin.downloads) : '--'
  const stars = Number.isSafeInteger(plugin.stars) ? compactNumber.format(plugin.stars) : '--'
  const author = plugin.owner ? `by ${plugin.owner}` : '社区作者'
  return `<article class="market-card"><div class="market-card-head"><div class="market-card-title"><h3 title="${escapeHtml(plugin.name)}">${escapeHtml(plugin.displayName)}</h3><p>${escapeHtml(author)}</p></div><div class="name-row"><span class="badge">${sourceBadge}</span>${deprecatedBadge}</div></div><p class="description">${escapeHtml(marketDescription(plugin))}</p><div class="market-source" title="${escapeHtml(plugin.installSpec)}">${escapeHtml(plugin.installSpec)}</div>${operationState}<div class="market-card-foot"><div class="market-stats"><span>DL ${escapeHtml(downloads)}</span><span>STAR ${escapeHtml(stars)}</span><span>${escapeHtml(plugin.category)}</span></div>${action}</div></article>`
}

function syncMarketPaginationState() {
  if (!marketView) return
  marketPrevious.disabled = extensionOperations?.busy === true || marketView.page <= 1
  marketNext.disabled = extensionOperations?.busy === true || marketView.page >= marketView.pages
}

function renderMarket() {
  if (!marketCatalog) return
  marketView = selectCommunityMarketPlugins(marketCatalog.plugins, {
    query: marketQuery.value,
    category: marketCategory.value,
    sort: marketSort.value,
    page: marketPage,
    pageSize: MARKET_PAGE_SIZE,
    installed: installedMarketReferences,
  })
  marketPage = marketView.page
  marketResultState.textContent = marketView.total === marketCatalog.count
    ? `显示全部 ${marketView.total} 个条目`
    : `找到 ${marketView.total} 个条目`
  marketList.innerHTML = marketView.items.length
    ? marketView.items.map(marketPluginMarkup).join('')
    : '<p class="market-empty">没有符合当前条件的插件</p>'
  marketPagination.hidden = marketView.pages <= 1
  marketPageState.textContent = `${marketView.page} / ${marketView.pages}`
  syncMarketPaginationState()
  if (extensionOperations.busy) setOperationBusy(true)
}

async function refreshMarket() {
  marketResultState.textContent = '正在读取社区目录'
  try {
    const catalog = await window.dshDesktop.listCommunityMarket()
    marketCatalog = catalog
    marketPage = 1
    marketCount.textContent = compactNumber.format(catalog.count)
    marketTotal.textContent = compactNumber.format(catalog.count)
    marketUpdated.textContent = catalog.updated ?? '--'
    const selectedCategory = marketCategory.value
    marketCategory.innerHTML = '<option value="all">全部分类</option>' + catalog.categories.map((category) => {
      const label = category.label?.zh ?? category.label?.en ?? category.id
      return `<option value="${escapeHtml(category.id)}">${escapeHtml(label)}</option>`
    }).join('')
    if ([...marketCategory.options].some((option) => option.value === selectedCategory)) {
      marketCategory.value = selectedCategory
    }
    renderMarket()
  } catch (error) {
    marketCatalog = undefined
    marketView = undefined
    marketCount.textContent = '--'
    marketTotal.textContent = '--'
    marketUpdated.textContent = '--'
    marketResultState.textContent = '社区目录暂时不可用'
    marketList.innerHTML = `<p class="market-empty">${escapeHtml(error.message)}</p>`
    marketPagination.hidden = true
  }
}

const recoveryResolutionLabels = Object.freeze({
  'auto-disabled': '已自动停用',
  'disabled-by-user': '已手动停用',
  'safe-mode-auto': '已自动进入安全模式',
  'safe-mode': '已进入安全模式',
  'baseline-quarantine-auto': '已切换桌面基线',
  'baseline-quarantine-bootstrap': '已在启动前切换桌面基线',
  'baseline-quarantine-active': '桌面基线仍在使用',
  'legacy-false-positive-repaired': '2.2 已自动修复误判',
  'restored-by-user': '已由用户恢复',
  'restored-by-direct-start': '已在启动时恢复全部插件',
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
  const baselineQuarantineAvailable = state.baselineQuarantineAvailable === true
  recoveryModeLabel.textContent = !state.safeMode
    ? '正常模式'
    : baselineQuarantineAvailable
      ? '桌面基线模式，已隔离无法识别的用户加载配置'
      : '检测到旧版本留下的插件停用状态'
  restoreSafeMode.hidden = !state.safeMode
  restoreSafeMode.textContent = baselineQuarantineAvailable
    ? '恢复原始加载配置并重启'
    : state.disabledPlugins.length > 0
    ? `恢复全部（${state.disabledPlugins.length}）并重启`
    : '恢复历史停用插件并重启'
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
    installedMarketReferences = new Set(inventory.plugins.flatMap((plugin) => [plugin.name, plugin.requested].filter(Boolean)))
    communityPluginList.innerHTML = inventory.communityPlugins?.length
      ? inventory.communityPlugins.map(communityPluginMarkup).join('')
      : '<p class="empty">暂无社区推荐</p>'
    renderPlugins(inventory.plugins)
    skillList.innerHTML = inventory.skills.length ? inventory.skills.map(skillMarkup).join('') : '<p class="empty">尚未发现技能</p>'
    renderMarket()
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
const removeProgressListener = window.dshDesktop.onExtensionProgress(renderProgress)

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

const removeNavigationListener = window.dshDesktop.onExtensionNavigate((payload) => {
  const tab = tabs.find((item) => item.dataset.tab === payload?.tab)
  if (tab) activateTab(tab)
})
const removePresetPreviewListener = window.dshDesktop.onPresetPreview((plan) => {
  const tab = tabs.find((item) => item.dataset.tab === 'presets')
  if (tab) activateTab(tab)
  renderPresetPlan(plan)
})
const removePluginPrefillListener = window.dshDesktop.onPluginInstallPrefill?.((payload) => {
  const spec = typeof payload?.spec === 'string' ? payload.spec : ''
  if (spec === '' || spec.length > 2_048) return
  const tab = tabs.find((item) => item.dataset.tab === 'plugins')
  if (tab) activateTab(tab)
  const input = document.querySelector('#plugin-spec')
  input.value = spec
  input.focus()
  notify('已从外部请求填入安装来源，请确认后点击「安装并重启」。')
})

document.querySelector('#plugin-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  const data = new FormData(form)
  const spec = data.get('spec')
  const allowUnknown = data.get('allowUnknown') === 'on'
  const fullAccess = data.get('fullAccess') === 'on'
  await extensionOperations.run(async () => {
    try {
      const result = await window.dshDesktop.installPlugin(spec, allowUnknown, fullAccess)
      notify(`${result.name} 已安装，DSH 已重启`)
      showActivation(`${result.name} 已安装。可立即刷新列表；如扩展界面仍显示旧状态，请完整重启 Harness。`, { mode: result.restartRequired ? 'restart' : 'refresh' })
      form.reset()
      await refresh()
    } catch (error) {
      notify(error.message, true)
    }
  })
})
window.addEventListener('beforeunload', () => {
  removeQqBotEventListener()
  removeProgressListener()
  removeNavigationListener()
  removePresetPreviewListener()
  removePluginPrefillListener?.()
}, { once: true })

pluginList.addEventListener('click', async (event) => {
  const updateButton = event.target.closest('[data-update-plugin]')
  if (updateButton) {
    const allowUnknown = updateButton.dataset.updateCompatibility === 'unknown'
    if (allowUnknown && !window.confirm('该版本没有声明 Desktop/DSH 适配范围，仍要更新吗？失败时会自动回滚。')) return
    await extensionOperations.run(async () => {
      try {
        const result = await window.dshDesktop.updatePlugin(updateButton.dataset.updatePlugin, allowUnknown)
        notify(`${result.name} 已更新至 v${result.version}，DSH 已重启`)
        showActivation(`${result.name} 已更新。刷新以读取新清单；必要时可完整重启 Harness。`, { mode: result.restartRequired ? 'restart' : 'refresh' })
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
      showActivation(`${button.dataset.removePlugin} 已移除。刷新以确认当前扩展状态。`, { mode: 'refresh' })
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

for (const control of [marketQuery, marketCategory, marketSort]) {
  control.addEventListener(control === marketQuery ? 'input' : 'change', () => {
    marketPage = 1
    renderMarket()
  })
}
marketPrevious.addEventListener('click', () => {
  if (!marketView || marketView.page <= 1) return
  marketPage = marketView.page - 1
  renderMarket()
  document.querySelector('#market').scrollIntoView({ block: 'start', behavior: 'smooth' })
})
marketNext.addEventListener('click', () => {
  if (!marketView || marketView.page >= marketView.pages) return
  marketPage = marketView.page + 1
  renderMarket()
  document.querySelector('#market').scrollIntoView({ block: 'start', behavior: 'smooth' })
})
document.querySelector('#market-reload').addEventListener('click', () => {
  void extensionOperations.run(refreshMarket)
})
marketList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-install-market-plugin]')
  if (!button) return
  const pluginId = button.dataset.installMarketPlugin
  if (!pluginId) return
  await extensionOperations.run(async () => {
    const plugin = marketCatalog?.plugins.find((candidate) => candidate.id === pluginId)
    marketInstallPhases.set(pluginId, 'installing')
    renderMarket()
    marketResultState.textContent = `正在安装 ${plugin?.displayName ?? '插件'}，首次构建可能需要一些时间`
    try {
      const result = await window.dshDesktop.installMarketPlugin(pluginId)
      marketInstallPhases.delete(pluginId)
      installedMarketReferences.add(pluginId)
      if (plugin) {
        for (const value of [plugin.name, plugin.npm, plugin.displayName, plugin.installSpec]) {
          if (value) installedMarketReferences.add(value)
        }
      }
      notify(`${result.name} 已安装，DSH 已重启`)
      showActivation(`${result.name} 已安装并通过启动检查，无需再次重启。`, { mode: 'refresh' })
      await refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('was not approved')) marketInstallPhases.delete(pluginId)
      else marketInstallPhases.set(pluginId, 'error')
      renderMarket()
      if (message.includes('was not approved')) notify('已取消安装')
      else notify(message, true)
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
  if (!window.confirm('恢复旧版本停用的全部插件并重启 DSH？')) return
  await extensionOperations.run(async () => {
    try {
      const result = await window.dshDesktop.restoreDisabledPlugins()
      const count = result.restored?.length ?? 0
      notify(count > 0 ? `已恢复 ${count} 个插件，DSH 已重启` : '旧停用状态已清除，DSH 已重启')
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
        showActivation(`${result.skill.name} 已导入。技能 watcher 会自动加载，也可手动刷新确认。`, { mode: 'refresh' })
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
    await Promise.all([refresh(), refreshMarket()])
    await checkPluginUpdates({ silent: true })
  })
})

revokeFullUserTrust.addEventListener('click', async () => {
  if (!window.confirm('撤销主 Runtime 和外来插件的完整权限授权？当前 Runtime 会继续运行，但下次启动会重新请求原生确认。')) return
  await extensionOperations.run(async () => {
    try {
      await window.dshDesktop.revokeFullUserTrust()
      notify('完整权限授权已撤销；下次启动会重新确认')
    } catch (error) {
      notify(error.message, true)
    }
  })
})
document.querySelector('#activation-refresh').addEventListener('click', () => {
  void extensionOperations.run(async () => {
    await refresh()
    await checkPluginUpdates({ silent: true })
    activationBanner.hidden = true
  })
})
restartRuntimeButton.addEventListener('click', () => {
  void extensionOperations.run(async () => {
    try {
      await window.dshDesktop.restartRuntime()
      notify('DeepSeek Harness 已完整重启')
      activationBanner.hidden = true
      await refresh()
    } catch (error) {
      notify(error.message, true)
    }
  })
})
document.querySelector('#export-preset').addEventListener('click', () => {
  void extensionOperations.run(async () => {
    try {
      const result = await window.dshDesktop.exportPreset()
      if (!result.canceled) notify(`Preset 已导出（${result.packages} 个插件，${result.skills} 个技能，跳过 ${result.skipped?.length ?? 0} 项本机或敏感设置）`)
    } catch (error) {
      notify(error.message, true)
    }
  })
})
document.querySelector('#select-preset').addEventListener('click', () => {
  void extensionOperations.run(async () => {
    try {
      const result = await window.dshDesktop.selectPreset()
      if (!result.canceled) renderPresetPlan(result.plan)
    } catch (error) {
      activePresetPlan = undefined
      presetPlanElement.hidden = true
      notify(error.message, true)
    }
  })
})
document.querySelector('#preview-migration').addEventListener('click', () => {
  void extensionOperations.run(async () => {
    try {
      renderMigrationPlan(await window.dshDesktop.previewWebProfileMigration())
    } catch (error) {
      notify(error.message, true)
    }
  })
})
document.querySelector('#apply-migration').addEventListener('click', () => {
  if (!activeMigrationPlan) return
  const names = [...document.querySelectorAll('[data-migration-plugin]:checked')]
    .map((element) => element.dataset.migrationPlugin)
  if (names.length === 0) {
    notify('请选择至少一个可迁移插件', true)
    return
  }
  if (!window.confirm(`将 ${names.length} 个 Web Profile 插件迁移到隔离的 Desktop Profile？`)) return
  void extensionOperations.run(async () => {
    try {
      const result = await window.dshDesktop.applyWebProfileMigration({
        id: activeMigrationPlan.id,
        names,
        allowUnknown: document.querySelector('#migration-allow-unknown').checked,
      })
      notify(`已迁移 ${result.plugins?.length ?? names.length} 个插件和 ${result.configurationFragments ?? 0} 个配置片段`)
      showActivation('Web Profile 的所选插件及相关 Profile 配置已迁移到 Desktop Profile。刷新查看结果；必要时可完整重启 Harness。', { mode: result.restartRequired ? 'restart' : 'refresh' })
      activeMigrationPlan = undefined
      document.querySelector('#migration-plan').hidden = true
      await refresh()
    } catch (error) {
      notify(error.message, true)
    }
  })
})
document.querySelector('#import-preset').addEventListener('click', () => {
  if (!activePresetPlan) return
  if (!document.querySelector('#preset-confirm').checked) {
    notify('请先审阅并勾选导入确认', true)
    return
  }
  if (!window.confirm('应用此 Preset？插件将使用精确版本，任何失败都会恢复旧环境。')) return
  const packages = Object.fromEntries([...document.querySelectorAll('[data-preset-package]')]
    .map((element) => [element.dataset.presetPackage, element.value]))
  const skills = Object.fromEntries([...document.querySelectorAll('[data-preset-skill]')]
    .map((element) => [element.dataset.presetSkill, element.value]))
  const config = Object.fromEntries([...document.querySelectorAll('[data-preset-config]')]
    .map((element) => [element.dataset.presetConfig, element.value]))
  void extensionOperations.run(async () => {
    try {
      const result = await window.dshDesktop.importPreset({
        id: activePresetPlan.id,
        confirmed: true,
        decisions: { packages, skills, ...config },
      })
      notify(`${result.preset.name} 已导入，DSH 已重启`)
      showActivation('Preset 环境已应用。刷新查看清单；如页面状态未同步，可完整重启 Harness。', result.activation)
      activePresetPlan = undefined
      presetPlanElement.hidden = true
      await refresh()
    } catch (error) {
      notify(error.message, true)
    }
  })
})

await extensionOperations.run(refresh)
void refreshMarket()
void extensionOperations.run(() => checkPluginUpdates({ silent: true }))
