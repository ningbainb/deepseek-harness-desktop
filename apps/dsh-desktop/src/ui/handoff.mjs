/**
 * Frontend logic for Continue from Other AI Agents (Context Handoff).
 */

const themeQuery = new URLSearchParams(window.location.search).get('theme')
if (themeQuery === 'dark' || themeQuery === 'light') {
  document.documentElement.dataset.dshDesktopTheme = themeQuery
}

const bridge = window.dshDesktop

let allProjects = []
let activePlan = null
let currentSelectedSession = null
let manualProjectCwd = null
let manualProjectMappings = Object.create(null)
let activeBatchPlan = null
let activeBatchImport = false
let lastBatchFailures = []
const selectedProjectKeys = new Set()

const elements = {
  rescanBtn: document.getElementById('rescan-btn'),
  searchInput: document.getElementById('search-input'),
  projectSelect: document.getElementById('project-select'),
  claudeSessionCount: document.getElementById('claude-session-count'),
  claudeStatus: document.getElementById('claude-status'),
  claudeRootPath: document.getElementById('claude-root-path'),
  pickClaudeRootBtn: document.getElementById('pick-claude-root-btn'),
  codexSessionCount: document.getElementById('codex-session-count'),
  codexStatus: document.getElementById('codex-status'),
  codexRootPath: document.getElementById('codex-root-path'),
  pickCodexRootBtn: document.getElementById('pick-codex-root-btn'),
  projectsContainer: document.getElementById('projects-container'),
  emptyPreview: document.getElementById('empty-preview'),
  previewContent: document.getElementById('preview-content'),
  previewSource: document.getElementById('preview-source'),
  previewTitle: document.getElementById('preview-title'),
  previewMeta: document.getElementById('preview-meta'),
  sourceWarning: document.getElementById('source-warning'),
  matchStatusTitle: document.getElementById('match-status-title'),
  matchStatusDesc: document.getElementById('match-status-desc'),
  revisionNote: document.getElementById('revision-note'),
  pickDirBtn: document.getElementById('pick-dir-btn'),
  metricTokens: document.getElementById('metric-tokens'),
  metricFiles: document.getElementById('metric-files'),
  metricMessages: document.getElementById('metric-messages'),
  previewSnippet: document.getElementById('preview-snippet'),
  importBtn: document.getElementById('import-btn'),
  importSelectedBtn: document.getElementById('import-selected-btn'),
  importAllBtn: document.getElementById('import-all-btn'),
  retryFailedBtn: document.getElementById('retry-failed-btn'),
  cancelBatchBtn: document.getElementById('cancel-batch-btn'),
  batchProgress: document.getElementById('batch-progress'),
}

function projectKey(project) {
  return [project?.sourceKind || '', project?.rootDir || project?.sourceRootDir || '', project?.projectRef || ''].join('\u001f')
}

function displayPath(value, fallback) {
  if (!value) return fallback
  const text = String(value)
  return text.length > 64 ? `...${text.slice(-61)}` : text
}

