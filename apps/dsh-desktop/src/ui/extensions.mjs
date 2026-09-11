import { createExtensionOperationQueue } from './extension-operation-queue.mjs'
import { presetExportFailureMessage } from './preset-export-view.mjs'
import {
  communityMarketInstallPresentation,
  selectCommunityMarketPlugins,
} from './community-market-view.mjs'
import {
  compatibilityDialogPresentation,
  filterInstalledPlugins,
  pluginCardPresentation,
  pluginEmptyPresentation,
  pluginEnvironmentRepairPresentation,
  pluginInstallPresentation,
} from './plugin-management-view.mjs'

const themeQuery = new URLSearchParams(window.location.search).get('theme')
if (themeQuery === 'dark' || themeQuery === 'light') {
  document.documentElement.dataset.dshDesktopTheme = themeQuery
}

const pluginList = document.querySelector('#plugin-list')
const pluginSearch = document.querySelector('#plugin-search')
const pluginDetail = document.querySelector('#plugin-detail')
const pluginInstallSubmit = document.querySelector('#plugin-install-submit')
const pluginInstallState = document.querySelector('#plugin-install-state')
const pluginUpdateSummary = document.querySelector('#plugin-update-summary')
const pluginUpdateSummaryText = document.querySelector('#plugin-update-summary-text')
const updateAllPluginsButton = document.querySelector('#update-all-plugins')
const communityPluginList = document.querySelector('#community-plugin-list')
const skillList = document.querySelector('#skill-list')
const pluginCount = document.querySelector('#plugin-count')
const nativeCount = document.querySelector('#native-count')
const nativeTotal = document.querySelector('#native-total')
const nativeSearch = document.querySelector('#native-search')
const nativePluginGrid = document.querySelector('#native-plugin-grid')
const nativeResultState = document.querySelector('#native-result-state')
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
const marketReloadButton = document.querySelector('#market-reload')
const toast = document.querySelector('#toast')
const pluginDialog = document.querySelector('#plugin-dialog')
const pluginDialogTitle = document.querySelector('#plugin-dialog-title')
const pluginDialogDescription = document.querySelector('#plugin-dialog-description')
const pluginDialogDetails = document.querySelector('#plugin-dialog-details')
const pluginDialogDetailText = document.querySelector('#plugin-dialog-detail-text')
const pluginDialogCancel = document.querySelector('#plugin-dialog-cancel')
const pluginDialogConfirm = document.querySelector('#plugin-dialog-confirm')
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
const networkDiagnosticResults = document.querySelector('#network-diagnostic-results')
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
let marketRefreshPromise
let pluginUpdatePromise
let refreshAllPromise
let cachedPlugins = []
let activePluginName
const PLUGIN_SETTINGS_KEY = 'dsh-plugin-settings-v1'
const pluginSettings = { autoUpdate: false, askUnknown: true, developerMode: false }
try {
  Object.assign(pluginSettings, JSON.parse(localStorage.getItem(PLUGIN_SETTINGS_KEY) ?? '{}'))
} catch { /* use safe defaults */ }

function syncPluginSettings() {
  document.querySelector('#plugin-auto-update').checked = pluginSettings.autoUpdate === true
  document.querySelector('#plugin-ask-unknown').checked = pluginSettings.askUnknown !== false
  document.querySelector('#plugin-developer-mode').checked = pluginSettings.developerMode === true
  document.querySelector('#plugin-developer-tools').hidden = pluginSettings.developerMode !== true
}

function savePluginSettings() {
  try { localStorage.setItem(PLUGIN_SETTINGS_KEY, JSON.stringify(pluginSettings)) } catch { /* optional setting persistence */ }
  syncPluginSettings()
}

const MARKET_PAGE_SIZE = 20
const compactNumber = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 })

