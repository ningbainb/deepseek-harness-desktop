/**
 * Frontend logic for Continue from Other AI Agents (Context Handoff).
 */

const bridge = window.dshDesktop

let allProjects = []
let activePlan = null
let currentSelectedSession = null
let manualProjectCwd = null

const elements = {
  rescanBtn: document.getElementById('rescan-btn'),
  searchInput: document.getElementById('search-input'),
  claudeSessionCount: document.getElementById('claude-session-count'),
  claudeStatus: document.getElementById('claude-status'),
  codexSessionCount: document.getElementById('codex-session-count'),
  codexStatus: document.getElementById('codex-status'),
  projectsContainer: document.getElementById('projects-container'),
  emptyPreview: document.getElementById('empty-preview'),
  previewContent: document.getElementById('preview-content'),
  previewSource: document.getElementById('preview-source'),
  previewTitle: document.getElementById('preview-title'),
  previewMeta: document.getElementById('preview-meta'),
  matchStatusTitle: document.getElementById('match-status-title'),
  matchStatusDesc: document.getElementById('match-status-desc'),
  revisionNote: document.getElementById('revision-note'),
  pickDirBtn: document.getElementById('pick-dir-btn'),
  metricTokens: document.getElementById('metric-tokens'),
  metricFiles: document.getElementById('metric-files'),
  metricMessages: document.getElementById('metric-messages'),
  previewSnippet: document.getElementById('preview-snippet'),
  importBtn: document.getElementById('import-btn'),
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
  elements.projectsContainer.innerHTML = '<p class="loading-state">正在扫描外部 AI 工具会话...</p>'
  try {
    const probeResults = await bridge.probeConversationSources()
    for (const p of probeResults) {
      if (p.sourceKind === 'claude-code') {
        elements.claudeStatus.textContent = p.available ? '已检测到' : '未检测到'
      } else if (p.sourceKind === 'codex') {
        elements.codexStatus.textContent = p.available ? '已检测到' : '未检测到'
      }
    }

    const scanResult = await bridge.scanConversationSources()
    allProjects = scanResult.projects || []

    let claudeCount = 0
    let codexCount = 0
    for (const s of scanResult.sources) {
      if (s.sourceKind === 'claude-code') claudeCount = s.sessionCount
      if (s.sourceKind === 'codex') codexCount = s.sessionCount
    }
    elements.claudeSessionCount.textContent = claudeCount
    elements.codexSessionCount.textContent = codexCount

    renderProjectList(elements.searchInput.value)
  } catch (error) {
    elements.projectsContainer.innerHTML = `<p class="error-state">扫描失败: ${error.message}</p>`
  }
}

function renderProjectList(filterText = '') {
  const needle = filterText.trim().toLowerCase()
  elements.projectsContainer.innerHTML = ''

  if (allProjects.length === 0) {
    elements.projectsContainer.innerHTML = '<p class="empty-state">未在默认路径发现 Claude Code 或 Codex 会话</p>'
    return
  }

  let visibleCount = 0

  for (const project of allProjects) {
    const filteredSessions = project.sessions.filter((s) => {
      if (!needle) return true
      return (
        (s.title && s.title.toLowerCase().includes(needle)) ||
        project.displayName.toLowerCase().includes(needle) ||
        (project.originalCwd && project.originalCwd.toLowerCase().includes(needle))
      )
    })

    if (filteredSessions.length === 0) continue
    visibleCount += filteredSessions.length

    const groupDiv = document.createElement('div')
    groupDiv.className = 'project-group'

    const titleDiv = document.createElement('div')
    titleDiv.className = 'project-group-title'
    titleDiv.textContent = `[${project.sourceDisplayName}] ${project.displayName}`
    groupDiv.appendChild(titleDiv)

    for (const sess of filteredSessions) {
      const itemDiv = document.createElement('div')
      itemDiv.className = 'session-item'
      if (currentSelectedSession?.sessionRef === sess.sessionRef) {
        itemDiv.classList.add('selected')
      }

      const itemTitle = document.createElement('div')
      itemTitle.className = 'session-item-title'
      itemTitle.textContent = sess.title || 'Untitled Session'

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

      itemDiv.appendChild(itemTitle)
      itemDiv.appendChild(itemMeta)

      itemDiv.addEventListener('click', () => {
        selectSession(project, sess)
      })

      groupDiv.appendChild(itemDiv)
    }

    elements.projectsContainer.appendChild(groupDiv)
  }

  if (visibleCount === 0) {
    elements.projectsContainer.innerHTML = '<p class="empty-state">未找到匹配的会话</p>'
  }
}