function formatDate(ts) {
  if (!ts) return '--'
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function loadSourcesAndScan() {
  const generation = ++scanGeneration
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchGeneration += 1
  deepMatchedSet = null
  previewGeneration += 1
  activePlan = null
  activeBatchPlan = null
  lastBatchFailures = []
  currentSelectedSession = null
  manualProjectCwd = null
  elements.emptyPreview.hidden = false
  elements.previewContent.hidden = true
  elements.importBtn.disabled = true
  elements.importBtn.textContent = '导入完整会话到 DSH 工作区'
  if (elements.batchProgress) elements.batchProgress.textContent = ''
  elements.sourceWarning.hidden = true
  elements.sourceWarning.textContent = ''
  elements.projectsContainer.innerHTML = '<p class="loading-state">正在扫描外部 AI 工具会话...</p>'
  try {
    const probeResults = await bridge.probeConversationSources()
    if (generation !== scanGeneration) return
    for (const p of probeResults) {
      if (p.sourceKind === 'claude-code') {
        elements.claudeStatus.textContent = p.available ? '已检测到' : '未检测到'
        if (elements.claudeRootPath) elements.claudeRootPath.textContent = displayPath(p.rootDir, '默认 ~/.claude')
      } else if (p.sourceKind === 'codex') {
        elements.codexStatus.textContent = p.available ? '已检测到' : '未检测到'
        if (elements.codexRootPath) elements.codexRootPath.textContent = displayPath(p.rootDir, '默认 ~/.codex')
      }
    }

    const scanResult = await bridge.scanConversationSources()
    if (generation !== scanGeneration) return
    allProjects = scanResult.projects || []

    let claudeCount = 0
    let codexCount = 0
    for (const s of scanResult.sources) {
      if (s.sourceKind === 'claude-code') claudeCount = s.sessionCount
      if (s.sourceKind === 'codex') codexCount = s.sessionCount
    }
    elements.claudeSessionCount.textContent = claudeCount
    elements.codexSessionCount.textContent = codexCount

    // Populate project filter dropdown
    if (elements.projectSelect) {
      elements.projectSelect.innerHTML = '<option value="all">[全部项目] (All Projects)</option>'
      for (const p of allProjects) {
        const opt = document.createElement('option')
        opt.value = p.projectRef
        const count = p.sessions?.length || p.sessionCount || 0
        opt.textContent = `[${p.sourceDisplayName}] ${p.displayName} (${count} 个会话) - ${p.originalCwd || p.projectRef}`
        elements.projectSelect.appendChild(opt)
      }
    }

    renderProjectList(elements.searchInput.value)
    updateBatchButtons()
  } catch (error) {
    if (generation !== scanGeneration) return
    elements.projectsContainer.textContent = ''
    const errorText = document.createElement('p')
    errorText.className = 'error-state'
    errorText.textContent = `扫描失败: ${error.message}`
    elements.projectsContainer.appendChild(errorText)
  }
}

let deepMatchedSet = null
let searchDebounceTimer = null
let searchGeneration = 0
let previewGeneration = 0
let scanGeneration = 0

function triggerSearch(filterText) {
  const generation = ++searchGeneration
  deepMatchedSet = null
  renderProjectList(filterText)

  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  const trimmed = filterText.trim()
  if (!trimmed || trimmed.length < 2) {
    deepMatchedSet = null
    return
  }

  searchDebounceTimer = setTimeout(async () => {
    try {
      if (generation !== searchGeneration) return
      if (typeof bridge.searchConversationContent === 'function') {
        const matches = await bridge.searchConversationContent(trimmed)
        if (generation === searchGeneration && matches && Array.isArray(matches)) {
          deepMatchedSet = new Set(matches)
          renderProjectList(elements.searchInput.value, deepMatchedSet)
        }
      }
    } catch {}
  }, 200)
}

function renderProjectList(filterText = '', deepMatches = null) {
  const needle = filterText.trim().toLowerCase()
  const selectedProjRef = elements.projectSelect?.value || 'all'
  elements.projectsContainer.innerHTML = ''

  if (allProjects.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'empty-state'
    empty.textContent = '未发现会话；可先选择 Claude 或 Codex 数据文件夹'
    elements.projectsContainer.appendChild(empty)
    return
  }

  let visibleCount = 0

  for (const project of allProjects) {
    if (selectedProjRef !== 'all' && project.projectRef !== selectedProjRef) {
      continue
    }

    const filteredSessions = project.sessions.filter((s) => {
      if (!needle) return true
      const inDeep = deepMatches && deepMatches.has(s.sessionRef)
      return (
        inDeep ||
        (s.title && s.title.toLowerCase().includes(needle)) ||
        (s.snippet && s.snippet.toLowerCase().includes(needle)) ||
        (s.sessionRef && s.sessionRef.toLowerCase().includes(needle)) ||
        project.displayName.toLowerCase().includes(needle) ||
        (project.originalCwd && project.originalCwd.toLowerCase().includes(needle))
      )
    })

    if (filteredSessions.length === 0) continue
    visibleCount += filteredSessions.length

    const groupDiv = document.createElement('div')
    const isSelectedProject = selectedProjRef !== 'all' && selectedProjRef === project.projectRef
    const shouldCollapseLargeProject = !needle && !isSelectedProject && filteredSessions.length > 25
    groupDiv.className = shouldCollapseLargeProject ? 'project-group collapsed' : 'project-group'

    const headerDiv = document.createElement('div')
    headerDiv.className = 'project-group-header'
    headerDiv.title = '点击折叠/展开此项目会话列表'

    const infoCol = document.createElement('div')
    infoCol.className = 'project-info-col'

    const titleMain = document.createElement('div')
    titleMain.className = 'project-title-main'
    const titleStrong = document.createElement('strong')
    titleStrong.textContent = `[${project.sourceDisplayName}] ${project.displayName}`
    titleMain.appendChild(titleStrong)

    const pathSub = document.createElement('div')
    pathSub.className = 'project-path-sub'
    pathSub.textContent = project.originalCwd || project.projectRef
    pathSub.title = project.originalCwd || project.projectRef

    infoCol.appendChild(titleMain)
    infoCol.appendChild(pathSub)

    const metaCol = document.createElement('div')
    metaCol.className = 'project-meta-col'

    const projectCheckbox = document.createElement('input')
    projectCheckbox.type = 'checkbox'
    projectCheckbox.className = 'project-select-checkbox'
    projectCheckbox.checked = selectedProjectKeys.has(projectKey(project))
    projectCheckbox.title = '选择此工作区用于批量导入'
    projectCheckbox.addEventListener('click', (event) => event.stopPropagation())
    projectCheckbox.addEventListener('change', () => {
      const key = projectKey(project)
      if (projectCheckbox.checked) selectedProjectKeys.add(key)
      else selectedProjectKeys.delete(key)
      updateBatchButtons()
    })

    const projectBatchBtn = document.createElement('button')
    projectBatchBtn.type = 'button'
    projectBatchBtn.className = 'secondary small project-batch-btn'
    projectBatchBtn.textContent = '导入此工作区'
    projectBatchBtn.title = '导入该原工作区的全部会话'
    projectBatchBtn.addEventListener('click', (event) => {
      event.stopPropagation()
      void runBatchImport([project])
    })

    const badge = document.createElement('span')
    badge.className = 'project-badge'
    badge.textContent = `${filteredSessions.length} 会话`

    const toggleIcon = document.createElement('span')
    toggleIcon.className = 'project-collapse-icon'
    toggleIcon.textContent = '▼'

    metaCol.appendChild(projectCheckbox)
    metaCol.appendChild(badge)
    metaCol.appendChild(projectBatchBtn)
    metaCol.appendChild(toggleIcon)

    headerDiv.appendChild(infoCol)
    headerDiv.appendChild(metaCol)

    headerDiv.addEventListener('click', () => {
      groupDiv.classList.toggle('collapsed')
    })

    const bodyDiv = document.createElement('div')
    bodyDiv.className = 'project-sessions-body'

    for (const sess of filteredSessions) {
      const itemDiv = document.createElement('div')
      itemDiv.className = 'session-item'
      if (currentSelectedSession?.sessionRef === sess.sessionRef) {
        itemDiv.classList.add('selected')
      }

      const itemTitle = document.createElement('div')
      itemTitle.className = 'session-item-title'
      itemTitle.textContent = sess.title || 'Untitled Session'
      itemDiv.appendChild(itemTitle)

      if (sess.snippet && sess.snippet !== sess.title) {
        const itemSnippet = document.createElement('div')
        itemSnippet.className = 'session-item-snippet'
        itemSnippet.textContent = sess.snippet
        itemSnippet.title = sess.snippet
        itemDiv.appendChild(itemSnippet)
      }

      const itemMeta = document.createElement('div')
      itemMeta.className = 'session-item-meta'

      const dateSpan = document.createElement('span')
      dateSpan.textContent = formatDate(sess.updatedAt || sess.createdAt)

      const statusSpan = document.createElement('span')
      statusSpan.className = `status-tag ${sess.importStatus || 'not-imported'}`
      statusSpan.textContent =
        sess.importStatus === 'imported'
          ? '已导入'
          : sess.importStatus === 'source-updated'
          ? '源会话有更新'
          : '未导入'

      itemMeta.appendChild(dateSpan)
      itemMeta.appendChild(statusSpan)

      itemDiv.appendChild(itemMeta)

      itemDiv.addEventListener('click', () => {
        selectSession(project, sess)
      })

      bodyDiv.appendChild(itemDiv)
    }

    groupDiv.appendChild(headerDiv)
    groupDiv.appendChild(bodyDiv)
    elements.projectsContainer.appendChild(groupDiv)
  }

  if (visibleCount === 0) {
    const empty = document.createElement('p')
    empty.className = 'empty-state'
    if (needle) {
      empty.appendChild(document.createTextNode(`未找到包含 “${needle}” 的会话记录`))
      empty.appendChild(document.createElement('br'))
      const hint = document.createElement('span')
      hint.style.fontSize = '11px'
      hint.style.opacity = '0.7'
      hint.textContent = '可尝试搜索代码关键词、文件名，或切换上方项目分类'
      empty.appendChild(hint)
    } else {
      empty.textContent = '未找到匹配的会话'
    }
    elements.projectsContainer.appendChild(empty)
  }
}

async function selectSession(project, session) {
  currentSelectedSession = { ...session, sourceKind: project.sourceKind }
  manualProjectCwd = null
  renderProjectList(elements.searchInput.value, deepMatchedSet)
  await loadPreview()
}

async function loadPreview() {
  if (!currentSelectedSession) return

  const generation = ++previewGeneration
  activePlan = null

  elements.emptyPreview.hidden = true
  elements.previewContent.hidden = false
  elements.importBtn.disabled = true
  elements.importBtn.textContent = '解析会话中...'

  try {
    const plan = await bridge.previewConversationImport({
      sourceKind: currentSelectedSession.sourceKind,
      sessionRef: currentSelectedSession.sessionRef,
      manualProjectCwd,
    })

    if (generation !== previewGeneration) return

    activePlan = plan

    elements.previewSource.textContent = plan.sourceDisplayName
    elements.previewTitle.textContent = plan.sessionTitle
    elements.sourceWarning.hidden = !plan.sourceWarning
    elements.sourceWarning.textContent = plan.sourceWarning || ''
    elements.previewMeta.textContent = `原项目: ${plan.originalCwd || '未指定'} · 事件数: ${plan.eventCount || 0} · 更新时间: ${formatDate(plan.updatedAt)}`

    // Match status
    if (plan.matchResult.isExactMatch) {
      elements.matchStatusTitle.textContent = '路径精确匹配'
           elements.matchStatusDesc.textContent = `目标工程目录: ${plan.matchResult.matchedPath}`
    } else if (plan.matchResult.status === 'git-root') {
      elements.matchStatusTitle.textContent = '当前 Git 工作区匹配'
      elements.matchStatusDesc.textContent = (plan.matchResult.message || '已按 Git 根目录匹配') + ' · 目标工程目录: ' + plan.matchResult.matchedPath
    } else if (plan.matchResult.status === 'git-remote') {
      elements.matchStatusTitle.textContent = 'Git 远程仓库匹配'
      elements.matchStatusDesc.textContent = plan.matchResult.message
    } else if (plan.matchResult.status === 'manual-selected') {
      elements.matchStatusTitle.textContent = '手动选择目录有效'
      elements.matchStatusDesc.textContent = `目标工程目录: ${plan.matchResult.matchedPath}`
    } else {
      elements.matchStatusTitle.textContent = '必须确认工程目录'
      elements.matchStatusDesc.textContent = plan.matchResult.message || '原工程目录不存在，请点击右侧按钮选择当前代码所在文件夹。'
    }

    if (plan.matchResult.revisionChanged) {
      elements.revisionNote.hidden = false
      elements.revisionNote.textContent = `代码版本变动: 原版本 (${plan.matchResult.historicalRevision || '历史'}) -> 当前版本 (${plan.matchResult.currentRevision || '最新'})`
    } else {
      elements.revisionNote.hidden = true
    }

    // Metrics
    elements.metricTokens.textContent = `${plan.eventCount || 0}`
    elements.metricFiles.textContent = `${plan.toolCallCount || 0}`
    elements.metricMessages.textContent = `${plan.messageCount || 0}`

    // Render structured events transcript preview
    if (plan.eventsPreview && plan.eventsPreview.length > 0) {
      const previewLines = plan.eventsPreview.map((ev) => {
        const timeStr = ev.sourceTimestamp ? new Date(ev.sourceTimestamp).toLocaleTimeString() : ''
        return `[#${ev.sequence}] [${ev.type.toUpperCase()}${ev.role ? ':' + ev.role : ''}] ${timeStr ? '(' + timeStr + ') ' : ''}${ev.contentPreview}`
      })
      elements.previewSnippet.textContent = previewLines.join('\n') + (plan.eventCount > plan.eventsPreview.length ? `\n... 还有 ${plan.eventCount - plan.eventsPreview.length} 条历史事件` : '')
    } else {
      elements.previewSnippet.textContent = plan.previewPromptSnippet || '无可见历史记录'
    }

    if (plan.canImport) {
      elements.importBtn.disabled = false
      elements.importBtn.textContent = plan.alreadyImported
        ? '已导入此版本 (复用或重新打开)'
        : plan.sourcePartial
        ? '导入可读取历史到 DSH 工作区'
        : '导入完整会话到 DSH 工作区'
    } else {
      elements.importBtn.disabled = true
      elements.importBtn.textContent = '无法导入: 请先选择有效工程目录'
    }
  } catch (error) {
    if (generation !== previewGeneration) return
    elements.previewSnippet.textContent = `解析失败: ${error.message}`
    elements.sourceWarning.hidden = true
    elements.sourceWarning.textContent = ''
    elements.importBtn.disabled = true
    elements.importBtn.textContent = '无法导入'
  }
}

function updateBatchButtons() {
  const hasProjects = allProjects.length > 0
  if (elements.importAllBtn) elements.importAllBtn.disabled = activeBatchImport || !hasProjects
  if (elements.importSelectedBtn) elements.importSelectedBtn.disabled = activeBatchImport || selectedProjectKeys.size === 0
  if (elements.rescanBtn) elements.rescanBtn.disabled = activeBatchImport
  if (elements.pickClaudeRootBtn) elements.pickClaudeRootBtn.disabled = activeBatchImport
  if (elements.pickCodexRootBtn) elements.pickCodexRootBtn.disabled = activeBatchImport
  if (elements.cancelBatchBtn) elements.cancelBatchBtn.hidden = !activeBatchImport
  if (elements.retryFailedBtn) elements.retryFailedBtn.hidden = activeBatchImport || lastBatchFailures.length === 0
}

function selectedProjects() {
  return allProjects.filter((project) => selectedProjectKeys.has(projectKey(project)))
}

function batchPreviewText(preview) {
  const workspaceLines = (preview.workspaces || []).map((workspace) => {
    const path = workspace.targetPath || '需要手动选择目录'
    return `- ${path}：${workspace.sessionCount || 0} 个会话`
  })
  const blockedLines = (preview.blockedProjects || []).map((project) => `- ${project.displayName}：${project.message || '需要手动选择目录'}`)
  return [
    `批量预览：${preview.totalProjects || 0} 个原工作区，${preview.totalSessions || 0} 个会话`,
    `可导入 ${preview.importableSessionCount || 0} 个，已导入版本 ${preview.alreadyImportedCount || 0} 个`,
    workspaceLines.length ? `目标 DSH 工作区：\n${workspaceLines.join('\n')}` : '',
    blockedLines.length ? `待映射工作区：\n${blockedLines.join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
}

function updateBatchProgress(payload) {
  if (!payload || !elements.batchProgress) return
  if (payload.phase === 'started') {
    elements.batchProgress.textContent = `准备导入 ${payload.total || 0} 个会话...`
    return
  }
  if (payload.phase === 'cancelled') {
    elements.batchProgress.textContent = `已取消：完成 ${payload.completed || 0}/${payload.total || 0}`
    return
  }
  const completed = payload.completed || 0
  const total = payload.total || 0
  elements.batchProgress.textContent = `批量导入中 ${completed}/${total} · 成功 ${(
    (payload.importedCount || 0) + (payload.reusedCount || 0)
  )} · 失败 ${payload.failedCount || 0}`
}

async function runBatchImport(projects = null, {
  sessionRefs = null,
  projectRefsOverride = null,
  skipConfirm = false,
  all = false,
} = {}) {
  if (activeBatchImport) return
  const selected = all
    ? null
    : Array.isArray(projects) && projects.length > 0
    ? projects
    : selectedProjects()
  if (!all && selected.length === 0 && !Array.isArray(projectRefsOverride)) {
    if (elements.batchProgress) elements.batchProgress.textContent = '请先勾选至少一个工作区，或使用“导入全部工作区和会话”。'
    return
  }

  const projectRefs = Array.isArray(projectRefsOverride)
    ? projectRefsOverride
    : selected
    ? selected.map((project) => ({
      sourceKind: project.sourceKind,
      rootDir: project.rootDir,
      projectRef: project.projectRef,
    }))
    : undefined
  let preview
  try {
    // Missing/moved original folders are mapped one project at a time. The
    // native folder picker keeps the target outside renderer-controlled paths.
    for (let attempts = 0; attempts <= (selected ? selected.length : 5_000); attempts += 1) {
      preview = await bridge.previewConversationImportBatch({
        projectRefs,
        sessionRefs,
        manualMappings: manualProjectMappings,
      })
      activeBatchPlan = preview
      elements.emptyPreview.hidden = true
      elements.previewContent.hidden = false
      elements.previewSource.textContent = '批量导入预览'
      elements.previewTitle.textContent = `${preview.totalProjects || 0} 个工作区 · ${preview.totalSessions || 0} 个会话`
      elements.previewMeta.textContent = batchPreviewText(preview)
      elements.sourceWarning.hidden = !preview.requiresManualSelection
      elements.sourceWarning.textContent = preview.requiresManualSelection
        ? '部分原工作区路径已移动或不存在，请逐个选择当前 DSH 项目文件夹。'
        : '确认后会按目标路径复用或创建工作区，并为每条原会话创建独立 DSH 会话。'
      elements.previewSnippet.textContent = batchPreviewText(preview)
      elements.metricTokens.textContent = `${preview.totalSessions || 0}`
      elements.metricFiles.textContent = `${preview.totalProjects || 0}`
      elements.metricMessages.textContent = `${preview.alreadyImportedCount || 0}`

      if (!preview.blockedProjects?.length) break
      const blocked = preview.blockedProjects[0]
      const selectedDir = await bridge.pickProjectDirectory()
      if (!selectedDir) {
        if (elements.batchProgress) elements.batchProgress.textContent = `已暂停：${blocked.displayName} 尚未绑定目标文件夹。`
        return
      }
      manualProjectMappings[blocked.projectKey] = selectedDir
    }

    if (!preview || !preview.canImport) {
      if (elements.batchProgress) elements.batchProgress.textContent = '批量导入暂不可用：请先完成所有工作区路径绑定。'
      return
    }
    const summary = `将导入 ${preview.totalSessions} 个会话，复用/创建 ${preview.workspaces?.length || 0} 个 DSH 工作区。\n\n${batchPreviewText(preview)}\n\n是否开始？`
    if (!skipConfirm && typeof window.confirm === 'function' && !window.confirm(summary)) return

    activeBatchImport = true
    updateBatchButtons()
    if (elements.importAllBtn) elements.importAllBtn.textContent = '批量导入中...'
    if (elements.importSelectedBtn) elements.importSelectedBtn.textContent = '批量导入中...'
    if (elements.batchProgress) elements.batchProgress.textContent = `正在导入 ${preview.totalSessions || 0} 个会话...`
    const result = await bridge.confirmConversationImportBatch(preview.planId)
    const successCount = (result?.importedCount || 0) + (result?.reusedCount || 0)
    const failures = (result?.results || []).filter((item) => !item.ok)
    lastBatchFailures = failures
    if (elements.batchProgress) {
      elements.batchProgress.textContent = result?.cancelled
        ? `已取消：完成 ${result.completed || 0}/${result.total || 0}`
        : `批量导入完成：成功 ${successCount}，失败 ${failures.length}`
    }
    if (failures.length > 0) {
      elements.sourceWarning.hidden = false
      elements.sourceWarning.textContent = failures.slice(0, 8).map((item) => `${item.title || item.sessionRef}: ${item.error || '导入失败'}`).join('\n')
      elements.previewSnippet.textContent = failures.map((item) => `${item.title || item.sessionRef}\n${item.error || '导入失败'}`).join('\n\n')
    } else {
      elements.sourceWarning.hidden = true
      elements.previewSnippet.textContent = result?.message || `已导入 ${successCount} 个会话。`
      if (result?.firstSessionId) setTimeout(() => window.close(), 1_200)
    }
  } catch (error) {
    if (elements.batchProgress) elements.batchProgress.textContent = `批量导入失败：${error.message}`
    elements.previewSnippet.textContent = `批量导入失败：${error.message}`
  } finally {
    activeBatchImport = false
    if (elements.importAllBtn) elements.importAllBtn.textContent = '导入全部工作区和会话'
    if (elements.importSelectedBtn) elements.importSelectedBtn.textContent = '导入选中的工作区'
    updateBatchButtons()
  }
}

async function pickSourceRoot(sourceKind, button, pathElement) {
  if (activeBatchImport) return
  if (button) button.disabled = true
  try {
    const selected = await bridge.pickConversationSourceDirectory(sourceKind)
    if (selected?.rootDir && pathElement) pathElement.textContent = displayPath(selected.rootDir, selected.rootDir)
    if (selected?.rootDir) await loadSourcesAndScan()
  } catch (error) {
    if (elements.batchProgress) elements.batchProgress.textContent = `选择源文件夹失败：${error.message}`
  } finally {
    updateBatchButtons()
  }
}

// Events
elements.rescanBtn.addEventListener('click', loadSourcesAndScan)
elements.searchInput.addEventListener('input', (e) => {
  triggerSearch(e.target.value)
})
elements.searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    triggerSearch(e.target.value)
  }
})
elements.projectSelect?.addEventListener('change', () => {
  triggerSearch(elements.searchInput.value)
})

elements.pickClaudeRootBtn?.addEventListener('click', () => pickSourceRoot(
  'claude-code',
  elements.pickClaudeRootBtn,
  elements.claudeRootPath,
))
elements.pickCodexRootBtn?.addEventListener('click', () => pickSourceRoot(
  'codex',
  elements.pickCodexRootBtn,
  elements.codexRootPath,
))
elements.importAllBtn?.addEventListener('click', () => runBatchImport(null, { all: true }))
elements.importSelectedBtn?.addEventListener('click', () => runBatchImport())
elements.retryFailedBtn?.addEventListener('click', () => {
  if (lastBatchFailures.length === 0) return
  const failedProjectKeys = new Set(lastBatchFailures.map((item) => item.projectKey))
  const projects = allProjects.filter((project) => failedProjectKeys.has(projectKey(project)))
  void runBatchImport(projects, {
    projectRefsOverride: lastBatchFailures.map((item) => ({
      sourceKind: item.sourceKind,
      rootDir: item.sourceRootDir,
      projectRef: item.projectRef,
    })),
    sessionRefs: lastBatchFailures.map((item) => ({ sourceKind: item.sourceKind, sessionRef: item.sessionRef })),
  })
})
elements.cancelBatchBtn?.addEventListener('click', async () => {
  if (!activeBatchPlan?.planId || typeof bridge.cancelConversationImportBatch !== 'function') return
  try {
    await bridge.cancelConversationImportBatch(activeBatchPlan.planId)
    if (elements.batchProgress) elements.batchProgress.textContent = '正在停止批量导入...'
  } catch (error) {
    if (elements.batchProgress) elements.batchProgress.textContent = `取消失败：${error.message}`
  }
})
if (typeof bridge.onConversationImportBatchProgress === 'function') {
  bridge.onConversationImportBatchProgress(updateBatchProgress)
}

elements.pickDirBtn.addEventListener('click', async () => {
  try {
    const selectedDir = await bridge.pickProjectDirectory()
    if (selectedDir) {
      manualProjectCwd = selectedDir
      await loadPreview()
    }
  } catch (error) {
    elements.previewSnippet.textContent = `选择目录失败: ${error.message}`
  }
})

elements.importBtn.addEventListener('click', async () => {
  if (!activePlan) return
  elements.importBtn.disabled = true
  elements.importBtn.textContent = '正在导入并创建 DSH 工作区与会话...'

  try {
    const result = await bridge.confirmConversationImport(activePlan.planId)
    if (!result?.ok) throw new Error(result?.error || '导入未完成')
    elements.importBtn.textContent = `导入成功！已导入 ${result.importedEventCount || 0} 条历史记录，正在打开会话...`
    if (result.sourcePartial || result.importTruncated) {
      elements.sourceWarning.hidden = false
      elements.sourceWarning.textContent = '导入完成，但部分超长或损坏记录已跳过。'
    }
    setTimeout(() => window.close(), 1_200)
  } catch (error) {
    elements.previewSnippet.textContent = `导入失败: ${error.message}`
    if (/源会话在预览后发生变化/u.test(error?.message || '')) {
      activePlan = null
      elements.sourceWarning.hidden = false
      elements.sourceWarning.textContent = '源会话在预览后有新内容，请重新选择该会话并预览后再导入。'
      elements.importBtn.disabled = true
      elements.importBtn.textContent = '源会话已更新，请重新预览'
    } else {
      elements.importBtn.disabled = false
      elements.importBtn.textContent = '导入完整会话到 DSH 工作区'
    }
  }
})

// Initialize
loadSourcesAndScan()