function formatFileSize(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function setOperationBusy(busy) {
  document.body.dataset.busy = String(busy)
  document.body.setAttribute('aria-busy', String(busy))
  for (const button of document.querySelectorAll('[data-mutation-control], [data-update-plugin], [data-remove-plugin], [data-toggle-plugin], [data-install-market-plugin]')) button.disabled = busy
  marketReloadButton.disabled = busy || Boolean(marketRefreshPromise)
  checkPluginUpdatesButton.disabled = busy || Boolean(pluginUpdatePromise)
  refreshButton.disabled = busy || Boolean(refreshAllPromise)
  if (!busy) syncMarketPaginationState()
}

const extensionOperations = createExtensionOperationQueue({ onBusyChange: setOperationBusy })

function escapeHtml(value) {
  const element = document.createElement('span')
  element.textContent = String(value)
  return element.innerHTML
}

function notify(message, error = false, action = undefined) {
  toast.replaceChildren()
  const text = document.createElement('span')
  text.textContent = message
  toast.append(text)
  if (action?.label && typeof action.run === 'function') {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'toast-action'
    button.textContent = action.label
    button.addEventListener('click', action.run, { once: true })
    toast.append(button)
  }
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
    'known-native-image-drop-conflict': `已验证${subject}会抢占原生图片拖放事件；保留安装状态，请移除或改用后续经验证版本`,
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

function pluginStatusMarkup(plugin) {
  const presentation = pluginCardPresentation(plugin)
  if (presentation.label === '') return ''
  return `<span class="plugin-status ${presentation.tone}">${escapeHtml(presentation.label)}</span>`
}

function pluginMarkup(plugin) {
  return `<article class="plugin-card" data-plugin-status="${escapeHtml(plugin.status ?? 'normal')}"><button type="button" class="plugin-card-main" data-open-plugin="${escapeHtml(plugin.name)}" aria-label="查看 ${escapeHtml(plugin.displayName ?? plugin.name)}"><span class="plugin-card-icon">${nativeIconSvg('sparkles')}</span><span class="plugin-card-copy"><span class="plugin-card-title-row"><strong>${escapeHtml(plugin.displayName ?? plugin.name)}</strong>${pluginStatusMarkup(plugin)}</span><span class="plugin-card-description">${escapeHtml(plugin.description ?? '此插件暂未提供说明。')}</span><span class="plugin-card-publisher">${escapeHtml(plugin.publisher ?? '社区作者')}</span></span></button></article>`
}

function pluginDetailMarkup(plugin) {
  const compatibility = plugin.compatibility?.status ?? plugin.advanced?.compatibility ?? 'unknown'
  const compatibilityText = compatibilityLabels[compatibility] ?? compatibilityLabels.unknown
  const facts = compatibilityFacts(plugin.compatibility)
  const updateLine = plugin.updateBlocked
    ? '<span class="plugin-detail-warning">新版本暂不兼容，当前版本仍可继续使用。</span>'
    : plugin.updateAvailable
      ? `<button type="button" class="primary" data-update-plugin="${escapeHtml(plugin.name)}" data-update-compatibility="${escapeHtml(plugin.updateCompatibility?.status ?? 'unknown')}" data-mutation-control>更新到 v${escapeHtml(plugin.latestVersion ?? '')}</button>`
      : '<span class="meta">已是当前可用版本</span>'
  const attention = plugin.attention
    ? `<section class="plugin-attention"><strong>${escapeHtml(plugin.statusLabel || '需要处理')}</strong><p>${escapeHtml(plugin.attention)}</p></section>`
    : ''
  const permissions = plugin.permissions?.length
    ? plugin.permissions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
    : '<li>未声明额外权限</li>'
  return `<button type="button" class="plugin-detail-back" data-close-plugin-detail aria-label="返回已安装插件">返回</button><header class="plugin-detail-header"><span class="plugin-detail-icon">${nativeIconSvg('sparkles')}</span><div><h2>${escapeHtml(plugin.displayName ?? plugin.name)}</h2><p>${escapeHtml(plugin.publisher ?? '社区作者')}</p></div></header><p class="plugin-detail-description">${escapeHtml(plugin.description ?? '此插件暂未提供说明。')}</p>${attention}<label class="plugin-enable-row"><span><strong>启用插件</strong><small>${plugin.enabled ? '插件当前已启用' : '插件当前已停用'}</small></span><input type="checkbox" role="switch" data-toggle-plugin="${escapeHtml(plugin.name)}"${plugin.enabled ? ' checked' : ''} data-mutation-control></label><dl class="plugin-detail-facts"><div><dt>版本</dt><dd>${escapeHtml(plugin.version ? `v${plugin.version}` : '未知')}</dd></div><div><dt>更新</dt><dd>${updateLine}</dd></div><div><dt>权限</dt><dd><ul>${permissions}</ul></dd></div></dl><button type="button" class="plugin-uninstall" data-remove-plugin="${escapeHtml(plugin.name)}" data-mutation-control>卸载插件</button><details class="plugin-advanced-information"><summary>高级信息</summary><dl><div><dt>Compatibility</dt><dd>${escapeHtml(compatibilityText)}</dd></div><div><dt>Runtime Range</dt><dd>${escapeHtml(plugin.advanced?.runtimeRange ?? '未声明')}</dd></div><div><dt>Source</dt><dd>${escapeHtml(plugin.advanced?.source ?? plugin.requested ?? '未知')}</dd></div><div><dt>Package Name</dt><dd>${escapeHtml(plugin.name)}</dd></div><div><dt>Integrity</dt><dd>${escapeHtml(plugin.advanced?.integrity ?? '由安装事务校验')}</dd></div></dl>${facts.length ? `<p>${escapeHtml(facts.join(' · '))}</p>` : ''}</details>`
}

const NATIVE_PLUGINS = [
  {
    id: 'value-mode',
    name: '性价比模式 (Value Mode)',
    packageName: '@linxin666/dsh-value-mode',
    category: 'ai',
    categoryLabel: 'AI 核心',
    description: '智能专家主控与副模型子代理分流调度，在保证深度思考质量的同时显著降低 Token 消耗。',
    features: ['专家双模调度', '动态 Token 节约', '开箱即用'],
    icon: 'sparkles',
  },
  {
    id: 'memory',
    name: '长期记忆持久化 (Memory)',
    packageName: '@ningbainb/dsh-memory',
    category: 'ai',
    categoryLabel: 'AI 核心',
    description: '当前用户本机长期事实与偏好记忆持久化，支持跨会话语义注入与敏感信息自动拦截。',
    features: ['用户隔离', '显式确认', '凭据拦截'],
    icon: 'brain',
  },
  {
    id: 'personal-prompt',
    name: '回复偏好',
    packageName: '@ningbainb/dsh-personal-prompt',
    category: 'ai',
    categoryLabel: 'AI 核心',
    description: '本地多 Profile 提示词配置管理，按工作区与全局作用域自动注入模型请求上下文。',
    features: ['Profile 切换', '上下文注入', '工作区隔离'],
    icon: 'text',
  },
  {
    id: 'model-preferences',
    name: '模型偏好与选择器',
    packageName: '@linxin666/dsh-client-ui-model-preferences',
    category: 'ai',
    categoryLabel: 'AI 核心',
    description: '自定义供应商排序、模型自定义钉选与一键模型切换器。',
    features: ['自定义排序', '快捷钉选', '供应商分组'],
    icon: 'sliders',
  },
  {
    id: 'reasoning-slider',
    name: '思考强度控制滑块',
    packageName: 'reasoning-slider',
    category: 'ai',
    categoryLabel: 'AI 核心',
    description: '为支持思考过程的模型提供直观的思考算力强度与上下文预算无级微调。',
    features: ['实时算力调节', '思考预算控制', '原生响应'],
    icon: 'gauge',
  },
  {
    id: 'describe-image',
    name: '多模态图像描述',
    packageName: '@linxin666/dsh-tool-describe-image',
    category: 'ai',
    categoryLabel: 'AI 核心',
    description: '调用多模态视觉能力解析图片内容，生成高精结构化描述与多模态交互。',
    features: ['图生文', '本地图像识别', '结构化标签'],
    icon: 'image',
  },
  {
    id: 'desktop-compat',
    name: '桌面原生兼容层',
    packageName: '@linxin666/dsh-desktop-compat',
    category: 'system',
    categoryLabel: '运行守护',
    description: '深度对接 Windows/macOS 系统原生文件、受信任工作区打开与后台排程服务。',
    features: ['安全路径白名单', '后台排程', '上下文修复'],
    icon: 'shield',
  },
  {
    id: 'desktop-repair',
    name: '环境自愈与故障隔离',
    packageName: '@linxin666/dsh-desktop-repair',
    category: 'system',
    categoryLabel: '运行守护',
    description: '三层启动防死锁与配置自愈引擎，异常时自动安全隔离并支持配置快照一键回滚。',
    features: ['防死锁自愈', '配置快照', '零感知恢复'],
    icon: 'heart-pulse',
  },
  {
    id: 'user-scope',
    name: '用户作用域与安全守卫',
    packageName: '@ningbainb/dsh-user-scope',
    category: 'system',
    categoryLabel: '运行守护',
    description: '本地回环通信身份校验，保障多用户配置隔离、敏感 Token 与工作区私密安全。',
    features: ['回环隔离', '主体校验', '零泄露防护'],
    icon: 'lock',
  },
  {
    id: 'dsh-base',
    name: 'DSH 桌面核心基座',
    packageName: '@deepseek-ai/dsh-base',
    category: 'system',
    categoryLabel: '运行守护',
    description: 'Cordis 微内核生命周期控制、插件依赖注入总线与高吞吐 IPC 通道。',
    features: ['Cordis 内核', '生命周期守护', '高性能通信'],
    icon: 'cpu',
  },
  {
    id: 'live-stats',
    name: '实时监控看板',
    packageName: '@linxin666/dsh-live-stats',
    category: 'system',
    categoryLabel: '运行守护',
    description: '毫秒级跟踪模型请求延迟、Token 吞吐速度与会话开销分析。',
    features: ['毫秒吞吐', 'Token 统计', '网络延迟监控'],
    icon: 'activity',
  },
  {
    id: 'qqbot',
    name: 'QQ 机器人官方接入',
    packageName: '@tencent-connect/dsh-qqbot',
    category: 'tools',
    categoryLabel: '工具协同',
    description: '腾讯官方 QQ Bot 协议驱动，支持扫码绑定私聊与群聊并双向流式收发消息。',
    features: ['官方驱动', '安全凭据加密', '扫码一键绑定'],
    icon: 'message',
  },
  {
    id: 'remote-web-ui',
    name: '远程移动配对控制',
    packageName: '@linxin666/dsh-remote-web-ui',
    category: 'tools',
    categoryLabel: '工具协同',
    description: '局域网加密配对与手机端快捷控制台，手机扫码即可随时查看进度与发出指令。',
    features: ['手机即开即用', '局域网极速直连', '安全令牌授权'],
    icon: 'smartphone',
  },
  {
    id: 'ssh',
    name: 'SSH 远程开发',
    packageName: '@linxin666/dsh-ssh',
    category: 'tools',
    categoryLabel: '工具协同',
    description: '轻量管理远程 Linux 主机认证与会话，直接在桌面端穿透操作远程开发环境。',
    features: ['免密登录', '远程会话', '通道加密'],
    icon: 'terminal',
  },
  {
    id: 'git-graph',
    name: 'Git 分支图谱',
    packageName: '@linxin666/dsh-git-graph',
    category: 'tools',
    categoryLabel: '工具协同',
    description: '当前工作区 Git 提交历史的可视化分支树，支持分支比对与提交详情检查。',
    features: ['分支树可视化', '提交历史溯源', '无需外部工具'],
    icon: 'git-branch',
  },
  {
    id: 'task-board',
    name: '任务看板与工作流',
    packageName: '@linxin666/dsh-task-board',
    category: 'tools',
    categoryLabel: '工具协同',
    description: '多工作区任务泳道与进度状态卡片，支持与 Worktree 及后台自动化执行联动。',
    features: ['泳道看板', '多任务协同', '自动化关联'],
    icon: 'layout',
  },
  {
    id: 'aionui-panel',
    name: 'AionUI 多端控制面板',
    packageName: '@linxin666/dsh-client-ui-aionui-panel',
    category: 'tools',
    categoryLabel: '工具协同',
    description: '多端统一管理侧边面板，支持跨端会话监控与统一交互入口。',
    features: ['多端管理', '侧边面板', '快速呼出'],
    icon: 'panel',
  },
  {
    id: 'particle-theme',
    name: '动态粒子交互背景',
    packageName: '@linxin666/dsh-particle-theme',
    category: 'ui',
    categoryLabel: '界面主题',
    description: '基于 Canvas 与 WebGL 的流体交互粒子背景，鼠标引力跟随与主题色系联动。',
    features: ['GPU 加速', '粒子引力互动', '主题自适应'],
    icon: 'sparkle',
  },
  {
    id: 'skin-center',
    name: '皮肤中心主题库',
    packageName: '@linxin666/dsh-client-ui-skin-center',
    category: 'ui',
    categoryLabel: '界面主题',
    description: '内置 15 套涵盖二次元、复古、赛博与金融风格的深度定制主题，一键试穿。',
    features: ['15套专属主题', '即时试穿', '沉浸式视效'],
    icon: 'palette',
  },
  {
    id: 'pet',
    name: '桌面桌宠挂件',
    packageName: '@linxin666/dsh-pet',
    category: 'ui',
    categoryLabel: '界面主题',
    description: '呆萌桌面互动桌宠，陪伴编码会话，支持轻触反馈与不同心情动态动作。',
    features: ['动态动作', '交互反馈', '低内存占用'],
    icon: 'smile',
  },
  {
    id: 'mode-switcher',
    name: '交互模式切换器',
    packageName: '@linxin666/dsh-mode-switcher',
    category: 'ui',
    categoryLabel: '界面主题',
    description: '极简专注模式与专家全功能模式间的一键切换，适应不同开发场景。',
    features: ['双模切换', '界面精简', '快捷响应'],
    icon: 'toggle',
  },
  {
    id: 'liangshen',
    name: '量身定制体验',
    packageName: '@linxin666/dsh-liangshen',
    category: 'ui',
    categoryLabel: '界面主题',
    description: '支持个人按需定制快捷操作与交互行为注入。',
    features: ['个性化定制', '快捷通道', '深度拓展'],
    icon: 'user-check',
  },
]

function nativeIconSvg(icon) {
  const icons = {
    sparkles: '<path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4z"/>',
    brain: '<path d="M9.5 2A4.5 4.5 0 0 0 5 6.5a4.5 4.5 0 0 0 .5 2 4.5 4.5 0 0 0-.5 2 4.5 4.5 0 0 0 4.5 4.5h.5v5a2 2 0 0 0 4 0v-5h.5a4.5 4.5 0 0 0 4.5-4.5 4.5 4.5 0 0 0-.5-2 4.5 4.5 0 0 0 .5-2A4.5 4.5 0 0 0 14.5 2c-1.5 0-2.8.7-3.6 1.8A4.5 4.5 0 0 0 9.5 2z"/>',
    text: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
    sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    gauge: '<circle cx="12" cy="12" r="9"/><path d="M12 12l3-3"/><path d="M8 12a4 4 0 0 1 8 0"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    'heart-pulse': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
    activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    smartphone: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
    'git-branch': '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
    layout: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
    panel: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/>',
    sparkle: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    palette: '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
    smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
    toggle: '<rect x="1" y="5" width="22" height="14" rx="7" ry="7"/><circle cx="16" cy="12" r="3"/>',
    'user-check': '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>',
  }
  const content = icons[icon] ?? icons.sparkles
  return `<svg class="native-card-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${content}</svg>`
}

function nativePluginMarkup(item, installedPlugin) {
  const version = installedPlugin?.version ? `v${installedPlugin.version}` : '内置'
  const settingsLink = ['value-mode', 'personal-prompt', 'memory', 'particle-theme', 'describe-image'].includes(item.id) ? `<button type="button" class="secondary" data-open-dock-setting="${escapeHtml(item.id)}">打开设置</button>` : ''
  const featuresHtml = item.features.map((f) => `<span class="native-feature-tag">${escapeHtml(f)}</span>`).join('')
  return `<article class="native-card" data-category="${escapeHtml(item.category)}" data-id="${escapeHtml(item.id)}"><div class="native-card-header"><div class="native-card-icon-wrap">${nativeIconSvg(item.icon)}</div><div class="native-card-title-group"><div class="native-card-name-row"><h3 class="native-card-title">${escapeHtml(item.name)}</h3><span class="badge builtin">原生内置</span></div><span class="native-package-name">${escapeHtml(item.packageName)}</span></div></div><p class="native-card-desc">${escapeHtml(item.description)}</p><div class="native-features-row">${featuresHtml}</div><div class="native-card-footer"><div class="native-status-pill"><span class="status-dot"></span><span>随桌面版维护 (${escapeHtml(version)})</span></div>${settingsLink}<span class="native-safe-badge" title="受保护的桌面级原生能力">内置</span></div></article>`
}

let currentNativeCategory = 'all'
let cachedInstalledPlugins = []

function renderNativePlugins(installedPlugins = cachedInstalledPlugins) {
  if (installedPlugins) cachedInstalledPlugins = installedPlugins
  if (!nativePluginGrid) return
  const pluginMap = new Map((cachedInstalledPlugins || []).map((p) => [p.name, p]))
  const q = (nativeSearch?.value || '').trim().toLowerCase()

  const filtered = NATIVE_PLUGINS.filter((item) => {
    if (currentNativeCategory !== 'all' && item.category !== currentNativeCategory) return false
    if (!q) return true
    const haystack = `${item.name} ${item.packageName} ${item.description} ${item.features.join(' ')}`.toLowerCase()
    return haystack.includes(q)
  })

  if (nativeTotal) nativeTotal.textContent = NATIVE_PLUGINS.length
  if (nativeCount) nativeCount.textContent = NATIVE_PLUGINS.length
  if (nativeResultState) {
    nativeResultState.textContent = filtered.length === NATIVE_PLUGINS.length
      ? `已加载全部 ${NATIVE_PLUGINS.length} 项原生核心能力`
      : `找到 ${filtered.length} 项原生能力`
  }

  nativePluginGrid.innerHTML = filtered.length
    ? filtered.map((item) => nativePluginMarkup(item, pluginMap.get(item.packageName))).join('')
    : '<p class="native-empty">未搜索到匹配的原生核心能力</p>'
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

function refreshMarket({ force = false } = {}) {
  if (marketRefreshPromise) return marketRefreshPromise
  const previousCatalog = marketCatalog
  marketReloadButton.disabled = true
  marketResultState.textContent = '正在读取社区目录'
  marketRefreshPromise = (async () => {
    try {
      const catalog = await window.dshDesktop.listCommunityMarket(force)
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
      if (previousCatalog) {
        marketCatalog = previousCatalog
        renderMarket()
        marketResultState.textContent = '目录刷新失败，继续显示本机缓存'
        return
      }
      marketCatalog = undefined
      marketView = undefined
      marketCount.textContent = '--'
      marketTotal.textContent = '--'
      marketUpdated.textContent = '--'
      marketResultState.textContent = '社区目录暂时不可用'
      marketList.innerHTML = `<p class="market-empty">${escapeHtml(error.message)}</p>`
      marketPagination.hidden = true
    } finally {
      marketRefreshPromise = undefined
      marketReloadButton.disabled = extensionOperations.busy
    }
  })()
  return marketRefreshPromise
}

function normalizedErrorMessage(error) {
  return String(error?.message ?? error)
    .replace(/^Error invoking remote method '[^']+': Error:\s*/u, '')
    .slice(0, 2_000)
}

function showPluginDialog({ title, description, details = '', confirmLabel = '继续', cancelLabel = '取消', cancelHidden = false, returnValue = false }) {
  pluginDialogTitle.textContent = title
  pluginDialogDescription.textContent = description
  pluginDialogDetails.hidden = details === ''
  pluginDialogDetails.open = false
  pluginDialogDetailText.textContent = details
  pluginDialogConfirm.textContent = confirmLabel
  pluginDialogCancel.textContent = cancelLabel
  pluginDialogCancel.hidden = cancelHidden
  pluginDialog.showModal()
  pluginDialogConfirm.focus()
  return new Promise((resolve) => {
    const onClose = () => {
      pluginDialog.removeEventListener('close', onClose)
      resolve(returnValue ? pluginDialog.returnValue : pluginDialog.returnValue === 'confirm')
    }
    pluginDialog.addEventListener('close', onClose)
  })
}

pluginDialog.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    pluginDialog.close('dismiss')
    return
  }
  if (event.key !== 'Tab') return
  const controls = [...pluginDialog.querySelectorAll('button:not([hidden]), summary, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.disabled)
  if (controls.length === 0) return
  const first = controls[0]
  const last = controls.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
})

function showPluginFailure(error, fallback = '插件安装失败') {
  const details = normalizedErrorMessage(error)
  const incompatible = details.includes('此插件暂不兼容') || error?.code === 'PLUGIN_INCOMPATIBLE'
  if (incompatible) {
    const presentation = compatibilityDialogPresentation('incompatible')
    return showPluginDialog({
      ...presentation,
      details,
    })
  }
  notify(fallback, true, {
    label: '查看',
    run: () => { void showPluginDialog({ title: fallback, description: '原有插件环境没有改变。', details, confirmLabel: '知道了', cancelHidden: true }) },
  })
  return Promise.resolve(false)
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

const networkSurfaceLabels = Object.freeze({
  api: '模型 API',
  update: '应用更新',
  market: '社区目录',
  pluginRegistry: 'NPM 清单',
  pluginInstaller: '插件安装子进程',
})

const networkStatusLabels = Object.freeze({
  reachable: '可连接',
  blocked: '不可连接',
  'not-probed': '未探测',
})

const networkReasonLabels = Object.freeze({
  'proxy-authentication-required': '代理需要认证',
  timeout: '检查超时，连接已重置',
  'dns-failed': 'DNS 解析失败',
  unreachable: '连接失败',
  'endpoint-http-error': '目标返回异常状态',
  'official-provider-endpoint-not-exposed': '官方 Provider 未向 Desktop 暴露当前 API 探测端点',
  'pnpm-child-runs-only-during-user-install': '仅在用户确认安装时启动，不执行额外安装探测',
  'pnpm-proxy-transport-unverified': '当前代理模式无法映射到 pnpm 子进程',
})

function networkDiagnosticMarkup(key, result) {
  const connectivity = result?.connectivity ?? {}
  const status = networkStatusLabels[connectivity.status] ?? '未知'
  const reason = networkReasonLabels[connectivity.reason]
  const elapsed = Number.isFinite(connectivity.elapsedMs) ? `，${Math.max(0, Math.round(connectivity.elapsedMs))} ms` : ''
  const configuration = result?.configuration?.summary ?? '未提供配置摘要'
  return `<article class="item"><div><div class="name-row"><span class="name">${escapeHtml(networkSurfaceLabels[key] ?? key)}</span><span class="badge${connectivity.status === 'blocked' ? ' inactive' : ''}">${escapeHtml(status)}</span></div><p class="description">${escapeHtml(`${reason ?? '检查完成'}${elapsed}`)}</p><p class="recovery-time">${escapeHtml(configuration)}</p></div></article>`
}

function renderNetworkDiagnostics(results) {
  networkDiagnosticResults.innerHTML = Object.entries(networkSurfaceLabels)
    .map(([key]) => networkDiagnosticMarkup(key, results?.[key]))
    .join('')
}

async function refreshRecovery() {
  const state = await window.dshDesktop.getPluginRecoveryState()
  recoveryCount.textContent = state.incidents.length
  recoveryCount.hidden = state.incidents.length === 0
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
  document.querySelector('#plugin-environment-repair').hidden = !pluginEnvironmentRepairPresentation(state).visible
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
    renderNativePlugins(inventory.plugins)
    skillList.innerHTML = inventory.skills.length ? inventory.skills.map(skillMarkup).join('') : '<p class="empty">尚未发现技能</p>'
    renderMarket()
    if (extensionOperations.busy) setOperationBusy(true)
  } catch (error) {
    notify(error.message, true)
  }
}

function renderPlugins(plugins) {
  cachedPlugins = plugins
  const communityPlugins = filterInstalledPlugins(plugins)
  const query = pluginSearch.value
  const visiblePlugins = filterInstalledPlugins(plugins, query)
  const empty = pluginEmptyPresentation({ installedCount: communityPlugins.length, query })
  pluginCount.textContent = communityPlugins.length
  pluginList.innerHTML = visiblePlugins.length
    ? visiblePlugins.map(pluginMarkup).join('')
    : `<div class="plugin-empty"><strong>${escapeHtml(empty.title)}</strong><p>${escapeHtml(empty.description)}</p>${empty.action ? `<button type="button" class="primary" data-open-discover>${escapeHtml(empty.action)}</button>` : ''}</div>`
  const available = communityPlugins.filter((plugin) => plugin.updateAvailable && !plugin.updateBlocked)
  pluginUpdateSummary.hidden = available.length === 0
  pluginUpdateSummaryText.textContent = `${available.length} 个插件有更新`
  updateAllPluginsButton.dataset.updateNames = available.map((plugin) => plugin.name).join('\n')
  if (activePluginName) {
    const active = communityPlugins.find((plugin) => plugin.name === activePluginName)
    if (active) pluginDetail.innerHTML = pluginDetailMarkup(active)
    else closePluginDetail()
  }
  if (extensionOperations.busy) setOperationBusy(true)
}

function openPluginDetail(name) {
  const plugin = cachedPlugins.find((item) => item.name === name && !item.builtIn)
  if (!plugin) return
  activePluginName = name
  pluginDetail.innerHTML = pluginDetailMarkup(plugin)
  pluginList.hidden = true
  pluginSearch.closest('label').hidden = true
  pluginUpdateSummary.hidden = true
  document.querySelector('#install-plugin').hidden = true
  document.querySelector('.plugin-tools').hidden = true
  pluginDetail.hidden = false
  pluginDetail.querySelector('[data-close-plugin-detail]')?.focus()
}

function closePluginDetail() {
  activePluginName = undefined
  pluginDetail.hidden = true
  pluginDetail.replaceChildren()
  pluginList.hidden = false
  pluginSearch.closest('label').hidden = false
  document.querySelector('#install-plugin').hidden = false
  document.querySelector('.plugin-tools').hidden = false
  renderPlugins(cachedPlugins)
  pluginSearch.focus()
}

async function updatePluginBatch(plugins, { allowUnknown = false } = {}) {
  if (plugins.length === 0) return undefined
  return extensionOperations.run(async () => {
    const result = await window.dshDesktop.installPluginBatch(
      plugins.map((plugin) => `${plugin.name}@${plugin.latestVersion}`),
      allowUnknown,
    )
    notify(plugins.length === 1 ? '插件已更新' : `${plugins.length} 个插件已更新`)
    await refresh()
    return result
  })
}

function checkPluginUpdates({ silent = false, skipAutoUpdate = false } = {}) {
  if (pluginUpdatePromise) return pluginUpdatePromise
  checkPluginUpdatesButton.disabled = true
  pluginUpdateState.textContent = '正在检查社区插件更新…'
  pluginUpdatePromise = (async () => {
    try {
      const plugins = await window.dshDesktop.checkPluginUpdates()
      renderPlugins(plugins)
      const available = plugins.filter((plugin) => plugin.updateAvailable).length
      pluginUpdateState.textContent = available > 0
        ? `发现 ${available} 个社区插件更新；不兼容版本已拦截。`
        : '社区插件已检查；内置插件随 Desktop 更新。'
      if (!silent) notify(available > 0 ? `发现 ${available} 个插件更新` : '插件已是最新状态')
      const automatic = plugins.filter((plugin) => plugin.updateAvailable && plugin.updateCompatibility?.status === 'compatible')
      if (!skipAutoUpdate && pluginSettings.autoUpdate && automatic.length > 0) {
        pluginUpdateState.textContent = `正在安全更新 ${automatic.length} 个插件…`
        await updatePluginBatch(automatic)
      }
    } catch (error) {
      pluginUpdateState.textContent = '插件更新源暂时不可用，已安装版本未改变。'
      if (!silent) notify(error.message, true)
    } finally {
      pluginUpdatePromise = undefined
      checkPluginUpdatesButton.disabled = extensionOperations.busy
    }
  })()
  return pluginUpdatePromise
}

pluginSearch.addEventListener('input', () => renderPlugins(cachedPlugins))

updateAllPluginsButton.addEventListener('click', async () => {
  const names = new Set(updateAllPluginsButton.dataset.updateNames?.split('\n').filter(Boolean) ?? [])
  const plugins = cachedPlugins.filter((plugin) => names.has(plugin.name) && plugin.updateAvailable && !plugin.updateBlocked)
  const unknown = plugins.some((plugin) => plugin.updateCompatibility?.status === 'unknown')
  if (unknown && !await confirmUnknownCompatibility('所有更新会作为一个整体应用；任何一项失败都会保留当前版本。')) return
  try {
    await updatePluginBatch(plugins, { allowUnknown: unknown })
    await checkPluginUpdates({ silent: true, skipAutoUpdate: true })
  } catch (error) {
    await showPluginFailure(error, '插件更新失败')
  }
})

for (const [id, key] of [
  ['plugin-auto-update', 'autoUpdate'],
  ['plugin-ask-unknown', 'askUnknown'],
  ['plugin-developer-mode', 'developerMode'],
]) {
  document.querySelector(`#${id}`).addEventListener('change', (event) => {
    pluginSettings[key] = event.currentTarget.checked
    savePluginSettings()
  })
}
syncPluginSettings()

document.querySelector('#repair-plugin-environment').addEventListener('click', () => {
  document.querySelector('#reset-profile-env').click()
})
document.querySelector('#developer-runtime-info').addEventListener('click', async () => {
  try {
    const info = await window.dshDesktop.getInfo()
    document.querySelector('#developer-result').textContent = `Desktop ${info?.version ?? '未知'} · Runtime ${info?.runtimeVersion ?? info?.runtime ?? '由 Desktop 管理'}`
  } catch (error) {
    document.querySelector('#developer-result').textContent = normalizedErrorMessage(error)
  }
})
document.querySelector('#developer-export-diagnostics').addEventListener('click', () => {
  document.querySelector('#export-diagnostics').click()
})
document.querySelector('#developer-open-profile').addEventListener('click', async () => {
  try { await window.dshDesktop.openProfileDirectory() } catch (error) { await showPluginFailure(error, '无法打开依赖环境') }
})
document.querySelector('#developer-open-logs').addEventListener('click', async () => {
  try { await window.dshDesktop.openLogs() } catch (error) { await showPluginFailure(error, '无法打开日志') }
})
document.querySelector('#developer-copy-environment').addEventListener('click', async () => {
  try {
    const info = await window.dshDesktop.getInfo()
    const payload = JSON.stringify({
      desktopVersion: info?.version,
      runtimeVersion: info?.runtimeVersion ?? info?.runtime,
      platform: info?.platform,
    }, null, 2)
    await navigator.clipboard.writeText(payload)
    notify('环境信息已复制')
  } catch (error) {
    await showPluginFailure(error, '复制环境信息失败')
  }
})

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

// Reuse the product's existing icon set across both navigation and catalog.
const navigationIcons = { 'relay-tab': 'sliders', 'value-mode-tab': 'cpu', 'personal-prompt-tab': 'user-check', 'describe-image-tab': 'image', 'plugins-hub-tab': 'layout', 'skills-tab': 'sparkles', 'qqbot-tab': 'message', 'particle-theme-tab': 'palette', 'backup-tab': 'git-branch', 'recovery-tab': 'activity' }
for (const [id, icon] of Object.entries(navigationIcons)) document.querySelector(`#${id} .tab-title`)?.insertAdjacentHTML('afterbegin', nativeIconSvg(icon))
const tabs = Array.from(document.querySelectorAll('[data-tab]'))
let settingsRequest = 0
let activeSettingsTab
const groupTitles = {
  plugins: ['扩展能力', '插件'], skills: ['扩展能力', '技能'], qqbot: ['扩展能力', 'QQ 机器人'],
  backup: ['维护与迁移', '备份与迁移'], recovery: ['维护与迁移', '诊断与恢复'],
}
function activateTab(tab, focus = false, settingOverride) {
  try { localStorage.setItem('dsh-dock-tab', tab.id) } catch { /* storage may be unavailable */ }
  const request = ++settingsRequest
  const setting = settingOverride ?? tab.dataset.setting
  activeSettingsTab = setting ? tab : undefined
  document.querySelector('#workspace-heading').hidden = Boolean(setting)
  document.querySelector('.content-toolbar').hidden = Boolean(setting)
  for (const nav of document.querySelectorAll('[data-tab-group]')) nav.hidden = nav.dataset.tabGroup !== tab.dataset.group
  const [group, title] = groupTitles[tab.dataset.group] ?? ['', '']
  document.querySelector('#workspace-breadcrumb').textContent = group
  document.querySelector('#workspace-title').textContent = title
  document.querySelector('main').scrollTop = 0
  try { localStorage.setItem('dsh-dock-setting', setting ?? '') } catch { /* optional navigation state */ }
  const settingState = document.querySelector('#dock-settings-state')
  const settingRetry = document.querySelector('#dock-settings-retry')
  document.querySelector('#dock-settings').setAttribute('aria-labelledby', tab.id)
  settingState.textContent = '正在加载设置…'
  settingState.hidden = !setting
  settingRetry.hidden = true
  void Promise.resolve(window.dshDesktop.selectDockSetting?.(setting ?? null)).then(() => {
    if (request === settingsRequest) settingState.hidden = true
  }).catch(error => {
    if (request === settingsRequest) {
      settingState.hidden = false
      settingState.textContent = error.message || '设置加载失败，请重试。'
      settingRetry.hidden = false
    }
  })
  for (const item of tabs) {
    const active = item.closest('.settings-sidebar')
      ? item.dataset.group === tab.dataset.group
      : item.dataset.tab === tab.dataset.tab
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
document.querySelector('#dock-settings-retry').addEventListener('click', () => {
  if (activeSettingsTab) activateTab(activeSettingsTab)
})

for (const tab of tabs) {
  tab.addEventListener('click', () => { activateTab(tab) })
  tab.addEventListener('keydown', (event) => {
    const peers = [...tab.closest('[role="tablist"]').querySelectorAll('[data-tab]')]
    const index = peers.indexOf(tab)
    let nextIndex
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (index + 1) % peers.length
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = (index - 1 + peers.length) % peers.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = peers.length - 1
    if (nextIndex === undefined) return
    event.preventDefault()
    activateTab(peers[nextIndex], true)
  })
}
const searchEntries = [
  ['模型接入', '供应商 bai 中转站 登录 账号 充值 API Key', 'relay-tab'],
  ['模型协作', '性价比模式 Value Mode 主控 执行模型 成本 策略', 'value-mode-tab'],
  ['回复偏好', '个人偏好 Prompt 提示词 全局 工作区', 'personal-prompt-tab', 'personal-prompt'],
  ['记忆', '个人偏好 本地记忆 待确认建议', 'personal-prompt-tab', 'memory'],
  ['图像理解', '视觉模型 图片 端点', 'describe-image-tab'],
  ['已安装插件', '社区扩展 更新 卸载 本地目录', 'plugins-tab'],
  ['发现插件', '插件市场 社区 群友作品', 'market-tab'],
  ['插件设置', '自动更新 未知兼容 开发者 内置能力', 'plugin-settings-tab'],
  ['技能', '导入技能 Skill', 'skills-tab'],
  ['QQ 机器人', '绑定 扫码', 'qqbot-tab'],
  ['外观与动效', '鲸鱼粒子 主题', 'particle-theme-tab'],
  ['环境预设', '备份 导入 导出 Preset', 'presets-tab'],
  ['对话导入', 'Claude Codex 历史', 'conversation-tab'],
  ['旧配置迁移', 'Web Profile', 'migration-tab'],
  ['诊断与恢复', '故障 隔离 网络 检查 重置', 'recovery-tab'],
]
const dockSearch = document.querySelector('#dock-search')
const searchResults = document.querySelector('#dock-search-results')
const sidebarNavigation = document.querySelector('.settings-sidebar > nav')
function resetFeatureSearch() {
  searchResults.hidden = true
  dockSearch.value = ''
  sidebarNavigation.hidden = false
}
dockSearch.addEventListener('input', () => {
  const query = dockSearch.value.trim().toLocaleLowerCase()
  searchResults.replaceChildren()
  searchResults.hidden = !query
  sidebarNavigation.hidden = Boolean(query)
  if (!query) return
  for (const [title, aliases, id, setting] of searchEntries.filter(entry => entry.slice(0, 2).join(' ').toLocaleLowerCase().includes(query))) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = title
    button.addEventListener('click', () => {
      resetFeatureSearch()
      activateTab(document.getElementById(id), true, setting)
    })
    searchResults.append(button)
  }
  if (!searchResults.childElementCount) searchResults.textContent = '没有匹配的功能'
})
dockSearch.addEventListener('keydown', event => {
  if (event.key === 'Escape') resetFeatureSearch()
  if (event.key === 'ArrowDown') { event.preventDefault(); searchResults.querySelector('button')?.focus() }
  if (event.key === 'Enter') { event.preventDefault(); searchResults.querySelector('button')?.click() }
})

nativePluginGrid?.addEventListener('click', event => {
  const button = event.target.closest('[data-open-dock-setting]')
  if (!button) return
  const id = button.dataset.openDockSetting
  const tab = document.getElementById(`${id === 'memory' ? 'personal-prompt' : id}-tab`)
  if (tab) activateTab(tab, true, id)
})

nativeSearch?.addEventListener('input', () => {
  renderNativePlugins()
})

document.querySelectorAll('.native-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.native-chip').forEach((c) => c.classList.remove('active'))
    chip.classList.add('active')
    currentNativeCategory = chip.dataset.nativeCategory || 'all'
    renderNativePlugins()
  })
})

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
  document.querySelector('#install-plugin').open = true
  input.value = spec
  input.focus()
  notify('已从外部请求填入安装来源，请确认后点击「安装并重启」。')
})

