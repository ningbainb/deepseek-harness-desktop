import { GITHUB_PROJECT_URL, PRIVACY_POLICY_URL } from './community-links.mjs'
import { runBestEffort } from './best-effort-events.mjs'

export function createApplicationMenuTemplate({
  app,
  shell,
  controller,
  openCommunity,
  openFeedback,
  openExtensions,
  openConversationImport,
  openTerminal,
  openLogs,
  openPrivacy = () => shell.openExternal(PRIVACY_POLICY_URL),
  exportDiagnostics = () => {},
  openProject = () => shell.openExternal(GITHUB_PROJECT_URL),
  openReleaseGuide,
  checkForUpdates,
  getCloseBehavior,
  setCloseBehavior,
  minimizeToTray,
  onActionError = () => {},
  platform = 'win32',
}) {
  const action = (operation) => () => runBestEffort(operation, onActionError)
  const closeBehavior = typeof getCloseBehavior === 'function' ? getCloseBehavior() : 'quit'
  const closeBehaviorEntry = typeof setCloseBehavior === 'function'
    ? {
        label: '关闭行为',
        submenu: [
          {
            type: 'radio',
            label: '退出',
            checked: closeBehavior === 'quit',
            click: action(() => setCloseBehavior('quit')),
          },
          {
            type: 'radio',
            label: '最小化到托盘并开启后台自动化',
            checked: closeBehavior === 'minimize-to-tray',
            click: action(() => setCloseBehavior('minimize-to-tray')),
          },
          {
            type: 'radio',
            label: '每次询问',
            checked: closeBehavior === 'ask',
            click: action(() => setCloseBehavior('ask')),
          },
        ],
      }
    : undefined
  const residencyEntry = typeof minimizeToTray === 'function'
    ? { label: '最小化到托盘', accelerator: 'CmdOrCtrl+Shift+M', click: action(minimizeToTray) }
    : undefined
  const applicationMenu = platform === 'darwin'
    ? { role: 'appMenu', submenu: [
        { role: 'about' },
        { type: 'separator' },
        ...(residencyEntry ? [residencyEntry] : []),
        ...(closeBehaviorEntry ? [closeBehaviorEntry, { type: 'separator' }] : []),
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ] }
    : {
        label: '应用',
        submenu: [
          ...(residencyEntry ? [residencyEntry] : []),
          ...(closeBehaviorEntry ? [closeBehaviorEntry, { type: 'separator' }] : []),
          { role: 'quit', label: '退出' },
        ],
      }
  return [
    applicationMenu,
    {
      label: '运行时',
      submenu: [
        { label: '重启 DSH', accelerator: 'CmdOrCtrl+Shift+R', click: action(() => controller.restart()) },
        { label: '打开日志', click: action(openLogs) },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新界面' },
        { role: 'forceReload', label: '强制刷新' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '工具',
      submenu: [
        ...(typeof openTerminal === 'function'
          ? [{ label: '内置终端', accelerator: 'CmdOrCtrl+Alt+T', click: action(openTerminal) }]
          : []),
        { label: '从其他 AI 工具继续工作', accelerator: 'CmdOrCtrl+Shift+I', click: action(openConversationImport) },
        { label: '扩展坞', accelerator: 'CmdOrCtrl+Shift+X', click: action(openExtensions) },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴', accelerator: 'CmdOrCtrl+V' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        ...(typeof openReleaseGuide === 'function'
          ? [{ label: '本版本新功能', click: action(openReleaseGuide) }]
          : []),
        { label: '检查更新', click: action(() => checkForUpdates({ manual: true })) },
        { label: '导出诊断日志', click: action(exportDiagnostics) },
        { type: 'separator' },
        { label: '加入社群', click: action(openCommunity) },
        { label: '提建议', click: action(openFeedback) },
        { label: 'GitHub 项目', click: action(openProject) },
        { label: '隐私政策', click: action(openPrivacy) },
        { type: 'separator' },
        { label: `版本 ${app.getVersion()}`, enabled: false },
      ],
    },
  ]
}

/** Install native right-click and terminal-style keyboard paste affordances. */
export function installEditContextMenu({ webContents, Menu }) {
  const onContextMenu = (_event, params = {}) => {
    const menu = Menu.buildFromTemplate([
      { role: 'cut', label: '剪切', enabled: params.editFlags?.canCut === true },
      { role: 'copy', label: '复制', enabled: params.editFlags?.canCopy === true || Boolean(params.selectionText) },
      { role: 'paste', label: '粘贴' },
      { type: 'separator' },
      { role: 'selectAll', label: '全选' },
    ])
    menu.popup()
  }
  const onBeforeInput = (event, input = {}) => {
    if (input.type !== 'keyDown' || String(input.key).toLowerCase() !== 'v') return
    if (!(input.control || input.meta) || !input.shift || input.alt) return
    event.preventDefault()
    webContents.paste()
  }
  webContents.on('context-menu', onContextMenu)
  webContents.on('before-input-event', onBeforeInput)
  return () => {
    webContents.removeListener('context-menu', onContextMenu)
    webContents.removeListener('before-input-event', onBeforeInput)
  }
}

export function installTrayResidencyShortcut({ webContents, minimizeToTray, platform = process.platform, onActionError = () => {} }) {
  const onBeforeInput = (event, input = {}) => {
    const modifier = platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta
    if (input.type !== 'keyDown' || String(input.key).toLowerCase() !== 'm' || !modifier || !input.shift || input.alt || input.isAutoRepeat) return
    event.preventDefault()
    runBestEffort(minimizeToTray, onActionError)
  }
  webContents.on('before-input-event', onBeforeInput)
  return () => webContents.removeListener('before-input-event', onBeforeInput)
}

export function installApplicationMenu(options) {
  const { Menu } = options
  const refresh = () => {
    const template = createApplicationMenuTemplate(options)
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
    return template
  }
  refresh()
  return refresh
}