async function selectSession(project, session) {
  currentSelectedSession = { ...session, sourceKind: project.sourceKind }
  manualProjectCwd = null
  renderProjectList(elements.searchInput.value)
  await loadPreview()
}

async function loadPreview() {
  if (!currentSelectedSession) return

  elements.emptyPreview.hidden = true
  elements.previewContent.hidden = false
  elements.importBtn.disabled = true
  elements.importBtn.textContent = '生成上下文中...'

  try {
    const plan = await bridge.previewConversationImport({
      sourceKind: currentSelectedSession.sourceKind,
      sessionRef: currentSelectedSession.sessionRef,
      manualProjectCwd,
    })

    activePlan = plan

    elements.previewSource.textContent = plan.sourceDisplayName
    elements.previewTitle.textContent = plan.sessionTitle
    elements.previewMeta.textContent = `原项目: ${plan.originalCwd || '未指定'} · 更新时间: ${formatDate(plan.updatedAt)}`

    // Match status
    if (plan.matchResult.isExactMatch) {
      elements.matchStatusTitle.textContent = '路径精确匹配'
      elements.matchStatusDesc.textContent = `当前工作目录: ${plan.matchResult.matchedPath}`
    } else if (plan.matchResult.status === 'git-remote') {
      elements.matchStatusTitle.textContent = 'Git 仓库匹配'
      elements.matchStatusDesc.textContent = plan.matchResult.message
    } else {
      elements.matchStatusTitle.textContent = '需要确认项目目录'
      elements.matchStatusDesc.textContent = plan.matchResult.message
    }

    if (plan.matchResult.revisionChanged) {
      elements.revisionNote.hidden = false
      elements.revisionNote.textContent = `代码版本变动: 原版本 (${plan.matchResult.historicalRevision || '历史'}) -> 当前版本 (${plan.matchResult.currentRevision || '最新'})`
    } else {
      elements.revisionNote.hidden = true
    }

    // Metrics
    elements.metricTokens.textContent = `~${plan.reconstructionSummary.tokenEstimate || 0}`
    elements.metricFiles.textContent = `${plan.reconstructionSummary.filesCount || 0}`
    elements.metricMessages.textContent = `${plan.messageCount || 0}`

    // Snippet
    elements.previewSnippet.textContent = plan.previewPromptSnippet

    elements.importBtn.disabled = false
    elements.importBtn.textContent = '创建新会话并继续工作'
  } catch (error) {
    elements.previewSnippet.textContent = `生成上下文失败: ${error.message}`
    elements.importBtn.disabled = true
    elements.importBtn.textContent = '无法导入'
  }
}

// Events
elements.rescanBtn.addEventListener('click', loadSourcesAndScan)
elements.searchInput.addEventListener('input', (e) => {
  renderProjectList(e.target.value)
})

elements.pickDirBtn.addEventListener('click', async () => {
  try {
    const selectedDir = await bridge.pickProjectDirectory()
    if (selectedDir) {
      manualProjectCwd = selectedDir
      await loadPreview()
    }
  } catch (error) {
    alert(`选择目录失败: ${error.message}`)
  }
})

elements.importBtn.addEventListener('click', async () => {
  if (!activePlan) return
  elements.importBtn.disabled = true
  elements.importBtn.textContent = '正在创建 DSH 会话...'

  try {
    const result = await bridge.confirmConversationImport(activePlan.planId)
    if (result.ok) {
      elements.importBtn.textContent = '导入成功！已开启会话'
      setTimeout(() => {
        window.close()
      }, 800)
    }
  } catch (error) {
    alert(`导入失败: ${error.message}`)
    elements.importBtn.disabled = false
    elements.importBtn.textContent = '创建新会话并继续工作'
  }
})

// Initialize
loadSourcesAndScan()