async function confirmUnknownCompatibility(details) {
  if (pluginSettings.askUnknown === false) return false
  const presentation = compatibilityDialogPresentation('unknown')
  return showPluginDialog({
    ...presentation,
    details,
  })
}

function isUnknownCompatibilityError(error) {
  const message = normalizedErrorMessage(error)
  return error?.code === 'PLUGIN_COMPATIBILITY_CONFIRMATION_REQUIRED' || message.includes('无法确认兼容性')
}

async function installPluginWithAdmission(spec, { fullAccess = false, button = pluginInstallSubmit } = {}) {
  const originalLabel = button.textContent
  button.textContent = pluginInstallPresentation('installing').button
  button.setAttribute('aria-busy', 'true')
  pluginInstallState.hidden = true
  const preparingTimer = setTimeout(() => {
    pluginInstallState.textContent = pluginInstallPresentation('preparing').message
    pluginInstallState.hidden = false
  }, 1_200)
  const finishingTimer = setTimeout(() => {
    pluginInstallState.textContent = pluginInstallPresentation('finishing').message
    pluginInstallState.hidden = false
  }, 5_000)
  try {
    try {
      return await window.dshDesktop.installPlugin(spec, false, fullAccess)
    } catch (error) {
      if (!isUnknownCompatibilityError(error)) throw error
      const approved = await confirmUnknownCompatibility(normalizedErrorMessage(error))
      if (!approved) return undefined
      return window.dshDesktop.installPlugin(spec, true, fullAccess)
    }
  } finally {
    clearTimeout(preparingTimer)
    clearTimeout(finishingTimer)
    button.textContent = originalLabel
    button.removeAttribute('aria-busy')
    pluginInstallState.hidden = true
  }
}

document.querySelector('#plugin-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.currentTarget
  const data = new FormData(form)
  const spec = String(data.get('spec') ?? '').trim()
  const fullAccess = data.get('fullAccess') === 'on'
  if (spec === '') return
  if (fullAccess) {
    const presentation = compatibilityDialogPresentation('full-access')
    const approved = await showPluginDialog({
      ...presentation,
    })
    if (!approved) return
  }
  pluginInstallSubmit.textContent = pluginInstallPresentation(extensionOperations.busy ? 'queued' : 'installing').button
  await extensionOperations.run(async () => {
    try {
      const result = await installPluginWithAdmission(spec, { fullAccess })
      if (!result) return
      notify('插件已安装')
      form.reset()
      await refresh()
    } catch (error) {
      await showPluginFailure(error)
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

document.querySelector('#plugins').addEventListener('click', async (event) => {
  const openButton = event.target.closest('[data-open-plugin]')
  if (openButton) {
    openPluginDetail(openButton.dataset.openPlugin)
    return
  }
  if (event.target.closest('[data-close-plugin-detail]')) {
    closePluginDetail()
    return
  }
  if (event.target.closest('[data-open-discover]')) {
    activateTab(document.querySelector('#market-tab'), true)
    return
  }
  const updateButton = event.target.closest('[data-update-plugin]')
  if (updateButton) {
    const allowUnknown = updateButton.dataset.updateCompatibility === 'unknown'
    if (allowUnknown && !await confirmUnknownCompatibility('更新失败时，当前版本会继续保留。')) return
    await extensionOperations.run(async () => {
      try {
        const result = await window.dshDesktop.updatePlugin(updateButton.dataset.updatePlugin, allowUnknown)
        notify(`${result.name} 已更新`)
        await refresh()
        await checkPluginUpdates({ silent: true, skipAutoUpdate: true })
      } catch (error) {
        await showPluginFailure(error, '插件更新失败')
        await refresh()
      }
    })
    return
  }
  const button = event.target.closest('[data-remove-plugin]')
  if (!button) return
  const approved = await showPluginDialog({
    title: '卸载插件？',
    description: '插件代码会被移除，聊天、设置和个人数据不会受影响。',
    confirmLabel: '卸载',
  })
  if (!approved) return
  await extensionOperations.run(async () => {
    try {
      await window.dshDesktop.removePlugin(button.dataset.removePlugin)
      notify('插件已卸载')
      activePluginName = undefined
      await refresh()
    } catch (error) {
      await showPluginFailure(error, '插件卸载失败')
    }
  })
})

document.querySelector('#plugins').addEventListener('change', async (event) => {
  const toggle = event.target.closest('[data-toggle-plugin]')
  if (!toggle) return
  const enabled = toggle.checked
  await extensionOperations.run(async () => {
    try {
      await window.dshDesktop.setPluginEnabled(toggle.dataset.togglePlugin, enabled)
      notify(enabled ? '插件已启用' : '插件已停用')
      await refresh()
    } catch (error) {
      toggle.checked = !enabled
      await showPluginFailure(error, enabled ? '插件启用失败' : '插件停用失败')
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
marketReloadButton.addEventListener('click', () => {
  void refreshMarket({ force: true })
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

document.querySelector('#run-network-diagnostics').addEventListener('click', () => {
  void extensionOperations.run(async () => {
    networkDiagnosticResults.innerHTML = '<p class="empty">正在逐项检查网络连通性</p>'
    try {
      renderNetworkDiagnostics(await window.dshDesktop.runNetworkDiagnostics())
      notify('网络连通性检查已完成')
    } catch (error) {
      networkDiagnosticResults.innerHTML = '<p class="empty">网络连通性检查未完成，请导出诊断包查看配置状态</p>'
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
document.querySelector('#open-conversation-import')?.addEventListener('click', () => {
  void extensionOperations.run(async () => {
    try {
      await window.dshDesktop.openConversationImport()
    } catch (error) {
      notify(error.message, true)
    }
  })
})
document.querySelector('#reset-profile-env')?.addEventListener('click', async () => {
  await extensionOperations.run(async () => {
    try {
      const preview = await window.dshDesktop.previewProfileReset()
      const confirmed = await showPluginDialog({
        title: '修复插件环境？',
        description: '修复只会重建插件运行环境，不会删除聊天、设置、模型服务商、API 配置或个人数据。',
        details: `当前环境约 ${formatFileSize(preview.currentProfileBytes)}，所需可用空间 ${formatFileSize(preview.requiredFreeBytes)}。原环境会先安全备份。`,
        confirmLabel: '修复',
      })
      if (!confirmed) return
      const result = await window.dshDesktop.resetProfile({ timestamp: preview.timestamp })
      void result
      notify('插件环境已修复')
      await refresh()
    } catch (error) {
      const action = await showPluginDialog({
        title: '插件环境修复失败',
        description: '原有聊天、设置和个人数据没有改变。你可以重试，或导出诊断信息用于反馈。',
        details: normalizedErrorMessage(error),
        confirmLabel: '重试',
        cancelLabel: '导出诊断信息',
        returnValue: true,
      })
      if (action === 'confirm') document.querySelector('#reset-profile-env').click()
      if (action === 'cancel') document.querySelector('#export-diagnostics').click()
    }
  })
})
checkPluginUpdatesButton.addEventListener('click', () => {
  void checkPluginUpdates()
})
function refreshAll() {
  if (refreshAllPromise) return refreshAllPromise
  refreshButton.disabled = true
  refreshAllPromise = Promise.all([refresh(), refreshMarket({ force: true })])
    .then(() => checkPluginUpdates({ silent: true }))
    .finally(() => {
      refreshAllPromise = undefined
      refreshButton.disabled = extensionOperations.busy
    })
  return refreshAllPromise
}
refreshButton.addEventListener('click', () => { void refreshAll() })

document.querySelector('#activation-refresh').addEventListener('click', () => {
  void refreshAll().then(() => {
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
    const button = document.querySelector('#export-preset')
    const status = document.querySelector('#preset-export-status')
    const details = document.querySelector('#preset-export-details')
    const errorText = document.querySelector('#preset-export-error')
    const label = button.textContent
    button.textContent = '正在导出…'
    status.hidden = false
    status.dataset.state = 'pending'
    status.textContent = '请选择保存位置；确认后将校验并导出，请稍候。'
    details.hidden = true
    details.open = false
    errorText.textContent = ''
    try {
      const result = await window.dshDesktop.exportPreset()
      status.dataset.state = result.canceled ? 'canceled' : 'success'
      status.textContent = result.canceled
        ? '已取消导出，未保存文件。'
        : `Preset 已保存到所选位置（${result.packages} 个社区插件，${result.skills} 个技能，跳过 ${result.skipped?.length ?? 0} 项本机或敏感设置）。桌面版内置组件由软件提供，无需放入预设。`
      if (!result.canceled) notify('Preset 已导出，校验通过。')
    } catch (error) {
      status.dataset.state = 'error'
      status.textContent = presetExportFailureMessage(error)
      errorText.textContent = String(error?.message ?? error).slice(0, 2_000)
      details.hidden = false
      notify(status.textContent, true)
    } finally {
      button.textContent = label
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

let initialTab = document.querySelector('#value-mode-tab')
let initialSetting
try {
  const previousId = localStorage.getItem('dsh-dock-tab')
  initialTab = tabs.find(tab => tab.id === previousId) ?? (previousId === 'memory-tab' ? document.querySelector('#personal-prompt-tab') : initialTab)
  const previousSetting = previousId === 'memory-tab' ? 'memory' : localStorage.getItem('dsh-dock-setting')
  if (initialTab.dataset.group === 'personal' && ['personal-prompt', 'memory'].includes(previousSetting)) initialSetting = previousSetting
} catch { /* first visit opens model collaboration */ }
activateTab(initialTab, false, initialSetting)
await refresh()
void refreshMarket()
void checkPluginUpdates({ silent: true })
